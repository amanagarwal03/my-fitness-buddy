import type { MealAnalysis } from './types';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
};

/**
 * Look up a product barcode in OpenFoodFacts (free, no key) and map it to the
 * same MealAnalysis shape the photo scanner returns. Returns null if the
 * product isn't in the database. Prefers per-serving values, falling back to
 * per-100g (the result screen lets the user adjust the quantity).
 */
export async function lookupBarcode(code: string): Promise<MealAnalysis | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    code,
  )}.json?fields=product_name,brands,nutriments,serving_size`;

  const res = await fetch(url, { headers: { 'User-Agent': 'MyFitnessBuddy/1.0' } });
  if (!res.ok) throw new Error(`Lookup failed (${res.status}).`);
  const json = (await res.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      brands?: string;
      serving_size?: string;
      nutriments?: Record<string, number>;
    };
  };

  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const n = p.nutriments ?? {};
  const perServing = n['energy-kcal_serving'] != null;
  const pick = (base: string) => (perServing ? n[`${base}_serving`] : n[`${base}_100g`]);

  const name = [p.brands, p.product_name].filter(Boolean).join(' ').trim() || 'Scanned product';
  const calories = num(perServing ? n['energy-kcal_serving'] : n['energy-kcal_100g']);
  const protein_g = num(pick('proteins'));
  const carbs_g = num(pick('carbohydrates'));
  const fat_g = num(pick('fat'));
  const quantity = perServing ? p.serving_size || '1 serving' : '100 g';

  return {
    name,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    confidence: 'high',
    items: [{ name, quantity, calories, protein_g, carbs_g, fat_g }],
    micros: [],
    assumptions: [`From OpenFoodFacts (barcode ${code}), per ${quantity}. Adjust the quantity if needed.`],
  };
}
