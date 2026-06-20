import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  clearActiveWorkout,
  liveElapsed,
  loadActiveWorkout,
  saveActiveWorkout,
} from '@/lib/activeWorkout';
import { useAuth } from '@/lib/auth';
import { formatDuration, isoDate } from '@/lib/date';
import { takePendingExercise } from '@/lib/pendingExercise';
import { PREVIEW_MODE } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';
import type { Unit, WorkoutSet } from '@/lib/types';
import { fromKg, round1, toKg } from '@/lib/units';

type SetEntry = { weight: string; reps: string; done: boolean; prevKg?: number | null; prevReps?: number | null };
type LogExercise = { key: string; id: string; name: string; bodyPart: string; sets: SetEntry[] };

// Build a set row. Pre-fills the weight/reps inputs with last time's values
// (converted to the active unit) so the user can just tweak them with the ± steppers.
const makeSet = (unit: Unit, prevKg?: number | null, prevReps?: number | null): SetEntry => ({
  weight: prevKg != null ? String(round1(fromKg(prevKg, unit))) : '',
  reps: prevReps != null ? String(prevReps) : '',
  done: false,
  prevKg: prevKg ?? null,
  prevReps: prevReps ?? null,
});

// How much the ± buttons nudge a weight, per unit.
const WEIGHT_STEP = 5;

