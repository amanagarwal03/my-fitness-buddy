import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { showAlert } from '@/lib/dialog';

import { DurationStepper } from '@/components/duration-stepper';
import { StepperInput } from '@/components/stepper-input';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import {
  clearActiveWorkout,
  liveElapsed,
  loadActiveWorkout,
  saveActiveWorkout,
} from '@/lib/activeWorkout';
import { useAuth } from '@/lib/auth';
import { distanceKm, estimateCalories } from '@/lib/cardio';
import { formatDuration, isoDate } from '@/lib/date';
import { logKind, type LogKind } from '@/lib/exerciseKind';
import { takePendingExercise } from '@/lib/pendingExercise';
import { PREVIEW_MODE } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';
import type { BodyPart, Unit, WorkoutSession, WorkoutSet } from '@/lib/types';
import { fromKg, fromKmh, round1, toKg, toKmh, type SpeedUnit } from '@/lib/units';

type SetEntry = {
  weight: string;
  reps: string;
  durationSec: number; // duration & cardio entries
  incline: string; // cardio
  speed: string; // cardio, in the active speed unit
  done: boolean;
  prevKg?: number | null;
  prevReps?: number | null;
};
type LogExercise = {
  key: string;
  id: string;
  name: string;
  bodyPart: string;
  kind: LogKind;
  collapsed: boolean;
  hasPrev: boolean; // there is earlier logged data for this exercise
  sets: SetEntry[];
};

const allDone = (sets: SetEntry[]) => sets.length > 0 && sets.every((s) => s.done);

const emptySet = (): SetEntry => ({
  weight: '',
  reps: '',
  durationSec: 0,
  incline: '',
  speed: '',
  done: false,
  prevKg: null,
  prevReps: null,
});

// A strength set, pre-filled from last time (weight converted to active unit;
// reps default to last time's, or 15 for a fresh exercise).
const makeStrengthSet = (unit: Unit, prevKg?: number | null, prevReps?: number | null): SetEntry => ({
  ...emptySet(),
  weight: prevKg != null ? String(round1(fromKg(prevKg, unit))) : '',
  reps: prevReps != null ? String(prevReps) : '15',
  prevKg: prevKg ?? null,
  prevReps: prevReps ?? null,
});

