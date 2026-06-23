import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TargetedEvent,
  type ViewProps,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sanitizeDecimal, sanitizeInt } from '@/lib/num';
import { round1 } from '@/lib/units';

/**
 * Numeric input flanked by large, tappable −/+ buttons. Weights use
 * `integer={false}` + step 5; reps use `integer` + step 1. Typing is sanitized
 * to a positive number, and the buttons nudge the value (never below 0).
 */
export function StepperInput({
  value,
  onChangeText,
  step,
  integer = false,
  placeholder,
  style,
  onFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  step: number;
  integer?: boolean;
  placeholder?: string;
  style?: ViewProps['style'];
  onFocus?: (e: NativeSyntheticEvent<TargetedEvent>) => void;
}) {
  const theme = useTheme();
  const sanitize = integer ? sanitizeInt : sanitizeDecimal;
  const bump = (delta: number) => {
    const base = Number(value) || 0;
    const raw = base + delta;
    const next = Math.max(0, integer ? Math.round(raw) : round1(raw));
    onChangeText(String(next));
  };
  return (
    <View
      style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.background }, style]}>
      <Pressable
        onPress={() => bump(-step)}
        hitSlop={6}
        style={({ pressed }) => [
          styles.btn,
          styles.btnLeft,
          { borderRightColor: theme.border },
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
        ]}>
        <ThemedText style={[styles.glyph, { color: theme.primary }]}>−</ThemedText>
      </Pressable>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(sanitize(t))}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        inputMode={integer ? 'numeric' : 'decimal'}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        onFocus={onFocus}
        style={[styles.input, { color: theme.text }]}
      />
      <Pressable
        onPress={() => bump(step)}
        hitSlop={6}
        style={({ pressed }) => [
          styles.btn,
          styles.btnRight,
          { borderLeftColor: theme.border },
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
        ]}>
        <ThemedText style={[styles.glyph, { color: theme.primary }]}>＋</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 50,
  },
  btn: { width: 40, alignItems: 'center', justifyContent: 'center' },
  btnLeft: { borderRightWidth: StyleSheet.hairlineWidth },
  btnRight: { borderLeftWidth: StyleSheet.hairlineWidth },
  input: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    paddingVertical: Spacing.two,
    minWidth: 34,
  },
  glyph: { fontSize: 22, lineHeight: 26, fontWeight: '800' },
});
