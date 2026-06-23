import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { showAlert } from '@/lib/dialog';
import { requireUserId, supabase } from '@/lib/supabase';
import type { NutritionGoals } from '@/lib/types';

const DEFAULTS = { calories: '2000', protein_g: '150', carbs_g: '200', fat_g: '65' };

export default function GoalsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('nutrition_goals')
      .select('*')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const g = data as NutritionGoals;
          setForm({
            calories: String(g.calories),
            protein_g: String(g.protein_g),
            carbs_g: String(g.carbs_g),
            fat_g: String(g.fat_g),
          });
        }
        setLoading(false);
      });
  }, []);

  const save = async () => {
    if (!session) return;
    const calories = Number(form.calories);
    const protein_g = Number(form.protein_g);
    const carbs_g = Number(form.carbs_g);
    const fat_g = Number(form.fat_g);
    if ([calories, protein_g, carbs_g, fat_g].some((n) => !Number.isFinite(n) || n < 0)) {
      showAlert('Invalid values', 'Please enter non-negative numbers for all goals.');
      return;
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
    const { error } = await supabase.from('nutrition_goals').upsert({
      user_id: userId,
      calories,
      protein_g,
      carbs_g,
      fat_g,
    });
    setSaving(false);
    if (error) {
      showAlert('Could not save', error.message);
      return;
    }
    router.back();
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText themeColor="textSecondary">
          Set your daily targets. The Today dashboard fills up as you log meals.
        </ThemedText>
        <Card>
          <Field
            label="Calories (kcal)"
            keyboardType="numeric"
            value={form.calories}
            onChangeText={(t) => setForm((f) => ({ ...f, calories: t }))}
            editable={!loading}
          />
          <Field
            label="Protein (g)"
            keyboardType="numeric"
            value={form.protein_g}
            onChangeText={(t) => setForm((f) => ({ ...f, protein_g: t }))}
            editable={!loading}
          />
          <Field
            label="Carbs (g)"
            keyboardType="numeric"
            value={form.carbs_g}
            onChangeText={(t) => setForm((f) => ({ ...f, carbs_g: t }))}
            editable={!loading}
          />
          <Field
            label="Fat (g)"
            keyboardType="numeric"
            value={form.fat_g}
            onChangeText={(t) => setForm((f) => ({ ...f, fat_g: t }))}
            editable={!loading}
          />
        </Card>
        <Button title="Save goals" onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
});