export default function LogWorkoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session: auth } = useAuth();
  const { continueSession } = useLocalSearchParams<{ continueSession?: string }>();
  const { scrollRef, handleInputFocus, keyboardSpacerHeight, keyboardDismissMode } =
    useKeyboardAwareScroll();

  const [unit, setUnit] = useState<Unit>('kg');
  const [continueSessionId, setContinueSessionId] = useState<string | null>(null);
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>('kmph');
  const [exercises, setExercises] = useState<LogExercise[]>([]);
  const [historyEx, setHistoryEx] = useState<LogExercise | null>(null);
  const [saving, setSaving] = useState(false);
  const [bodyWeightKg, setBodyWeightKg] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [elapsedBeforePause, setElapsedBeforePause] = useState(0);
  const [runningSince, setRunningSince] = useState<number | null>(() => Date.now());
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const unitRef = useRef(unit);
  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);
  const speedUnitRef = useRef(speedUnit);
  useEffect(() => {
    speedUnitRef.current = speedUnit;
  }, [speedUnit]);
  const uidRef = useRef(auth?.user.id);
  useEffect(() => {
    uidRef.current = auth?.user.id;
  }, [auth]);

  // Live duration tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Body weight for calorie estimates.
  useEffect(() => {
    const uid = auth?.user.id;
    if (!uid || PREVIEW_MODE) return;
    supabase
      .from('profiles')
      .select('weight_kg')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data }) => setBodyWeightKg((data?.weight_kg as number | null) ?? null));
  }, [auth]);

  // Restore an in-progress workout, reopen a just-finished session to continue,
  // or start fresh with the profile's unit.
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
        setSpeedUnit(saved.speedUnit ?? 'kmph');
        setContinueSessionId(saved.continueSessionId ?? null);
        // Normalise older saves that predate kind/cardio/collapse fields.
        setExercises(
          (saved.exercises ?? []).map((ex) => ({
            key: ex.key,
            id: ex.id,
            name: ex.name,
            bodyPart: ex.bodyPart,
            kind: ex.kind ?? logKind(ex.bodyPart as BodyPart, ex.name),
            collapsed: ex.collapsed ?? false,
            hasPrev: ex.hasPrev ?? false,
            sets: (ex.sets ?? []).map((s) => ({ ...emptySet(), ...s })),
          })),
        );
      } else if (continueSession && uidRef.current) {
        await loadSessionToContinue(continueSession, uidRef.current);
      } else if (uidRef.current) {
        const { data } = await supabase
          .from('profiles')
          .select('unit_pref')
          .eq('user_id', uidRef.current)
          .maybeSingle();
        if (active) setUnit((data?.unit_pref as Unit) ?? 'kg');
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reopen a finished session as the active workout: keep its start time, resume
  // the clock from its saved duration, and load its sets back in (all ticked, so
  // they re-save). Finishing then appends to this session instead of a new one.
  const loadSessionToContinue = async (sessionId: string, uid: string) => {
    const [profileRes, sessRes, setsRes] = await Promise.all([
      supabase.from('profiles').select('unit_pref').eq('user_id', uid).maybeSingle(),
      supabase
        .from('workout_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', uid)
        .maybeSingle(),
      supabase
        .from('workout_sets')
        .select('*, exercises(name, body_part)')
        .eq('session_id', sessionId)
        .eq('user_id', uid)
        .order('set_number', { ascending: true }),
    ]);
    const sess = sessRes.data as WorkoutSession | null;
    if (!sess) return;
    const pref = (profileRes.data?.unit_pref as Unit) ?? 'kg';
    setUnit(pref);
    setContinueSessionId(sessionId);
    setStartedAt(new Date(sess.started_at).getTime());
    setElapsedBeforePause(sess.duration_seconds ?? 0);
    setRunningSince(Date.now()); // resume the clock

    type Joined = WorkoutSet & { exercises: { name: string; body_part: BodyPart } | null };
    const rows = (setsRes.data ?? []) as Joined[];
    const map = new Map<string, LogExercise>();
    for (const r of rows) {
      const bodyPart = r.exercises?.body_part ?? 'chest';
      const name = r.exercises?.name ?? 'Exercise';
      const kind = logKind(bodyPart, name);
      const ex =
        map.get(r.exercise_id) ??
        ({ key: `${r.exercise_id}-${Date.now()}`, id: r.exercise_id, name, bodyPart, kind, collapsed: true, hasPrev: true, sets: [] } as LogExercise);
      ex.sets.push({
        ...emptySet(),
        done: true,
        weight: r.weight_kg != null ? String(round1(fromKg(r.weight_kg, pref))) : '',
        reps: r.reps != null ? String(r.reps) : '',
        durationSec: r.duration_seconds ?? 0,
        incline: r.incline != null ? String(r.incline) : '',
        speed: r.speed_kmh != null ? String(round1(fromKmh(r.speed_kmh, 'kmph'))) : '',
      });
      map.set(r.exercise_id, ex);
    }
    setExercises([...map.values()]);
  };

  // Persist the in-progress workout whenever it changes.
  useEffect(() => {
    if (!ready || PREVIEW_MODE) return;
    saveActiveWorkout({
      startedAt,
      elapsedBeforePause,
      runningSince,
      unit,
      speedUnit,
      continueSessionId,
      exercises,
      updatedAt: Date.now(),
    });
  }, [ready, startedAt, elapsedBeforePause, runningSince, unit, speedUnit, continueSessionId, exercises]);

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
    const kind = logKind(bodyPart as BodyPart, name);
    const prev: Record<number, { kg: number | null; reps: number | null }> = {};
    let lastRow: WorkoutSet | undefined;
    let lastDaySetCount = 0;
    if (!PREVIEW_MODE && uidRef.current) {
      const { data } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('user_id', uidRef.current)
        .eq('exercise_id', id)
        .order('performed_on', { ascending: false })
        .order('set_number', { ascending: true })
        .limit(20);
      const rows = (data as WorkoutSet[]) ?? [];
      lastRow = rows[0];
      const lastDay = rows[0]?.performed_on;
      const lastDayRows = rows.filter((r) => r.performed_on === lastDay);
      lastDaySetCount = lastDayRows.length;
      lastDayRows.forEach((r) => {
        prev[r.set_number] = { kg: r.weight_kg, reps: r.reps };
      });
    }
    const hasPrev = lastRow != null;

    let sets: SetEntry[];
    if (kind === 'cardio') {
      // One entry, pre-filled with last time's incline/speed.
      sets = [
        {
          ...emptySet(),
          incline: lastRow?.incline != null ? String(lastRow.incline) : '',
          speed:
            lastRow?.speed_kmh != null
              ? String(round1(fromKmh(lastRow.speed_kmh, speedUnitRef.current)))
              : '',
        },
      ];
    } else if (kind === 'duration') {
      sets = [{ ...emptySet(), durationSec: lastRow?.duration_seconds ?? 0 }];
    } else {
      // Mirror last time: as many sets as the previous occurrence, each pre-filled
      // with that set's weight/reps. Falls back to 3 blank sets for a new exercise.
      const count = Math.max(1, lastDaySetCount || 3);
      sets = Array.from({ length: count }, (_, i) =>
        makeStrengthSet(unitRef.current, prev[i + 1]?.kg, prev[i + 1]?.reps),
      );
    }

    setExercises((cur) => [
      ...cur,
      { key: `${id}-${Date.now()}`, id, name, bodyPart, kind, collapsed: false, hasPrev, sets },
    ]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const p = takePendingExercise();
      if (p) addExercise(p.id, p.name, p.bodyPart);
    }, [addExercise]),
  );

  const patchSet = (exKey: string, idx: number, patch: Partial<SetEntry>) =>
    setExercises((cur) =>
      cur.map((ex) =>
        ex.key === exKey
          ? { ...ex, sets: ex.sets.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }
          : ex,
      ),
    );

  // Ticking the last remaining set folds the exercise away so the next one is in
  // view. We only auto-collapse on the rising edge (not already all-done) so a
  // manual expand isn't immediately undone.
  const toggleDone = (exKey: string, idx: number) =>
    setExercises((cur) =>
      cur.map((ex) => {
        if (ex.key !== exKey) return ex;
        const wasAllDone = allDone(ex.sets);
        const sets = ex.sets.map((s, i) => (i === idx ? { ...s, done: !s.done } : s));
        const collapsed = !wasAllDone && allDone(sets) ? true : ex.collapsed;
        return { ...ex, sets, collapsed };
      }),
    );

  const toggleCollapse = (exKey: string) =>
    setExercises((cur) =>
      cur.map((ex) => (ex.key === exKey ? { ...ex, collapsed: !ex.collapsed } : ex)),
    );

  const addSet = (exKey: string) =>
    setExercises((cur) =>
      cur.map((ex) => {
        if (ex.key !== exKey) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const seed: SetEntry = last ? { ...last, done: false } : emptySet();
        return { ...ex, sets: [...ex.sets, seed] };
      }),
    );

  const removeSet = (exKey: string, idx: number) =>
    setExercises((cur) =>
      cur.map((ex) =>
        ex.key === exKey && ex.sets.length > 1
          ? { ...ex, sets: ex.sets.filter((_, i) => i !== idx) }
          : ex,
      ),
    );

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

  const toggleSpeedUnit = () => {
    const next: SpeedUnit = speedUnit === 'kmph' ? 'mph' : 'kmph';
    setExercises((cur) =>
      cur.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) =>
          s.speed !== '' && Number.isFinite(Number(s.speed))
            ? { ...s, speed: String(round1(fromKmh(toKmh(Number(s.speed), speedUnit), next))) }
            : s,
        ),
      })),
    );
    setSpeedUnit(next);
  };

  const removeExercise = (exKey: string) =>
    setExercises((cur) => cur.filter((ex) => ex.key !== exKey));

  const hasCardio = exercises.some((ex) => ex.kind === 'cardio');

  // Live stats from completed sets.
  const doneSets = exercises.flatMap((ex) => ex.sets.filter((s) => s.done));
  const volume = exercises
    .filter((ex) => ex.kind === 'strength')
    .flatMap((ex) => ex.sets.filter((s) => s.done))
    .reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
  const elapsed = Math.max(
    0,
    Math.floor(elapsedBeforePause + (runningSince ? (now - runningSince) / 1000 : 0)),
  );

  const finish = async () => {
    const done = exercises.flatMap((ex) => ex.sets.filter((s) => s.done).map((s) => ({ ex, s })));
    if (done.length === 0) {
      showAlert('Nothing to save', 'Mark at least one set as done (the ✓), or discard the workout.');
      return;
    }
    for (const { ex, s } of done) {
      if (ex.kind === 'strength' && !(Number(s.reps) > 0)) {
        showAlert('Add your reps', `Every completed set of ${ex.name} needs a rep count greater than 0.`);
        return;
      }
      if (ex.kind === 'duration' && !(s.durationSec > 0)) {
        showAlert('Add a duration', `Set a hold time for ${ex.name}.`);
        return;
      }
      if (ex.kind === 'cardio' && !(s.durationSec > 0 || Number(s.speed) > 0)) {
        showAlert('Add your run', `Enter a duration or speed for ${ex.name}.`);
        return;
      }
    }
    if (PREVIEW_MODE) {
      showAlert('Preview mode', 'Connect Supabase to save workouts.');
      return;
    }
    if (!auth) return;
    setSaving(true);
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      setSaving(false);
      showAlert('Could not save', (e as Error).message);
      return;
    }
    const durationSeconds = liveElapsed({ elapsedBeforePause, runningSince });
    let sessionId: string;
    if (continueSessionId) {
      // Append to the existing session: extend its duration & end time, then
      // rebuild its sets from scratch (we loaded the originals back in).
      const { error: upErr } = await supabase
        .from('workout_sessions')
        .update({ ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
        .eq('id', continueSessionId)
        .eq('user_id', userId);
      if (upErr) {
        setSaving(false);
        showAlert('Could not save', upErr.message);
        return;
      }
      await supabase
        .from('workout_sets')
        .delete()
        .eq('session_id', continueSessionId)
        .eq('user_id', userId);
      sessionId = continueSessionId;
    } else {
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
        showAlert('Could not save', error?.message ?? 'Please try again.');
        return;
      }
      sessionId = sess.id;
    }
    const today = continueSessionId ? isoDate(new Date(startedAt)) : isoDate();
    const rows = exercises.flatMap((ex) => {
      const doneSetsForEx = ex.sets.filter((s) => s.done);
      return doneSetsForEx.map((s, i) => {
        const base = {
          user_id: userId,
          exercise_id: ex.id,
          session_id: sessionId,
          performed_on: today,
          set_number: i + 1,
          weight_kg: null as number | null,
          reps: null as number | null,
          duration_seconds: null as number | null,
          incline: null as number | null,
          speed_kmh: null as number | null,
        };
        if (ex.kind === 'strength') {
          base.weight_kg = s.weight !== '' ? toKg(Number(s.weight), unit) : null;
          base.reps = s.reps !== '' ? Number(s.reps) : null;
        } else if (ex.kind === 'duration') {
          base.duration_seconds = s.durationSec || null;
        } else {
          base.duration_seconds = s.durationSec || null;
          base.incline = s.incline !== '' && Number.isFinite(Number(s.incline)) ? Number(s.incline) : null;
          base.speed_kmh =
            s.speed !== '' && Number.isFinite(Number(s.speed)) ? toKmh(Number(s.speed), speedUnit) : null;
        }
        return base;
      });
    });
    if (rows.length) {
      const { error: e2 } = await supabase.from('workout_sets').insert(rows);
      if (e2) {
        setSaving(false);
        showAlert('Could not save sets', e2.message);
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
    showAlert('Discard workout?', 'This workout won’t be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: doDiscard },
    ]);
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{
          title: continueSessionId ? 'Continue Workout' : 'Log Workout',
          headerRight: () => (
            <Pressable onPress={finish} hitSlop={8} disabled={saving}>
              <ThemedText type="smallBold" themeColor="primary" style={{ fontSize: 16 }}>
                Finish
              </ThemedText>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissMode}>
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
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              {hasCardio ? (
                <Toggle<SpeedUnit>
                  value={speedUnit}
                  onChange={(v) => v !== speedUnit && toggleSpeedUnit()}
                  options={[
                    { label: 'km/h', value: 'kmph' },
                    { label: 'mph', value: 'mph' },
                  ]}
                />
              ) : null}
              <Toggle<Unit>
                value={unit}
                onChange={(v) => v !== unit && toggleUnit()}
                options={[
                  { label: 'kg', value: 'kg' },
                  { label: 'lbs', value: 'lbs' },
                ]}
              />
            </View>
          </View>
        </Card>

        {exercises.map((ex) => {
          const doneCount = ex.sets.filter((s) => s.done).length;
          const complete = allDone(ex.sets);
          return (
            <Card key={ex.key}>
              <View style={styles.exHeader}>
                <Pressable
                  onPress={() => toggleCollapse(ex.key)}
                  hitSlop={8}
                  style={styles.collapseToggle}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {ex.collapsed ? '▸' : '▾'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => (ex.hasPrev ? setHistoryEx(ex) : toggleCollapse(ex.key))}
                  style={{ flex: 1 }}>
                  <ThemedText type="smallBold" themeColor="primary">
                    {complete ? '✓ ' : ''}
                    {ex.name}
                    {ex.hasPrev ? <ThemedText type="small" themeColor="textSecondary">  🕘</ThemedText> : null}
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => removeExercise(ex.key)} hitSlop={10}>
                  <ThemedText type="smallBold" themeColor="danger">
                    ✕
                  </ThemedText>
                </Pressable>
              </View>

              {!ex.collapsed && ex.hasPrev ? (
                <View style={styles.exActions}>
                  <HeaderChip label="🕘  Past details" onPress={() => setHistoryEx(ex)} />
                  <HeaderChip
                    label="📈  Progress"
                    onPress={() =>
                      router.push({
                        pathname: '/workout/progress/[id]',
                        params: { id: ex.id, name: ex.name, bodyPart: ex.bodyPart, unit },
                      })
                    }
                  />
                </View>
              ) : null}

              {ex.collapsed ? (
                <Pressable onPress={() => toggleCollapse(ex.key)} style={styles.exSummary}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {ex.kind === 'cardio'
                      ? ex.sets[0]?.done
                        ? 'Run added · tap to edit'
                        : 'Tap to add this run'
                      : `${doneCount} of ${ex.sets.length} ${ex.sets.length === 1 ? 'set' : 'sets'} done · tap to edit`}
                  </ThemedText>
                </Pressable>
              ) : ex.kind === 'strength' ? (
                <StrengthSets
                  ex={ex}
                  unit={unit}
                  onPatch={patchSet}
                  onToggleDone={toggleDone}
                  onAddSet={addSet}
                  onFocus={handleInputFocus}
                />
              ) : ex.kind === 'duration' ? (
                <DurationSets ex={ex} onPatch={patchSet} onToggleDone={toggleDone} onAddSet={addSet} />
              ) : (
                <CardioEntry
                  ex={ex}
                  speedUnit={speedUnit}
                  bodyWeightKg={bodyWeightKg}
                  onPatch={patchSet}
                  onToggleDone={toggleDone}
                  onFocus={handleInputFocus}
                />
              )}
            </Card>
          );
        })}

        {exercises.length === 0 ? (
          <Card>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Add an exercise to start logging.
            </ThemedText>
          </Card>
        ) : null}

        <Button title="＋ Add Exercise" onPress={() => router.push('/workout/add-exercise')} />
        <Button title="Finish workout" onPress={finish} loading={saving} />
        <Button title="Discard workout" variant="secondary" onPress={discard} />
        <View style={{ height: keyboardSpacerHeight }} />
      </ScrollView>

      <ExerciseHistoryModal
        ex={historyEx}
        unit={unit}
        speedUnit={speedUnit}
        onClose={() => setHistoryEx(null)}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Past-details modal: this exercise's history, newest day first (3 shown, rest
// behind a "Show more"). Opened by tapping the exercise name or "Past details".
// ---------------------------------------------------------------------------
type HistoryDay = { day: string; sets: WorkoutSet[] };

function historyDayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const today = isoDate();
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (day === today) return 'Today';
  if (day === isoDate(yest)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function ExerciseHistoryModal({
  ex,
  unit,
  speedUnit,
  onClose,
}: {
  ex: LogExercise | null;
  unit: Unit;
  speedUnit: SpeedUnit;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { session: auth } = useAuth();
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!ex) return;
    setExpanded(false);
    setLoading(true);
    setDays([]);
    const uid = auth?.user.id;
    if (PREVIEW_MODE || !uid) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('workout_sets')
        .select('*')
        .eq('user_id', uid)
        .eq('exercise_id', ex.id)
        .order('performed_on', { ascending: false })
        .order('set_number', { ascending: true })
        .limit(120);
      if (!active) return;
      const rows = (data as WorkoutSet[]) ?? [];
      const map = new Map<string, WorkoutSet[]>();
      for (const r of rows) {
        const arr = map.get(r.performed_on) ?? [];
        arr.push(r);
        map.set(r.performed_on, arr);
      }
      setDays([...map.entries()].map(([day, sets]) => ({ day, sets })));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [ex, auth]);

  const setLine = (s: WorkoutSet): string => {
    if (!ex) return '';
    if (ex.kind === 'cardio') {
      const parts = [formatDuration(s.duration_seconds ?? 0)];
      if (s.speed_kmh != null)
        parts.push(`${round1(fromKmh(s.speed_kmh, speedUnit))} ${speedUnit === 'kmph' ? 'km/h' : 'mph'}`);
      if (s.incline != null) parts.push(`${s.incline}% incline`);
      return parts.join(' · ');
    }
    if (ex.kind === 'duration') return formatDuration(s.duration_seconds ?? 0);
    const w = s.weight_kg != null ? `${round1(fromKg(s.weight_kg, unit))} ${unit}` : '—';
    return `${w}${s.reps != null ? ` × ${s.reps}` : ''}`;
  };

  const shown = expanded ? days : days.slice(0, 3);

  return (
    <Modal visible={!!ex} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.histOverlay} onPress={onClose}>
        <Pressable
          style={[styles.histSheet, { backgroundColor: theme.background, borderColor: theme.border }]}
          onPress={() => {}}>
          <View style={styles.histHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                PAST DETAILS
              </ThemedText>
              <ThemedText type="subtitle" numberOfLines={1}>
                {ex?.name ?? ''}
              </ThemedText>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <ThemedText type="smallBold" themeColor="primary">
                Done
              </ThemedText>
            </Pressable>
          </View>

          {loading ? (
            <View style={{ paddingVertical: Spacing.five, alignItems: 'center' }}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : days.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: Spacing.four }}>
              No past entries yet — this will fill up once you log this exercise.
            </ThemedText>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: Spacing.three, paddingBottom: Spacing.two }}>
              {shown.map((d) => (
                <View key={d.day} style={[styles.histDay, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold">{historyDayLabel(d.day)}</ThemedText>
                  <View style={{ gap: 2, marginTop: Spacing.one }}>
                    {d.sets.map((s, i) => (
                      <View key={s.id} style={styles.histSetRow}>
                        <ThemedText type="small" themeColor="textSecondary" style={{ width: 34 }}>
                          {ex?.kind === 'strength' ? `#${i + 1}` : ''}
                        </ThemedText>
                        <ThemedText type="small" style={{ flex: 1 }}>
                          {setLine(s)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              {days.length > 3 ? (
                <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: Spacing.two }}>
                  <ThemedText type="smallBold" themeColor="primary">
                    {expanded ? 'Show less' : `Show ${days.length - 3} more`}
                  </ThemedText>
                </Pressable>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HeaderChip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerChip,
        { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Per-kind set editors
// ---------------------------------------------------------------------------
type EditorProps = {
  ex: LogExercise;
  onPatch: (exKey: string, idx: number, patch: Partial<SetEntry>) => void;
  onToggleDone: (exKey: string, idx: number) => void;
  onAddSet: (exKey: string) => void;
};

function DoneCheck({ done, onPress }: { done: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.check,
        { backgroundColor: done ? theme.success : 'transparent', borderColor: done ? theme.success : theme.border },
      ]}>
      <ThemedText style={{ color: '#fff', fontSize: 14 }}>{done ? '✓' : ''}</ThemedText>
    </Pressable>
  );
}

function StrengthSets({
  ex,
  unit,
  onPatch,
  onToggleDone,
  onAddSet,
  onFocus,
}: EditorProps & { unit: Unit; onFocus: (e: any) => void }) {
  const theme = useTheme();
  return (
    <>
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
        <View key={i} style={[styles.tableRow, s.done && { backgroundColor: theme.success + '22' }]}>
          <ThemedText type="smallBold" style={styles.colSet}>
            {i + 1}
          </ThemedText>
          <StepperInput
            style={styles.colWeight}
            value={s.weight}
            onChangeText={(v) => onPatch(ex.key, i, { weight: v })}
            onFocus={onFocus}
            step={5}
            placeholder={s.prevKg != null ? String(round1(fromKg(s.prevKg, unit))) : '0'}
          />
          <StepperInput
            style={styles.colReps}
            value={s.reps}
            onChangeText={(v) => onPatch(ex.key, i, { reps: v })}
            onFocus={onFocus}
            step={1}
            integer
            placeholder={s.prevReps != null ? String(s.prevReps) : '0'}
          />
          <View style={styles.colCheck}>
            <DoneCheck done={s.done} onPress={() => onToggleDone(ex.key, i)} />
          </View>
        </View>
      ))}
      <Button title="＋ Add Set" variant="secondary" onPress={() => onAddSet(ex.key)} />
    </>
  );
}

function DurationSets({ ex, onPatch, onToggleDone, onAddSet }: EditorProps) {
  const theme = useTheme();
  return (
    <>
      <View style={styles.tableHead}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.colSet}>
          SET
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1, textAlign: 'center' }}>
          HOLD TIME
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.colCheck}>
          ✓
        </ThemedText>
      </View>
      {ex.sets.map((s, i) => (
        <View key={i} style={[styles.tableRow, s.done && { backgroundColor: theme.success + '22' }]}>
          <ThemedText type="smallBold" style={styles.colSet}>
            {i + 1}
          </ThemedText>
          <View style={{ flex: 1 }}>
            <DurationStepper value={s.durationSec} onChange={(v) => onPatch(ex.key, i, { durationSec: v })} />
          </View>
          <View style={styles.colCheck}>
            <DoneCheck done={s.done} onPress={() => onToggleDone(ex.key, i)} />
          </View>
        </View>
      ))}
      <Button title="＋ Add Set" variant="secondary" onPress={() => onAddSet(ex.key)} />
    </>
  );
}

function CardioEntry({
  ex,
  speedUnit,
  bodyWeightKg,
  onPatch,
  onToggleDone,
  onFocus,
}: {
  ex: LogExercise;
  speedUnit: SpeedUnit;
  bodyWeightKg: number | null;
  onPatch: (exKey: string, idx: number, patch: Partial<SetEntry>) => void;
  onToggleDone: (exKey: string, idx: number) => void;
  onFocus: (e: any) => void;
}) {
  const theme = useTheme();
  const s = ex.sets[0];
  const speedKmh = s.speed !== '' && Number.isFinite(Number(s.speed)) ? toKmh(Number(s.speed), speedUnit) : 0;
  const inc = s.incline !== '' && Number.isFinite(Number(s.incline)) ? Number(s.incline) : 0;
  const distKm = distanceKm(speedKmh, s.durationSec);
  const distShown = speedUnit === 'kmph' ? distKm : distKm * 0.621371;
  const cal = estimateCalories({ durationSec: s.durationSec, speedKmh, incline: inc, weightKg: bodyWeightKg });

  return (
    <View style={{ gap: Spacing.two }}>
      <CardioRow label="Duration">
        <DurationStepper value={s.durationSec} onChange={(v) => onPatch(ex.key, 0, { durationSec: v })} />
      </CardioRow>
      <CardioRow label={`Speed (${speedUnit === 'kmph' ? 'km/h' : 'mph'})`}>
        <StepperInput
          value={s.speed}
          onChangeText={(v) => onPatch(ex.key, 0, { speed: v })}
          onFocus={onFocus}
          step={0.5}
          placeholder="0"
        />
      </CardioRow>
      <CardioRow label="Incline (%)">
        <StepperInput
          value={s.incline}
          onChangeText={(v) => onPatch(ex.key, 0, { incline: v })}
          onFocus={onFocus}
          step={1}
          placeholder="0"
        />
      </CardioRow>

      {s.durationSec > 0 || speedKmh > 0 ? (
        <View style={[styles.estRow, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {distKm > 0 ? `≈ ${round1(distShown)} ${speedUnit === 'kmph' ? 'km' : 'mi'}` : '—'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {cal > 0 ? `≈ ${cal} kcal` : '—'}
          </ThemedText>
        </View>
      ) : null}

      <Pressable
        onPress={() => onToggleDone(ex.key, 0)}
        style={[
          styles.includeRow,
          { borderColor: s.done ? theme.success : theme.border, backgroundColor: s.done ? theme.success + '18' : 'transparent' },
        ]}>
        <DoneCheck done={s.done} onPress={() => onToggleDone(ex.key, 0)} />
        <ThemedText type="smallBold">{s.done ? 'Included in workout' : 'Tap to include this run'}</ThemedText>
      </Pressable>
    </View>
  );
}

function CardioRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.cardioRow}>
      <ThemedText type="small" themeColor="textSecondary" style={{ width: 96 }}>
        {label}
      </ThemedText>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { label: string; value: T }[];
}) {
  const theme = useTheme();
  return (
    <View style={[styles.unitToggle, { borderColor: theme.border }]}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.unitOption, { backgroundColor: o.value === value ? theme.primary : 'transparent' }]}>
          <ThemedText type="smallBold" style={{ color: o.value === value ? '#fff' : theme.textSecondary }}>
            {o.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
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
  unitOption: { paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one + 2 },
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
    gap: 6,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.one,
  },
  colSet: { width: 24, textAlign: 'center' },
  colWeight: { flex: 1, textAlign: 'center' },
  colReps: { flex: 1, textAlign: 'center' },
  colCheck: { width: 40, alignItems: 'center' },
  check: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardioRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  estRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
  },
  includeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.one,
  },
  collapseToggle: { width: 22, alignItems: 'center' },
  exSummary: { marginTop: Spacing.one },
  exActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  histOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  histSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  histHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  histDay: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  histSetRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
