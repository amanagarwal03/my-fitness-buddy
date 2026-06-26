import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bmiCategory, computeBmi } from '@/lib/bmi';
import {
  bmr as calcBmr,
  bodyFatPct,
  healthyBfRange,
  idealWeight,
  metabolicAge,
  muscleMassPct,
  subcutaneousFatPct,
  type Sex,
} from '@/lib/bodyStats';
import { ageFromDob } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import type { Profile, Unit } from '@/lib/types';
import { fromKg, round1 } from '@/lib/units';

const HERO_GRADIENT = ['#2EA0FF', '#1257B0'] as const;

const MEASURES = [
  { key: 'neck_cm', label: 'Neck', emoji: '🧣' },
  { key: 'chest_cm', label: 'Chest', emoji: '🫁' },
  { key: 'biceps_cm', label: 'Biceps', emoji: '💪' },
  { key: 'waist_cm', label: 'Waist', emoji: '📏' },
  { key: 'hips_cm', label: 'Hips', emoji: '🍑' },
  { key: 'thighs_cm', label: 'Thighs', emoji: '🦵' },
] as const;

export default function SharedBodyScreen() {
  const theme = useTheme();
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', ownerId).maybeSingle();
      if (!active) return;
      setProfile((data as Profile) ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [ownerId]);

  if (loading) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: 'Body composition' }} />
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </Screen>
    );
  }

  if (!profile || !profile.share_body) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: 'Body composition' }} />
        <View style={styles.center}>
          <ThemedText themeColor="textSecondary">This person isn’t sharing their body composition.</ThemedText>
        </View>
      </Screen>
    );
  }

  const sex = (profile.sex as Sex) ?? 'other';
  const age = ageFromDob(profile.dob) ?? profile.age ?? null;
  const heightCm = profile.height_cm ?? null;
  const weightKg = profile.weight_kg ?? null;
  const unit: Unit = profile.unit_pref ?? 'kg';
  const measureUnit = unit === 'lbs' ? 'in' : 'cm';

  const measures = {
    neck: profile.neck_cm ?? null,
    waist: profile.waist_cm ?? null,
    hips: profile.hips_cm ?? null,
  };
  const bmi = heightCm && weightKg ? computeBmi(heightCm, weightKg) : null;
  const bmrVal = weightKg && heightCm && age ? calcBmr(sex, weightKg, heightCm, age) : null;
  const bf = bodyFatPct(sex, heightCm ?? 0, age ?? 0, bmi, measures);
  const muscle = bf != null ? muscleMassPct(bf) : null;
  const subcut = bf != null ? subcutaneousFatPct(bf) : null;
  const metAge = metabolicAge(age ?? 0, sex, bf);
  const ideal = idealWeight(heightCm ?? 0);
  const bfRange = healthyBfRange(sex);
  const toW = (kg: number) => `${round1(fromKg(kg, unit))} ${unit}`;
  const dispLen = (cm: number) => (measureUnit === 'in' ? `${round1(cm / 2.54)} in` : `${round1(cm)} cm`);

  const hasAnyMeasure = MEASURES.some((mm) => profile[mm.key] != null);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Body composition' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {ideal ? (
          <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.idealHero}>
            <ThemedText style={styles.idealLabel}>🎯  Ideal weight target</ThemedText>
            <ThemedText style={styles.idealValue}>{toW(ideal.target)}</ThemedText>
            <ThemedText style={styles.idealRange}>
              Healthy range {toW(ideal.min)} – {toW(ideal.max)}
            </ThemedText>
          </LinearGradient>
        ) : null}

        <ThemedText type="smallBold" themeColor="textSecondary">
          METRICS
        </ThemedText>
        <View style={styles.metricGrid}>
          <Metric emoji="⚖️" label="BMI" value={bmi != null ? bmi.toFixed(1) : '—'} sub={bmi != null ? bmiCategory(bmi) : '—'} accent={theme.primary} />
          <Metric emoji="🔥" label="Body fat" value={bf != null ? `${bf}%` : '—'} sub={bf != null ? `Healthy ${bfRange.min}–${bfRange.max}%` : '—'} accent="#F59E0B" />
          <Metric emoji="💪" label="Muscle mass" value={muscle != null ? `${muscle}%` : '—'} sub="Estimated" accent={theme.success} />
          <Metric emoji="🧈" label="Subcutaneous" value={subcut != null ? `${subcut}%` : '—'} sub="Body fat est." accent="#8B5CF6" />
          <Metric emoji="🔋" label="BMR" value={bmrVal != null ? `${bmrVal}` : '—'} sub="kcal/day at rest" accent="#0EA5E9" />
          <Metric emoji="⏳" label="Metabolic age" value={metAge != null ? `${metAge}` : '—'} sub={age != null ? `Actual ${age} yrs` : 'Estimated'} accent="#EC4899" />
        </View>

        <ThemedText type="smallBold" themeColor="textSecondary">
          MEASUREMENTS
        </ThemedText>
        <Card>
          {hasAnyMeasure ? (
            MEASURES.map((mm, i) => {
              const v = profile[mm.key] as number | null;
              return (
                <View key={mm.key} style={[styles.measureRow, i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <ThemedText style={{ flex: 1 }}>
                    {mm.emoji}  {mm.label}
                  </ThemedText>
                  <ThemedText type="smallBold">{v != null ? dispLen(v) : '—'}</ThemedText>
                </View>
              );
            })
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No measurements entered yet.
            </ThemedText>
          )}
        </Card>

        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Estimates for guidance, not medical measurements.
        </ThemedText>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  idealHero: { borderRadius: Spacing.four, padding: Spacing.four, gap: Spacing.one },
  idealLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '700' },
  idealValue: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: Spacing.one },
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
  metricIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  measureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two },
});
