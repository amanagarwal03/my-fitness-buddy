import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CollapsibleCalendar } from '@/components/calendar';
import { MenuButton } from '@/components/side-nav';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clearActiveWorkout, liveElapsed, loadActiveWorkout } from '@/lib/activeWorkout';
import { BODY_PART_META } from '@/lib/bodyparts';
import { formatDuration, isoDate } from '@/lib/date';
import { PREVIEW_MODE, previewTodaySessions } from '@/lib/preview';
import { supabase } from '@/lib/supabase';
import { BODY_PARTS, type BodyPart, type Unit, type WorkoutSession, type WorkoutSet } from '@/lib/types';
import { fromKg, round1 } from '@/lib/units';

// A set with its exercise's name/body part joined in.
type JoinedSet = WorkoutSet & { exercises: { name: string; body_part: BodyPart } | null };
// Sets grouped under one exercise (within a session, or a manual day log).
type ExerciseGroup = { exerciseId: string; name: string; bodyPart: BodyPart; sets: WorkoutSet[] };

function dayLabel(d: Date): string {
  const today = isoDate();
  const target = isoDate(d);
  if (target === today) return 'Today';
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (target === isoDate(yest)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

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

export default function WorkoutScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [daySessions, setDaySessions] = useState<WorkoutSession[]>([]);
  const [sessionGroups, setSessionGroups] = useState<Record<string, ExerciseGroup[]>>({});
  const [manualGroups, setManualGroups] = useState<ExerciseGroup[]>([]);
  const [dayMarks, setDayMarks] = useState<Set<string>>(new Set());
  const [unit, setUnit] = useState<Unit>('kg');
  const [activeElapsed, setActiveElapsed] = useState<number | null>(null);

  const checkActive = useCallback(async () => {
    const w = await loadActiveWorkout();
    setActiveElapsed(w ? liveElapsed(w) : null);
  }, []);

  const loadDay = useCallback(async () => {
    if (PREVIEW_MODE) {
      setSessionGroups({});
      setManualGroups([]);
      setDaySessions(previewTodaySessions);
      return;
    }
    const day = isoDate(selectedDate);
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    const [profileRes, setsRes, sessRes] = await Promise.all([
      supabase.from('profiles').select('unit_pref').maybeSingle(),
      supabase
        .from('workout_sets')
        .select('*, exercises(name, body_part)')
        .eq('performed_on', day)
        .order('set_number', { ascending: true }),
      supabase
        .from('workout_sessions')
        .select('*')
        .gte('started_at', dayStart.toISOString())
        .lte('started_at', dayEnd.toISOString())
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: true }),
    ]);
    setUnit((profileRes.data?.unit_pref as Unit) ?? 'kg');
    setDaySessions((sessRes.data as WorkoutSession[]) ?? []);

    const rows = (setsRes.data ?? []) as JoinedSet[];
    const bySession: Record<string, JoinedSet[]> = {};
    const manual: JoinedSet[] = [];
    for (const r of rows) {
      if (r.session_id) (bySession[r.session_id] ??= []).push(r);
      else manual.push(r);
    }
    const grouped: Record<string, ExerciseGroup[]> = {};
    for (const [sid, srows] of Object.entries(bySession)) grouped[sid] = groupByExercise(srows);
    setSessionGroups(grouped);
    setManualGroups(groupByExercise(manual));
  }, [selectedDate]);

  const loadMarks = useCallback(async () => {
    if (PREVIEW_MODE) return;
    const since = new Date();
    since.setDate(since.getDate() - 120);
    const { data } = await supabase
      .from('workout_sets')
      .select('performed_on')
      .gte('performed_on', isoDate(since));
    if (data) setDayMarks(new Set(data.map((r: { performed_on: string }) => r.performed_on)));
  }, []);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  useFocusEffect(
    useCallback(() => {
      loadDay();
      loadMarks();
      checkActive();
    }, [loadDay, loadMarks, checkActive]),
  );

  const discardActive = () => {
    Alert.alert('Discard in-progress workout?', 'This clears the workout you started.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await clearActiveWorkout();
          setActiveElapsed(null);
        },
      },
    ]);
  };

  const deleteSession = (s: WorkoutSession) => {
    const remove = async () => {
      if (PREVIEW_MODE) {
        setDaySessions((prev) => prev.filter((x) => x.id !== s.id));
        return;
      }
      // Remove the session and its sets (sets cascade via session_id on delete).
      await supabase.from('workout_sets').delete().eq('session_id', s.id);
      await supabase.from('workout_sessions').delete().eq('id', s.id);
      loadDay();
      loadMarks();
    };
    Alert.alert('Delete session?', 'This removes the session, its duration, and all its sets.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  };

  const deleteManualLog = (g: ExerciseGroup) => {
    const remove = async () => {
      if (PREVIEW_MODE) {
        setManualGroups((prev) => prev.filter((x) => x.exerciseId !== g.exerciseId));
        return;
      }
      await supabase
        .from('workout_sets')
        .delete()
        .eq('exercise_id', g.exerciseId)
        .eq('performed_on', isoDate(selectedDate))
        .is('session_id', null);
      loadDay();
      loadMarks();
    };
    Alert.alert('Clear log?', `Remove the quick log for ${g.name} on ${dayLabel(selectedDate)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: remove },
    ]);
  };

  const hasAnything = daySessions.length > 0 || manualGroups.length > 0;
  const viewingToday = isoDate(selectedDate) === isoDate();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <MenuButton />
          <ThemedText type="subtitle">Workout</ThemedText>
        </View>

        {activeElapsed != null ? (
          <View style={{ gap: Spacing.two }}>
            <Button
              title={`▶  Resume Workout · ${formatDuration(activeElapsed)}`}
              onPress={() => router.push('/workout/log')}
            />
            <Pressable onPress={discardActive} style={{ alignSelf: 'center' }} hitSlop={8}>
              <ThemedText type="small" themeColor="danger">
                Discard in-progress workout
              </ThemedText>
            </Pressable>
          </View>
        ) : viewingToday ? (
          <Button title="＋  Start Workout" onPress={() => router.push('/workout/log')} />
        ) : null}

        {/* Calendar: pick a day to see what was logged */}
        <CollapsibleCalendar
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          markedDays={dayMarks}
        />
        <ThemedText type="smallBold">Logged on {dayLabel(selectedDate)}</ThemedText>

        {!viewingToday ? (
          <View style={[styles.readOnly, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary">
              📖  Viewing a past day — read only. Switch to Today to log a workout.
            </ThemedText>
          </View>
        ) : null}

        {daySessions.map((s, i) => (
          <SessionCard
            key={s.id}
            index={i}
            session={s}
            groups={sessionGroups[s.id] ?? []}
            unit={unit}
            onDelete={() => deleteSession(s)}
          />
        ))}

        {manualGroups.length > 0 ? (
          <ThemedText type="smallBold" themeColor="textSecondary">
            QUICK LOGS
          </ThemedText>
        ) : null}
        {manualGroups.map((g) => (
          <ExerciseLogCard key={g.exerciseId} group={g} unit={unit} onDelete={() => deleteManualLog(g)} />
        ))}

        {!hasAnything ? (
          <Card>
            <ThemedText themeColor="textSecondary">Nothing logged on {dayLabel(selectedDate)}.</ThemedText>
          </Card>
        ) : null}

        {/* Per-body-part logging (incl. cardio) + progress — today only */}
        {viewingToday ? (
        <>
        <ThemedText type="smallBold" themeColor="textSecondary">
          BROWSE BY MUSCLE GROUP
        </ThemedText>
        <View style={styles.muscleList}>
          {BODY_PARTS.map((bp) => {
            const meta = BODY_PART_META[bp];
            return (
              <Pressable
                key={bp}
                style={({ pressed }) => [
                  styles.muscleRow,
                  {
                    backgroundColor: pressed ? theme.backgroundElement : theme.background,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push({ pathname: '/workout/[bodyPart]', params: { bodyPart: bp } })}>
                <View style={[styles.muscleBadge, { backgroundColor: meta.color + '22' }]}>
                  <ThemedText style={{ fontSize: 22 }}>{meta.emoji}</ThemedText>
                </View>
                <ThemedText type="smallBold" style={{ flex: 1 }}>
                  {meta.label}
                </ThemedText>
                <View style={[styles.muscleAccent, { backgroundColor: meta.color }]} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ›
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SessionCard({
  index,
  session,
  groups,
  unit,
  onDelete,
}: {
  index: number;
  session: WorkoutSession;
  groups: ExerciseGroup[];
  unit: Unit;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const clock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const start = new Date(session.started_at);
  const end = session.ended_at ? new Date(session.ended_at) : null;
  const totalSets = groups.reduce((a, g) => a + g.sets.length, 0);

  return (
    <Card>
      <View style={styles.sessionHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">⏱  Session {index + 1}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {clock(start)}
            {end ? ` – ${clock(end)}` : ''}
          </ThemedText>
        </View>
        <View style={styles.sessionStats}>
          <ThemedText type="smallBold" themeColor="primary">
            {formatDuration(session.duration_seconds ?? 0)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {totalSets} {totalSets === 1 ? 'set' : 'sets'}
          </ThemedText>
        </View>
        <Pressable onPress={onDelete} hitSlop={10} style={{ paddingLeft: Spacing.two }}>
          <ThemedText type="smallBold" themeColor="danger">
            ✕
          </ThemedText>
        </Pressable>
      </View>

      {groups.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No sets recorded.
        </ThemedText>
      ) : (
        groups.map((g) => (
          <View key={g.exerciseId} style={[styles.exerciseBlock, { borderTopColor: theme.border }]}>
            <ExerciseDetail group={g} unit={unit} />
          </View>
        ))
      )}
    </Card>
  );
}

// One exercise's sets (used inside a session card).
function ExerciseDetail({ group, unit }: { group: ExerciseGroup; unit: Unit }) {
  const isCardio = group.bodyPart === 'cardio';
  const meta = BODY_PART_META[group.bodyPart];
  return (
    <View>
      <View style={styles.exerciseTitleRow}>
        <ThemedText type="smallBold">
          {meta?.emoji ?? '🏋️'}  {group.name}
        </ThemedText>
        {meta ? (
          <View style={[styles.groupTag, { backgroundColor: meta.color + '22' }]}>
            <ThemedText type="small" style={{ color: meta.color, fontWeight: '600' }}>
              {meta.label}
            </ThemedText>
          </View>
        ) : null}
      </View>
      {isCardio
        ? group.sets.map((s) => (
            <ThemedText key={s.id} type="small" themeColor="textSecondary">
              {formatDuration(s.duration_seconds ?? 0)}
              {s.speed_kmh != null ? ` · ${round1(s.speed_kmh)} km/h` : ''}
              {s.incline != null ? ` · ${s.incline}% incline` : ''}
            </ThemedText>
          ))
        : group.sets.map((s, i) => (
            <ThemedText key={s.id} type="small">
              Set {i + 1}:{'  '}
              <ThemedText type="smallBold">
                {s.weight_kg != null ? `${round1(fromKg(s.weight_kg, unit))} ${unit}` : '—'}
              </ThemedText>
              {s.reps != null ? ` × ${s.reps} reps` : ''}
            </ThemedText>
          ))}
    </View>
  );
}

// A standalone exercise quick-log (no session), with its own delete control.
function ExerciseLogCard({
  group,
  unit,
  onDelete,
}: {
  group: ExerciseGroup;
  unit: Unit;
  onDelete: () => void;
}) {
  return (
    <Card>
      <View style={styles.sessionRow}>
        <View style={{ flex: 1 }}>
          <ExerciseDetail group={group} unit={unit} />
        </View>
        <Pressable onPress={onDelete} hitSlop={10}>
          <ThemedText type="smallBold" themeColor="danger">
            ✕
          </ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionStats: { alignItems: 'flex-end' },
  readOnly: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  exerciseTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  groupTag: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: 999 },
  exerciseBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    marginTop: Spacing.two,
    gap: 2,
  },
  muscleList: { gap: Spacing.two },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  muscleBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  muscleAccent: { width: 4, height: 24, borderRadius: 2 },
});
