import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { showAlert } from '@/lib/dialog';

import { DurationStepper } from '@/components/duration-stepper';
import { StepperInput } from '@/components/stepper-input';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { BODY_PART_META } from '@/lib/bodyparts';
import { isoDate } from '@/lib/date';
import { logKind, type LogKind } from '@/lib/exerciseKind';
import { takePendingExercise } from '@/lib/pendingExercise';
import { requireUserId, supabase } from '@/lib/supabase';
import type { BodyPart, Unit, WorkoutSet } from '@/lib/types';
import { fromKg, fromKmh, round1, toKg, toKmh, type SpeedUnit } from '@/lib/units';

type JoinedSet = WorkoutSet & { exercises: { name: string; body_part: BodyPart } | null };

// One editable set. Which fields matter depends on the exercise's kind:
// strength → weight/reps, duration → durationSec, cardio → durationSec/incline/speed.
type EditSet = {
  key: string;
  weight: string; // in display unit
  reps: string;
  durationSec: number;
  incline: string;
  speed: string; // in the active speed unit
};
type EditExercise = {
  key: string;
  id: string;
  name: string;
  bodyPart: BodyPart;
  kind: LogKind;
  sets: EditSet[];
};

let keySeq = 0;
const newKey = () => `k${Date.now()}-${keySeq++}`;
const emptySet = (): EditSet => ({
  key: newKey(),
  weight: '',
  reps: '15',
  durationSec: 0,
  incline: '',
  speed: '',
});

