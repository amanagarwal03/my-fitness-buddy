import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { BODY_PART_META } from '@/lib/bodyparts';
import { isoDate } from '@/lib/date';
import { PREVIEW_MODE } from '@/lib/preview';
import { supabase } from '@/lib/supabase';
import type { BodyPart, Exercise, Unit, WorkoutSet } from '@/lib/types';
import { fromKg, round1 } from '@/lib/units';

// Per-exercise progress summary derived from a year of logged sets.
type ExSummary = {
  id: string;
  name: string;
  isCardio: boolean;
  points: number[]; // per-day best metric (display unit), oldest → newest
  best: number; // best metric ever (display unit)
  last: number; // most recent day's best
  delta: number | null; // last − first across the available points
  lastDate: string; // YYYY-MM-DD of most recent log
  dayCount: number; // number of distinct days logged
};

function dateLabel(iso: string): string {
  const today = isoDate();
  if (iso === today) return 'Today';
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (iso === isoDate(yest)) return 'Yesterday';
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function GroupProgressScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { bodyPart } = useLocalSearchParams<{ bodyPart: BodyPart }>();
  const isCardio = bodyPart === 'cardio';
  const meta = bodyPart ? BODY_PART_META[bodyPart] : null;

  const [unit, setUnit] = useState<Unit>('kg');
  const [summaries, setSummaries] = useState<ExSummary[]>([]);
  const [notLogged, setNotLogged] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!bodyPart) return;
    if (PREVIEW_MODE) {
      setSummaries([]);
      setNotLogged([]);
      setLoading(false);
      return;
    }
    if (!uid) return;
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 365);

    const [profileRes, exRes] = await Promise.all([
      supabase.from('profiles').select('unit_pref').eq('user_id', uid).maybeSingle(),
      supabase.from('exercises').select('*').eq('body_part', bodyPart).order('name', { ascending: true }),
    ]);
    const pref = (profileRes.data?.unit_pref as Unit) ?? 'kg';
    setUnit(pref);

    const exercises = (exRes.data as Exercise[]) ?? [];
    const ids = exercises.map((e) => e.id);
    if (ids.length === 0) {
      setSummaries([]);
      setNotLogged([]);
      setLoading(false);
      return;
    }

    const { data: setsData } = await supabase
      .from('workout_sets')
      .select('*')
      .eq('user_id', uid)
      .in('exercise_id', ids)
      .gte('performed_on', isoDate(since))
      .order('performed_on', { ascending: true });
    const sets = (setsData as WorkoutSet[]) ?? [];

    // Group sets by exercise, then collapse to a per-day best metric.
    const byExercise = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const arr = byExercise.get(s.exercise_id) ?? [];
      arr.push(s);
      byExercise.set(s.exercise_id, arr);
    }

    const out: ExSummary[] = [];
    const empty: string[] = [];
    for (const exercise of exercises) {
      const exSets = byExercise.get(exercise.id);
      if (!exSets || exSets.length === 0) {
        empty.push(exercise.name);
        continue;
      }
      const metric = (s: WorkoutSet) => (isCardio ? s.speed_kmh : s.weight_kg) ?? 0;
      const perDay = new Map<string, number>();
      for (const s of exSets) {
        perDay.set(s.performed_on, Math.max(perDay.get(s.performed_on) ?? 0, metric(s)));
      }
      const days = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      // Convert kg → display unit for strength; cardio is already km/h.
      const toDisplay = (v: number) => round1(isCardio ? v : fromKg(v, pref));
      const recent = days.slice(-12);
      const points = recent.map(([, v]) => toDisplay(v));
      const allValues = days.map(([, v]) => toDisplay(v));
      const best = allValues.reduce((a, b) => Math.max(a, b), 0);
      const last = points[points.length - 1] ?? 0;
      const first = points[0];
      const delta = points.length >= 2 ? round1(last - first) : null;
      out.push({
        id: exercise.id,
        name: exercise.name,
        isCardio,
        points,
        best,
        last,
        delta,
        lastDate: days[days.length - 1][0],
        dayCount: days.length,
      });
    }

    // Most recently trained first.
    out.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    setSummaries(out);
    setNotLogged(empty);
    setLoading(false);
  }, [bodyPart, isCardio, uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const metricUnit = isCardio ? 'km/h' : unit;
  // Card inner width for sparklines: screen − screen padding − card padding.
  const chartWidth = Dimensions.get('window').width - Spacing.three * 2 - Spacing.three * 2;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: meta ? `${meta.label} progress` : 'Progress' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Card>
            <ThemedText themeColor="textSecondary">Loading…</ThemedText>
          </Card>
        ) : summaries.length === 0 ? (
          <Card>
            <ThemedText type="smallBold">No progress yet</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Log some {meta?.label.toLowerCase() ?? ''} sets and your per-exercise progress will show up
              here.
            </ThemedText>
          </Card>
        ) : (
          summaries.map((s) => {
            const trendColor =
              s.delta == null || s.delta === 0
                ? theme.textSecondary
                : s.delta > 0
                  ? theme.success
                  : theme.danger;
            const arrow = s.delta == null || s.delta === 0 ? '' : s.delta > 0 ? '▲' : '▼';
            return (
              <Pressable
                key={s.id}
                onPress={() =>
                  router.push({
                    pathname: '/workout/progress/[id]',
                    params: { id: s.id, name: s.name, bodyPart: bodyPart ?? '' },
                  })
                }>
                <Card>
                  <View style={styles.cardHead}>
                    <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>
                      {s.name}
                    </ThemedText>
                    <View style={{ alignItems: 'flex-end' }}>
                      <ThemedText type="smallBold" themeColor="primary">
                        {s.last} {metricUnit}
                      </ThemedText>
                      {s.delta != null && s.delta !== 0 ? (
                        <ThemedText type="small" style={{ color: trendColor }}>
                          {arrow} {Math.abs(s.delta)} {metricUnit}
                        </ThemedText>
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary">
                          best {s.best} {metricUnit}
                        </ThemedText>
                      )}
                    </View>
                  </View>

                  {s.points.length >= 2 ? (
                    <LineChart
                      data={s.points.map((v) => ({ value: v }))}
                      width={chartWidth}
                      height={56}
                      color={trendColor === theme.textSecondary ? theme.primary : trendColor}
                      thickness={2}
                      curved
                      adjustToWidth
                      initialSpacing={4}
                      endSpacing={4}
                      hideDataPoints={Platform.OS === 'web'}
                      dataPointsColor={theme.primary}
                      dataPointsRadius={2.5}
                      hideYAxisText
                      hideAxesAndRules
                      yAxisColor="transparent"
                      xAxisColor="transparent"
                    />
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      Log again to see your trend.
                    </ThemedText>
                  )}

                  <View style={styles.cardFoot}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Last: {dateLabel(s.lastDate)} · {s.dayCount}{' '}
                      {s.dayCount === 1 ? 'day' : 'days'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="primary">
                      Details ›
                    </ThemedText>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}

        {notLogged.length > 0 ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              NOT LOGGED YET
            </ThemedText>
            <Card>
              {notLogged.map((name) => (
                <ThemedText key={name} type="small" themeColor="textSecondary">
                  {name}
                </ThemedText>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
