import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isoDate } from '@/lib/date';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const sameDay = (a: Date, b: Date) => isoDate(a) === isoDate(b);
const startOfWeek = (d: Date) => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
};
const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

/**
 * MyFitnessPal-style collapsible calendar. Shows the current week as a strip;
 * tap the chevron to expand to a full month. Days with logged data get a dot.
 */
export function CollapsibleCalendar({
  selectedDate,
  onSelect,
  markedDays,
  maxDate = new Date(),
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  markedDays?: Set<string>;
  maxDate?: Date;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  // Month shown when expanded (first of the month). Tracks the selection.
  const [cursor, setCursor] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  const today = isoDate();
  const maxIso = isoDate(maxDate);

  // Build the visible day grid.
  let rows: Date[][] = [];
  if (expanded) {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    let day = startOfWeek(first);
    const lastOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    while (day <= lastOfMonth || day.getDay() !== 0) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      rows.push(week);
      if (rows.length > 6) break;
    }
  } else {
    const ws = startOfWeek(selectedDate);
    rows = [Array.from({ length: 7 }, (_, i) => addDays(ws, i))];
  }

  const headerLabel = expanded
    ? cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : selectedDate.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const shiftMonth = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <View style={[styles.wrap, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.header}>
        {expanded ? (
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.navBtn}>
            <ThemedText type="subtitle">‹</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
        <ThemedText type="smallBold">{headerLabel}</ThemedText>
        {expanded ? (
          <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.navBtn}>
            <ThemedText type="subtitle">›</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.cellText}>
            {w}
          </ThemedText>
        ))}
      </View>

      {rows.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((d) => {
            const di = isoDate(d);
            const isSelected = sameDay(d, selectedDate);
            const isToday = di === today;
            const isFuture = di > maxIso;
            const otherMonth = expanded && d.getMonth() !== cursor.getMonth();
            const marked = markedDays?.has(di);
            return (
              <Pressable
                key={di}
                disabled={isFuture}
                onPress={() => {
                  onSelect(d);
                  setExpanded(false); // auto-collapse back to the week bar on pick
                }}
                style={styles.cell}>
                <View
                  style={[
                    styles.dayCircle,
                    // Worked-out days are tinted green; the selected day stays solid primary.
                    marked && !isSelected && { backgroundColor: theme.success + '2E' },
                    isSelected && { backgroundColor: marked ? theme.success : theme.primary },
                    !isSelected && isToday && { borderColor: theme.primary, borderWidth: 1.5 },
                  ]}>
                  <ThemedText
                    type="small"
                    style={{
                      color: isSelected
                        ? '#fff'
                        : marked
                          ? theme.success
                          : isFuture || otherMonth
                            ? theme.textSecondary
                            : theme.text,
                      opacity: isFuture ? 0.4 : otherMonth ? 0.5 : 1,
                      fontWeight: isToday || isSelected || marked ? '700' : '400',
                    }}>
                    {d.getDate()}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: marked && !isSelected ? theme.success : 'transparent' },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      ))}

      <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8} style={styles.expandBtn}>
        <ThemedText type="small" themeColor="primary">
          {expanded ? '▴ Show less' : '▾ Show month'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  navBtn: { width: 36, alignItems: 'center' },
  weekRow: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  cellText: { flex: 1, textAlign: 'center' },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
  expandBtn: { alignSelf: 'center', paddingVertical: Spacing.one },
});