export default function EditSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { scrollRef, handleInputFocus, keyboardSpacerHeight, keyboardDismissMode } =
    useKeyboardAwareScroll();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [unit, setUnit] = useState<Unit>('kg');
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>('kmph');
  const [exercises, setExercises] = useState<EditExercise[]>([]);
  const [performedOn, setPerformedOn] = useState<string>(() => isoDate());
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const unitRef = useRef<Unit>('kg');
  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);

  // Load the session's sets, grouped by exercise, into editable rows.
  useEffect(() => {
    if (!id || !uid) return;
    let active = true;
    (async () => {
      const [profileRes, sessRes, setsRes] = await Promise.all([
        supabase.from('profiles').select('unit_pref').eq('user_id', uid).maybeSingle(),
        supabase
          .from('workout_sessions')
          .select('started_at')
          .eq('id', id)
          .eq('user_id', uid)
          .maybeSingle(),
        supabase
          .from('workout_sets')
          .select('*, exercises(name, body_part)')
          .eq('session_id', id)
          .eq('user_id', uid)
          .order('set_number', { ascending: true }),
      ]);
      if (!active) return;
      const pref = (profileRes.data?.unit_pref as Unit) ?? 'kg';
      setUnit(pref);
      if (sessRes.data?.started_at) setPerformedOn(isoDate(new Date(sessRes.data.started_at)));

      const rows = (setsRes.data ?? []) as JoinedSet[];
      const map = new Map<string, EditExercise>();
      for (const r of rows) {
        const bodyPart = r.exercises?.body_part ?? 'chest';
        const name = r.exercises?.name ?? 'Exercise';
        const g =
          map.get(r.exercise_id) ??
          ({
            key: newKey(),
            id: r.exercise_id,
            name,
            bodyPart,
            kind: logKind(bodyPart, name),
            sets: [],
          } as EditExercise);
        g.sets.push({
          key: newKey(),
          weight: r.weight_kg != null ? String(round1(fromKg(r.weight_kg, pref))) : '',
          reps: r.reps != null ? String(r.reps) : '',
          durationSec: r.duration_seconds ?? 0,
          incline: r.incline != null ? String(r.incline) : '',
          speed: r.speed_kmh != null ? String(round1(fromKmh(r.speed_kmh, 'kmph'))) : '',
        });
        map.set(r.exercise_id, g);
      }
      setExercises([...map.values()]);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [id, uid]);

  // Add an exercise picked from the picker on return.
  const addExercise = useCallback((exId: string, name: string, bodyPart: string) => {
    const bp = bodyPart as BodyPart;
    setExercises((cur) => [
      ...cur,
      { key: newKey(), id: exId, name, bodyPart: bp, kind: logKind(bp, name), sets: [emptySet()] },
    ]);
  }, []);
  useFocusEffect(
    useCallback(() => {
      const p = takePendingExercise();
      if (p) addExercise(p.id, p.name, p.bodyPart);
    }, [addExercise]),
  );

  const patchSet = (exKey: string, idx: number, patch: Partial<EditSet>) =>
    setExercises((cur) =>
      cur.map((ex) =>
        ex.key === exKey
          ? { ...ex, sets: ex.sets.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }
          : ex,
      ),
    );

  const addSet = (exKey: string) =>
    setExercises((cur) =>
      cur.map((ex) => {
        if (ex.key !== exKey) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const seed: EditSet = last ? { ...last, key: newKey() } : emptySet();
        return { ...ex, sets: [...ex.sets, seed] };
      }),
    );

  const removeSet = (exKey: string, idx: number) =>
    setExercises((cur) =>
      cur.map((ex) =>
        ex.key === exKey ? { ...ex, sets: ex.sets.filter((_, i) => i !== idx) } : ex,
      ),
    );

  const removeExercise = (exKey: string) =>
    setExercises((cur) => cur.filter((ex) => ex.key !== exKey));

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

  const hasCardio = exercises.some((ex) => ex.kind === 'cardio');

  const save = async () => {
    // Validate per kind: strength needs reps, plank needs a hold time, cardio
    // needs a duration or speed.
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (ex.kind === 'strength' && !(Number(s.reps) > 0)) {
          showAlert('Add your reps', `Every set of ${ex.name} needs a rep count greater than 0.`);
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
    }
    setSaving(true);
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      setSaving(false);
      showAlert('Could not save', (e as Error).message);
      return;
    }
    // Rebuild the session's sets from scratch, numbering them per-exercise and
    // writing only the fields that matter for each kind. The session row
    // (duration/time) is untouched.
    const rows = exercises.flatMap((ex) =>
      ex.sets.map((s, i) => {
        const base = {
          user_id: userId,
          exercise_id: ex.id,
          session_id: id,
          performed_on: performedOn,
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
          base.incline =
            s.incline !== '' && Number.isFinite(Number(s.incline)) ? Number(s.incline) : null;
          base.speed_kmh =
            s.speed !== '' && Number.isFinite(Number(s.speed)) ? toKmh(Number(s.speed), speedUnit) : null;
        }
        return base;
      }),
    );

    const { error: delErr } = await supabase
      .from('workout_sets')
      .delete()
      .eq('session_id', id)
      .eq('user_id', userId);
    if (delErr) {
      setSaving(false);
      showAlert('Could not save', delErr.message);
      return;
    }
    if (rows.length) {
      const { error: insErr } = await supabase.from('workout_sets').insert(rows);
      if (insErr) {
        setSaving(false);
        showAlert('Could not save', insErr.message);
        return;
      }
    }
    setSaving(false);
    router.back();
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Edit Session',
          headerRight: () => (
            <Pressable onPress={save} hitSlop={8} disabled={saving}>
              <ThemedText type="smallBold" themeColor="primary" style={{ fontSize: 16 }}>
                Save
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
        <View style={styles.topRow}>
          <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
            Editing set details only — the session’s time and duration stay the same.
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            {hasCardio ? (
              <UnitToggle<SpeedUnit>
                value={speedUnit}
                onChange={(v) => v !== speedUnit && toggleSpeedUnit()}
                options={[
                  { label: 'km/h', value: 'kmph' },
                  { label: 'mph', value: 'mph' },
                ]}
              />
            ) : null}
            <UnitToggle<Unit>
              value={unit}
              onChange={(v) => v !== unit && toggleUnit()}
              options={[
                { label: 'kg', value: 'kg' },
                { label: 'lbs', value: 'lbs' },
              ]}
            />
          </View>
        </View>

        {exercises.map((ex) => {
          const meta = BODY_PART_META[ex.bodyPart];
          return (
            <Card key={ex.key}>
              <View style={styles.exHeader}>
                <ThemedText type="smallBold" themeColor="primary" style={{ flex: 1 }}>
                  {meta?.emoji ?? '🏋️'}  {ex.name}
                </ThemedText>
                <Pressable onPress={() => removeExercise(ex.key)} hitSlop={10}>
                  <ThemedText type="smallBold" themeColor="danger">
                    Remove
                  </ThemedText>
                </Pressable>
              </View>

              {ex.kind === 'strength' ? (
                <StrengthRows ex={ex} unit={unit} onPatch={patchSet} onRemove={removeSet} onFocus={handleInputFocus} />
              ) : ex.kind === 'duration' ? (
                <DurationRows ex={ex} onPatch={patchSet} onRemove={removeSet} />
              ) : (
                <CardioRows ex={ex} speedUnit={speedUnit} onPatch={patchSet} onRemove={removeSet} onFocus={handleInputFocus} />
              )}

              <Button title="＋ Add Set" variant="secondary" onPress={() => addSet(ex.key)} />
            </Card>
          );
        })}

        {ready && exercises.length === 0 ? (
          <Card>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              This session has no sets. Add an exercise below.
            </ThemedText>
          </Card>
        ) : null}

        <Button title="＋ Add Exercise" onPress={() => router.push('/workout/add-exercise')} />
        <Button title="Save changes" onPress={save} loading={saving} />
        {/* Room to scroll the last set above the keyboard. */}
        <View style={{ height: keyboardSpacerHeight }} />
      </ScrollView>
    </Screen>
  );
}

type RowProps = {
  ex: EditExercise;
  onPatch: (exKey: string, idx: number, patch: Partial<EditSet>) => void;
  onRemove: (exKey: string, idx: number) => void;
};

function StrengthRows({
  ex,
  unit,
  onPatch,
  onRemove,
  onFocus,
}: RowProps & { unit: Unit; onFocus: (e: any) => void }) {
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
        <View style={styles.colDel} />
      </View>
      {ex.sets.map((s, i) => (
        <View key={s.key} style={styles.tableRow}>
          <ThemedText type="smallBold" style={styles.colSet}>
            {i + 1}
          </ThemedText>
          <StepperInput
            style={styles.colWeight}
            value={s.weight}
            onChangeText={(v) => onPatch(ex.key, i, { weight: v })}
            onFocus={onFocus}
            step={5}
            placeholder="0"
          />
          <StepperInput
            style={styles.colReps}
            value={s.reps}
            onChangeText={(v) => onPatch(ex.key, i, { reps: v })}
            onFocus={onFocus}
            step={1}
            integer
            placeholder="0"
          />
          <Pressable onPress={() => onRemove(ex.key, i)} hitSlop={8} style={styles.colDel}>
            <ThemedText type="smallBold" themeColor="danger">
              ✕
            </ThemedText>
          </Pressable>
        </View>
      ))}
    </>
  );
}

function DurationRows({ ex, onPatch, onRemove }: RowProps) {
  return (
    <>
      <View style={styles.tableHead}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.colSet}>
          SET
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1, textAlign: 'center' }}>
          HOLD TIME
        </ThemedText>
        <View style={styles.colDel} />
      </View>
      {ex.sets.map((s, i) => (
        <View key={s.key} style={styles.tableRow}>
          <ThemedText type="smallBold" style={styles.colSet}>
            {i + 1}
          </ThemedText>
          <View style={{ flex: 1 }}>
            <DurationStepper value={s.durationSec} onChange={(v) => onPatch(ex.key, i, { durationSec: v })} />
          </View>
          <Pressable onPress={() => onRemove(ex.key, i)} hitSlop={8} style={styles.colDel}>
            <ThemedText type="smallBold" themeColor="danger">
              ✕
            </ThemedText>
          </Pressable>
        </View>
      ))}
    </>
  );
}

