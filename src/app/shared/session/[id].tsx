import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BODY_PART_META } from '@/lib/bodyparts';
import { distanceKm, estimateCalories } from '@/lib/cardio';
import { formatDuration } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import type { BodyPart, Unit, WorkoutSession, WorkoutSet } from '@/lib/types';
import { fromKg, round1 } from '@/lib/units';

type JoinedSet = WorkoutSet & { exercises: { name: string; body_part: BodyPart } | null };
type ExerciseGroup = { exerciseId: string; name: string; bodyPart: BodyPart; sets: WorkoutSet[] };

function groupByExercise(rows: JoinedSet[]): ExerciseGroup[] {
  const map = new Map<string, ExerciseGroup>();
  for (const r of rows) {
    const g = map.get(r.exercise_id) ?? {
      exerciseId: r.exercise_id,
      name: r.exercises?.name ?? 'Exercise',
      bodyPart: r.exercises?.body_part ?? 'chest',
      sets: [],
    };
    g.sets.push(r);
    map.set(r.exercise_id, g);
  }
  return [...map.values()];
}

// Full-screen detail for one shared session (opened from the coach view). It
// re-fetches by owner + session id so RLS stays scoped to the shared owner.
export default function SharedSessionScreen() {
  const theme = useTheme();
  const { id, ownerId } = useLocalSearchParams<{ id: string; ownerId: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [unit, setUnit] = useState<Unit>('kg');
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !ownerId) return;
    let active = true;
    (async () => {
      const [profileRes, sessRes, setsRes] = await Promise.all([
        supabase.from('profiles').select('unit_pref, weight_kg').eq('user_id', ownerId).maybeSingle(),
        supabase
          .from('workout_sessions')
          .select('*')
          .eq('id', id)
          .eq('user_id', ownerId)
          .maybeSingle(),
        supabase
          .from('workout_sets')
          .select('*, exercises(name, body_part)')
          .eq('session_id', id)
          .eq('user_id', ownerId)
          .order('set_number', { ascending: true }),
      ]);
      if (!active) return;
      setUnit((profileRes.data?.unit_pref as Unit) ?? 'kg');
      setWeightKg((profileRes.data?.weight_kg as number | null) ?? null);
      setSession((sessRes.data as WorkoutSession) ?? null);
      setGroups(groupByExercise((setsRes.data ?? []) as JoinedSet[]));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id, ownerId]);

  const clock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const start = session ? new Date(session.started_at) : null;
  const end = session?.ended_at ? new Date(session.ended_at) : null;
  const totalSets = groups.reduce((a, g) => a + g.sets.length, 0);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Session detail' }} />
      {loading ? (
        <View style={{ padding: Spacing.four, alignItems: 'center' }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : !session ? (
        <View style={{ padding: Spacing.four }}>
          <ThemedText themeColor="textSecondary">This session is no longer available.</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.headerCard}>
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle">⏱  Session</ThemedText>
              {start ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                  {clock(start)}
                  {end ? ` – ${clock(end)}` : ''}
                </ThemedText>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText type="title" themeColor="primary" style={{ fontSize: 22 }}>
                {formatDuration(session.duration_seconds ?? 0)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {groups.length} {groups.length === 1 ? 'exercise' : 'exercises'} · {totalSets}{' '}
                {totalSets === 1 ? 'set' : 'sets'}
              </ThemedText>
            </View>
          </Card>

          {groups.length === 0 ? (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                No sets recorded.
              </ThemedText>
            </Card>
          ) : (
            groups.map((g) => (
              <ExerciseCard key={g.exerciseId} group={g} unit={unit} weightKg={weightKg} />
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function ExerciseCard({
  group,
  unit,
  weightKg,
}: {
  group: ExerciseGroup;
  unit: Unit;
  weightKg: number | null;
}) {
  const theme = useTheme();
  const isCardio = group.bodyPart === 'cardio';
  const meta = BODY_PART_META[group.bodyPart];
  return (
    <Card>
      <View style={styles.exTitleRow}>
        <ThemedText type="smallBold" style={{ flex: 1 }}>
          {meta?.emoji ?? '🏋️'}  {group.name}
        </ThemedText>
        {meta ? (
          <View style={[styles.tag, { backgroundColor: meta.color + '22' }]}>
            <ThemedText type="small" style={{ color: meta.color, fontWeight: '700' }}>
              {meta.label}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {group.sets.map((s, i) => (
        <View key={s.id} style={[styles.setRow, { borderTopColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.setNum}>
            {i + 1}
          </ThemedText>
          {isCardio ? (
            <ThemedText type="small" style={{ flex: 1 }}>
              {formatDuration(s.duration_seconds ?? 0)}
              {s.speed_kmh != null ? ` · ${round1(s.speed_kmh)} km/h` : ''}
              {s.incline != null ? ` · ${s.incline}% incline` : ''}
              {distanceKm(s.speed_kmh, s.duration_seconds) > 0
                ? ` · ≈${round1(distanceKm(s.speed_kmh, s.duration_seconds))} km`
                : ''}
              {s.duration_seconds
                ? ` · ≈${estimateCalories({ durationSec: s.duration_seconds, speedKmh: s.speed_kmh, incline: s.incline, weightKg })} kcal`
                : ''}
            </ThemedText>
          ) : (
            <ThemedText type="small" style={{ flex: 1 }}>
              <ThemedText type="smallBold">
                {s.weight_kg != null ? `${round1(fromKg(s.weight_kg, unit))} ${unit}` : '—'}
              </ThemedText>
              {s.reps != null ? ` × ${s.reps} reps` : ''}
            </ThemedText>
          )}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  exTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tag: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: 999 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  setNum: { width: 20, textAlign: 'center' },
});
