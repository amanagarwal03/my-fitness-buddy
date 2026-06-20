import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen, SegmentedControl } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { formatDuration, isoDate } from '@/lib/date';
import { PREVIEW_MODE, previewCardio, previewSets } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';
import type { BodyPart, Unit, WorkoutSet } from '@/lib/types';
import { fromKg, fromKmh, round1, toKg, toKmh, type SpeedUnit } from '@/lib/units';

export default function ExerciseLogScreen() {
  const { id, name, bodyPart } = useLocalSearchParams<{
    id: string;
    name?: string;
    bodyPart?: BodyPart;
  }>();

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: name ?? 'Log exercise' }} />
      {bodyPart === 'cardio' ? (
        <CardioLog id={id} name={name} />
      ) : (
        <StrengthLog id={id} name={name} />
      )}
    </Screen>
  );
}

function ProgressButton({ id, name, bodyPart }: { id: string; name?: string; bodyPart?: BodyPart }) {
  const router = useRouter();
  return (
    <Button
      title="📈  View progress"
      variant="secondary"
      onPress={() =>
        router.push({
          pathname: '/workout/progress/[id]',
          params: { id, name: name ?? '', bodyPart: bodyPart ?? '' },
        })
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Strength logging — sets of weight (kg/lbs) + reps
// ---------------------------------------------------------------------------
type SetRow = { weight: string; reps: string };
const emptyRows = (n: number): SetRow[] => Array.from({ length: n }, () => ({ weight: '', reps: '' }));

function StrengthLog({ id, name }: { id: string; name?: string }) {
  const theme = useTheme();
  const { session: auth } = useAuth();
  const [unit, setUnit] = useState<Unit>('kg');
  const [rows, setRows] = useState<SetRow[]>(emptyRows(3));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    if (PREVIEW_MODE) {
      setUnit('kg');
      setRows(previewSets.map((s) => ({ ...s })));
      return;
    }
    const today = isoDate();
    const [profileRes, setsRes] = await Promise.all([
      supabase.from('profiles').select('unit_pref').maybeSingle(),
      supabase
        .from('workout_sets')
        .select('*')
        .eq('exercise_id', id)
        .order('performed_on', { ascending: false })
        .order('set_number', { ascending: true })
        .limit(30),
    ]);
    const pref = (profileRes.data?.unit_pref as Unit) ?? 'kg';
    setUnit(pref);
    const all = (setsRes.data as WorkoutSet[]) ?? [];
    const todays = all.filter((s) => s.performed_on === today);
    // Show today's sets if any; otherwise pre-fill from the most recent day so
    // you start from last time's numbers and just adjust them.
    const source = todays.length > 0 ? todays : all.filter((s) => s.performed_on === all[0]?.performed_on);
    if (source.length > 0) {
      const next = emptyRows(Math.max(3, source.length));
      source.forEach((s) => {
        const idx = s.set_number - 1;
        if (idx >= 0 && idx < next.length) {
          next[idx] = {
            weight: s.weight_kg != null ? String(round1(fromKg(s.weight_kg, pref))) : '',
            reps: s.reps != null ? String(s.reps) : '',
          };
        }
      });
      setRows(next);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onUnitChange = (next: Unit) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.weight === '' || !Number.isFinite(Number(r.weight))) return r;
        const kg = toKg(Number(r.weight), unit);
        return { ...r, weight: String(round1(fromKg(kg, next))) };
      }),
    );
    setUnit(next);
  };

  const updateRow = (i: number, key: keyof SetRow, value: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  };

  // ± steppers nudge a set's weight by 5 (blank counts as 0, never goes below 0).
  const bumpWeight = (i: number, delta: number) => {
    setRows((prev) =>
      prev.map((r, idx) =>
        idx === i ? { ...r, weight: String(Math.max(0, round1((Number(r.weight) || 0) + delta))) } : r,
      ),
    );
  };

  const save = async () => {
    if (PREVIEW_MODE) {
      Alert.alert('Preview mode', 'Connect Supabase to save your sets.');
      return;
    }
    if (!auth || !id) return;
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
      return;
    }
    const today = isoDate();

    const toInsert = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.weight !== '' && Number.isFinite(Number(r.weight)))
      .map(({ r, i }) => ({
        user_id: userId,
        exercise_id: id,
        session_id: null,
        performed_on: today,
        set_number: i + 1,
        weight_kg: toKg(Number(r.weight), unit),
        reps: r.reps !== '' && Number.isFinite(Number(r.reps)) ? Number(r.reps) : null,
      }));

    if (toInsert.length === 0) {
      Alert.alert('Nothing to save', 'Enter a weight for at least one set.');
      return;
    }

    setSaving(true);
    // Manual (non-session) logs: replace today's sets for this exercise so
    // re-saving stays idempotent without relying on a day-wide unique key.
    await supabase
      .from('workout_sets')
      .delete()
      .eq('exercise_id', id)
      .eq('performed_on', today)
      .is('session_id', null);
    const { error } = await supabase.from('workout_sets').insert(toInsert);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    Alert.alert('Saved', 'Your sets have been logged.');
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          UNIT
        </ThemedText>
        <View style={{ width: 140 }}>
          <SegmentedControl<Unit>
            value={unit}
            onChange={onUnitChange}
            options={[
              { label: 'kg', value: 'kg' },
              { label: 'lbs', value: 'lbs' },
            ]}
          />
        </View>
      </View>

      {rows.map((row, i) => (
        <Card key={i} style={styles.setRow}>
          <ThemedText type="smallBold" style={{ width: 44 }}>
            Set {i + 1}
          </ThemedText>
          <View style={{ flex: 1.5 }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.one }}>
              Weight ({unit})
            </ThemedText>
            <View style={styles.stepRow}>
              <Pressable
                onPress={() => bumpWeight(i, -5)}
                hitSlop={6}
                style={[styles.stepBtn, { borderColor: theme.border }]}>
                <ThemedText type="smallBold" style={styles.stepGlyph}>
                  −
                </ThemedText>
              </Pressable>
              <TextInput
                keyboardType="numeric"
                value={row.weight}
                onChangeText={(t) => updateRow(i, 'weight', t)}
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
                style={[styles.stepInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
              />
              <Pressable
                onPress={() => bumpWeight(i, 5)}
                hitSlop={6}
                style={[styles.stepBtn, { borderColor: theme.border }]}>
                <ThemedText type="smallBold" style={styles.stepGlyph}>
                  ＋
                </ThemedText>
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Reps"
              keyboardType="numeric"
              value={row.reps}
              onChangeText={(t) => updateRow(i, 'reps', t)}
              placeholder="—"
            />
          </View>
        </Card>
      ))}

      <Button
        title="＋ Add set"
        variant="secondary"
        onPress={() => setRows((prev) => [...prev, { weight: '', reps: '' }])}
      />
      <Button title="Save sets" onPress={save} loading={saving} />
      <ProgressButton id={id} name={name} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Cardio logging — duration timer + incline + speed (kmph/mph)
// ---------------------------------------------------------------------------
function CardioLog({ id, name }: { id: string; name?: string }) {
  const { session: auth } = useAuth();
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>('kmph');
  const [incline, setIncline] = useState('');
  const [speed, setSpeed] = useState('');
  const [running, setRunning] = useState(false);
  const [, setTick] = useState(0);
  const baseRef = useRef(0); // accumulated seconds before the current run
  const runStartRef = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    if (PREVIEW_MODE) {
      setSpeedUnit('kmph');
      setIncline(String(previewCardio.incline));
      setSpeed(String(previewCardio.speedKmh));
      baseRef.current = previewCardio.durationSec;
      setTick((t) => t + 1);
      return;
    }
    const today = isoDate();
    const { data } = await supabase
      .from('workout_sets')
      .select('*')
      .eq('exercise_id', id)
      .eq('performed_on', today)
      .order('set_number', { ascending: true });
    const entry = (data as WorkoutSet[] | null)?.find((s) => s.set_number === 1);
    if (entry) {
      baseRef.current = entry.duration_seconds ?? 0;
      setIncline(entry.incline != null ? String(entry.incline) : '');
      setSpeed(entry.speed_kmh != null ? String(round1(fromKmh(entry.speed_kmh, 'kmph'))) : '');
      setTick((t) => t + 1);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Tick the live timer while running.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [running]);

  const elapsed = () =>
    baseRef.current + (running && runStartRef.current ? (Date.now() - runStartRef.current) / 1000 : 0);

  const toggleTimer = () => {
    if (running) {
      baseRef.current = elapsed();
      runStartRef.current = null;
      setRunning(false);
    } else {
      runStartRef.current = Date.now();
      setRunning(true);
    }
  };

  const resetTimer = () => {
    baseRef.current = 0;
    runStartRef.current = null;
    setRunning(false);
    setTick((t) => t + 1);
  };

  const onSpeedUnitChange = (next: SpeedUnit) => {
    if (speed !== '' && Number.isFinite(Number(speed))) {
      const kmh = toKmh(Number(speed), speedUnit);
      setSpeed(String(round1(fromKmh(kmh, next))));
    }
    setSpeedUnit(next);
  };

  const save = async () => {
    if (PREVIEW_MODE) {
      Alert.alert('Preview mode', 'Connect Supabase to save this run.');
      return;
    }
    if (!auth || !id) return;
    const durationSeconds = Math.round(elapsed());
    if (durationSeconds === 0 && speed === '' && incline === '') {
      Alert.alert('Nothing to save', 'Run the timer or enter speed/incline first.');
      return;
    }
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
      return;
    }
    const today = isoDate();
    setSaving(true);
    // Replace today's manual cardio entry for this exercise (idempotent re-save).
    await supabase
      .from('workout_sets')
      .delete()
      .eq('exercise_id', id)
      .eq('performed_on', today)
      .is('session_id', null);
    const { error } = await supabase.from('workout_sets').insert({
      user_id: userId,
      exercise_id: id,
      session_id: null,
      performed_on: today,
      set_number: 1,
      weight_kg: null,
      reps: null,
      duration_seconds: durationSeconds || null,
      incline: incline !== '' && Number.isFinite(Number(incline)) ? Number(incline) : null,
      speed_kmh: speed !== '' && Number.isFinite(Number(speed)) ? toKmh(Number(speed), speedUnit) : null,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    Alert.alert('Saved', 'Your run has been logged.');
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ alignItems: 'center', gap: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">
          DURATION
        </ThemedText>
        <ThemedText type="title" style={{ fontVariant: ['tabular-nums'] }}>
          {formatDuration(elapsed())}
        </ThemedText>
        <View style={styles.timerBtns}>
          <Button
            title={running ? 'Pause' : 'Start'}
            variant={running ? 'danger' : 'primary'}
            onPress={toggleTimer}
            style={{ flex: 1 }}
          />
          <Button title="Reset" variant="secondary" onPress={resetTimer} style={{ flex: 1 }} />
        </View>
      </Card>

      <Card style={{ gap: Spacing.three }}>
        <Field
          label="Incline (%)"
          keyboardType="numeric"
          value={incline}
          onChangeText={setIncline}
          placeholder="0"
        />
        <View style={styles.headerRow}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            SPEED UNIT
          </ThemedText>
          <View style={{ width: 160 }}>
            <SegmentedControl<SpeedUnit>
              value={speedUnit}
              onChange={onSpeedUnitChange}
              options={[
                { label: 'km/h', value: 'kmph' },
                { label: 'mph', value: 'mph' },
              ]}
            />
          </View>
        </View>
        <Field
          label={`Speed (${speedUnit === 'kmph' ? 'km/h' : 'mph'})`}
          keyboardType="numeric"
          value={speed}
          onChangeText={setSpeed}
          placeholder="0"
        />
      </Card>

      <Button title="Save run" onPress={save} loading={saving} />
      <ProgressButton id={id} name={name} bodyPart="cardio" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  timerBtns: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  stepBtn: {
    width: 36,
    height: 48,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 20, lineHeight: 22 },
  stepInput: {
    flex: 1,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 48,
    textAlign: 'center',
  },
});
