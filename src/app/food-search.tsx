import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { StepperInput } from '@/components/stepper-input';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { showAlert } from '@/lib/dialog';
import { searchFoods, type FoodItem, type Serving } from '@/lib/foodSearch';
import { PREVIEW_MODE } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';

const round = (v: number) => Math.round(v);

export default function FoodSearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { mealType } = useLocalSearchParams<{ mealType?: string }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [recents, setRecents] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Recently logged foods, de-duped by name — a one-tap re-add list (MFP-style).
  useEffect(() => {
    if (PREVIEW_MODE || !uid) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('meals')
        .select('name, calories, protein_g, carbs_g, fat_g, raw_response, eaten_at')
        .eq('user_id', uid)
        .order('eaten_at', { ascending: false })
        .limit(60);
      if (!active || !data) return;
      const seen = new Set<string>();
      const items: FoodItem[] = [];
      for (const m of data as {
        name: string | null;
        calories: number | null;
        protein_g: number | null;
        carbs_g: number | null;
        fat_g: number | null;
        raw_response: unknown;
      }[]) {
        const name = (m.name ?? '').trim();
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        const raw = m.raw_response as { brand?: string; items?: { quantity?: string }[] } | null;
        items.push({
          code: '',
          name,
          brand: raw?.brand ?? '',
          servings: [
            {
              label: raw?.items?.[0]?.quantity || 'as logged',
              grams: null,
              calories: m.calories ?? 0,
              protein_g: m.protein_g ?? 0,
              carbs_g: m.carbs_g ?? 0,
              fat_g: m.fat_g ?? 0,
            },
          ],
        });
        if (items.length >= 15) break;
      }
      setRecents(items);
    })();
    return () => {
      active = false;
    };
  }, [uid]);

  // Debounced search; cancels the in-flight request when the query changes.
  useEffect(() => {
    const q = query.trim();
    abortRef.current?.abort();
    setOpenKey(null);
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setNote(null);
      return;
    }
    setLoading(true);
    setNote(null); // don't show a stale "no match"/error while the new query loads
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      try {
        const hits = await searchFoods(q, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setResults(hits);
        setNote(hits.length === 0 ? `No matches for “${q}”. Try fewer or different words, or scan the barcode.` : null);
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setNote('The food database is busy right now — please try again in a moment.');
        setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  // Insert a meal scaled to the chosen serving × quantity, then return to the diary.
  const logFood = async (item: FoodItem, serving: Serving, qty: number) => {
    if (PREVIEW_MODE) {
      showAlert('Preview mode', 'Connect Supabase to log foods.');
      return;
    }
    if (!(qty > 0)) return;
    setLogging(true);
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      setLogging(false);
      showAlert('Could not log', (e as Error).message);
      return;
    }
    const calories = round(serving.calories * qty);
    const protein_g = round(serving.protein_g * qty);
    const carbs_g = round(serving.carbs_g * qty);
    const fat_g = round(serving.fat_g * qty);
    const quantityLabel = `${qty % 1 === 0 ? qty : qty.toFixed(1)} × ${serving.label}`;
    const mealItem = { name: item.name, quantity: quantityLabel, calories, protein_g, carbs_g, fat_g };
    const { error } = await supabase.from('meals').insert({
      user_id: userId,
      eaten_at: new Date().toISOString(),
      name: item.brand && !item.name.toLowerCase().includes(item.brand.toLowerCase())
        ? `${item.name} (${item.brand})`
        : item.name,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      micros: [],
      raw_response: {
        name: item.name,
        brand: item.brand || null,
        items: [mealItem],
        meal_type: mealType ?? null,
        source: 'search',
        barcode: item.code || null,
      },
    });
    setLogging(false);
    if (error) {
      showAlert('Could not log', error.message);
      return;
    }
    router.back();
  };

  const searching = query.trim().length >= 2;

  return (
    <Screen>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <ThemedText themeColor="textSecondary">🔍</ThemedText>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search foods, brands, flavors…"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.text }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <ThemedText themeColor="textSecondary">✕</ThemedText>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText type="smallBold" themeColor="primary">
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      {/* Thin top progress strip while refreshing, so the list doesn't flash. */}
      {loading ? (
        <View style={styles.loadingStrip}>
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary">
            Searching…
          </ThemedText>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {searching ? (
          // Only show the big spinner on a fresh search with nothing to show yet.
          loading && results.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : note ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              {note}
            </ThemedText>
          ) : (
            results.map((item) => {
              const key = `${item.code}-${item.name}`;
              return (
                <FoodRow
                  key={key}
                  item={item}
                  open={openKey === key}
                  logging={logging}
                  onToggle={() => setOpenKey((k) => (k === key ? null : key))}
                  onQuickAdd={() => logFood(item, item.servings[0], 1)}
                  onLog={(serving, qty) => logFood(item, serving, qty)}
                />
              );
            })
          )
        ) : recents.length ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary">
              RECENT
            </ThemedText>
            {recents.map((item) => {
              const key = `recent-${item.name}`;
              return (
                <FoodRow
                  key={key}
                  item={item}
                  open={openKey === key}
                  logging={logging}
                  onToggle={() => setOpenKey((k) => (k === key ? null : key))}
                  onQuickAdd={() => logFood(item, item.servings[0], 1)}
                  onLog={(serving, qty) => logFood(item, serving, qty)}
                />
              );
            })}
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            Type at least 2 letters to search thousands of branded foods.
          </ThemedText>
        )}
      </ScrollView>
    </Screen>
  );
}

function FoodRow({
  item,
  open,
  logging,
  onToggle,
  onQuickAdd,
  onLog,
}: {
  item: FoodItem;
  open: boolean;
  logging: boolean;
  onToggle: () => void;
  onQuickAdd: () => void;
  onLog: (serving: Serving, qty: number) => void;
}) {
  const theme = useTheme();
  const [servingIdx, setServingIdx] = useState(0);
  const [qty, setQty] = useState('1');
  const serving = item.servings[servingIdx] ?? item.servings[0];
  const def = item.servings[0];
  const q = Number(qty) || 0;
  const subtitle = [`${round(def.calories)} cal`, def.label, item.brand].filter(Boolean).join(' · ');

  return (
    <Card style={{ gap: open ? Spacing.three : 0 }}>
      <View style={styles.row}>
        <Pressable style={{ flex: 1 }} onPress={onToggle}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {item.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        </Pressable>
        <Pressable onPress={onToggle} hitSlop={8} style={styles.chevron} accessibilityLabel={open ? 'Collapse' : 'Expand'}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={{ fontSize: 16 }}>
            {open ? '⌃' : '⌄'}
          </ThemedText>
        </Pressable>
        <Pressable onPress={onQuickAdd} hitSlop={8} style={[styles.plus, { borderColor: theme.primary }]}>
          <ThemedText type="smallBold" themeColor="primary" style={{ fontSize: 18 }}>
            ＋
          </ThemedText>
        </Pressable>
      </View>

      {open ? (
        <View style={{ gap: Spacing.two }}>
          {item.servings.length > 1 ? (
            <View style={styles.servingRow}>
              {item.servings.map((s, i) => (
                <Pressable
                  key={s.label}
                  onPress={() => setServingIdx(i)}
                  style={[
                    styles.servingPill,
                    {
                      borderColor: i === servingIdx ? theme.primary : theme.border,
                      backgroundColor: i === servingIdx ? theme.primary + '18' : 'transparent',
                    },
                  ]}>
                  <ThemedText type="small" themeColor={i === servingIdx ? 'primary' : 'textSecondary'} style={{ fontWeight: '700' }}>
                    {s.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Serving: {serving.label}
            </ThemedText>
          )}

          <View style={styles.qtyRow}>
            <ThemedText type="small" themeColor="textSecondary" style={{ width: 70 }}>
              Quantity
            </ThemedText>
            <View style={{ flex: 1 }}>
              <StepperInput value={qty} onChangeText={setQty} step={1} placeholder="1" />
            </View>
          </View>

          <View style={styles.totalsRow}>
            <ThemedText type="smallBold">{round(serving.calories * q)} kcal</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              P {round(serving.protein_g * q)}g · C {round(serving.carbs_g * q)}g · F {round(serving.fat_g * q)}g
            </ThemedText>
          </View>

          <Button title="Log" onPress={() => onLog(serving, q)} loading={logging} disabled={!(q > 0)} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: Spacing.two },
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  hint: { textAlign: 'center', paddingVertical: Spacing.four },
  loadingStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  servingPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  totalsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
