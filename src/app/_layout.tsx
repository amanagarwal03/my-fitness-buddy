import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandSplash } from '@/components/brand-splash';
import { AuthProvider, useAuth } from '@/lib/auth';
import { PREVIEW_MODE } from '@/lib/preview';

function RootNavigator() {
  const { session, initializing, needsOnboarding, recovering } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  // Keep the branded splash up for a minimum beat so it doesn't just flash by.
  const [minSplashDone, setMinSplashDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (PREVIEW_MODE || initializing) return; // preview: skip the auth gate
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    const onReset = segments[1] === 'reset-password';
    // A password-recovery link landed us here — force the "set new password" screen.
    if (recovering) {
      if (!onReset) router.replace('/(auth)/reset-password');
      return;
    }
    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }
    if (needsOnboarding === null) return; // wait until profile state is known
    if (needsOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    } else if (!needsOnboarding && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)/nutrition');
    }
  }, [session, initializing, needsOnboarding, recovering, segments, router]);

  if (initializing || !minSplashDone) {
    return <BrandSplash />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="result"
          options={{ headerShown: true, title: 'Meal analysis', presentation: 'modal' }}
        />
        <Stack.Screen
          name="goals"
          options={{ headerShown: true, title: 'Daily goals', presentation: 'modal' }}
        />
        <Stack.Screen name="share" options={{ headerShown: true }} />
        <Stack.Screen name="shared/[ownerId]" options={{ headerShown: true }} />
        <Stack.Screen name="barcode" options={{ headerShown: true, presentation: 'modal' }} />
        <Stack.Screen name="workout/log" options={{ headerShown: true, title: 'Log Workout' }} />
        <Stack.Screen
          name="workout/add-exercise"
          options={{ headerShown: true, title: 'Add Exercise', presentation: 'modal' }}
        />
        <Stack.Screen name="workout/[bodyPart]" options={{ headerShown: true }} />
        <Stack.Screen name="workout/exercise/[id]" options={{ headerShown: true }} />
        <Stack.Screen name="workout/progress/[id]" options={{ headerShown: true }} />
        <Stack.Screen name="workout/edit-session/[id]" options={{ headerShown: true }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
