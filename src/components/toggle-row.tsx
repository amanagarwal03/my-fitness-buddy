import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Label + native Switch row, used for on/off preferences. */
export function ToggleRow({
  label,
  sublabel,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {sublabel ? (
          <ThemedText type="small" themeColor="textSecondary">
            {sublabel}
          </ThemedText>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: theme.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
});
