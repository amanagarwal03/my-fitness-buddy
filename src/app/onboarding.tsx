import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DobPicker } from '@/components/dob-picker';
import { GenderSelect, type Gender } from '@/components/gender-select';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { bmiCategory, computeBmi } from '@/lib/bmi';
import { ageFromDob } from '@/lib/date';
import { showAlert } from '@/lib/dialog';
import { sanitizeDecimal } from '@/lib/num';
import { requireUserId, supabase } from '@/lib/supabase';
import type { Unit } from '@/lib/types';
import { fromKg, round1, toKg } from '@/lib/units';

type HeightUnit = 'cm' | 'in';
const CM_PER_IN = 2.54;

const DEFAULT_GOALS = { calories: '2000', protein_g: '150', carbs_g: '200', fat_g: '65' };
const TOTAL_STEPS = 3;

const STEP_META = [
  { emoji: '👋', title: 'Welcome', subtitle: 'Let’s set up your fitness buddy' },
  { emoji: '📏', title: 'About you', subtitle: 'A few details & your BMI basics' },
  { emoji: '🎯', title: 'Daily goals', subtitle: 'Set your nutrition targets' },
];

const WELCOME_POINTS = [
  { emoji: '📸', text: 'Snap a meal for instant macros' },
  { emoji: '🏋️', text: 'Log every workout & set' },
  { emoji: '📈', text: 'Track BMI and daily goals' },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, refreshOnboarding, markOnboarded, signOut } = useAuth();

  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<Gender | null>(null);
  const [unit, setUnit] = useState<Unit>('kg');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [heightInput, setHeightInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Scroll the form up so the focused field clears the keyboard (Android has no
  // iOS-style automatic inset adjustment).
  const handleFieldFocus = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const weightKg = weightInput !== '' ? toKg(Number(weightInput), unit) : null;
  const heightCm =
    heightInput !== '' ? (heightUnit === 'cm' ? Number(heightInput) : Number(heightInput) * CM_PER_IN) : null;
  const bmi = heightCm && weightKg ? computeBmi(heightCm, weightKg) : null;

  // Keep the displayed value the same magnitude when the unit toggles.
  const onHeightUnitChange = (next: HeightUnit) => {
    const cur = Number(heightInput);
    if (heightInput !== '' && Number.isFinite(cur)) {
      const cm = heightUnit === 'cm' ? cur : cur * CM_PER_IN;
      setHeightInput(String(round1(next === 'cm' ? cm : cm / CM_PER_IN)));
    }
    setHeightUnit(next);
  };
  const onWeightUnitChange = (next: Unit) => {
    const cur = Number(weightInput);
    if (weightInput !== '' && Number.isFinite(cur)) {
      setWeightInput(String(round1(fromKg(toKg(cur, unit), next))));
    }
    setUnit(next);
  };

  const next = () => {
    if (step === 1) {
      if (!heightCm || heightCm <= 0) {
        showAlert('Add your height', 'Enter your height to continue.');
        return;
      }
      if (!weightKg || weightKg <= 0) {
        showAlert('Add your weight', 'Enter your weight to continue.');
        return;
      }
    }
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = async () => {
    if (!session) return;
    const g = {
      calories: Number(goals.calories) || 2000,
      protein_g: Number(goals.protein_g) || 150,
      carbs_g: Number(goals.carbs_g) || 200,
      fat_g: Number(goals.fat_g) || 65,
    };
    setSaving(true);
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      setSaving(false);
      showAlert('Could not save', (e as Error).message);
      return;
    }
    const [pErr, gErr] = await Promise.all([
      supabase.from('profiles').upsert({
        user_id: userId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        dob: dob || null,
        age: ageFromDob(dob),
        sex,
        height_cm: heightCm,
        weight_kg: weightKg,
        unit_pref: unit,
        updated_at: new Date().toISOString(),
      }),
      supabase.from('nutrition_goals').upsert({ user_id: userId, ...g }),
    ]).then((res) => [res[0].error, res[1].error]);
    setSaving(false);
    if (pErr || gErr) {
      showAlert('Could not save', (pErr ?? gErr)?.message ?? 'Please try again.');
      return;
    }
    // The save succeeded under a verified user id, so advance immediately rather
    // than waiting on a re-read that a stale token could get wrong.
    markOnboarded();
    refreshOnboarding();
    router.replace('/(tabs)/nutrition');
  };

  const meta = STEP_META[step];
  // A filled field gets a primary-tinted border so it's obvious at a glance that
  // it already has a value (the greyed placeholder was easy to mistake for input).
  const filledBorder = (v: string) => ({
    borderColor: v ? theme.primary : theme.border,
    borderWidth: v ? 1.5 : StyleSheet.hairlineWidth,
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        showsVerticalScrollIndicator={false}>
        {/* Gradient hero */}
        <LinearGradient
          colors={['#2EA0FF', '#1257B0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <SafeAreaView edges={['top']}>
            <View style={styles.heroTop}>
              <ThemedText style={styles.stepCount}>
                Step {step + 1} of {TOTAL_STEPS}
              </ThemedText>
              <Pressable onPress={signOut} hitSlop={10}>
                <ThemedText style={styles.signOut}>Sign out</ThemedText>
              </Pressable>
            </View>
            <View style={styles.heroInner}>
              <View style={styles.badge}>
                <ThemedText style={{ fontSize: 30 }}>{meta.emoji}</ThemedText>
              </View>
              <ThemedText style={styles.heroTitle}>{meta.title}</ThemedText>
              <ThemedText style={styles.heroSub}>{meta.subtitle}</ThemedText>
            </View>
            {/* Segmented progress bar */}
            <View style={styles.progress}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressSeg,
                    { backgroundColor: i <= step ? '#fff' : 'rgba(255,255,255,0.3)' },
                  ]}
                />
              ))}
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={styles.body}>
          {step === 0 ? (
            <View style={{ gap: Spacing.three }}>
              <ThemedText type="subtitle">You’re all set to start 🎉</ThemedText>
              <ThemedText themeColor="textSecondary">
                A quick minute to personalise things — you can change any of it later.
              </ThemedText>
              <Card style={{ gap: Spacing.three }}>
                {WELCOME_POINTS.map((p) => (
                  <View key={p.text} style={styles.point}>
                    <View style={[styles.pointIcon, { backgroundColor: theme.backgroundElement }]}>
                      <ThemedText style={{ fontSize: 18 }}>{p.emoji}</ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={{ flex: 1 }}>
                      {p.text}
                    </ThemedText>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {step === 1 ? (
            <Card style={{ gap: Spacing.three }}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                YOUR DETAILS
              </ThemedText>
              <View style={styles.nameRow}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="First name"
                    value={firstName}
                    onChangeText={setFirstName}
                    onFocus={handleFieldFocus}
                    autoCapitalize="words"
                    placeholder="Alex"
                    style={filledBorder(firstName)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Last name"
                    value={lastName}
                    onChangeText={setLastName}
                    onFocus={handleFieldFocus}
                    autoCapitalize="words"
                    placeholder="Carter"
                    style={filledBorder(lastName)}
                  />
                </View>
              </View>

              <DobPicker value={dob} onChange={setDob} />
              {ageFromDob(dob) != null ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Age: {ageFromDob(dob)}
                </ThemedText>
              ) : null}

              <GenderSelect value={sex} onChange={setSex} />

              <MeasureField
                label="Height"
                value={heightInput}
                onChangeText={(t) => setHeightInput(sanitizeDecimal(t))}
                onFocus={handleFieldFocus}
                placeholder={heightUnit === 'cm' ? '175' : '69'}
                unit={heightUnit}
                unitOptions={[
                  { label: 'cm', value: 'cm' },
                  { label: 'in', value: 'in' },
                ]}
                onUnitChange={onHeightUnitChange}
                filledStyle={filledBorder(heightInput)}
              />

              <MeasureField
                label="Weight"
                value={weightInput}
                onChangeText={(t) => setWeightInput(sanitizeDecimal(t))}
                onFocus={handleFieldFocus}
                placeholder={unit === 'kg' ? '70' : '154'}
                unit={unit}
                unitOptions={[
                  { label: 'kg', value: 'kg' },
                  { label: 'lbs', value: 'lbs' },
                ]}
                onUnitChange={onWeightUnitChange}
                filledStyle={filledBorder(weightInput)}
              />

              {bmi ? (
                <View style={[styles.bmiPill, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="smallBold">BMI {bmi.toFixed(1)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {bmiCategory(bmi)}
                  </ThemedText>
                </View>
              ) : null}
            </Card>
          ) : null}

          {step === 2 ? (
            <View style={{ gap: Spacing.three }}>
              <ThemedText type="small" themeColor="textSecondary">
                Not sure? Tap “Use recommended” for sensible starting targets.
              </ThemedText>
              <Card style={{ gap: Spacing.three }}>
                <Field
                  label="Calories (kcal)"
                  keyboardType="numeric"
                  value={goals.calories}
                  onChangeText={(t) => setGoals((g) => ({ ...g, calories: t }))}
                  onFocus={handleFieldFocus}
                />
                <Field
                  label="Protein (g)"
                  keyboardType="numeric"
                  value={goals.protein_g}
                  onChangeText={(t) => setGoals((g) => ({ ...g, protein_g: t }))}
                  onFocus={handleFieldFocus}
                />
                <Field
                  label="Carbs (g)"
                  keyboardType="numeric"
                  value={goals.carbs_g}
                  onChangeText={(t) => setGoals((g) => ({ ...g, carbs_g: t }))}
                  onFocus={handleFieldFocus}
                />
                <Field
                  label="Fat (g)"
                  keyboardType="numeric"
                  value={goals.fat_g}
                  onChangeText={(t) => setGoals((g) => ({ ...g, fat_g: t }))}
                  onFocus={handleFieldFocus}
                />
                <Button
                  title="Use recommended"
                  variant="secondary"
                  onPress={() => setGoals(DEFAULT_GOALS)}
                />
              </Card>
            </View>
          ) : null}

          <View style={styles.nav}>
            {step > 0 ? (
              <Button title="Back" variant="secondary" onPress={back} style={{ flex: 1 }} />
            ) : null}
            {step < TOTAL_STEPS - 1 ? (
              <Button title="Continue" onPress={next} style={{ flex: 1 }} />
            ) : (
              <Button title="Finish setup" onPress={finish} loading={saving} style={{ flex: 1 }} />
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Label + numeric input with a trailing unit dropdown (e.g. cm / in, kg / lbs). */
function MeasureField<T extends string>({
  label,
  value,
  onChangeText,
  onFocus,
  placeholder,
  unit,
  unitOptions,
  onUnitChange,
  filledStyle,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  onFocus: () => void;
  placeholder: string;
  unit: T;
  unitOptions: { label: string; value: T }[];
  onUnitChange: (v: T) => void;
  filledStyle: { borderColor: string; borderWidth: number };
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.measureRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          inputMode="decimal"
          style={[
            styles.measureInput,
            { color: theme.text, backgroundColor: theme.background },
            filledStyle,
          ]}
        />
        <UnitDropdown value={unit} options={unitOptions} onChange={onUnitChange} />
      </View>
    </View>
  );
}

/** Compact dropdown for picking a unit; opens a small centered menu. */
function UnitDropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.unitButton, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <ThemedText type="smallBold">{current?.label ?? value}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          ▾
        </ThemedText>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.unitOverlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.unitMenu, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {}}>
            {options.map((o) => {
              const sel = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={[styles.unitItem, sel && { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText themeColor={sel ? 'primary' : 'text'} style={{ fontWeight: sel ? '700' : '400' }}>
                    {o.label}
                  </ThemedText>
                  {sel ? (
                    <ThemedText type="smallBold" themeColor="primary">
                      ✓
                    </ThemedText>
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: Spacing.six },
  hero: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: Spacing.four,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  stepCount: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  signOut: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  heroInner: { alignItems: 'center', paddingTop: Spacing.three, paddingHorizontal: Spacing.four, gap: Spacing.half },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center' },
  progress: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  progressSeg: { flex: 1, height: 5, borderRadius: 3 },
  body: { padding: Spacing.four, gap: Spacing.four },
  nameRow: { flexDirection: 'row', gap: Spacing.two },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pointIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  measureRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
  measureInput: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 48,
  },
  unitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
    minWidth: 76,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  unitOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  unitMenu: {
    width: '100%',
    maxWidth: 220,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.one,
    gap: 2,
  },
  unitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  bmiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  nav: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
});
