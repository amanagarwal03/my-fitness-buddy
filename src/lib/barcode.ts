import { supabase } from './supabase';
import type { MealAnalysis } from './types';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
};

// An OpenFoodFacts product as returned by the lookup/search endpoints.
export type OffProduct = {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: Record<string, number>;
};

/**
 * Map an OpenFoodFacts product to the MealAnalysis shape the result screen
 * consumes (shared by barcode lookup and food search). Prefers per-serving
 * values, falling back to per-100g. Returns null if it has no usable name.
 */
export function productToAnalysis(p: OffProduct, code = ''): MealAnalysis | null {
  const n = p.nutriments ?? {};
  const perServing = n['energy-kcal_serving'] != null;
  const pick = (base: string) => (perServing ? n[`${base}_serving`] : n[`${base}_100g`]);

  const name = [p.brands, p.product_name].filter(Boolean).join(' ').trim();
  if (!name) return null;
  const calories = num(perServing ? n['energy-kcal_serving'] : n['energy-kcal_100g']);
  const protein_g = num(pick('proteins'));
  const carbs_g = num(pick('carbohydrates'));
  const fat_g = num(pick('fat'));
  const quantity = perServing ? p.serving_size || '1 serving' : '100 g';
  const source = code ? `From OpenFoodFacts (barcode ${code}), per ${quantity}.` : `From OpenFoodFacts, per ${quantity}.`;

  // Some entries (often non-food items, or foods awaiting data) have a name but
  // no nutrition. Flag that clearly instead of presenting a silent 0-calorie row.
  const hasNutrition = calories > 0 || protein_g > 0 || carbs_g > 0 || fat_g > 0;

  return {
    name,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    confidence: hasNutrition ? 'high' : 'low',
    items: [{ name, quantity, calories, protein_g, carbs_g, fat_g }],
    micros: [],
    assumptions: [
      hasNutrition
        ? `${source} Adjust the quantity if needed.`
        : `OpenFoodFacts has no nutrition info for this barcode — it may not be a food product. Enter the values manually below, or go back and try a photo scan.`,
    ],
  };
}

/**
 * Look up a product barcode in OpenFoodFacts. Goes through our `food-search`
 * Edge Function first (server-side, so the proper User-Agent reaches OFF —
 * browser requests get throttled / 404'd), falling back to a direct call.
 * Returns null when the product simply isn't in the database.
 */
export async function lookupBarcode(code: string): Promise<MealAnalysis | null> {
  const fromResult = (status?: number, product?: OffProduct): MealAnalysis | null => {
    if (status !== 1 || !product) return null;
    return productToAnalysis(product, code) ?? EMPTY_PRODUCT(code);
  };

  // 1) Edge Function proxy (reliable; correct UA; CORS-safe on web).
  try {
    const { data, error } = await supabase.functions.invoke('food-search', {
      body: { barcode: code },
    });
    if (!error && data) {
      const d = data as { status?: number; product?: OffProduct };
      return fromResult(d.status, d.product);
    }
  } catch {
    // fall through to direct call
  }

  // 2) Direct fallback (the product endpoint sends CORS headers).
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
    code,
  )}.json?fields=product_name,brands,nutriments,serving_size`;
  const res = await fetch(url, { headers: { 'User-Agent': 'MyFitnessBuddy/1.0' } });
  if (res.status === 404) return null; // not found, not an error
  if (!res.ok) throw new Error(`Lookup failed (${res.status}).`);
  const json = (await res.json()) as { status?: number; product?: OffProduct };
  return fromResult(json.status, json.product);
}

// Fallback for a barcode that exists but has no usable name (rare).
const EMPTY_PRODUCT = (code: string): MealAnalysis => ({
  name: 'Scanned product',
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  confidence: 'low',
  items: [{ name: 'Scanned product', quantity: '100 g', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }],
  micros: [],
  assumptions: [`From OpenFoodFacts (barcode ${code}). No nutrition on file — enter values manually.`],
});
