import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';

import { showAlert } from '@/lib/dialog';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BODY_PART_META } from '@/lib/bodyparts';
import { setPendingExercise } from '@/lib/pendingExercise';
import { PREVIEW_MODE, previewExercises } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';
import { BODY_PARTS, type BodyPart, type Exercise } from '@/lib/types';

export default function AddExerciseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [all, setAll] = useState<Exercise[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<BodyPart | 'all'>('all');
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    if (PREVIEW_MODE) {
      setAll(Object.values(previewExercises).flat());
      return;
    }
    supabase
      .from('exercises')
      .select('*')
      .order('name')
      .then(({ data }) => setAll((data as Exercise[]) ?? []));
  }, []);

  // Filter, then group by body part into sections for a clean, scannable list.
  const sections = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matched = all.filter(
      (e) => (filter === 'all' || e.body_part === filter) && e.name.toLowerCase().includes(term),
    );
    return BODY_PARTS.map((bp) => ({
      bodyPart: bp,
      title: BODY_PART_META[bp].label,
      data: matched.filter((e) => e.body_part === bp),
    })).filter((s) => s.data.length > 0);
  }, [all, q, filter]);

  const pick = (e: Exercise) => {
    setPendingExercise({ id: e.id, name: e.name, bodyPart: e.body_part });
    router.back();
  };

  // Open the inline create form (works on all platforms, unlike Alert.prompt).
  const openCustom = () => {
    if (filter === 'all') {
      showAlert('Pick a muscle group', 'Tap a muscle group above first, then add your exercise.');
      return;
    }
    setCustomName(q.trim());
    setCustomOpen(true);
  };

  const submitCustom = async () => {
    const name = customName.trim();
    if (!name) return;
    setCustomOpen(false);
    await createCustom(name);
  };

  // Create a custom exercise (from the given name or the current search term),
  // assigned to the selected muscle group, then immediately add it to the workout.
  const createCustom = async (nameArg?: string) => {
    const name = (nameArg ?? q).trim();
    if (!name) return;
    if (filter === 'all') {
      showAlert('Pick a muscle group', 'Tap a muscle group above first, then create your exercise.');
      return;
    }
    const bp = filter;
    if (PREVIEW_MODE) {
      pick({ id: `custom-${Date.now()}`, body_part: bp, name, user_id: 'preview', is_custom: true } as Exercise);
      return;
    }
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      showAlert('Could not create', (e as Error).message);
      return;
    }
    const { data, error } = await supabase
      .from('exercises')
      .insert({ body_part: bp, name, user_id: userId, is_custom: true })
      .select('*')
      .single();
    if (error || !data) {
      showAlert('Could not create', error?.message ?? 'Please try again.');
      return;
    }
    pick(data as Exercise);
  };

  const trimmed = q.trim();
  const exactExists = all.some((e) => e.name.toLowerCase() === trimmed.toLowerCase());
  const createMeta = filter !== 'all' ? BODY_PART_META[filter] : null;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Add Exercise' }} />

      {/* Search */}
      <View style={styles.search}>
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <ThemedText themeColor="textSecondary" style={{ fontSize: 16 }}>
            🔍
          </ThemedText>
          <TextInput
            placeholder="Search exercises"
            placeholderTextColor={theme.textSecondary}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            style={[styles.input, { color: theme.text }]}
          />
          {q.length > 0 ? (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <ThemedText themeColor="textSecondary">✕</ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filter pills — colored accent per muscle group */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        {BODY_PARTS.map((bp) => {
          const meta = BODY_PART_META[bp];
          return (
            <Chip
              key={bp}
              label={`${meta.emoji}  ${meta.label}`}
              color={meta.color}
              active={filter === bp}
              onPress={() => setFilter(bp)}
            />
          );
        })}
      </ScrollView>

      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <Pressable
            onPress={openCustom}
            style={({ pressed }) => [
              styles.createRow,
              {
                marginTop: 0,
                marginBottom: Spacing.one,
                backgroundColor: pressed ? theme.backgroundElement : theme.background,
                borderColor: createMeta?.color ?? theme.primary,
              },
            ]}>
            <View style={[styles.badge, { backgroundColor: (createMeta?.color ?? theme.primary) + '22' }]}>
              <ThemedText style={{ fontSize: 20 }}>＋</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold">Add a custom exercise</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {createMeta ? `Not listed? Create your own ${createMeta.label} exercise` : 'Pick a muscle group above first'}
              </ThemedText>
            </View>
          </Pressable>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={{ fontSize: 40 }}>🏋️</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {trimmed
                ? `No match for “${trimmed}”.`
                : 'No exercises here yet.'}
            </ThemedText>
          </View>
        }
        ListFooterComponent={
          trimmed && !exactExists ? (
            <Pressable
              onPress={() => createCustom()}
              style={({ pressed }) => [
                styles.createRow,
                {
                  backgroundColor: pressed ? theme.backgroundElement : theme.background,
                  borderColor: createMeta?.color ?? theme.primary,
                },
              ]}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: (createMeta?.color ?? theme.primary) + '22' },
                ]}>
                <ThemedText style={{ fontSize: 20 }}>＋</ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold">Create “{trimmed}”</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {createMeta ? `Add as ${createMeta.label}` : 'Pick a muscle group above first'}
                </ThemedText>
              </View>
            </Pressable>
          ) : null
        }
        renderSectionHeader={({ section }) => {
          const meta = BODY_PART_META[section.bodyPart as BodyPart];
          return (
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: meta.color }]} />
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
                {section.title.toUpperCase()}
              </ThemedText>
            </View>
          );
        }}
        renderItem={({ item }) => {
          const meta = BODY_PART_META[item.body_part];
          return (
            <Pressable
              onPress={() => pick(item)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? theme.backgroundElement : theme.background,
                  borderColor: theme.border,
                },
              ]}>
              <View style={[styles.badge, { backgroundColor: meta.color + '22' }]}>
                <ThemedText style={{ fontSize: 20 }}>{meta.emoji}</ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {meta.label}
                  {item.is_custom ? ' · custom' : ''}
                </ThemedText>
              </View>
              <View style={[styles.addPill, { backgroundColor: meta.color }]}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>
                  ＋
                </ThemedText>
              </View>
            </Pressable>
          );
        }}
      />

      {/* Inline create-custom-exercise form */}
      <Modal visible={customOpen} transparent animationType="fade" onRequestClose={() => setCustomOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCustomOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => {}}>
            <ThemedText type="subtitle">New exercise</ThemedText>
            {createMeta ? (
              <View style={styles.modalGroup}>
                <View style={[styles.sectionDot, { backgroundColor: createMeta.color }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  {createMeta.emoji}  {createMeta.label}
                </ThemedText>
              </View>
            ) : null}
            <TextInput
              value={customName}
              onChangeText={setCustomName}
              placeholder="Exercise name"
              placeholderTextColor={theme.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitCustom}
              style={[
                styles.modalInput,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            />
            <Button title="Create & add" onPress={submitCustom} />
            <Pressable onPress={() => setCustomOpen(false)} style={{ alignSelf: 'center', padding: Spacing.two }}>
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

function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const accent = color ?? theme.primary;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? accent : theme.backgroundElement,
          borderColor: active ? accent : theme.border,
        },
      ]}>
      <ThemedText
        type="small"
        numberOfLines={1}
        style={{ color: active ? '#fff' : theme.text, fontWeight: '600' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: Spacing.two },
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listContent: { padding: Spacing.three, paddingTop: Spacing.two, gap: Spacing.two },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { letterSpacing: 0.8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addPill: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + 2,
    marginTop: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  empty: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.six },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  modalInput: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 48,
  },
});
