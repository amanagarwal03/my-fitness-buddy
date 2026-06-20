import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, SegmentedControl } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { bmiCategory, computeBmi } from '@/lib/bmi';
import { requireUserId, supabase } from '@/lib/supabase';
import type { Unit } from '@/lib/types';
import { toKg } from '@/lib/units';

const DEFAULT_GOALS = { calories: '2000', protein_g: '150', carbs_g: '200', fat_g: '65' };
const TOTAL_STEPS = 3;

const STEP_META = [
  { emoji: '👋', title: 'Welcome', subtitle: 'Let’s set up your fitness buddy' },
  { emoji: '📏', title: 'About you', subtitle: 'Height & weight for your BMI' },
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
  const { session, refreshOnboarding, signOut } = useAuth();

  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState<Unit>('kg');
  const [heightCm, setHeightCm] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [saving, setSaving] = useState(false);

  const weightKg = weightInput !== '' ? toKg(Number(weightInput), unit) : null;
  const heightNum = heightCm !== '' ? Number(heightCm) : null;
  const bmi = heightNum && weightKg ? computeBmi(heightNum, weightKg) : null;

  const next = () => {
    if (step === 1) {
      if (!heightNum || heightNum <= 0) {
        Alert.alert('Add your height', 'Enter your height in centimetres to continue.');
        return;
      }
      if (!weightKg || weightKg <= 0) {
        Alert.alert('Add your weight', 'Enter your weight to continue.');
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
      Alert.alert('Could not save', (e as Error).message);
      return;
    }
    const [pErr, gErr] = await Promise.all([
      supabase.from('profiles').upsert({
        user_id: userId,
        height_cm: heightNum,
        weight_kg: weightKg,
        unit_pref: unit,
        updated_at: new Date().toISOString(),
      }),
      supabase.from('nutrition_goals').upsert({ user_id: userId, ...g }),
    ]).then((res) => [res[0].error, res[1].error]);
    setSaving(false);
    if (pErr || gErr) {
      Alert.alert('Could not save', (pErr ?? gErr)?.message ?? 'Please try again.');
      return;
    }
    await refreshOnboarding();
    router.replace('/(tabs)/nutrition');
  };

  const meta = STEP_META[step];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
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
                PREFERRED WEIGHT UNIT
              </ThemedText>
              <SegmentedControl<Unit>
                value={unit}
                onChange={setUnit}
                options={[
                  { label: 'kg', value: 'kg' },
                  { label: 'lbs', value: 'lbs' },
                ]}
              />
              <Field
                label="Height (cm)"
                keyboardType="numeric"
                value={heightCm}
                onChangeText={setHeightCm}
                placeholder="175"
              />
              <Field
                label={`Weight (${unit})`}
                keyboardType="numeric"
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder={unit === 'kg' ? '70' : '154'}
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
                />
                <Field
                  label="Protein (g)"
                  keyboardType="numeric"
                  value={goals.protein_g}
                  onChangeText={(t) => setGoals((g) => ({ ...g, protein_g: t }))}
                />
                <Field
                  label="Carbs (g)"
                  keyboardType="numeric"
                  value={goals.carbs_g}
                  onChangeText={(t) => setGoals((g) => ({ ...g, carbs_g: t }))}
                />
                <Field
                  label="Fat (g)"
                  keyboardType="numeric"
                  value={goals.fat_g}
                  onChangeText={(t) => setGoals((g) => ({ ...g, fat_g: t }))}
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
    </View>
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
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pointIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
