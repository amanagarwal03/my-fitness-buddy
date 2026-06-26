import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useSegments } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { PREVIEW_MODE } from '@/lib/preview';

const LOGO_SOURCE = require('@/assets/images/logo.png');

// Max width of the centered content column on desktop — keeps the mobile-first
// screens readable instead of stretching them across the whole window. The
// column blends into the page (no phone-frame border) so it reads like a website.
const FRAME_WIDTH = 600;

/**
 * On wide screens, wraps the whole app in a desktop "shell": a left sidebar for
 * navigation plus the app centered in a fixed-width frame on a canvas. On phones
 * (and on native) it renders the app untouched, full-bleed.
 */
export function DesktopShell({ children }: { children: ReactNode }) {
  const { isDesktop } = useResponsive();
  const theme = useTheme();
  const { session } = useAuth();
  const segments = useSegments();

  if (!isDesktop) return <>{children}</>;

  // Only show the sidebar once the user is in the app proper — not on the
  // splash, sign-in, or onboarding (those get a clean centered frame).
  const signedIn = PREVIEW_MODE || !!session;
  const inApp = signedIn && segments[0] !== '(auth)' && segments[0] !== 'onboarding';

  return (
    <View style={[styles.canvas, { backgroundColor: theme.background }]}>
      {inApp ? <DesktopSidebar /> : null}
      <View style={[styles.contentArea, { backgroundColor: theme.background }]}>
        <View style={[styles.frame, { backgroundColor: theme.background }]}>{children}</View>
      </View>
    </View>
  );
}

function DesktopSidebar() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { signOut } = useAuth();
  const activeTab = segments[0] === '(tabs)' ? segments[1] : undefined;

  const go = (path: string) => router.push(path as never);

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.background, borderRightColor: theme.border }]}>
      <View style={styles.brand}>
        <LinearGradient
          colors={['#2EA0FF', '#1257B0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.brandBadge}>
          <Image source={LOGO_SOURCE} style={styles.brandLogo} contentFit="contain" />
        </LinearGradient>
        <ThemedText type="smallBold" numberOfLines={1}>
          My Fitness Buddy
        </ThemedText>
      </View>

      <View style={styles.navList}>
        <NavLink emoji="🍽️" label="Nutrition" active={activeTab === 'nutrition'} onPress={() => go('/(tabs)/nutrition')} />
        <NavLink emoji="🏋️" label="Workout" active={activeTab === 'workout'} onPress={() => go('/(tabs)/workout')} />
        <NavLink emoji="📊" label="Body" active={activeTab === 'body'} onPress={() => go('/(tabs)/body')} />
        <NavLink emoji="👤" label="Profile" active={activeTab === 'profile'} onPress={() => go('/(tabs)/profile')} />
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.navList}>
        <NavLink emoji="🤝" label="Share & coaches" onPress={() => go('/share')} />
        <NavLink emoji="🎯" label="Edit goals" onPress={() => go('/goals')} />
      </View>

      <View style={{ flex: 1 }} />

      <NavLink emoji="🚪" label="Sign out" danger onPress={signOut} />
    </View>
  );
}

function NavLink({
  emoji,
  label,
  active,
  danger,
  onPress,
}: {
  emoji: string;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navItem,
        {
          backgroundColor: active
            ? theme.backgroundSelected
            : pressed
              ? theme.backgroundElement
              : 'transparent',
        },
      ]}>
      <ThemedText style={{ fontSize: 18 }}>{emoji}</ThemedText>
      <ThemedText
        type="smallBold"
        themeColor={danger ? 'danger' : active ? 'primary' : 'text'}
        numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, flexDirection: 'row' },
  contentArea: { flex: 1, alignItems: 'center' },
  frame: { flex: 1, width: '100%', maxWidth: FRAME_WIDTH },
  sidebar: {
    width: 248,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.four,
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
  },
  brandBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  brandLogo: { width: 26, height: 26, borderRadius: 6 },
  navList: { gap: Spacing.half },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.two, marginHorizontal: Spacing.two },
});
