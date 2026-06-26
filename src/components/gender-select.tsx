import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Gender = 'male' | 'female' | 'other';

const OPTIONS: { value: Gender; label: string; symbol: string; color: string }[] = [
  { value: 'male', label: 'Male', symbol: '♂', color: '#2EA0FF' },
  { value: 'female', label: 'Female', symbol: '♀', color: '#EC4899' },
  { value: 'other', label: 'Other', symbol: '⚧', color: '#8B5CF6' },
];

/**
 * Card-style gender picker (three tappable cards with coloured icons). Shared by
 * the profile editor and onboarding so both feel the same.
 */
export function GenderSelect({
  value,
  onChange,
}: {
  value: Gender | null;
  onChange: (g: Gender) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">
        Gender
      </ThemedText>
      <View style={styles.genderRow}>
        {OPTIONS.map((o) => {
          const sel = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              style={[
                styles.genderCard,
                { borderColor: sel ? o.color : theme.border, backgroundColor: sel ? o.color + '1A' : 'transparent' },
              ]}>
              <View style={[styles.genderIcon, { backgroundColor: sel ? o.color : theme.backgroundSelected }]}>
                <ThemedText style={{ fontSize: 22, color: sel ? '#fff' : theme.textSecondary }}>
                  {o.symbol}
                </ThemedText>
              </View>
              <ThemedText type="smallBold" themeColor={sel ? 'text' : 'textSecondary'}>
                {o.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  genderRow: { flexDirection: 'row', gap: Spacing.two },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
  },
  genderIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
