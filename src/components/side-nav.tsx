import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';

type SideNavContextValue = { open: () => void };
const SideNavContext = createContext<SideNavContextValue>({ open: () => {} });

export function useSideNav() {
  return useContext(SideNavContext);
}

/** Hamburger (☰) button — place in a screen header to open the side nav. */
export function MenuButton() {
  const { open } = useSideNav();
  return (
    <Pressable onPress={open} hitSlop={10} style={{ paddingRight: Spacing.two }}>
      <ThemedText style={{ fontSize: 24 }}>☰</ThemedText>
    </Pressable>
  );
}

type Item = { label: string; emoji: string; onPress: () => void };

export function SideNavProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const go = (path: string) => {
    close();
    router.push(path as never);
  };

  const items: Item[] = [
    { label: 'Share & coaches', emoji: '🤝', onPress: () => go('/share') },
    { label: 'Edit daily goals', emoji: '🎯', onPress: () => go('/goals') },
    {
      label: 'Connect apps',
      emoji: '⌚️',
      onPress: () =>
        Alert.alert(
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
                  My Fitness Buddy
                </ThemedText>
                {session?.user.email ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {session.user.email}
                  </ThemedText>
                ) : null}
              </View>

              <View style={styles.items}>
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
  backdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    width: '78%',
    maxWidth: 320,
    height: '100%',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  header: { padding: Spacing.four, gap: Spacing.one },
  items: { flex: 1, paddingHorizontal: Spacing.two, gap: Spacing.one },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    margin: Spacing.two,
    borderRadius: Spacing.two,
  },
});
