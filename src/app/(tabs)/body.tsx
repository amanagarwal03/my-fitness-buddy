import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MenuHeader } from '@/components/side-nav';
import { StepperInput } from '@/components/stepper-input';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { bmiCategory, computeBmi } from '@/lib/bmi';
import {
  ACTIVITY_LABELS,
  bmr as calcBmr,
  bodyFatPct,
  estimateMeasurements,
  healthyBfRange,
  idealWeight,
  macroSplit,
  metabolicAge,
  muscleMassPct,
  recommendedCalories,
  subcutaneousFatPct,
  tdee as calcTdee,
  type Sex,
} from '@/lib/bodyStats';
import { ageFromDob } from '@/lib/date';
import { showAlert } from '@/lib/dialog';
import { PREVIEW_MODE } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';
import type { ActivityLevel, FitnessGoal, Profile, Unit } from '@/lib/types';
import { fromKg, round1 } from '@/lib/units';

const HERO_GRADIENT = ['#2EA0FF', '#1257B0'] as const;

const MEASURES = [
  { key: 'neck', label: 'Neck', emoji: '🧣' },
  { key: 'chest', label: 'Chest', emoji: '🫁' },
  { key: 'biceps', label: 'Biceps', emoji: '💪' },
  { key: 'waist', label: 'Waist', emoji: '📏' },
  { key: 'hips', label: 'Hips', emoji: '🍑' },
  { key: 'thighs', label: 'Thighs', emoji: '🦵' },
] as const;
type MeasureKey = (typeof MEASURES)[number]['key'];

const ACTIVITIES: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const GOALS: { key: FitnessGoal; label: string; emoji: string }[] = [
  { key: 'lose', label: 'Lose', emoji: '📉' },
  { key: 'maintain', label: 'Maintain', emoji: '⚖️' },
  { key: 'gain', label: 'Gain', emoji: '📈' },
];

type MeasureUnit = 'cm' | 'in';

const toCmVal = (s: string, unit: MeasureUnit) => {
  const v = Number(s);
  if (!(s !== '' && v > 0)) return null;
  return unit === 'in' ? round1(v * 2.54) : round1(v);
};

const payloadFrom = (
  vals: Record<MeasureKey, string>,
  unit: MeasureUnit,
  activity: ActivityLevel,
  goal: FitnessGoal,
) => ({
  neck_cm: toCmVal(vals.neck, unit),
  chest_cm: toCmVal(vals.chest, unit),
  biceps_cm: toCmVal(vals.biceps, unit),
  waist_cm: toCmVal(vals.waist, unit),
  hips_cm: toCmVal(vals.hips, unit),
  thighs_cm: toCmVal(vals.thighs, unit),
  activity_level: activity,
  goal,
});

