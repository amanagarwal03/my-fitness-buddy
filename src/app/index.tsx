import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { PREVIEW_MODE } from '@/lib/preview';

// Entry route ("/"): send the user to the app or the sign-in screen.
// The root layout only renders this once auth has finished initializing,
// so `session` is already known here.
export default function Index() {
  const { session } = useAuth();
  if (PREVIEW_MODE) return <Redirect href="/(tabs)/nutrition" />;
  return <Redirect href={session ? '/(tabs)/nutrition' : '/(auth)/sign-in'} />;
}
