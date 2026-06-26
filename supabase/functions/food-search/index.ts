// food-search — Supabase Edge Function (Deno).
//
// Food text-search + barcode lookup proxy. Prefers USDA FoodData Central's
// "Branded Foods" dataset (accurate manufacturer label data with real serving
// sizes) when USDA_API_KEY is set, then falls back to OpenFoodFacts' modern
// relevance-ranked search, then its legacy cgi endpoint. Runs server-side so the
// web app isn't blocked by CORS and the proper User-Agent reaches OFF.
//
// Results are normalised to the OpenFoodFacts product shape the client already
// maps from, so no client change is needed when USDA is the source.
//
// JWT verification is handled by the platform (verify_jwt defaults to true).
//
// Setup:
//   supabase secrets set USDA_API_KEY=...   (free key from https://api.data.gov/signup)
//   supabase functions deploy food-search

const USDA_API_KEY = Deno.env.get('USDA_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
const UA = 'MyFitnessBuddy/1.0 (food-search edge function)';

const round1 = (x: number) => Math.round(x * 10) / 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Result cleanup: de-dupe near-identical entries and rank the most complete /
// accurate ones first, so a search returns one good row per item, not ten. ─────
type Hit = {
  product_name?: string;
  brands?: string | string[];
  serving_size?: string;
  nutriments?: Record<string, number>;
};

const hitName = (h: Hit) => String(h.product_name ?? '');
const hitBrand = (h: Hit) => (Array.isArray(h.brands) ? (h.brands[0] ?? '') : String(h.brands ?? ''));
const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Lower bucket = better: prefer entries with per-serving data + full macros.
function qualityBucket(h: Hit): number {
  const n = h.nutriments ?? {};
  const hasServing = n['energy-kcal_serving'] != null;
  const macros = ['proteins', 'carbohydrates', 'fat'].filter((b) => (n[`${b}_100g`] ?? 0) > 0).length;
  if (hasServing && macros >= 2) return 0;
  if (macros >= 2) return 1;
  if ((n['energy-kcal_100g'] ?? 0) > 0) return 2;
  return 3;
}

function dedupeAndRank(hits: Hit[], limit = 25): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of hits) {
    const key = `${normalize(hitName(h))}|${normalize(hitBrand(h))}`;
    if (key.replace('|', '').trim().length === 0) continue; // no usable name
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  // Stable sort by quality bucket — keeps source/relevance order within a bucket
  // (USDA-first, then OpenFoodFacts), just floats the most complete rows up.
  return out
    .map((h, i) => ({ h, i, b: qualityBucket(h) }))
    .sort((a, b) => a.b - b.b || a.i - b.i)
    .map((x) => x.h)
    .slice(0, limit);
}

// ── USDA FoodData Central ───────────────────────────────────────────────────
// Nutrient numbers: 208 energy(kcal), 203 protein, 205 carbs, 204 fat.
type FdcNutrient = { nutrientNumber?: string | number; number?: string | number; value?: number };
type FdcFood = {
  fdcId?: number;
  description?: string;
  brandName?: string;
  brandOwner?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: FdcNutrient[];
};

function fdcValue(food: FdcFood, numbers: string[]): number {
  for (const n of food.foodNutrients ?? []) {
    const num = String(n.nutrientNumber ?? n.number ?? '');
    if (numbers.includes(num)) return Number(n.value) || 0;
  }
  return 0;
}

// Map a USDA food into the OpenFoodFacts product shape the client expects.
function usdaToHit(f: FdcFood): Record<string, unknown> | null {
  const kcal = fdcValue(f, ['208', '957', '958']); // values are per 100 g
  if (!(kcal > 0)) return null;
  const protein = fdcValue(f, ['203']);
  const carbs = fdcValue(f, ['205']);
  const fat = fdcValue(f, ['204']);

  const nutriments: Record<string, number> = {
    'energy-kcal_100g': round1(kcal),
    'proteins_100g': round1(protein),
    'carbohydrates_100g': round1(carbs),
    'fat_100g': round1(fat),
  };

  let serving_size: string | undefined;
  let serving_quantity: number | undefined;
  const ss = Number(f.servingSize);
  const unit = String(f.servingSizeUnit ?? '').toLowerCase();
  if (ss > 0 && (unit === 'g' || unit === 'ml')) {
    const factor = ss / 100;
    nutriments['energy-kcal_serving'] = round1(kcal * factor);
    nutriments['proteins_serving'] = round1(protein * factor);
    nutriments['carbohydrates_serving'] = round1(carbs * factor);
    nutriments['fat_serving'] = round1(fat * factor);
    serving_size = `${round1(ss)} ${unit}`;
    serving_quantity = ss;
  }

  return {
    code: f.gtinUpc || String(f.fdcId ?? ''),
    product_name: f.description ?? '',
    brands: f.brandName || f.brandOwner || '',
    serving_size,
    serving_quantity,
    nutriments,
  };
}

