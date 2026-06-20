import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface a clear error early rather than failing deep in a request.
  console.warn(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your Supabase values.',
  );
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Fall back to harmless placeholders when env is missing so createClient doesn't
// throw ("supabaseUrl is required"). Real calls won't work until .env is set, but
// the app (and PREVIEW_MODE) can still boot.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // PKCE: email confirmation & password-reset links carry a `?code=` we
      // exchange for a session (see auth.tsx deep-link handler).
      flowType: 'pkce',
    },
  },
);

// React Native requires us to drive token auto-refresh off the app's foreground
// state. Without this, a session that expires while the app is backgrounded is
// never refreshed — and supabase-js then silently falls back to the anon key on
// every request, so writes fail with "row violates row-level security policy"
// (auth.uid() is null) even though the user appears signed in. Start refreshing
// when the app is active, stop when it's backgrounded.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
if (AppState.currentState === 'active') {
  supabase.auth.startAutoRefresh();
}

/**
 * Returns a guaranteed-fresh authenticated user id, refreshing the token if it
 * has expired. Throws a clear, user-facing error if there is no valid session
 * (so callers can tell the user to sign in again instead of hitting an opaque
 * RLS failure). Use this for the `user_id` on any insert/upsert/delete.
 */
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  let session = data.session;
  // If the access token is expired or missing, force a refresh from the stored
  // refresh token before giving up.
  if (!session || (session.expires_at ?? 0) * 1000 < Date.now() + 5000) {
    const refreshed = await supabase.auth.refreshSession();
    if (!refreshed.error && refreshed.data.session) session = refreshed.data.session;
  }
  if (error || !session?.user?.id) {
    throw new Error('Your session has expired. Please sign out and sign in again.');
  }
  return session.user.id;
}
