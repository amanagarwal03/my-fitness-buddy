import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { isoDate } from '@/lib/date';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { uploadMealPhoto } from '@/lib/storage';
import { requireUserId, supabase } from '@/lib/supabase';
import type { MealAnalysis, MealItem } from '@/lib/types';

// Editable item: macros held as strings while the user types.
type EditItem = {
  key: string;
  name: string;
  quantity: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

const n = (s: string) => {
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

let keyCounter = 0;
const newKey = () => `item-${keyCounter++}`;

export default function ResultScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ analysis?: string; imageUri?: string; mealType?: string }>();
  const [saving, setSaving] = useState(false);

  const analysis = useMemo<MealAnalysis | null>(() => {
    if (!params.analysis) return null;
    try {
      return JSON.parse(params.analysis) as MealAnalysis;
    } catch {
      return null;
    }
  }, [params.analysis]);

  // Seed editable items from the analysis. If the function returned an itemized
  // breakdown, use it; otherwise fall back to a single item for the whole meal.
  const [items, setItems] = useState<EditItem[]>(() => {
    if (!analysis) return [];
    const fromLLM = analysis.items?.length
      ? analysis.items
      : [
          {
            name: analysis.name || 'Meal',
            quantity: '1 serving',
            calories: analysis.calories,
            protein_g: analysis.protein_g,
            carbs_g: analysis.carbs_g,
            fat_g: analysis.fat_g,
          } as MealItem,
        ];
    return fromLLM.map((it) => ({
      key: newKey(),
      name: it.name,
      quantity: it.quantity ?? '',
      calories: String(Math.round(it.calories)),
      protein_g: String(Math.round(it.protein_g)),
      carbs_g: String(Math.round(it.carbs_g)),
      fat_g: String(Math.round(it.fat_g)),
    }));
  });

  if (!analysis) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <ThemedText>Could not read the analysis. Please try again.</ThemedText>
        </View>
      </Screen>
    );
  }

  const totals = items.reduce(
    (acc, it) => ({
      calories: acc.calories + n(it.calories),
      protein_g: acc.protein_g + n(it.protein_g),
      carbs_g: acc.carbs_g + n(it.carbs_g),
      fat_g: acc.fat_g + n(it.fat_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const update = (key: string, field: keyof EditItem, value: string) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));

  const remove = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { key: newKey(), name: '', quantity: '', calories: '0', protein_g: '0', carbs_g: '0', fat_g: '0' },
    ]);

  const confidenceColor =
    analysis.confidence === 'high'
      ? theme.success
      : analysis.confidence === 'medium'
        ? theme.warning
        : theme.danger;

  const save = async () => {
    if (!session) return;
    if (items.length === 0) {
      Alert.alert('No items', 'Add at least one food item before saving.');
      return;
    }
    const mealItems: MealItem[] = items.map((it) => ({
      name: it.name.trim() || 'Item',
      quantity: it.quantity.trim(),
      calories: n(it.calories),
      protein_g: n(it.protein_g),
      carbs_g: n(it.carbs_g),
      fat_g: n(it.fat_g),
    }));
    setSaving(true);
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error).message);
      return;
    }
    const { data: inserted, error } = await supabase
      .from('meals')
      .insert({
        user_id: userId,
        eaten_at: new Date().toISOString(),
        name: analysis.name,
        calories: totals.calories,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        micros: analysis.micros,
        // Persist the (possibly edited) items + meal type alongside the raw analysis.
        raw_response: { ...analysis, items: mealItems, edited: true, meal_type: params.mealType ?? null },
      })
      .select('id')
      .single();
    if (error) {
      setSaving(false);
      Alert.alert('Could not save', error.message);
      return;
    }
    // Upload the meal photo (best-effort — the meal is already saved either way).
    if (params.imageUri && inserted?.id) {
      try {
        const ref = await ImageManipulator.manipulate(params.imageUri).renderAsync();
        const out = await ref.saveAsync({ base64: true, compress: 0.6, format: SaveFormat.JPEG });
        if (out.base64) {
          const path = await uploadMealPhoto(userId, inserted.id, isoDate(), out.base64);
          await supabase.from('meals').update({ image_url: path }).eq('id', inserted.id);
        }
      } catch {
        // Ignore photo failures; the nutrition data is what matters most.
      }
    }
    setSaving(false);
    router.back();
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {params.imageUri ? (
          <Image source={{ uri: params.imageUri }} style={styles.image} contentFit="cover" />
        ) : null}

        <ThemedText type="subtitle">{analysis.name}</ThemedText>

        <View style={[styles.confidence, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.dot, { backgroundColor: confidenceColor }]} />
          <ThemedText type="small" themeColor="textSecondary">
            {analysis.confidence} confidence — review &amp; correct below
          </ThemedText>
        </View>

        {/* Live totals */}
        <Card>
          <MacroLine label="Calories" value={`${Math.round(totals.calories)} kcal`} color={theme.calories} />
          <MacroLine label="Protein" value={`${Math.round(totals.protein_g)} g`} color={theme.protein} />
          <MacroLine label="Carbs" value={`${Math.round(totals.carbs_g)} g`} color={theme.carbs} />
          <MacroLine label="Fat" value={`${Math.round(totals.fat_g)} g`} color={theme.fat} />
        </Card>

        {/* Editable items */}
        <View style={styles.itemsHeader}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ITEMS ({items.length})
          </ThemedText>
          <Pressable onPress={addItem} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="primary">
              + Add item
            </ThemedText>
          </Pressable>
        </View>

        {items.map((it) => (
          <Card key={it.key}>
            <View style={styles.itemTopRow}>
              <TextInput
                value={it.name}
                onChangeText={(t) => update(it.key, 'name', t)}
                placeholder="Food name"
                placeholderTextColor={theme.textSecondary}
                style={[styles.nameInput, { color: theme.text, borderColor: theme.border }]}
              />
              <Pressable onPress={() => remove(it.key)} hitSlop={8} style={styles.removeBtn}>
                <ThemedText type="smallBold" themeColor="danger">
                  ✕
                </ThemedText>
              </Pressable>
            </View>

            <MiniField
              label="Quantity"
              value={it.quantity}
              onChangeText={(t) => update(it.key, 'quantity', t)}
              placeholder="e.g. 1 cup"
              keyboardType="default"
              wide
            />

            <View style={styles.macroInputs}>
              <MiniField label="Cal" value={it.calories} onChangeText={(t) => update(it.key, 'calories', t)} />
              <MiniField label="P (g)" value={it.protein_g} onChangeText={(t) => update(it.key, 'protein_g', t)} />
              <MiniField label="C (g)" value={it.carbs_g} onChangeText={(t) => update(it.key, 'carbs_g', t)} />
              <MiniField label="F (g)" value={it.fat_g} onChangeText={(t) => update(it.key, 'fat_g', t)} />
            </View>
          </Card>
        ))}

        {analysis.micros?.length ? (
          <Card>
            <ThemedText type="smallBold">Micronutrients (estimated)</ThemedText>
            {analysis.micros.map((micro, i) => (
              <View key={`${micro.name}-${i}`} style={styles.microRow}>
                <ThemedText type="small">{micro.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {micro.amount} {micro.unit}
                </ThemedText>
              </View>
            ))}
          </Card>
        ) : null}

        {analysis.assumptions?.length ? (
          <Card>
            <ThemedText type="smallBold">Assumptions</ThemedText>
            {analysis.assumptions.map((a, i) => (
              <ThemedText key={i} type="small" themeColor="textSecondary">
                • {a}
              </ThemedText>
            ))}
          </Card>
        ) : null}

        <Button title="Save to today's log" onPress={save} loading={saving} />
        <Button title="Discard" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

function MiniField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'numeric',
  wide = false,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'numeric' | 'default';
  wide?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.miniField, !wide && { flex: 1 }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        style={[styles.miniInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
      />
    </View>
  );
}

function MacroLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.macroLine}>
      <View style={styles.macroLabel}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <ThemedText>{label}</ThemedText>
      </View>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  image: { width: '100%', height: 220, borderRadius: Spacing.three },
  confidence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  macroLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  macroLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  microRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
  },
  removeBtn: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  macroInputs: { flexDirection: 'row', gap: Spacing.two },
  miniField: { gap: 2 },
  miniInput: {
    borderRadius: Spacing.one + 2,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
    minHeight: 40,
  },
});
