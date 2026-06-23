import { supabase } from './supabase';

const BUCKET = 'meal-photos';
export const PHOTO_RETENTION_DAYS = 7;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a base64 string to bytes without relying on atob (Hermes-safe). */
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = B64.indexOf(clean[i]);
    const e2 = B64.indexOf(clean[i + 1]);
    const e3 = B64.indexOf(clean[i + 2]);
    const e4 = B64.indexOf(clean[i + 3]);
    out[p++] = (e1 << 2) | (e2 >> 4);
    if (e3 !== -1) out[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (e4 !== -1) out[p++] = ((e3 & 3) << 6) | e4;
  }
  return out;
}

/** Upload a meal photo (base64 JPEG) and return its storage path. */
export async function uploadMealPhoto(
  userId: string,
  mealId: string,
  dateIso: string,
  base64: string,
): Promise<string> {
  const path = `${userId}/${dateIso}/${mealId}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToBytes(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** Map storage paths → short-lived signed URLs for display (RLS-enforced). */
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 3600);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}

/**
 * Delete the current user's meal photos older than the retention window and
 * clear their image_url. Safe to call on screen focus; it's a no-op when there's
 * nothing to prune.
 */
export async function pruneOldPhotos(): Promise<void> {
  // Scope to the signed-in user: the coach-sharing RLS policy lets a viewer
  // SELECT a shared owner's meals, so an unscoped query would try to prune
  // another account's photos.
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PHOTO_RETENTION_DAYS);
  const { data } = await supabase
    .from('meals')
    .select('id, image_url')
    .eq('user_id', uid)
    .lt('eaten_at', cutoff.toISOString())
    .not('image_url', 'is', null);
  const rows = (data as { id: string; image_url: string }[] | null) ?? [];
  if (rows.length === 0) return;
  await supabase.storage.from(BUCKET).remove(rows.map((r) => r.image_url));
  await supabase
    .from('meals')
    .update({ image_url: null })
    .in('id', rows.map((r) => r.id));
}
