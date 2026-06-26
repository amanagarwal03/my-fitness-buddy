import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');

// Stored value is ISO (YYYY-MM-DD); shown as MM-DD-YYYY.
const toDisplay = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : '';
};
const parseIso = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
};

/**
 * Date-of-birth picker: a tappable field that opens a calendar with an enum
 * month dropdown and a numeric year dropdown, then day selection on the grid.
 * Emits an ISO date (YYYY-MM-DD); displays MM-DD-YYYY. Future days are blocked.
 */
export function DobPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const parsed = useMemo(() => parseIso(value), [value]);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'calendar' | 'month' | 'year'>('calendar');
  const [year, setYear] = useState(parsed?.y ?? today.getFullYear() - 25);
  const [month, setMonth] = useState(parsed?.mo ?? 0);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = today.getFullYear(); y >= today.getFullYear() - 120; y--) list.push(y);
    return list;
  }, [today]);

  const openPicker = () => {
    if (parsed) {
      setYear(parsed.y);
      setMonth(parsed.mo);
    }
    setView('calendar');
    setOpen(true);
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null); // keep the last row aligned
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const selectedDay = parsed && parsed.y === year && parsed.mo === month ? parsed.d : null;

  const pickDay = (day: number) => {
    const d = new Date(year, month, day);
    if (d > today) return; // no future birth dates
    onChange(`${year}-${pad(month + 1)}-${pad(day)}`);
    setOpen(false);
  };

  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">
        Date of birth
      </ThemedText>
      <Pressable
        disabled={disabled}
        onPress={openPicker}
        style={[styles.field, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <ThemedText style={{ color: value ? theme.text : theme.textSecondary, fontSize: 16 }}>
          {value ? toDisplay(value) : 'MM-DD-YYYY'}
        </ThemedText>
        <ThemedText style={{ fontSize: 16 }}>📅</ThemedText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {}}>
            {/* Month + year selectors */}
            <View style={styles.selectorRow}>
              <Selector
                label={MONTHS[month]}
                active={view === 'month'}
                onPress={() => setView((v) => (v === 'month' ? 'calendar' : 'month'))}
                flex={1.5}
              />
              <Selector
                label={String(year)}
                active={view === 'year'}
                onPress={() => setView((v) => (v === 'year' ? 'calendar' : 'year'))}
                flex={1}
              />
            </View>

            {view === 'month' ? (
              <ListPicker
                items={MONTHS.map((m, i) => ({ label: m, value: i }))}
                selected={month}
                onSelect={(v) => {
                  setMonth(v);
                  setView('calendar');
                }}
              />
            ) : view === 'year' ? (
              <ListPicker
                items={years.map((y) => ({ label: String(y), value: y }))}
                selected={year}
                onSelect={(v) => {
                  setYear(v);
                  setView('calendar');
                }}
              />
            ) : (
              <View style={{ gap: Spacing.one }}>
                <View style={styles.weekRow}>
                  {WEEKDAYS.map((w, i) => (
                    <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.cellText}>
                      {w}
                    </ThemedText>
                  ))}
                </View>
                {weeks.map((week, wi) => (
                  <View key={wi} style={styles.weekRow}>
                    {week.map((day, di) => {
                      if (day == null) return <View key={di} style={styles.cell} />;
                      const isFuture = new Date(year, month, day) > today;
                      const isSelected = day === selectedDay;
                      return (
                        <Pressable
                          key={di}
                          disabled={isFuture}
                          onPress={() => pickDay(day)}
                          style={styles.cell}>
                          <View
                            style={[
                              styles.dayCircle,
                              isSelected && { backgroundColor: theme.primary },
                            ]}>
                            <ThemedText
                              type="small"
                              style={{
                                color: isSelected ? '#fff' : theme.text,
                                opacity: isFuture ? 0.3 : 1,
                                fontWeight: isSelected ? '700' : '400',
                              }}>
                              {day}
                            </ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}

            <Pressable onPress={() => setOpen(false)} style={styles.doneBtn} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="primary">
                Done
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Selector({
  label,
  active,
  onPress,
  flex,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  flex: number;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.selector,
        { flex, borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '14' : 'transparent' },
      ]}>
      <ThemedText type="smallBold" themeColor={active ? 'primary' : 'text'} numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {active ? '▴' : '▾'}
      </ThemedText>
    </Pressable>
  );
}

function ListPicker<T extends number>({
  items,
  selected,
  onSelect,
}: {
  items: { label: string; value: T }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: Spacing.one }}>
      {items.map((it) => {
        const isSel = it.value === selected;
        return (
          <Pressable
            key={it.value}
            onPress={() => onSelect(it.value)}
            style={[styles.listItem, isSel && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText themeColor={isSel ? 'primary' : 'text'} style={{ fontWeight: isSel ? '700' : '400' }}>
              {it.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  selectorRow: { flexDirection: 'row', gap: Spacing.two },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  list: { maxHeight: 240 },
  listItem: { paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three, borderRadius: Spacing.one },
  weekRow: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  cellText: { flex: 1, textAlign: 'center' },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  doneBtn: { alignSelf: 'flex-end', paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
});
