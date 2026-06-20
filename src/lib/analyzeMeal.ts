import { supabase } from './supabase';
import type { MealAnalysis } from './types';

/**
 * Send a base64 meal image to the `analyze-meal` Edge Function and get
 * structured nutrition back. The user's Supabase JWT is attached automatically
 * by `functions.invoke`, so the function can verify the caller.
 */
export async function analyzeMeal(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' = 'image/jpeg',
): Promise<MealAnalysis> {
  const { data, error } = await supabase.functions.invoke<MealAnalysis>('analyze-meal', {
    body: { imageBase64, mediaType },
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to analyze meal.');
  }
  if (!data) {
    throw new Error('No analysis returned. Please try again.');
  }
  return data;
}