async function searchUsda(q: string): Promise<unknown[] | null> {
  if (!USDA_API_KEY) return null;
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}` +
    `&query=${encodeURIComponent(q)}&dataType=${encodeURIComponent('Branded,Foundation,SR Legacy')}` +
    `&pageSize=30`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const foods: FdcFood[] = Array.isArray(data?.foods) ? data.foods : [];
    const hits = foods.map(usdaToHit).filter((h): h is Record<string, unknown> => h != null);
    return hits.length ? hits : null;
  } catch {
    return null;
  }
}

async function lookupUsdaBarcode(code: string): Promise<{ status: number; product?: unknown } | null> {
  if (!USDA_API_KEY) return null;
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}` +
    `&query=${encodeURIComponent(code)}&dataType=Branded&pageSize=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const foods: FdcFood[] = Array.isArray(data?.foods) ? data.foods : [];
    const match = foods.find((f) => (f.gtinUpc ?? '').replace(/^0+/, '') === code.replace(/^0+/, ''));
    const hit = match ? usdaToHit(match) : null;
    return hit ? { status: 1, product: hit } : null;
  } catch {
    return null;
  }
}

// ── OpenFoodFacts ───────────────────────────────────────────────────────────
async function searchAlicious(q: string): Promise<unknown[] | null> {
  const url =
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}` +
    `&page_size=40&lc=en&fields=${FIELDS}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.hits) ? data.hits : null;
  } catch {
    return null;
  }
}

async function searchLegacy(q: string): Promise<unknown[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=40&fields=${FIELDS}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`legacy ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.products) ? data.products : [];
}

async function lookupOffBarcode(code: string): Promise<{ status: number; product?: unknown }> {
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json` +
    `?fields=product_name,brands,nutriments,serving_size`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 404) return { status: 0 };
  if (!res.ok) throw new Error(`product ${res.status}`);
  const data = await res.json();
  return { status: data?.status ?? 0, product: data?.product };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { q?: string; barcode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  // Barcode lookup mode — OFF is barcode-native, USDA fills gaps.
  if (body.barcode) {
    const code = String(body.barcode).trim();
    if (!code) return json({ status: 0 });
    try {
      const off = await lookupOffBarcode(code);
      if (off.status === 1) return json(off);
      const usda = await lookupUsdaBarcode(code);
      return json(usda ?? off);
    } catch (e) {
      const usda = await lookupUsdaBarcode(code);
      if (usda) return json(usda);
      return json({ error: `Food database unavailable: ${e instanceof Error ? e.message : e}` }, 502);
    }
  }

  // Text search mode — query USDA (accurate US branded) and OpenFoodFacts (broad
  // global + India coverage) in parallel, then merge: USDA hits first, OFF after.
  // The client de-dupes by name+brand, so cross-source duplicates collapse.
  const q = String(body.q ?? '').trim();
  if (q.length < 2) return json({ hits: [] });

  const offSearch = (async (): Promise<{ hits: unknown[]; err: boolean }> => {
    try {
      return { hits: (await searchAlicious(q)) ?? (await searchLegacy(q)), err: false };
    } catch {
      return { hits: [], err: true };
    }
  })();

  const [usda, off] = await Promise.all([searchUsda(q), offSearch]);
  const usdaHits = usda ?? [];
  // De-dupe near-identical rows across sources and float the most complete
  // entries up, so a search returns one good result per item — not ten.
  const hits = dedupeAndRank([...usdaHits, ...off.hits] as Hit[]);

  // Only surface an outage if everything failed and we have nothing to show.
  if (hits.length === 0 && off.err && usdaHits.length === 0) {
    return json({ error: 'Food database unavailable.' }, 502);
  }
  return json({ hits });
});
