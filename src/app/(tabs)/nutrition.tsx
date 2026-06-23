import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Image } from 'expo-image';

import { CollapsibleCalendar } from '@/components/calendar';
import { MenuButton } from '@/components/side-nav';
import { ThemedText } from '@/components/themed-text';
import { Card, ProgressBar, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { showAlert } from '@/lib/dialog';
import { analyzeMeal } from '@/lib/analyzeMeal';
import { isoDate } from '@/lib/date';
import { captureFromCamera, pickFromLibrary } from '@/lib/image';
import { setPendingMealImage } from '@/lib/pendingMeal';
import { PREVIEW_MODE, previewGoals, previewMeals } from '@/lib/preview';
import { pruneOldPhotos, signedPhotoUrls } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { Meal, NutritionGoals } from '@/lib/types';

const DEFAULT_GOALS = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_TYPES: { key: MealType; label: string; emoji: string }[] = [
  { key: 'breakfast', label: 'Breakfast', emoji: '☕️' },
  { key: 'lunch', label: 'Lunch', emoji: '🍔' },
  { key: 'dinner', label: 'Dinner', emoji: '🍽️' },
  { key: 'snack', label: 'Snack', emoji: '🍎' },
];

const mealTypeOf = (m: Meal): MealType | 'other' => {
  const t = (m.raw_response as { meal_type?: string } | null)?.meal_type;
  return t === 'breakfast' || t === 'lunch' || t === 'dinner' || t === 'snack' ? t : 'other';
};

function dayLabel(d: Date): string {
  const today = isoDate();
  const target = isoDate(d);
  if (target === today) return 'Today';
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (target === isoDate(yest)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function NutritionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [meals, setMeals] = useState<Meal[]>([]);
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [markedDays, setMarkedDays] = useState<Set<string>>(new Set());
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<MealType | null>(null);

  const isToday = isoDate(selectedDate) === isoDate();

  const load = useCallback(async () => {
    if (PREVIEW_MODE) {
      setMeals(previewMeals);
      setGoals(previewGoals);
      setLoading(false);
      return;
    }
    if (!uid) return;
    setLoading(true);
    // Use the selected day's LOCAL midnight bounds (converted to UTC) so meals
    // logged in the evening don't fall outside the window.
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    // Always scope to the signed-in user. The coach-sharing RLS policy lets a
    // viewer SELECT a shared owner's rows too, so an unscoped query would mix
    // another account's meals into this user's diary.
    const [mealsRes, goalsRes] = await Promise.all([
      supabase
        .from('meals')
        .select('*')
        .eq('user_id', uid)
        .gte('eaten_at', dayStart.toISOString())
        .lte('eaten_at', dayEnd.toISOString())
        .order('eaten_at', { ascending: false }),
      supabase.from('nutrition_goals').select('*').eq('user_id', uid).maybeSingle(),
    ]);
    if (!mealsRes.error && mealsRes.data) {
      const list = mealsRes.data as Meal[];
      setMeals(list);
      const paths = list.map((m) => m.image_url).filter((p): p is string => !!p);
      setPhotoUrls(paths.length ? await signedPhotoUrls(paths) : {});
    }
    if (!goalsRes.error) setGoals((goalsRes.data as NutritionGoals) ?? null);
    setLoading(false);
  }, [selectedDate, uid]);

  const loadMarks = useCallback(async () => {
    if (PREVIEW_MODE) {
      setMarkedDays(new Set(previewMeals.map((m) => isoDate(new Date(m.eaten_at)))));
      return;
    }
    if (!uid) return;
    const since = new Date();
    since.setDate(since.getDate() - 120);
    const { data } = await supabase
      .from('meals')
      .select('eaten_at')
      .eq('user_id', uid)
      .gte('eaten_at', since.toISOString());
    if (data) setMarkedDays(new Set(data.map((r: { eaten_at: string }) => isoDate(new Date(r.eaten_at)))));
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadMarks();
      if (!PREVIEW_MODE) pruneOldPhotos(); // remove photos past the retention window
    }, [load, loadMarks]),
  );

  const totals = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      protein_g: acc.protein_g + (m.protein_g ?? 0),
      carbs_g: acc.carbs_g + (m.carbs_g ?? 0),
      fat_g: acc.fat_g + (m.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const target = goals ?? { ...DEFAULT_GOALS };
  const calLeft = Math.max(0, Math.round(target.calories - totals.calories));

  const runAnalysis = async (source: 'camera' | 'library', mealType: MealType) => {
    if (PREVIEW_MODE) {
      showAlert('Preview mode', 'Connect Supabase to enable meal scanning. The UI flow is ready.');
      return;
    }
    try {
      const img = source === 'camera' ? await captureFromCamera() : await pickFromLibrary();
      if (!img) return;
      setBusy('Analyzing your meal…');
      const analysis = await analyzeMeal(img.base64, 'image/jpeg');
      setBusy(null);
      // Hand the photo off via a module holder (not a route param) — on web the
      // URI is a large data: URL that would break navigation if put in the URL.
      setPendingMealImage(img);
      router.push({
        pathname: '/result',
        params: { analysis: JSON.stringify(analysis), mealType },
      });
    } catch (e) {
      setBusy(null);
      showAlert('Could not analyze', e instanceof Error ? e.message : String(e));
    }
  };

  const onLog = (mealType: MealType) => setLogFor(mealType);

  const deleteMeal = (id: string) => {
    if (PREVIEW_MODE) {
      setMeals((prev) => prev.filter((m) => m.id !== id));
      return;
    }
    showAlert('Delete meal?', 'This removes it from the log.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          let q = supabase.from('meals').delete().eq('id', id);
          if (uid) q = q.eq('user_id', uid);
          await q;
          load();
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <MenuButton />
            <ThemedText type="title" style={{ fontSize: 28 }}>
              {dayLabel(selectedDate)}
            </ThemedText>
          </View>
          <Pressable onPress={() => router.push('/goals')} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="primary">
              Edit goals
            </ThemedText>
          </Pressable>
        </View>

        <CollapsibleCalendar
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          markedDays={markedDays}
        />

        {/* Calories */}
        <Card>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Calories
          </ThemedText>
          <View style={styles.calRow}>
            <View style={styles.calLeftWrap}>
              <ThemedText type="title" style={{ fontSize: 34 }}>
                {Math.round(totals.calories)}
              </ThemedText>
              <ThemedText themeColor="textSecondary"> / {Math.round(target.calories)}</ThemedText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText type="subtitle">{calLeft}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                left
              </ThemedText>
            </View>
          </View>
          <ProgressBar value={totals.calories} max={target.calories} color={theme.calories} />
        </Card>

        {/* Macros */}
        <Card>
          <View style={styles.macroGrid}>
            <MacroCol label="Carbs" value={totals.carbs_g} goal={target.carbs_g} color={theme.carbs} />
            <MacroCol label="Fat" value={totals.fat_g} goal={target.fat_g} color={theme.fat} />
            <MacroCol label="Protein" value={totals.protein_g} goal={target.protein_g} color={theme.protein} />
          </View>
          {!goals ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              Showing default goals — tap “Edit goals” to set your own.
            </ThemedText>
          ) : null}
        </Card>

        {/* Diary */}
        <ThemedText type="subtitle" style={{ marginTop: Spacing.one }}>
          Diary
        </ThemedText>

        {MEAL_TYPES.map((mt) => {
          const list = meals.filter((m) => mealTypeOf(m) === mt.key);
          const subtotal = list.reduce((a, m) => a + (m.calories ?? 0), 0);
          return (
            <Card key={mt.key}>
              <View style={styles.diaryHeader}>
                <ThemedText style={{ fontSize: 20 }}>{mt.emoji}</ThemedText>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">{mt.label}</ThemedText>
                  {subtotal > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {Math.round(subtotal)} kcal
                    </ThemedText>
                  ) : null}
                </View>
                {isToday ? (
                  <Pressable onPress={() => onLog(mt.key)} hitSlop={8} style={styles.logBtn}>
                    <ThemedText type="smallBold" themeColor="primary">
                      Log
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              {list.map((m) => (
                <MealRow
                  key={m.id}
                  meal={m}
                  photoUrl={m.image_url ? photoUrls[m.image_url] : undefined}
                  onViewPhoto={setPhotoModal}
                  onDelete={() => deleteMeal(m.id)}
                />
              ))}
            </Card>
          );
        })}

        {/* Meals logged before meal types existed (no type) */}
        {meals.some((m) => mealTypeOf(m) === 'other') ? (
          <Card>
            <ThemedText type="smallBold">Other</ThemedText>
            {meals
              .filter((m) => mealTypeOf(m) === 'other')
              .map((m) => (
                <MealRow
                  key={m.id}
                  meal={m}
                  photoUrl={m.image_url ? photoUrls[m.image_url] : undefined}
                  onViewPhoto={setPhotoModal}
                  onDelete={() => deleteMeal(m.id)}
                />
              ))}
          </Card>
        ) : null}
      </ScrollView>

      <Modal visible={!!busy} transparent animationType="fade">
        <View style={styles.overlay}>
          <Card style={{ alignItems: 'center', gap: Spacing.three }}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText>{busy}</ThemedText>
          </Card>
        </View>
      </Modal>

      <Modal visible={!!photoModal} transparent animationType="fade" onRequestClose={() => setPhotoModal(null)}>
        <Pressable style={styles.photoOverlay} onPress={() => setPhotoModal(null)}>
          {photoModal ? (
            <Image source={{ uri: photoModal }} style={styles.fullPhoto} contentFit="contain" />
          ) : null}
          <ThemedText type="small" style={{ color: '#fff', marginTop: Spacing.three }}>
            Tap anywhere to close
          </ThemedText>
        </Pressable>
      </Modal>

      {/* Meal-source action sheet — tap the backdrop (anywhere) to dismiss. */}
      <Modal visible={!!logFor} transparent animationType="fade" onRequestClose={() => setLogFor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setLogFor(null)}>
          {/* Stop taps on the sheet itself from dismissing. */}
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {}}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {MEAL_TYPES.find((m) => m.key === logFor)?.label ?? 'Add a meal'} · how do you want to add it?
            </ThemedText>
            <SheetOption
              emoji="📷"
              label="Take photo"
              onPress={() => {
                const t = logFor;
                setLogFor(null);
                if (t) runAnalysis('camera', t);
              }}
            />
            <SheetOption
              emoji="🖼️"
              label="Choose from gallery"
              onPress={() => {
                const t = logFor;
                setLogFor(null);
                if (t) runAnalysis('library', t);
              }}
            />
            <SheetOption
              emoji="🏷️"
              label="Scan barcode"
              onPress={() => {
                const t = logFor;
                setLogFor(null);
                if (t) router.push({ pathname: '/barcode', params: { mealType: t } });
              }}
            />
            <Pressable
              onPress={() => setLogFor(null)}
              style={[styles.sheetCancel, { borderColor: theme.border }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function SheetOption({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetOption,
        { backgroundColor: pressed ? theme.backgroundElement : theme.backgroundElement + '80' },
      ]}>
      <ThemedText style={{ fontSize: 20 }}>{emoji}</ThemedText>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

function MealRow({
  meal,
  photoUrl,
  onViewPhoto,
  onDelete,
}: {
  meal: Meal;
  photoUrl?: string;
  onViewPhoto: (url: string) => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.mealLine}>
      <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>
        {meal.name || 'Meal'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {Math.round(meal.calories)} kcal
      </ThemedText>
      {photoUrl ? (
        <Pressable onPress={() => onViewPhoto(photoUrl)} hitSlop={8} style={styles.delBtn}>
          <ThemedText style={{ fontSize: 16 }}>📷</ThemedText>
        </Pressable>
      ) : null}
      <Pressable onPress={onDelete} hitSlop={8} style={styles.delBtn}>
        <ThemedText type="smallBold" themeColor="danger">
          🗑
        </ThemedText>
      </Pressable>
    </View>
  );
}

function MacroCol({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}) {
  return (
    <View style={styles.macroCol}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">
        {Math.round(value)}
        <ThemedText type="small" themeColor="textSecondary">
          {' '}
          / {Math.round(goal)}g
        </ThemedText>
      </ThemedText>
      <ProgressBar value={value} max={goal} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  calRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  calLeftWrap: { flexDirection: 'row', alignItems: 'baseline' },
  macroGrid: { flexDirection: 'row', gap: Spacing.three },
  macroCol: { flex: 1, gap: Spacing.one },
  diaryHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  logBtn: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  mealLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.two,
  },
  delBtn: { paddingHorizontal: Spacing.one },
  thumb: { width: 36, height: 36, borderRadius: 8 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  photoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  fullPhoto: { width: '100%', height: '80%', borderRadius: Spacing.three },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: Spacing.three,
  },
  sheet: {
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  sheetCancel: {
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.one,
  },
});
