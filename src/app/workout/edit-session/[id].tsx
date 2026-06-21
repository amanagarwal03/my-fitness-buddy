import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BODY_PART_META } from '@/lib/bodyparts';
import { isoDate } from '@/lib/date';
import { sanitizeDecimal, sanitizeInt } from '@/lib/num';
import { takePendingExercise } from '@/lib/pendingExercise';
import { requireUserId, supabase } from '@/lib/supabase';
import type { BodyPart, Unit, WorkoutSet } from '@/lib/types';
import { fromKg, round1, toKg } from '@/lib/units';

type JoinedSet = WorkoutSet & { exercises: { name: string; body_part: BodyPart } | null };

// One editable set. Cardio fields are carried through untouched on save.
type EditSet = {
  key: string;
  weight: string; // in display unit
  reps: string;
  duration_seconds: number | null;
  incline: number | null;
  speed_kmh: number | null;
};
type EditExercise = { key: string; id: string; name: string; bodyPart: BodyPart; sets: EditSet[] };

const WEIGHT_STEP = 5;
let keySeq = 0;
const newKey = () => `k${Date.now()}-${keySeq++}`;
const emptySet = (): EditSet => ({
  key: newKey(),
  weight: '',
  reps: '',
  duration_seconds: null,
  incline: null,
  speed_kmh: null,
});

export default function EditSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [unit, setUnit] = useState<Unit>('kg');
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
    if (!id) return;
    let active = true;
    (async () => {
      const [profileRes, sessRes, setsRes] = await Promise.all([
        supabase.from('profiles').select('unit_pref').maybeSingle(),
        supabase.from('workout_sessions').select('started_at').eq('id', id).maybeSingle(),
        supabase
          .from('workout_sets')
          .select('*, exercises(name, body_part)')
          .eq('session_id', id)
          .order('set_number', { ascending: true }),
      ]);
      if (!active) return;
      const pref = (profileRes.data?.unit_pref as Unit) ?? 'kg';
      setUnit(pref);
      if (sessRes.data?.started_at) setPerformedOn(isoDate(new Date(sessRes.data.started_at)));

      const rows = (setsRes.data ?? []) as JoinedSet[];
      const map = new Map<string, EditExercise>();
      for (const r of rows) {
        const g =
          map.get(r.exercise_id) ??
          ({
            key: newKey(),
            id: r.exercise_id,
            name: r.exercises?.name ?? 'Exercise',
            bodyPart: r.exercises?.body_part ?? 'chest',
            sets: [],
          } as EditExercise);
        g.sets.push({
          key: newKey(),
          weight: r.weight_kg != null ? String(round1(fromKg(r.weight_kg, pref))) : '',
          reps: r.reps != null ? String(r.reps) : '',
          duration_seconds: r.duration_seconds ?? null,
          incline: r.incline ?? null,
          speed_kmh: r.speed_kmh ?? null,
        });
        map.set(r.exercise_id, g);
      }
      setExercises([...map.values()]);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // Add an exercise picked from the picker on return.
  const addExercise = useCallback((exId: string, name: string, bodyPart: string) => {
    setExercises((cur) => [
      ...cur,
      { key: newKey(), id: exId, name, bodyPart: bodyPart as BodyPart, sets: [emptySet()] },
    ]);
  }, []);
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

  const addSet = (exKey: string) =>
    setExercises((cur) =>
      cur.map((ex) => {
        if (ex.key !== exKey) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const seed: EditSet = last
          ? { ...emptySet(), weight: last.weight, reps: last.reps }
          : emptySet();
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

  const save = async () => {
    setSaving(true);
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error).message);
      return;
    }
    // Rebuild the session's sets from scratch: number them per-exercise and keep
    // any carried-over cardio fields. The session row (duration/time) is untouched.
    const rows = exercises.flatMap((ex) =>
      ex.sets.map((s, i) => ({
        user_id: userId,
        exercise_id: ex.id,
        session_id: id,
        performed_on: performedOn,
        set_number: i + 1,
        weight_kg: s.weight !== '' ? toKg(Number(s.weight), unit) : null,
        reps: s.reps !== '' ? Number(s.reps) : null,
        duration_seconds: s.duration_seconds,
        incline: s.incline,
        speed_kmh: s.speed_kmh,
      })),
    );

    const { error: delErr } = await supabase.from('workout_sets').delete().eq('session_id', id);
    if (delErr) {
      setSaving(false);
      Alert.alert('Could not save', delErr.message);
      return;
    }
    if (rows.length) {
      const { error: insErr } = await supabase.from('workout_sets').insert(rows);
      if (insErr) {
        setSaving(false);
        Alert.alert('Could not save', insErr.message);
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
            Editing set details only — the session’s time and duration stay the same.
          </ThemedText>
          <View style={[styles.unitToggle, { borderColor: theme.border }]}>
            {(['kg', 'lbs'] as Unit[]).map((u) => (
              <Pressable
                key={u}
                onPress={() => u !== unit && toggleUnit()}
                style={[styles.unitOption, { backgroundColor: u === unit ? theme.primary : 'transparent' }]}>
                <ThemedText type="smallBold" style={{ color: u === unit ? '#fff' : theme.textSecondary }}>
                  {u}
                </ThemedText>
              </Pressable>
            ))}
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
                      onChangeText={(t) => updateSet(ex.key, i, 'weight', sanitizeDecimal(t))}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="0"
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
                    onChangeText={(t) => updateSet(ex.key, i, 'reps', sanitizeInt(t))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.cellInput, styles.colReps, { color: theme.text, borderColor: theme.border }]}
                  />
                  <Pressable onPress={() => removeSet(ex.key, i)} hitSlop={8} style={styles.colDel}>
                    <ThemedText type="smallBold" themeColor="danger">
                      ✕
                    </ThemedText>
                  </Pressable>
                </View>
              ))}

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
      </ScrollView>
    </Screen>
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
  unitOption: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.one },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.one },
  colSet: { width: 30, textAlign: 'center' },
  colWeight: { flex: 1.7, textAlign: 'center' },
  colReps: { flex: 1 },
  colDel: { width: 36, alignItems: 'center' },
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
});
