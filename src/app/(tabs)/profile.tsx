import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { MenuButton } from '@/components/side-nav';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen, SegmentedControl } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { bmiCategory, computeBmi } from '@/lib/bmi';
import { sanitizeDecimal, sanitizeInt } from '@/lib/num';
import { PREVIEW_MODE, previewProfile } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';
import type { Profile, Unit } from '@/lib/types';
import { fromKg, round1, toKg } from '@/lib/units';

type Gender = 'male' | 'female' | 'other';

export default function ProfileScreen() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const [unit, setUnit] = useState<Unit>('kg');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Gender | null>(null);
  const [heightCm, setHeightCm] = useState('');
  const [weightInput, setWeightInput] = useState(''); // shown in current unit
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const data = PREVIEW_MODE
      ? previewProfile
      : ((await supabase.from('profiles').select('*').maybeSingle()).data as Profile | null);
    if (data) {
      const p = data as Profile;
      setUnit(p.unit_pref ?? 'kg');
      setFirstName(p.first_name ?? '');
      setLastName(p.last_name ?? '');
      setAge(p.age != null ? String(p.age) : '');
      setSex(p.sex ?? null);
      setHeightCm(p.height_cm ? String(p.height_cm) : '');
      setWeightInput(
        p.weight_kg != null ? String(round1(fromKg(p.weight_kg, p.unit_pref ?? 'kg'))) : '',
      );
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // When the unit toggle changes, convert the displayed weight so the value stays the same.
  const onUnitChange = (next: Unit) => {
    const current = Number(weightInput);
    if (Number.isFinite(current) && weightInput !== '') {
      const kg = toKg(current, unit);
      setWeightInput(String(round1(fromKg(kg, next))));
    }
    setUnit(next);
  };

  const weightKg = weightInput !== '' ? toKg(Number(weightInput), unit) : null;
  const heightNum = heightCm !== '' ? Number(heightCm) : null;
  const bmi = heightNum && weightKg ? computeBmi(heightNum, weightKg) : null;

  const save = async () => {
    if (PREVIEW_MODE) {
      Alert.alert('Preview mode', 'Connect Supabase to save your profile.');
      return;
    }
    if (!session) return;
    if (heightNum != null && (!Number.isFinite(heightNum) || heightNum <= 0)) {
      Alert.alert('Invalid height', 'Enter your height in centimetres.');
      return;
    }
    setSaving(true);
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error).message);
      return;
    }
    const { error } = await supabase.from('profiles').upsert({
      user_id: userId,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      age: age !== '' ? Number(age) : null,
      sex,
      height_cm: heightNum,
      weight_kg: weightKg,
      unit_pref: unit,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    Alert.alert('Saved', 'Your profile has been updated.');
  };

  const deleteAccount = () => {
    if (PREVIEW_MODE) {
      Alert.alert('Preview mode', 'Connect Supabase to manage your account.');
      return;
    }
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all your data — meals, photos, workouts, and sharing. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.rpc('delete_my_account');
            setDeleting(false);
            if (error) {
              Alert.alert('Could not delete', error.message);
              return;
            }
            await signOut();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <MenuButton />
          <ThemedText type="subtitle">Profile</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {session?.user.email}
        </ThemedText>

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
                editable={!loading}
                placeholder="Alex"
                autoCapitalize="words"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Last name"
                value={lastName}
                onChangeText={setLastName}
                editable={!loading}
                placeholder="Carter"
                autoCapitalize="words"
              />
            </View>
          </View>
          <Field
            label="Age"
            keyboardType="number-pad"
            inputMode="numeric"
            value={age}
            onChangeText={(t) => setAge(sanitizeInt(t))}
            editable={!loading}
            placeholder="28"
          />
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="small" themeColor="textSecondary">
              Gender
            </ThemedText>
            <SegmentedControl<Gender>
              value={(sex ?? '') as Gender}
              onChange={setSex}
              options={[
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
                { label: 'Other', value: 'other' },
              ]}
            />
          </View>
        </Card>

        <Card style={{ alignItems: 'center', gap: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">
            BODY MASS INDEX
          </ThemedText>
          <ThemedText type="title" themeColor={bmi ? 'text' : 'textSecondary'}>
            {bmi ? bmi.toFixed(1) : '—'}
          </ThemedText>
          {bmi ? (
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {bmiCategory(bmi)}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Enter height and weight to see your BMI.
            </ThemedText>
          )}
        </Card>

        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Preferred weight unit
          </ThemedText>
          <SegmentedControl<Unit>
            value={unit}
            onChange={onUnitChange}
            options={[
              { label: 'kg', value: 'kg' },
              { label: 'lbs', value: 'lbs' },
            ]}
          />
          <Field
            label="Height (cm)"
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={heightCm}
            onChangeText={(t) => setHeightCm(sanitizeDecimal(t))}
            editable={!loading}
            placeholder="175"
          />
          <Field
            label={`Weight (${unit})`}
            keyboardType="decimal-pad"
            inputMode="decimal"
            value={weightInput}
            onChangeText={(t) => setWeightInput(sanitizeDecimal(t))}
            editable={!loading}
            placeholder={unit === 'kg' ? '70' : '154'}
          />
        </Card>

        <Button title="Save profile" onPress={save} loading={saving} />
        <View style={{ height: Spacing.three }} />
        <Button title="Sign out" variant="secondary" onPress={signOut} />
        <Button title="Delete account" variant="danger" onPress={deleteAccount} loading={deleting} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nameRow: { flexDirection: 'row', gap: Spacing.two },
});
