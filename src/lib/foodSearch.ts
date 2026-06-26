// Free-text food search. Prefers the modern relevance-ranked OpenFoodFacts
// search engine (fuzzy / substring / best-match first), proxied through our
// `food-search` Edge Function so the web app isn't CORS-blocked. Falls back to
// hitting OpenFoodFacts directly if the function isn't reachable. Each result
// carries its serving options so the UI can scale calories/macros by quantity.

import { Platform } from 'react-native';

import { supabase } from './supabase';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
};

export type Serving = {
  label: string; // e.g. "1 serving (15 g)" or "100 g"
  grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type FoodItem = {
  code: string;
  name: string;
  brand: string;
  servings: Serving[]; // at least one; first is the default
};

// Raised when the food database can't be reached (vs. a successful empty result).
export class FoodSearchError extends Error {}

type SearchHit = {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number>;
};

function firstBrand(brands: string | string[] | undefined): string {
  if (Array.isArray(brands)) return (brands[0] ?? '').trim();
  return (brands ?? '').split(',')[0].trim();
}

function toFoodItem(p: SearchHit): FoodItem | null {
  const n = p.nutriments ?? {};
  const brand = firstBrand(p.brands);
  const name = (p.product_name ?? '').trim() || brand;
  if (!name) return null;

  const servings: Serving[] = [];

  // Per-serving (preferred default) when the product declares one.
  if (n['energy-kcal_serving'] != null) {
    const grams =
      typeof p.serving_quantity === 'number'
        ? p.serving_quantity
        : Number(p.serving_quantity) || null;
    const size = p.serving_size?.trim();
    const label = `1 serving${size ? ` (${size})` : grams ? ` (${grams} g)` : ''}`;
    servings.push({
      label,
      grams,
      calories: num(n['energy-kcal_serving']),
      protein_g: num(n['proteins_serving']),
      carbs_g: num(n['carbohydrates_serving']),
      fat_g: num(n['fat_serving']),
    });
  }

  // Per-100 g is almost always present; useful for weighing your own portion.
  if (n['energy-kcal_100g'] != null) {
    servings.push({
      label: '100 g',
      grams: 100,
      calories: num(n['energy-kcal_100g']),
      protein_g: num(n['proteins_100g']),
      carbs_g: num(n['carbohydrates_100g']),
      fat_g: num(n['fat_100g']),
    });
  }

  if (servings.length === 0 || servings.every((s) => s.calories <= 0)) return null;
  return { code: p.code ?? '', name, brand, servings };
}

const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
const UA = 'MyFitnessBuddy/1.0';

async function fetchHits(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  // 1) Our Edge Function proxy — the good search engine, CORS-safe on web.
  try {
    const { data, error } = await supabase.functions.invoke('food-search', { body: { q: query } });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!error && data && Array.isArray((data as { hits?: SearchHit[] }).hits)) {
      return (data as { hits: SearchHit[] }).hits;
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    // fall through to direct calls
  }

  // 2) Direct fallback. Native can hit the modern engine directly (no CORS); on
  //    web that's blocked, so we drop to the cgi endpoint (which sends CORS).
  if (Platform.OS !== 'web') {
    try {
      const res = await fetch(
        `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=40&lc=en&fields=${FIELDS}`,
        { headers: { 'User-Agent': UA }, signal },
      );
      if (res.ok) {
        const j = (await res.json()) as { hits?: SearchHit[] };
        if (Array.isArray(j.hits)) return j.hits;
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
    }
  }

  // The legacy cgi endpoint is overloaded-prone (503s), so retry once on a 5xx.
  const cgiUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=40&fields=${FIELDS}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(cgiUrl, { headers: { 'User-Agent': UA }, signal });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      throw new FoodSearchError('network');
    }
    if (res.ok) {
      const json = (await res.json()) as { products?: SearchHit[] };
      return json.products ?? [];
    }
    if (res.status < 500 || attempt === 1) throw new FoodSearchError(`status ${res.status}`);
    await new Promise((r) => setTimeout(r, 700)); // brief backoff, then one retry
  }
  return [];
}

export async function searchFoods(query: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const hits = await fetchHits(query, signal);

  const items: FoodItem[] = [];
  const seen = new Set<string>();
  for (const p of hits) {
    const item = toFoodItem(p);
    if (!item) continue;
    // De-dupe by name+brand so the list isn't full of near-identical rows.
    const key = `${item.name}|${item.brand}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}
