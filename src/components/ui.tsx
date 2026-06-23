import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({
  children,
  edges = ['top'],
  style,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: ViewProps['style'];
}) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: theme.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewProps['style'] }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewProps['style'];
}) {
  const theme = useTheme();
  const bg =
    variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : theme.backgroundSelected;
  const fg = variant === 'secondary' ? theme.text : '#fff';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <ThemedText style={[styles.buttonText, { color: fg }]}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  style,
  secureTextEntry,
  ...rest
}: TextInputProps & { label?: string }) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(true);
  const isPassword = !!secureTextEntry;
  return (
    <View style={{ gap: Spacing.one }}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <View style={isPassword ? styles.fieldRow : undefined}>
        <TextInput
          placeholderTextColor={theme.textSecondary}
          secureTextEntry={isPassword && hidden}
          // Sensible defaults for password fields so secure typing stays smooth
          // on Android (autofill/autocorrect fighting a controlled value is the
          // usual cause of laggy/jumpy input). Callers can still override these.
          {...(isPassword
            ? { autoCapitalize: 'none' as const, autoCorrect: false, spellCheck: false }
            : null)}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            isPassword && styles.inputWithAction,
            style,
          ]}
          {...rest}
        />
        {isPassword ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8} style={styles.revealBtn}>
            <ThemedText type="smallBold" themeColor="primary">
              {hidden ? 'Show' : 'Hide'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segmentItem,
              active && { backgroundColor: theme.background, borderColor: theme.border },
            ]}>
            <ThemedText
              type="smallBold"
              themeColor={active ? 'text' : 'textSecondary'}
              style={{ textAlign: 'center' }}>
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const theme = useTheme();
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.progressFill, { flex: pct, backgroundColor: color }]} />
      <View style={{ flex: 1 - pct }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 16,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 48,
  },
  fieldRow: { position: 'relative', justifyContent: 'center' },
  inputWithAction: { paddingRight: 64 },
  revealBtn: { position: 'absolute', right: Spacing.three, paddingVertical: Spacing.one },
  segment: {
    flexDirection: 'row',
    borderRadius: Spacing.two,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.one + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
});