export default function LogWorkoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session: auth } = useAuth();

  const [unit, setUnit] = useState<Unit>('kg');
  const [exercises, setExercises] = useState<LogExercise[]>([]);
  const [saving, setSaving] = useState(false);
  // Timer: accumulated running seconds + the moment it started running (null when
  // paused). Persisted so the workout can be left and resumed.
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [elapsedBeforePause, setElapsedBeforePause] = useState(0);
  const [runningSince, setRunningSince] = useState<number | null>(() => Date.now());
  const [ready, setReady] = useState(false);
  // A ticking clock drives the live duration; deriving elapsed from this state
  // (rather than calling Date.now() in render) keeps it recomputing every second.
  const [now, setNow] = useState(() => Date.now());
  // Latest unit, readable inside addExercise (which intentionally has no deps).
  const unitRef = useRef(unit);
  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);

  // Live duration tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Restore an in-progress workout (or start fresh with the profile's unit).
  useEffect(() => {
    if (PREVIEW_MODE) {
      setReady(true);
      return;
    }
    let active = true;
    (async () => {
      const saved = await loadActiveWorkout();
      if (!active) return;
      if (saved) {
        setStartedAt(saved.startedAt);
        setElapsedBeforePause(saved.elapsedBeforePause);
        setRunningSince(saved.runningSince);
        setUnit(saved.unit);
        setExercises(saved.exercises as LogExercise[]);
      } else {
        const { data } = await supabase.from('profiles').select('unit_pref').maybeSingle();
        if (active) setUnit((data?.unit_pref as Unit) ?? 'kg');
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Persist the in-progress workout whenever it changes.
  useEffect(() => {
    if (!ready || PREVIEW_MODE) return;
    saveActiveWorkout({ startedAt, elapsedBeforePause, runningSince, unit, exercises, updatedAt: Date.now() });
  }, [ready, startedAt, elapsedBeforePause, runningSince, unit, exercises]);

  const paused = runningSince === null;
  const pause = () => {
    if (runningSince === null) return;
    setElapsedBeforePause((e) => e + (Date.now() - runningSince) / 1000);
    setRunningSince(null);
  };
  const resume = () => {
    if (runningSince === null) setRunningSince(Date.now());
  };

  const addExercise = useCallback(async (id: string, name: string, bodyPart: string) => {
    const prev: Record<number, { kg: number | null; reps: number | null }> = {};
    if (!PREVIEW_MODE) {
      const { data } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('exercise_id', id)
        .order('performed_on', { ascending: false })
        .order('set_number', { ascending: true })
        .limit(20);
      const rows = (data as WorkoutSet[]) ?? [];
      const lastDay = rows[0]?.performed_on;
      rows
        .filter((r) => r.performed_on === lastDay)
        .forEach((r) => {
          prev[r.set_number] = { kg: r.weight_kg, reps: r.reps };
        });
    }
    setExercises((cur) => [
      ...cur,
      {
        key: `${id}-${Date.now()}`,
        id,
        name,
        bodyPart,
        sets: [1, 2, 3].map((nset) => makeSet(unitRef.current, prev[nset]?.kg, prev[nset]?.reps)),
      },
    ]);
  }, []);

  // Consume a picked exercise when returning from the picker.
  useFocusEffect(
    useCallback(() => {
      const p = takePendingExercise();
      if (p) addExercise(p.id, p.name, p.bodyPart);
    }, [addExercise]),
  );

  const updateSet = (exKey: string, idx: number, field: 'weight' | 'reps', value: string) =>
    setExercises((cur) =>
      cur.map((ex) =>
        ex.key === exKey
          ? { ...ex, sets: ex.sets.map((s, i) => (i === idx ? { ...s, [field]: value } : s)) }
          : ex,
      ),
    );

  const toggleDone = (exKey: string, idx: number) =>
    setExercises((cur) =>
      cur.map((ex) =>
        ex.key === exKey
          ? { ...ex, sets: ex.sets.map((s, i) => (i === idx ? { ...s, done: !s.done } : s)) }
          : ex,
      ),
    );

  // A new set carries over the previous set's weight/reps (Hevy-style), so you
  // only adjust what changed.
  const addSet = (exKey: string) =>
    setExercises((cur) =>
      cur.map((ex) => {
        if (ex.key !== exKey) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const seed: SetEntry = last
          ? { weight: last.weight, reps: last.reps, done: false, prevKg: last.prevKg, prevReps: last.prevReps }
          : makeSet(unitRef.current);
        return { ...ex, sets: [...ex.sets, seed] };
      }),
    );

  // ± steppers nudge a set's weight by WEIGHT_STEP (treating blank as 0, min 0).
  const bumpWeight = (exKey: string, idx: number, delta: number) =>
    setExercises((cur) =>
      cur.map((ex) =>
        ex.key === exKey
          ? {
              ...ex,
              sets: ex.sets.map((s, i) =>
                i === idx
                  ? { ...s, weight: String(Math.max(0, round1((Number(s.weight) || 0) + delta))) }
                  : s,
              ),
            }
          : ex,
      ),
    );

  // Switch the logging unit and convert any already-entered weights so the
  // displayed numbers stay equivalent (PREV is stored in kg and converted live).
  const toggleUnit = () => {
    const next: Unit = unit === 'kg' ? 'lbs' : 'kg';
    setExercises((cur) =>
      cur.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) =>
          s.weight !== '' && Number.isFinite(Number(s.weight))
            ? { ...s, weight: String(round1(fromKg(toKg(Number(s.weight), unit), next))) }
            : s,
        ),
      })),
    );
    setUnit(next);
  };

  const removeExercise = (exKey: string) =>
    setExercises((cur) => cur.filter((ex) => ex.key !== exKey));

  // Live stats from completed sets.
  const doneSets = exercises.flatMap((ex) => ex.sets.filter((s) => s.done));
  const volume = doneSets.reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
  const elapsed = Math.max(
    0,
    Math.floor(elapsedBeforePause + (runningSince ? (now - runningSince) / 1000 : 0)),
  );

  const finish = async () => {
    const perEx = exercises.map((ex) => ({ ex, done: ex.sets.filter((s) => s.done) }));
    if (!perEx.some((d) => d.done.length > 0)) {
      Alert.alert('Nothing to save', 'Check off at least one set (the ✓), or discard the workout.');
      return;
    }
    if (PREVIEW_MODE) {
      Alert.alert('Preview mode', 'Connect Supabase to save workouts.');
      return;
    }
    if (!auth) return;
    setSaving(true);
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error).message);
      return;
    }
    const durationSeconds = liveElapsed({ elapsedBeforePause, runningSince });
    const { data: sess, error } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: userId,
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
      })
      .select('id')
      .single();
    if (error || !sess) {
      setSaving(false);
      Alert.alert('Could not save', error?.message ?? 'Please try again.');
      return;
    }
    const today = isoDate();
    // Sets belong to this session (session_id). Each exercise card keeps its own
    // sets numbered 1..n — no merging across cards — so the session preserves the
    // full per-exercise detail. A brand-new session id means a plain insert never
    // collides with anything that already exists.
    const rows = perEx.flatMap(({ ex, done }) =>
      done.map((s, i) => ({
        user_id: userId,
        exercise_id: ex.id,
        session_id: sess.id,
        performed_on: today,
        set_number: i + 1,
        weight_kg: s.weight !== '' ? toKg(Number(s.weight), unit) : null,
        reps: s.reps !== '' ? Number(s.reps) : null,
      })),
    );
    if (rows.length) {
      const { error: e2 } = await supabase.from('workout_sets').insert(rows);
      if (e2) {
        setSaving(false);
        Alert.alert('Could not save sets', e2.message);
        return;
      }
    }
    await clearActiveWorkout();
    setSaving(false);
    router.back();
  };

  const discard = () => {
    const doDiscard = async () => {
      await clearActiveWorkout();
      router.back();
    };
    if (exercises.length === 0) {
      doDiscard();
      return;
    }
    Alert.alert('Discard workout?', 'This workout won’t be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: doDiscard },
    ]);
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Log Workout',
          headerRight: () => (
            <Pressable onPress={finish} hitSlop={8} disabled={saving}>
              <ThemedText type="smallBold" themeColor="primary" style={{ fontSize: 16 }}>
                Finish
              </ThemedText>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Live stats */}
        <Card>
          <View style={styles.statsRow}>
            <Stat label={paused ? 'Duration (paused)' : 'Duration'} value={formatDuration(elapsed)} highlight />
            <Stat label="Volume" value={`${Math.round(volume)} ${unit}`} />
            <Stat label="Sets" value={String(doneSets.length)} />
          </View>
          <View style={styles.unitRow}>
            <Pressable
              onPress={paused ? resume : pause}
              style={[
                styles.pauseBtn,
                { borderColor: theme.border, backgroundColor: paused ? theme.primary : 'transparent' },
              ]}>
              <ThemedText type="smallBold" style={{ color: paused ? '#fff' : theme.text }}>
                {paused ? '▶  Resume' : '⏸  Pause'}
              </ThemedText>
            </Pressable>
            <View style={[styles.unitToggle, { borderColor: theme.border }]}>
              {(['kg', 'lbs'] as Unit[]).map((u) => (
                <Pressable
                  key={u}
                  onPress={() => u !== unit && toggleUnit()}
                  style={[
                    styles.unitOption,
                    { backgroundColor: u === unit ? theme.primary : 'transparent' },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: u === unit ? '#fff' : theme.textSecondary }}>
                    {u}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        </Card>

        {exercises.map((ex) => (
          <Card key={ex.key}>
            <View style={styles.exHeader}>
              <ThemedText type="smallBold" themeColor="primary" style={{ flex: 1 }}>
                {ex.name}
              </ThemedText>
              <Pressable onPress={() => removeExercise(ex.key)} hitSlop={10}>
                <ThemedText type="smallBold" themeColor="danger">
                  ✕
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.tableHead}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.colSet}>
                SET
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.colWeight}>
                {unit.toUpperCase()}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.colReps}>
                REPS
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.colCheck}>
                ✓
              </ThemedText>
            </View>

            {ex.sets.map((s, i) => (
              <View
                key={i}
                style={[styles.tableRow, s.done && { backgroundColor: theme.success + '22' }]}>
                <ThemedText type="smallBold" style={styles.colSet}>
                  {i + 1}
                </ThemedText>
                <View style={styles.weightCell}>
                  <Pressable
                    onPress={() => bumpWeight(ex.key, i, -WEIGHT_STEP)}
                    hitSlop={6}
                    style={[styles.stepBtn, { borderColor: theme.border }]}>
                    <ThemedText type="smallBold" style={styles.stepGlyph}>
                      −
                    </ThemedText>
                  </Pressable>
                  <TextInput
                    value={s.weight}
                    onChangeText={(t) => updateSet(ex.key, i, 'weight', t)}
                    keyboardType="numeric"
                    placeholder={s.prevKg != null ? String(round1(fromKg(s.prevKg, unit))) : '0'}
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.cellInput, styles.weightInput, { color: theme.text, borderColor: theme.border }]}
                  />
                  <Pressable
                    onPress={() => bumpWeight(ex.key, i, WEIGHT_STEP)}
                    hitSlop={6}
                    style={[styles.stepBtn, { borderColor: theme.border }]}>
                    <ThemedText type="smallBold" style={styles.stepGlyph}>
                      ＋
                    </ThemedText>
                  </Pressable>
                </View>
                <TextInput
                  value={s.reps}
                  onChangeText={(t) => updateSet(ex.key, i, 'reps', t)}
                  keyboardType="numeric"
                  placeholder={s.prevReps != null ? String(s.prevReps) : '0'}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.cellInput, styles.colReps, { color: theme.text, borderColor: theme.border }]}
                />
                <View style={styles.colCheck}>
                  <Pressable
                    onPress={() => toggleDone(ex.key, i)}
                    style={[
                      styles.check,
                      {
                        backgroundColor: s.done ? theme.success : 'transparent',
                        borderColor: s.done ? theme.success : theme.border,
                      },
                    ]}>
                    <ThemedText style={{ color: '#fff', fontSize: 14 }}>{s.done ? '✓' : ''}</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}

            <Button title="＋ Add Set" variant="secondary" onPress={() => addSet(ex.key)} />
          </Card>
        ))}

        {exercises.length === 0 ? (
          <Card>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Add an exercise to start logging your sets.
            </ThemedText>
          </Card>
        ) : null}

        <Button title="＋ Add Exercise" onPress={() => router.push('/workout/add-exercise')} />
        <Button title="Finish workout" onPress={finish} loading={saving} />
        <Button title="Discard workout" variant="secondary" onPress={discard} />
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor={highlight ? 'primary' : 'text'} style={{ fontSize: 18 }}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  unitToggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    overflow: 'hidden',
  },
  unitOption: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  pauseBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.one },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    borderRadius: Spacing.one,
  },
  colSet: { width: 30, textAlign: 'center' },
  colWeight: { flex: 1.7, textAlign: 'center' },
  colReps: { flex: 1 },
  colCheck: { width: 44, alignItems: 'center' },
  weightCell: { flex: 1.7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 30,
    height: 40,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 18, lineHeight: 20 },
  cellInput: {
    marginHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.one + 2,
    paddingVertical: Spacing.two,
    textAlign: 'center',
    fontSize: 15,
    minHeight: 40,
  },
  weightInput: { flex: 1, marginHorizontal: 0 },
  check: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
