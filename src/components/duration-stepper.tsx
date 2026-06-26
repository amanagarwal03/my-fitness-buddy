import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/date';

// A −/＋ stepper for time-based entries (plank holds, cardio duration). Bumps in
// 15-second steps and never goes below 0.
export function DurationStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const theme = useTheme();
  const bump = (d: number) => onChange(Math.max(0, value + d));
  return (
    <View style={[styles.durWrap, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <Pressable
        onPress={() => bump(-15)}
        hitSlop={6}
        style={[styles.durBtn, { borderRightColor: theme.border, borderRightWidth: StyleSheet.hairlineWidth }]}>
        <ThemedText style={[styles.durGlyph, { color: theme.primary }]}>−</ThemedText>
      </Pressable>
      <ThemedText style={[styles.durVal, { color: theme.text }]}>{formatDuration(value)}</ThemedText>
      <Pressable
        onPress={() => bump(15)}
        hitSlop={6}
        style={[styles.durBtn, { borderLeftColor: theme.border, borderLeftWidth: StyleSheet.hairlineWidth }]}>
        <ThemedText style={[styles.durGlyph, { color: theme.primary }]}>＋</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  durWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 48,
  },
  durBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  durGlyph: { fontSize: 22, lineHeight: 26, fontWeight: '800' },
  durVal: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', alignSelf: 'center' },
});