function CardioRows({
  ex,
  speedUnit,
  onPatch,
  onRemove,
  onFocus,
}: RowProps & { speedUnit: SpeedUnit; onFocus: (e: any) => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.two }}>
      {ex.sets.map((s, i) => (
        <View
          key={s.key}
          style={[styles.cardioCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
          {ex.sets.length > 1 ? (
            <View style={styles.cardioCardHead}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Set {i + 1}
              </ThemedText>
              <Pressable onPress={() => onRemove(ex.key, i)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="danger">
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
          <CardioField label="Duration">
            <DurationStepper value={s.durationSec} onChange={(v) => onPatch(ex.key, i, { durationSec: v })} />
          </CardioField>
          <CardioField label={`Speed (${speedUnit === 'kmph' ? 'km/h' : 'mph'})`}>
            <StepperInput
              value={s.speed}
              onChangeText={(v) => onPatch(ex.key, i, { speed: v })}
              onFocus={onFocus}
              step={0.5}
              placeholder="0"
            />
          </CardioField>
          <CardioField label="Incline (%)">
            <StepperInput
              value={s.incline}
              onChangeText={(v) => onPatch(ex.key, i, { incline: v })}
              onFocus={onFocus}
              step={1}
              placeholder="0"
            />
          </CardioField>
          {ex.sets.length === 1 ? (
            <Pressable onPress={() => onRemove(ex.key, i)} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
              <ThemedText type="small" themeColor="danger">
                Remove set
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function CardioField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.cardioField}>
      <ThemedText type="small" themeColor="textSecondary" style={{ width: 96 }}>
        {label}
      </ThemedText>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function UnitToggle<T extends string>({
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

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  unitToggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    overflow: 'hidden',
  },
  unitOption: { paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: Spacing.one },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.one },
  colSet: { width: 24, textAlign: 'center' },
  colWeight: { flex: 1, textAlign: 'center' },
  colReps: { flex: 1, textAlign: 'center' },
  colDel: { width: 32, alignItems: 'center' },
  cardioCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    padding: Spacing.two + 2,
    gap: Spacing.two,
  },
  cardioCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardioField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
