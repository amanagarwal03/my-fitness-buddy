import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen, SegmentedControl } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/date';
import { PREVIEW_MODE, previewProgressKg, previewProgressKmh } from '@/lib/preview';
import { supabase } from '@/lib/supabase';
import type { BodyPart, Unit, WorkoutSet } from '@/lib/types';
import { fromKg, round1 } from '@/lib/units';

function isoMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type Range = 'day' | 'week' | 'month';

type Point = { label: string; value: number };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Monday-based week start key.
function weekKey(d: Date) {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // 0 = Monday
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ProgressScreen() {
  const theme = useTheme();
  const { id, name, bodyPart } = useLocalSearchParams<{
    id: string;
    name?: string;
    bodyPart?: BodyPart;
  }>();
  const isCardio = bodyPart === 'cardio';
  const [range, setRange] = useState<Range>('day');
  const [unit, setUnit] = useState<Unit>('kg');
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [loading, setLoading] = useState(true);

  const metricUnit = isCardio ? 'km/h' : unit;
  const metricLabel = isCardio ? 'TOP SPEED' : 'TOP SET';

  const load = useCallback(async () => {
    if (!id) return;
    if (PREVIEW_MODE) {
      setUnit('kg');
      // Spread the sample history over recent days so day/week/month all render.
      const series = isCardio ? previewProgressKmh : previewProgressKg;
      const n = series.length;
      setSets(
        series.map((v, i) => ({
          id: `p${i}`,
          user_id: 'preview',
          exercise_id: String(id),
          session_id: null,
          performed_on: isoMinusDays(n - 1 - i),
          set_number: 1,
          weight_kg: isCardio ? null : v,
          reps: isCardio ? null : 6,
          duration_seconds: isCardio ? 30 * 60 : null,
          incline: isCardio ? 2 : null,
          speed_kmh: isCardio ? v : null,
        })),
      );
      setLoading(false);
      return;
    }
    const since = new Date();
    since.setDate(since.getDate() - 365);
    const [profileRes, setsRes] = await Promise.all([
      supabase.from('profiles').select('unit_pref').maybeSingle(),
      supabase
        .from('workout_sets')
        .select('*')
        .eq('exercise_id', id)
        .gte('performed_on', since.toISOString().slice(0, 10))
        .order('performed_on', { ascending: true }),
    ]);
    setUnit((profileRes.data?.unit_pref as Unit) ?? 'kg');
    setSets((setsRes.data as WorkoutSet[]) ?? []);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const points = useMemo<Point[]>(() => {
    if (sets.length === 0) return [];

    // Per-day best value: top speed (km/h) for cardio, else top weight (kg).
    const metric = (s: WorkoutSet) => (isCardio ? s.speed_kmh : s.weight_kg) ?? 0;
    const perDay = new Map<string, number>();
    for (const s of sets) {
      perDay.set(s.performed_on, Math.max(perDay.get(s.performed_on) ?? 0, metric(s)));
    }

    const buckets = new Map<string, { date: Date; value: number }>();
    for (const [dateStr, topKg] of perDay) {
      const d = new Date(`${dateStr}T00:00:00`);
      let key: string;
      let bucketDate: Date;
      if (range === 'day') {
        key = dateStr;
        bucketDate = d;
      } else if (range === 'week') {
        bucketDate = weekKey(d);
        key = bucketDate.toISOString().slice(0, 10);
      } else {
        bucketDate = new Date(d.getFullYear(), d.getMonth(), 1);
        key = monthKey(d);
      }
      const existing = buckets.get(key);
      // Use the best (max) top-set within the bucket.
      if (!existing || topKg > existing.value) buckets.set(key, { date: bucketDate, value: topKg });
    }

    const sorted = [...buckets.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
    const limit = range === 'day' ? 14 : 12;
    const recent = sorted.slice(-limit);

    return recent.map((b) => {
      // Cardio values are already km/h; weight values convert kg → display unit.
      const value = round1(isCardio ? b.value : fromKg(b.value, unit));
      let label: string;
      if (range === 'day') label = `${b.date.getMonth() + 1}/${b.date.getDate()}`;
      else if (range === 'week') label = `${b.date.getMonth() + 1}/${b.date.getDate()}`;
      else label = MONTHS[b.date.getMonth()];
      return { label, value };
    });
  }, [sets, range, unit, isCardio]);

  // Per-day set-by-set history (most recent first), with simple stats.
  const history = useMemo(() => {
    const byDay = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const arr = byDay.get(s.performed_on) ?? [];
      arr.push(s);
      byDay.set(s.performed_on, arr);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30)
      .map(([date, daySets]) => ({
        date,
        sets: [...daySets].sort((a, b) => a.set_number - b.set_number),
      }));
  }, [sets]);

  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  const delta = first != null && last != null ? round1(last - first) : null;
  const trend =
    delta == null || delta === 0 ? 'flat' : delta > 0 ? 'progressing' : 'regressing';
  const trendColor =
    trend === 'progressing' ? theme.success : trend === 'regressing' ? theme.danger : theme.textSecondary;

  const chartWidth = Dimensions.get('window').width - Spacing.three * 2 - Spacing.three * 2;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: name ? `${name} — Progress` : 'Progress' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <SegmentedControl<Range>
          value={range}
          onChange={setRange}
          options={[
            { label: 'Daily', value: 'day' },
            { label: 'Weekly', value: 'week' },
            { label: 'Monthly', value: 'month' },
          ]}
        />

        {points.length === 0 ? (
          <Card>
            <ThemedText themeColor="textSecondary">
              {loading ? 'Loading…' : 'No data yet. Log some sets to see your progress here.'}
            </ThemedText>
          </Card>
        ) : (
          <>
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                {metricLabel} ({metricUnit})
              </ThemedText>
              <View style={styles.summaryRow}>
                <ThemedText type="title" style={{ fontSize: 36 }}>
                  {last}
                </ThemedText>
                {delta != null ? (
                  <ThemedText type="smallBold" style={{ color: trendColor }}>
                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)} {metricUnit} · {trend}
                  </ThemedText>
                ) : null}
              </View>
            </Card>

            <Card>
              <LineChart
                data={points.map((p) => ({ value: p.value, label: p.label }))}
                width={chartWidth}
                height={200}
                color={theme.primary}
                thickness={3}
                dataPointsColor={theme.primary}
                textColor={theme.textSecondary}
                yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                yAxisColor={theme.border}
                xAxisColor={theme.border}
                rulesColor={theme.border}
                curved
                adjustToWidth
                hideDataPoints={Platform.OS === 'web'}
              />
            </Card>
          </>
        )}

        {history.length > 0 ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              SET HISTORY
            </ThemedText>
            {history.map((day) => (
              <DayHistoryCard key={day.date} date={day.date} sets={day.sets} unit={unit} isCardio={isCardio} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function DayHistoryCard({
  date,
  sets,
  unit,
  isCardio,
}: {
  date: string;
  sets: WorkoutSet[];
  unit: Unit;
  isCardio: boolean;
}) {
  const d = new Date(`${date}T00:00:00`);
  const dateLabel = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  if (isCardio) {
    const s = sets[0];
    return (
      <Card>
        <ThemedText type="smallBold">{dateLabel}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDuration(s?.duration_seconds ?? 0)}
          {s?.speed_kmh != null ? ` · ${round1(s.speed_kmh)} km/h` : ''}
          {s?.incline != null ? ` · ${s.incline}% incline` : ''}
        </ThemedText>
      </Card>
    );
  }

  // Strength stats: best set + total volume (weight × reps), in display unit.
  let best = 0;
  let volume = 0;
  for (const s of sets) {
    const w = s.weight_kg ?? 0;
    if (w > best) best = w;
    volume += w * (s.reps ?? 0);
  }

  return (
    <Card>
      <View style={styles.summaryRow}>
        <ThemedText type="smallBold">{dateLabel}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sets.length} set{sets.length > 1 ? 's' : ''}
        </ThemedText>
      </View>
      {sets.map((s) => (
        <ThemedText key={s.id} type="small">
          Set {s.set_number}:{'  '}
          <ThemedText type="smallBold">
            {s.weight_kg != null ? `${round1(fromKg(s.weight_kg, unit))} ${unit}` : '—'}
          </ThemedText>
          {s.reps != null ? ` × ${s.reps} reps` : ''}
        </ThemedText>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        Best {round1(fromKg(best, unit))} {unit} · Volume {Math.round(fromKg(volume, unit))} {unit}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
