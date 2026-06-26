import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandSplash } from '@/components/brand-splash';
import { DesktopShell } from '@/components/desktop-shell';
import { HeaderNav, SideNavProvider } from '@/components/side-nav';
import { useTheme } from '@/hooks/use-theme';
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
      <SideNavProvider>
        <StackNavigator />
      </SideNavProvider>
    </ThemeProvider>
  );
}

// Every stacked content screen shows the ☰ menu (and a back chevron when
// applicable) on the left, themed so it stays visible on light/dark headers.
// The header is off by default — auth, onboarding, the tab bar and the redirect
// index keep their own chrome — and turned on per content screen below. The
// shared headerLeft only renders where a header is shown.
function StackNavigator() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerLeft: () => <HeaderNav />,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="result"
        options={{ headerShown: true, title: 'Meal analysis', presentation: 'modal' }}
      />
      {/* Share & Goals use an in-content title row (like the tabs), so no header. */}
      <Stack.Screen name="share" options={{ headerShown: false }} />
      <Stack.Screen name="goals" options={{ headerShown: false }} />
      <Stack.Screen name="shared/[ownerId]" options={{ headerShown: true }} />
      <Stack.Screen name="shared/session/[id]" options={{ headerShown: true }} />
      <Stack.Screen name="shared/body/[ownerId]" options={{ headerShown: true }} />
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
      <Stack.Screen name="workout/group-progress/[bodyPart]" options={{ headerShown: true }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DesktopShell>
          <RootNavigator />
        </DesktopShell>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
