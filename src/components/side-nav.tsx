import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { showAlert } from '@/lib/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type SideNavContextValue = { open: () => void };
const SideNavContext = createContext<SideNavContextValue>({ open: () => {} });

export function useSideNav() {
  return useContext(SideNavContext);
}

/** Hamburger (☰) button — place in a screen header to open the side nav. */
export function MenuButton() {
  const { open } = useSideNav();
  const { isDesktop } = useResponsive();
  // On desktop the persistent sidebar replaces the slide-out nav.
  if (isDesktop) return null;
  return (
    <Pressable onPress={open} hitSlop={10} style={{ paddingRight: Spacing.two }}>
      <ThemedText style={{ fontSize: 24 }}>☰</ThemedText>
    </Pressable>
  );
}

/**
 * In-content title row (☰ + heading) matching the tab screens, so menu
 * destinations like Share and Goals line up identically. The ☰ hides on desktop
 * (the sidebar replaces it), leaving just the heading — same as the tabs.
 */
export function MenuHeader({ title }: { title: string }) {
  return (
    <View style={styles.menuHeader}>
      <MenuButton />
      <ThemedText type="subtitle" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </ThemedText>
    </View>
  );
}

/**
 * Header-left control for stacked screens: just the ☰ menu, so the side nav is
 * reachable from anywhere. On desktop the persistent sidebar replaces it, so it
 * renders nothing there.
 */
export function HeaderNav() {
  const { open } = useSideNav();
  const theme = useTheme();
  const { isDesktop } = useResponsive();
  if (isDesktop) return null;
  return (
    <View style={styles.headerNav}>
      <Pressable onPress={open} hitSlop={10} accessibilityLabel="Open menu">
        <ThemedText style={{ fontSize: 24, color: theme.text }}>☰</ThemedText>
      </Pressable>
    </View>
  );
}

type Item = { label: string; emoji: string; onPress: () => void };

export function SideNavProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [visible, setVisible] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  // Refresh the greeting name each time the nav opens (so it reflects edits made
  // on the profile screen). Scoped to the signed-in user.
  const open = useCallback(() => {
    setVisible(true);
    const uid = session?.user.id;
    if (uid) {
      supabase
        .from('profiles')
        .select('first_name')
        .eq('user_id', uid)
        .maybeSingle()
        .then(({ data }) => setFirstName((data?.first_name as string) ?? null));
    }
  }, [session?.user.id]);
  const close = useCallback(() => setVisible(false), []);

  const go = (path: string) => {
    close();
    router.push(path as never);
  };

  // The three main tabs, so the menu doubles as full navigation.
  const tabItems: Item[] = [
    { label: 'Nutrition', emoji: '🍽️', onPress: () => go('/(tabs)/nutrition') },
    { label: 'Workout', emoji: '🏋️', onPress: () => go('/(tabs)/workout') },
    { label: 'Body', emoji: '📊', onPress: () => go('/(tabs)/body') },
    { label: 'Profile', emoji: '👤', onPress: () => go('/(tabs)/profile') },
  ];

  const items: Item[] = [
    { label: 'Share & coaches', emoji: '🤝', onPress: () => go('/share') },
    { label: 'Edit daily goals', emoji: '🎯', onPress: () => go('/goals') },
    {
      label: 'Connect apps',
      emoji: '⌚️',
      onPress: () =>
        showAlert(
          'Coming soon',
          'Google Fit, Apple Health / Watch and Strava need a custom build of the app — they’re on the roadmap.',
        ),
    },
  ];

  return (
    <SideNavContext.Provider value={{ open }}>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable
            style={[styles.panel, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}>
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
              <View style={styles.header}>
                <ThemedText type="title" style={{ fontSize: 22 }}>
                  {firstName ? `Hello, ${firstName} 👋` : 'My Fitness Buddy'}
                </ThemedText>
                {firstName ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    My Fitness Buddy
                  </ThemedText>
                ) : session?.user.email ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {session.user.email}
                  </ThemedText>
                ) : null}
              </View>

              <View style={styles.items}>
                {tabItems.map((it) => (
                  <Pressable
                    key={it.label}
                    onPress={it.onPress}
                    style={({ pressed }) => [
                      styles.item,
                      { backgroundColor: pressed ? theme.backgroundElement : 'transparent' },
                    ]}>
                    <ThemedText style={{ fontSize: 20 }}>{it.emoji}</ThemedText>
                    <ThemedText type="smallBold">{it.label}</ThemedText>
                  </Pressable>
                ))}

                <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

                {items.map((it) => (
                  <Pressable
                    key={it.label}
                    onPress={it.onPress}
                    style={({ pressed }) => [
                      styles.item,
                      { backgroundColor: pressed ? theme.backgroundElement : 'transparent' },
                    ]}>
                    <ThemedText style={{ fontSize: 20 }}>{it.emoji}</ThemedText>
                    <ThemedText type="smallBold">{it.label}</ThemedText>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => {
                  close();
                  signOut();
                }}
                style={({ pressed }) => [
                  styles.item,
                  { backgroundColor: pressed ? theme.backgroundElement : 'transparent' },
                ]}>
                <ThemedText style={{ fontSize: 20 }}>🚪</ThemedText>
                <ThemedText type="smallBold" themeColor="danger">
                  Sign out
                </ThemedText>
              </Pressable>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </SideNavContext.Provider>
  );
}

const styles = StyleSheet.create({
  headerNav: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.two },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headerBack: { paddingRight: Spacing.one },
  backdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    width: '78%',
    maxWidth: 320,
    height: '100%',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  header: { padding: Spacing.four, gap: Spacing.one },
  items: { flex: 1, paddingHorizontal: Spacing.two, gap: Spacing.one },
  menuDivider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.two, marginHorizontal: Spacing.three },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    margin: Spacing.two,
    borderRadius: Spacing.two,
  },
});
