import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen, SegmentedControl } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { distanceKm } from '@/lib/cardio';
import { formatDuration } from '@/lib/date';
import { PREVIEW_MODE, previewProgressKg, previewProgressKmh } from '@/lib/preview';
import { supabase } from '@/lib/supabase';
import type { BodyPart, Unit, WorkoutSet } from '@/lib/types';
import { fromKg, round1 } from '@/lib/units';

const HERO_GRADIENT = ['#2EA0FF', '#1257B0'] as const;

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

type StrengthStats = {
  kind: 'strength';
  best: number; // kg
  est1rm: number; // kg, Epley
  totalVolume: number; // kg
  totalSets: number;
  totalReps: number;
  sessions: number;
  bestDay: string | null; // performed_on of the highest-volume day
};
type CardioStats = {
  kind: 'cardio';
  topSpeed: number; // km/h
  longest: number; // seconds
  totalDistance: number; // km
  totalDuration: number; // seconds
  sessions: number;
  bestDay: string | null; // performed_on of the top-speed day
};

export default function ProgressScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const uid = session?.user.id;
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
  const metricLabel = isCardio ? 'Top speed' : 'Top set';

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
    if (!uid) return;
    const since = new Date();
    since.setDate(since.getDate() - 365);
    const [profileRes, setsRes] = await Promise.all([
      supabase.from('profiles').select('unit_pref').eq('user_id', uid).maybeSingle(),
      supabase
        .from('workout_sets')
        .select('*')
        .eq('user_id', uid)
        .eq('exercise_id', id)
        .gte('performed_on', since.toISOString().slice(0, 10))
        .order('performed_on', { ascending: true }),
    ]);
    setUnit((profileRes.data?.unit_pref as Unit) ?? 'kg');
    setSets((setsRes.data as WorkoutSet[]) ?? []);
    setLoading(false);
  }, [id, uid]);

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

  // All-time stats for the header tiles (independent of the selected range).
  const stats = useMemo<StrengthStats | CardioStats | null>(() => {
    if (sets.length === 0) return null;
    const days = new Set<string>();
    if (isCardio) {
      let topSpeed = 0;
      let longest = 0;
      let totalDistance = 0;
      let totalDuration = 0;
      let bestDay: string | null = null;
      for (const s of sets) {
        days.add(s.performed_on);
        const spd = s.speed_kmh ?? 0;
        if (spd > topSpeed) {
          topSpeed = spd;
          bestDay = s.performed_on;
        }
        longest = Math.max(longest, s.duration_seconds ?? 0);
        totalDistance += distanceKm(s.speed_kmh, s.duration_seconds);
        totalDuration += s.duration_seconds ?? 0;
      }
      return { kind: 'cardio', topSpeed, longest, totalDistance, totalDuration, sessions: days.size, bestDay };
    }
    let best = 0;
    let est1rm = 0;
    let totalVolume = 0;
    let totalReps = 0;
    let totalSets = 0;
    const volByDay = new Map<string, number>();
    for (const s of sets) {
      days.add(s.performed_on);
      const w = s.weight_kg ?? 0;
      const r = s.reps ?? 0;
      best = Math.max(best, w);
      est1rm = Math.max(est1rm, w * (1 + r / 30)); // Epley 1RM estimate
      totalVolume += w * r;
      totalReps += r;
      totalSets += 1;
      volByDay.set(s.performed_on, (volByDay.get(s.performed_on) ?? 0) + w * r);
    }
    let bestDay: string | null = null;
    let bestVol = -1;
    for (const [day, vol] of volByDay) {
      if (vol > bestVol) {
        bestVol = vol;
        bestDay = day;
      }
    }
    return { kind: 'strength', best, est1rm, totalVolume, totalSets, totalReps, sessions: days.size, bestDay };
  }, [sets, isCardio]);

  // Per-day set-by-set history (most recent first).
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
  const trend = delta == null || delta === 0 ? 'No change' : delta > 0 ? 'Progressing' : 'Easing off';

  // Bar chart: highlight the record bar within the selected range.
  const maxVal = points.reduce((m, p) => Math.max(m, p.value), 0);
  const chartWidth = Dimensions.get('window').width - Spacing.three * 2 - Spacing.three * 2;
  const n = Math.max(points.length, 1);
  const slot = chartWidth / n;
  const barWidth = Math.max(10, Math.min(30, slot * 0.6));
  const spacing = Math.max(6, slot - barWidth);
  const barData = points.map((p) => ({
    value: p.value,
    label: p.label,
    frontColor: p.value === maxVal ? theme.success : theme.primary,
    gradientColor: p.value === maxVal ? theme.success : '#7DC4FF',
  }));

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: name ? `${name} — Progress` : 'Progress' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* ---------- Hero ---------- */}
        <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <ThemedText style={styles.heroLabel}>{metricLabel.toUpperCase()}</ThemedText>
          {points.length === 0 ? (
            <ThemedText style={styles.heroValue}>—</ThemedText>
          ) : (
            <>
              <View style={styles.heroValueRow}>
                <ThemedText style={styles.heroValue}>{last}</ThemedText>
                <ThemedText style={styles.heroUnit}>{metricUnit}</ThemedText>
              </View>
              {delta != null ? (
                <View style={styles.trendPill}>
                  <ThemedText style={styles.trendText}>
                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)} {metricUnit} · {trend}
                  </ThemedText>
                </View>
              ) : null}
            </>
          )}
        </LinearGradient>

        {points.length === 0 ? (
          <Card>
            <ThemedText themeColor="textSecondary">
              {loading ? 'Loading…' : 'No data yet. Log some sets to see your progress here.'}
            </ThemedText>
          </Card>
        ) : (
          <>
            {/* ---------- Stat tiles ---------- */}
            {stats?.kind === 'strength' ? (
              <View style={styles.tileGrid}>
                <StatTile emoji="🏆" accent={theme.success} label="Personal best" value={`${round1(fromKg(stats.best, unit))}`} unit={unit} />
                <StatTile emoji="💪" accent={theme.primary} label="Est. 1RM" value={`${Math.round(fromKg(stats.est1rm, unit))}`} unit={unit} />
                <StatTile emoji="🔥" accent="#F59E0B" label="Total volume" value={compact(Math.round(fromKg(stats.totalVolume, unit)))} unit={unit} />
                <StatTile emoji="📅" accent="#8B5CF6" label="Sessions" value={`${stats.sessions}`} unit={`${stats.totalSets} sets`} />
              </View>
            ) : stats?.kind === 'cardio' ? (
              <View style={styles.tileGrid}>
                <StatTile emoji="⚡" accent={theme.success} label="Top speed" value={`${round1(stats.topSpeed)}`} unit="km/h" />
                <StatTile emoji="⏱" accent={theme.primary} label="Longest" value={formatDuration(stats.longest)} unit="" />
                <StatTile emoji="📏" accent="#F59E0B" label="Total distance" value={`${round1(stats.totalDistance)}`} unit="km" />
                <StatTile emoji="📅" accent="#8B5CF6" label="Sessions" value={`${stats.sessions}`} unit={formatDuration(stats.totalDuration)} />
              </View>
            ) : null}

            {/* ---------- Bar chart ---------- */}
            <Card>
              <View style={styles.chartHead}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {metricLabel.toUpperCase()} OVER TIME
                </ThemedText>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Record
                  </ThemedText>
                </View>
              </View>
              <SegmentedControl<Range>
                value={range}
                onChange={setRange}
                options={[
                  { label: 'Daily', value: 'day' },
                  { label: 'Weekly', value: 'week' },
                  { label: 'Monthly', value: 'month' },
                ]}
              />
              <View style={{ marginTop: Spacing.three }}>
                <BarChart
                  data={barData}
                  width={chartWidth}
                  height={190}
                  barWidth={barWidth}
                  spacing={spacing}
                  initialSpacing={spacing}
                  endSpacing={0}
                  barBorderTopLeftRadius={5}
                  barBorderTopRightRadius={5}
                  showGradient
                  frontColor={theme.primary}
                  maxValue={maxVal > 0 ? Math.ceil((maxVal * 1.18) / 5) * 5 : 10}
                  noOfSections={4}
                  yAxisThickness={0}
                  xAxisColor={theme.border}
                  rulesColor={theme.border}
                  rulesType="dashed"
                  yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 9 }}
                  disableScroll
                  isAnimated
                />
              </View>
            </Card>
          </>
        )}

        {history.length > 0 ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              SET HISTORY
            </ThemedText>
            {history.map((day) => (
              <DayHistoryCard
                key={day.date}
                date={day.date}
                sets={day.sets}
                unit={unit}
                isCardio={isCardio}
                isBest={day.date === stats?.bestDay}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// Compact big numbers: 12500 → "12.5k".
function compact(n: number): string {
  if (n >= 1000) return `${round1(n / 1000)}k`;
  return String(n);
}

function StatTile({
  emoji,
  accent,
  label,
  value,
  unit,
}: {
  emoji: string;
  accent: string;
  label: string;
  value: string;
  unit?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.tileIcon, { backgroundColor: accent + '22' }]}>
        <ThemedText style={{ fontSize: 15 }}>{emoji}</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <ThemedText type="title" style={{ fontSize: 22 }}>
          {value}
        </ThemedText>
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function DayHistoryCard({
  date,
  sets,
  unit,
  isCardio,
  isBest,
}: {
  date: string;
  sets: WorkoutSet[];
  unit: Unit;
  isCardio: boolean;
  isBest?: boolean;
}) {
  const theme = useTheme();
  const d = new Date(`${date}T00:00:00`);
  const dateLabel = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  if (isCardio) {
    const s = sets[0];
    return (
      <Card>
        <View style={styles.dayHead}>
          <ThemedText type="smallBold">{dateLabel}</ThemedText>
          {isBest ? <BestBadge /> : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDuration(s?.duration_seconds ?? 0)}
          {s?.speed_kmh != null ? ` · ${round1(s.speed_kmh)} km/h` : ''}
          {s?.incline != null ? ` · ${s.incline}% incline` : ''}
        </ThemedText>
      </Card>
    );
  }

  // Strength: best set + total volume (display unit), plus a per-set bar so the
  // heaviest set reads at a glance.
  let best = 0;
  let volume = 0;
  for (const s of sets) {
    const w = s.weight_kg ?? 0;
    if (w > best) best = w;
    volume += w * (s.reps ?? 0);
  }

  return (
    <Card>
      <View style={styles.dayHead}>
        <ThemedText type="smallBold">{dateLabel}</ThemedText>
        <View style={styles.dayHeadRight}>
          {isBest ? <BestBadge /> : null}
          <ThemedText type="small" themeColor="textSecondary">
            {sets.length} set{sets.length > 1 ? 's' : ''}
          </ThemedText>
        </View>
      </View>
      <View style={{ gap: Spacing.one + 2, marginTop: Spacing.one }}>
        {sets.map((s) => {
          const w = s.weight_kg ?? 0;
          const pct = best > 0 ? Math.max(0.08, w / best) : 0;
          return (
            <View key={s.id} style={styles.setRow}>
              <ThemedText type="small" themeColor="textSecondary" style={{ width: 30 }}>
                #{s.set_number}
              </ThemedText>
              <View style={[styles.setBarTrack, { backgroundColor: theme.backgroundSelected }]}>
                <View
                  style={[
                    styles.setBarFill,
                    { flex: pct, backgroundColor: w === best ? theme.success : theme.primary },
                  ]}
                />
                <View style={{ flex: 1 - pct }} />
              </View>
              <ThemedText type="small" style={{ width: 96, textAlign: 'right' }}>
                <ThemedText type="smallBold">
                  {s.weight_kg != null ? `${round1(fromKg(s.weight_kg, unit))} ${unit}` : '—'}
                </ThemedText>
                {s.reps != null ? ` ×${s.reps}` : ''}
              </ThemedText>
            </View>
          );
        })}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
        Best {round1(fromKg(best, unit))} {unit} · Volume {Math.round(fromKg(volume, unit))} {unit}
      </ThemedText>
    </Card>
  );
}

function BestBadge() {
  const theme = useTheme();
  return (
    <View style={[styles.bestBadge, { backgroundColor: theme.success + '22' }]}>
      <ThemedText type="small" style={{ color: theme.success, fontWeight: '700' }}>
        🏆 Best
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  hero: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
  heroValue: { color: '#fff', fontSize: 44, fontWeight: '800' },
  heroUnit: { color: 'rgba(255,255,255,0.9)', fontSize: 18, fontWeight: '700' },
  trendPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    marginTop: Spacing.one,
  },
  trendText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    width: '48%',
    flexGrow: 1,
    gap: 2,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  chartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayHeadRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bestBadge: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: 999 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  setBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  setBarFill: { height: '100%', borderRadius: 4 },
});