export default function BodyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { scrollRef, handleInputFocus, keyboardSpacerHeight, keyboardDismissMode } =
    useKeyboardAwareScroll();

  const [sex, setSex] = useState<Sex>('other');
  const [age, setAge] = useState<number | null>(null);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>('kg');

  const [m, setM] = useState<Record<MeasureKey, string>>({
    neck: '', chest: '', biceps: '', waist: '', hips: '', thighs: '',
  });
  const [activity, setActivity] = useState<ActivityLevel>('moderate');
  const [goal, setGoal] = useState<FitnessGoal>('maintain');
  const [measureUnit, setMeasureUnit] = useState<MeasureUnit>('cm');
  const [measureOpen, setMeasureOpen] = useState(false); // collapsed by default
  const [applied, setApplied] = useState(false);

  const hydrated = useRef(false);
  const savedSnapshot = useRef('');

  const load = useCallback(async () => {
    if (PREVIEW_MODE || !uid) {
      hydrated.current = true;
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle();
    const p = data as Profile | null;
    const pref = (p?.unit_pref as Unit) ?? 'kg';
    const mu: MeasureUnit = pref === 'lbs' ? 'in' : 'cm';
    const sx = (p?.sex as Sex) ?? 'other';
    const h = p?.height_cm ?? 0;
    setSex(sx);
    setAge(ageFromDob(p?.dob) ?? p?.age ?? null);
    setHeightCm(p?.height_cm ?? null);
    setWeightKg(p?.weight_kg ?? null);
    setUnit(pref);
    setMeasureUnit(mu);

    // Pre-fill empty measurements with standard estimates from height + sex so
    // the screen shows sensible numbers the user can correct.
    const est = estimateMeasurements(sx, h);
    const disp = (cm: number | null | undefined, fallback?: number) => {
      const val = cm ?? fallback;
      if (val == null) return '';
      return String(mu === 'in' ? round1(val / 2.54) : round1(val));
    };
    const next: Record<MeasureKey, string> = {
      neck: disp(p?.neck_cm, est?.neck),
      chest: disp(p?.chest_cm, est?.chest),
      biceps: disp(p?.biceps_cm, est?.biceps),
      waist: disp(p?.waist_cm, est?.waist),
      hips: disp(p?.hips_cm, est?.hips),
      thighs: disp(p?.thighs_cm, est?.thighs),
    };
    setM(next);
    const act = (p?.activity_level as ActivityLevel) ?? 'moderate';
    const g = (p?.goal as FitnessGoal) ?? 'maintain';
    setActivity(act);
    setGoal(g);
    // Snapshot includes the pre-fill so estimates aren't auto-saved until the
    // user actually edits something.
    savedSnapshot.current = JSON.stringify(payloadFrom(next, mu, act, g));
    hydrated.current = true;
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!hydrated.current || PREVIEW_MODE || !uid) return;
    const payload = payloadFrom(m, measureUnit, activity, goal);
    const serialized = JSON.stringify(payload);
    if (serialized === savedSnapshot.current) return;
    const t = setTimeout(async () => {
      let userId: string;
      try {
        userId = await requireUserId();
      } catch {
        return;
      }
      await supabase
        .from('profiles')
        .upsert({ user_id: userId, ...payload, updated_at: new Date().toISOString() });
      savedSnapshot.current = serialized;
    }, 700);
    return () => clearTimeout(t);
  }, [m, activity, goal, measureUnit, uid]);

  const patch = (key: MeasureKey, v: string) => setM((cur) => ({ ...cur, [key]: v.replace(/[^0-9.]/g, '') }));

  const toggleMeasureUnit = () => {
    const next: MeasureUnit = measureUnit === 'cm' ? 'in' : 'cm';
    setM((cur) => {
      const o = { ...cur };
      (Object.keys(o) as MeasureKey[]).forEach((k) => {
        const v = Number(o[k]);
        if (o[k] !== '' && Number.isFinite(v) && v > 0) {
          o[k] = String(round1(next === 'in' ? v / 2.54 : v * 2.54));
        }
      });
      return o;
    });
    setMeasureUnit(next);
  };

  // ── Derived metrics ────────────────────────────────────────────────────────
  const measures = {
    neck: toCmVal(m.neck, measureUnit),
    waist: toCmVal(m.waist, measureUnit),
    hips: toCmVal(m.hips, measureUnit),
  };
  const bmi = heightCm && weightKg ? computeBmi(heightCm, weightKg) : null;
  const bmrVal = weightKg && heightCm && age ? calcBmr(sex, weightKg, heightCm, age) : null;
  const tdeeVal = bmrVal != null ? calcTdee(bmrVal, activity) : null;
  const bf = bodyFatPct(sex, heightCm ?? 0, age ?? 0, bmi, measures);
  const muscle = bf != null ? muscleMassPct(bf) : null;
  const subcut = bf != null ? subcutaneousFatPct(bf) : null;
  const metAge = metabolicAge(age ?? 0, sex, bf);
  const ideal = idealWeight(heightCm ?? 0);
  const recCals = tdeeVal != null && bmrVal != null ? recommendedCalories(tdeeVal, bmrVal, goal) : null;
  const bfRange = healthyBfRange(sex);

  const toW = (kg: number) => `${round1(fromKg(kg, unit))} ${unit}`;
  const missingBasics = !heightCm || !weightKg || !age;

  // Distance from the ideal-weight target, for the hero card.
  const diffKg = weightKg && ideal ? weightKg - ideal.target : null;
  const deltaLabel =
    diffKg == null
      ? ''
      : Math.abs(diffKg) < 0.5
        ? 'You’re right at your target 🎉'
        : `${round1(fromKg(Math.abs(diffKg), unit))} ${unit} to ${diffKg > 0 ? 'lose' : 'gain'}`;

  const filledCount = MEASURES.filter((mm) => m[mm.key] !== '').length;

  const applyToGoals = async () => {
    if (recCals == null || !weightKg) return;
    if (PREVIEW_MODE) {
      showAlert('Preview mode', 'Connect Supabase to save goals.');
      return;
    }
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      showAlert('Could not save', (e as Error).message);
      return;
    }
    const split = macroSplit(recCals, weightKg);
    const { error } = await supabase.from('nutrition_goals').upsert({ user_id: userId, ...split });
    if (error) {
      showAlert('Could not save', error.message);
      return;
    }
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissMode}>
        <MenuHeader title="Body" />

        {missingBasics ? (
          <Pressable onPress={() => router.push('/(tabs)/profile')}>
            <Card style={[styles.notice, { borderColor: theme.warning }]}>
              <ThemedText type="small">
                Add your height, weight and date of birth in{' '}
                <ThemedText type="smallBold" themeColor="primary">
                  Profile
                </ThemedText>{' '}
                to unlock all metrics.
              </ThemedText>
            </Card>
          </Pressable>
        ) : null}

        {/* ── Ideal weight hero (up top) ─────────────── */}
        {ideal ? (
          <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.idealHero}>
            <View style={styles.idealTopRow}>
              <View style={styles.idealEmoji}>
                <ThemedText style={{ fontSize: 22 }}>🎯</ThemedText>
              </View>
              <ThemedText style={styles.idealLabel}>Ideal weight target</ThemedText>
            </View>
            <ThemedText style={styles.idealValue}>{toW(ideal.target)}</ThemedText>
            {deltaLabel ? <ThemedText style={styles.idealDelta}>{deltaLabel}</ThemedText> : null}
            <ThemedText style={styles.idealRange}>
              Healthy range {toW(ideal.min)} – {toW(ideal.max)}
            </ThemedText>
          </LinearGradient>
        ) : null}

        {/* ── Your metrics ───────────────────────────── */}
        <ThemedText type="smallBold" themeColor="textSecondary">
          YOUR METRICS
        </ThemedText>
        <View style={styles.metricGrid}>
          <Metric emoji="⚖️" label="BMI" value={bmi != null ? bmi.toFixed(1) : '—'} sub={bmi != null ? bmiCategory(bmi) : 'Add height & weight'} accent={theme.primary} />
          <Metric emoji="🔥" label="Body fat" value={bf != null ? `${bf}%` : '—'} sub={bf != null ? `Healthy ${bfRange.min}–${bfRange.max}%` : 'Add measurements'} accent="#F59E0B" />
          <Metric emoji="💪" label="Muscle mass" value={muscle != null ? `${muscle}%` : '—'} sub="Estimated" accent={theme.success} />
          <Metric emoji="🧈" label="Subcutaneous" value={subcut != null ? `${subcut}%` : '—'} sub="Body fat est." accent="#8B5CF6" />
          <Metric emoji="🔋" label="BMR" value={bmrVal != null ? `${bmrVal}` : '—'} sub="kcal/day at rest" accent="#0EA5E9" />
          <Metric emoji="⏳" label="Metabolic age" value={metAge != null ? `${metAge}` : '—'} sub={age != null ? `Actual ${age} yrs` : 'Estimated'} accent="#EC4899" />
        </View>

        {/* ── Measurements (collapsed by default) ─────── */}
        <Pressable
          onPress={() => setMeasureOpen((o) => !o)}
          style={[styles.collapseHeader, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={[styles.collapseIcon, { backgroundColor: theme.primary + '22' }]}>
            <ThemedText style={{ fontSize: 18 }}>📐</ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold">Measurements</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {filledCount > 0 ? `${filledCount} of 6 entered · tap to edit` : 'Tap to add your girths'}
            </ThemedText>
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary" style={{ fontSize: 18 }}>
            {measureOpen ? '⌄' : '›'}
          </ThemedText>
        </Pressable>

        {measureOpen ? (
          <Card style={{ gap: Spacing.two }}>
            <View style={styles.sectionHeader}>
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                Pre-filled with standard estimates — adjust to your real numbers.
              </ThemedText>
              <View style={[styles.unitToggle, { borderColor: theme.border }]}>
                {(['cm', 'in'] as MeasureUnit[]).map((u) => (
                  <Pressable
                    key={u}
                    onPress={() => u !== measureUnit && toggleMeasureUnit()}
                    style={[styles.unitOpt, { backgroundColor: u === measureUnit ? theme.primary : 'transparent' }]}>
                    <ThemedText type="smallBold" style={{ color: u === measureUnit ? '#fff' : theme.textSecondary }}>
                      {u}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
            {MEASURES.map((mm) => (
              <View key={mm.key} style={styles.measureRow}>
                <ThemedText style={{ width: 96 }}>
                  {mm.emoji}  {mm.label}
                </ThemedText>
                <View style={{ flex: 1 }}>
                  <StepperInput
                    value={m[mm.key]}
                    onChangeText={(v) => patch(mm.key, v)}
                    onFocus={handleInputFocus}
                    step={0.5}
                    placeholder="—"
                  />
                </View>
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              Neck + waist (and hips) unlock a more accurate body-fat estimate.
            </ThemedText>
          </Card>
        ) : null}

        {/* ── Goal + activity → recommended calories ───── */}
        <ThemedText type="smallBold" themeColor="textSecondary">
          DAILY CALORIE TARGET
        </ThemedText>
        <Card style={{ gap: Spacing.three }}>
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="small" themeColor="textSecondary">
              Goal
            </ThemedText>
            <View style={styles.goalRow}>
              {GOALS.map((g) => {
                const sel = goal === g.key;
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => setGoal(g.key)}
                    style={[
                      styles.goalCard,
                      { borderColor: sel ? theme.primary : theme.border, backgroundColor: sel ? theme.primary + '14' : 'transparent' },
                    ]}>
                    <ThemedText style={{ fontSize: 22 }}>{g.emoji}</ThemedText>
                    <ThemedText type="smallBold" themeColor={sel ? 'primary' : 'text'}>
                      {g.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: Spacing.two }}>
            <ThemedText type="small" themeColor="textSecondary">
              Activity level
            </ThemedText>
            {ACTIVITIES.map((a) => {
              const sel = activity === a;
              return (
                <Pressable
                  key={a}
                  onPress={() => setActivity(a)}
                  style={[styles.activityRow, { borderColor: sel ? theme.primary : theme.border }]}>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: sel ? theme.primary : theme.border, backgroundColor: sel ? theme.primary : 'transparent' },
                    ]}
                  />
                  <ThemedText type="small" themeColor={sel ? 'text' : 'textSecondary'} style={{ flex: 1 }}>
                    {ACTIVITY_LABELS[a]}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {recCals != null ? (
            <View style={[styles.recBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                Recommended intake to {goal === 'lose' ? 'lose' : goal === 'gain' ? 'gain' : 'maintain'} weight
              </ThemedText>
              <ThemedText type="title" style={{ fontSize: 34 }}>
                {recCals}
                <ThemedText themeColor="textSecondary"> kcal/day</ThemedText>
              </ThemedText>
              {tdeeVal != null ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Maintenance ≈ {tdeeVal} kcal · BMR {bmrVal}
                </ThemedText>
              ) : null}
              <Button
                title={applied ? '✓ Applied to your goals' : 'Apply to my daily goals'}
                onPress={applyToGoals}
                variant={applied ? 'secondary' : 'primary'}
                style={{ marginTop: Spacing.one }}
              />
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Add height, weight and date of birth in Profile to get a calorie target.
            </ThemedText>
          )}
        </Card>

        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          These figures are estimates for guidance, not medical measurements.
        </ThemedText>
        <View style={{ height: keyboardSpacerHeight }} />
      </ScrollView>
    </Screen>
  );
}

function Metric({
  emoji,
  label,
  value,
  sub,
  accent,
}: {
  emoji: string;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: accent + '22' }]}>
        <ThemedText style={{ fontSize: 18 }}>{emoji}</ThemedText>
      </View>
      <ThemedText type="title" style={{ fontSize: 24 }}>
        {value}
      </ThemedText>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {sub}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  notice: { borderWidth: StyleSheet.hairlineWidth },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  idealHero: { borderRadius: Spacing.four, padding: Spacing.four, gap: Spacing.one },
  idealTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  idealEmoji: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idealLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '700' },
  idealValue: { color: '#fff', fontSize: 38, fontWeight: '800', marginTop: Spacing.one },
  idealDelta: { color: '#fff', fontSize: 15, fontWeight: '700' },
  idealRange: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },

  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  metric: {
    width: '48%',
    flexGrow: 1,
    gap: 2,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },

  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  collapseIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  unitToggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    overflow: 'hidden',
  },
  unitOpt: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  measureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  goalRow: { flexDirection: 'row', gap: Spacing.two },
  goalCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two + 2,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  recBox: { borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.one },
});
