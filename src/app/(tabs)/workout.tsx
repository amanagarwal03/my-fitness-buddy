import { LinearGradient } from 'expo-linear-gradient';
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
  // Display unit follows the profile by default, but the user can flip it here
  // without it resetting on every refresh.
  const [profileUnit, setProfileUnit] = useState<Unit>('kg');
  const [unitOverride, setUnitOverride] = useState<Unit | null>(null);
  const unit = unitOverride ?? profileUnit;
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
    setProfileUnit((profileRes.data?.unit_pref as Unit) ?? 'kg');
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

  // Day totals for the summary strip.
  const totalDuration = daySessions.reduce((a, s) => a + (s.duration_seconds ?? 0), 0);
  const totalSets =
    Object.values(sessionGroups)
      .flat()
      .reduce((a, g) => a + g.sets.length, 0) + manualGroups.reduce((a, g) => a + g.sets.length, 0);

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

        {/* Day header + unit toggle */}
        <View style={styles.dayHeader}>
          <ThemedText type="smallBold">Logged on {dayLabel(selectedDate)}</ThemedText>
          {hasAnything ? <UnitToggle unit={unit} onChange={setUnitOverride} /> : null}
        </View>

        {!viewingToday ? (
          <View style={[styles.readOnly, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary">
              📖  Viewing a past day — read only. Switch to Today to log a workout.
            </ThemedText>
          </View>
        ) : null}

        {/* Day summary strip */}
        {hasAnything ? (
          <View style={styles.summaryRow}>
            <SummaryStat emoji="⏱" label="Time" value={formatDuration(totalDuration)} accent={theme.primary} />
            <SummaryStat emoji="🏋️" label="Sets" value={String(totalSets)} accent={theme.success} />
            <SummaryStat
              emoji="🔥"
              label={daySessions.length === 1 ? 'Session' : 'Sessions'}
              value={String(daySessions.length)}
              accent="#F59E0B"
            />
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
          <Card style={styles.emptyCard}>
            <ThemedText style={{ fontSize: 34 }}>🏋️</ThemedText>
            <ThemedText type="smallBold">Nothing logged {dayLabel(selectedDate) === 'Today' ? 'yet' : `on ${dayLabel(selectedDate)}`}</ThemedText>
            {viewingToday ? (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Tap “Start Workout” above to log your first session.
              </ThemedText>
            ) : null}
          </Card>
        ) : null}

        {/* Per-body-part logging (incl. cardio) + progress — today only */}
        {viewingToday ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              EXERCISES & PROGRESS
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

function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (u: Unit) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.unitToggle, { borderColor: theme.border }]}>
      {(['kg', 'lbs'] as Unit[]).map((u) => (
        <Pressable
          key={u}
          onPress={() => onChange(u)}
          style={[styles.unitOption, { backgroundColor: u === unit ? theme.primary : 'transparent' }]}>
          <ThemedText type="smallBold" style={{ color: u === unit ? '#fff' : theme.textSecondary }}>
            {u}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

function SummaryStat({
  emoji,
  label,
  value,
  accent,
}: {
  emoji: string;
  label: string;
  value: string;
  accent: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.summaryStat, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: accent + '22' }]}>
        <ThemedText style={{ fontSize: 16 }}>{emoji}</ThemedText>
      </View>
      <ThemedText type="smallBold" style={{ fontSize: 17 }}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
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
    <Card style={styles.sessionCard}>
      {/* Header */}
      <View style={styles.sessionTop}>
        <LinearGradient
          colors={['#2EA0FF', '#1257B0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sessionBadge}>
          <ThemedText style={styles.sessionBadgeText}>{index + 1}</ThemedText>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">Session {index + 1}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {clock(start)}
            {end ? ` – ${clock(end)}` : ''}
          </ThemedText>
        </View>
        <View style={[styles.durationPill, { backgroundColor: theme.primary + '18' }]}>
          <ThemedText type="smallBold" themeColor="primary" style={{ fontVariant: ['tabular-nums'] }}>
            {formatDuration(session.duration_seconds ?? 0)}
          </ThemedText>
        </View>
        <Pressable onPress={onDelete} hitSlop={10} style={{ paddingLeft: Spacing.two }}>
          <ThemedText type="smallBold" themeColor="danger">
            ✕
          </ThemedText>
        </Pressable>
      </View>

      <View style={[styles.sessionMeta, { borderTopColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          {groups.length} {groups.length === 1 ? 'exercise' : 'exercises'} · {totalSets}{' '}
          {totalSets === 1 ? 'set' : 'sets'}
        </ThemedText>
      </View>

      {groups.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No sets recorded.
        </ThemedText>
      ) : (
        groups.map((g) => <ExerciseBlock key={g.exerciseId} group={g} unit={unit} />)
      )}
    </Card>
  );
}

// One exercise: color accent bar, name + muscle tag, and sets as chips.
function ExerciseBlock({ group, unit }: { group: ExerciseGroup; unit: Unit }) {
  const theme = useTheme();
  const isCardio = group.bodyPart === 'cardio';
  const meta = BODY_PART_META[group.bodyPart];
  return (
    <View style={styles.exBlock}>
      <View style={[styles.exAccent, { backgroundColor: meta?.color ?? theme.primary }]} />
      <View style={{ flex: 1, gap: Spacing.one + 2 }}>
        <View style={styles.exHeaderRow}>
          <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>
            {meta?.emoji ?? '🏋️'}  {group.name}
          </ThemedText>
          {meta ? (
            <View style={[styles.muscleTag, { backgroundColor: meta.color + '22' }]}>
              <ThemedText type="small" style={{ color: meta.color, fontWeight: '700' }}>
                {meta.label}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.setChips}>
          {group.sets.map((s, i) => (
            <View key={s.id} style={[styles.setChip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {isCardio ? (
                <ThemedText type="small">
                  {formatDuration(s.duration_seconds ?? 0)}
                  {s.speed_kmh != null ? ` · ${round1(s.speed_kmh)} km/h` : ''}
                  {s.incline != null ? ` · ${s.incline}%` : ''}
                </ThemedText>
              ) : (
                <ThemedText type="small">
                  <ThemedText type="small" themeColor="textSecondary">
                    {i + 1}
                  </ThemedText>
                  {'  '}
                  <ThemedText type="smallBold">
                    {s.weight_kg != null ? `${round1(fromKg(s.weight_kg, unit))} ${unit}` : '—'}
                  </ThemedText>
                  {s.reps != null ? ` × ${s.reps}` : ''}
                </ThemedText>
              )}
            </View>
          ))}
        </View>
      </View>
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
    <Card style={styles.sessionCard}>
      <View style={styles.sessionRow}>
        <View style={{ flex: 1 }}>
          <ExerciseBlock group={group} unit={unit} />
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
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readOnly: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  unitToggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    overflow: 'hidden',
  },
  unitOption: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  summaryRow: { flexDirection: 'row', gap: Spacing.two },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sessionCard: { gap: 0, padding: Spacing.three },
  sessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionBadgeText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  durationPill: { paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one, borderRadius: 999 },
  sessionMeta: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
  },
  exBlock: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  exAccent: { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  exHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  muscleTag: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: 999 },
  setChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  setChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyCard: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.four },
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
