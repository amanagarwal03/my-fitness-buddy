import { requireUserId, supabase } from './supabase';

export type ShareGrant = {
  owner_id: string;
  viewer_id: string;
  owner_label: string | null;
  // Email of the viewer who redeemed the code (captured at redeem time).
  viewer_label?: string | null;
  // The owner's display name (when they share it). Falls back to owner_label.
  owner_name?: string | null;
};

// Avoids ambiguous characters (0/O, 1/I) in the human-typed code.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(len = 6): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/** Return the current user's share code, creating one if they don't have it yet. */
export async function getOrCreateMyCode(_userId?: string): Promise<string> {
  // Always resolve a guaranteed-fresh authenticated id so the insert's
  // owner_id matches auth.uid() (otherwise RLS rejects it).
  const userId = await requireUserId();
  const existing = await supabase.from('share_codes').select('code').eq('owner_id', userId).maybeSingle();
  if (existing.data?.code) return existing.data.code;

  // Try a few times in case of a code collision.
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await supabase.from('share_codes').insert({ code, owner_id: userId });
    if (!error) return code;
    lastError = error.message;
    // If the owner already has a row (unique on owner_id), fetch and return it.
    const again = await supabase.from('share_codes').select('code').eq('owner_id', userId).maybeSingle();
    if (again.data?.code) return again.data.code;
  }
  throw new Error(lastError ?? 'Could not generate a share code. Please try again.');
}

/** Redeem someone else's code → returns the owner's user id. */
export async function redeemCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_share_code', { p_code: code });
  if (error) throw new Error(error.message);
  return data as string;
}

/** People who have shared their profile with me (I'm the viewer/coach). */
export async function listSharedWithMe(userId: string): Promise<ShareGrant[]> {
  const { data } = await supabase.from('share_grants').select('*').eq('viewer_id', userId);
  const grants = (data as ShareGrant[]) ?? [];
  if (grants.length === 0) return grants;
  // Enrich with each owner's display name (respecting their share_name choice).
  const ownerIds = grants.map((g) => g.owner_id);
  const { data: profs } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name, share_name')
    .in('user_id', ownerIds);
  const nameById = new Map<string, string>();
  for (const p of (profs as
    | { user_id: string; first_name: string | null; last_name: string | null; share_name: boolean | null }[]
    | null) ?? []) {
    if (p.share_name === false) continue; // owner chose to hide their name
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (name) nameById.set(p.user_id, name);
  }
  return grants.map((g) => ({ ...g, owner_name: nameById.get(g.owner_id) ?? null }));
}

/** People I've shared my profile with (I'm the owner). */
export async function listMyViewers(userId: string): Promise<ShareGrant[]> {
  const { data } = await supabase.from('share_grants').select('*').eq('owner_id', userId);
  return (data as ShareGrant[]) ?? [];
}

/** Revoke a grant (either side can call: owner removing a viewer, or viewer leaving). */
export async function removeGrant(ownerId: string, viewerId: string): Promise<void> {
  await supabase.from('share_grants').delete().eq('owner_id', ownerId).eq('viewer_id', viewerId);
}
