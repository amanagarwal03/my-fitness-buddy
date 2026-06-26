import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { showAlert } from '@/lib/dialog';
import { PREVIEW_MODE, previewExercises } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';
import type { BodyPart, Exercise } from '@/lib/types';

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function BodyPartScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { bodyPart } = useLocalSearchParams<{ bodyPart: BodyPart }>();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  // When set, the form is renaming this custom exercise; otherwise it adds a new one.
  const [editTarget, setEditTarget] = useState<Exercise | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    if (!bodyPart) return;
    if (PREVIEW_MODE) {
      setExercises(previewExercises[bodyPart] ?? []);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .eq('body_part', bodyPart)
      .order('is_custom', { ascending: true })
      .order('name', { ascending: true });
    setExercises((data as Exercise[]) ?? []);
    setLoading(false);
  }, [bodyPart]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openAdd = () => {
    setEditTarget(null);
    setNewName('');
    setFormOpen(true);
  };
  const openEdit = (ex: Exercise) => {
    setEditTarget(ex);
    setNewName(ex.name);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditTarget(null);
    setNewName('');
  };

  const saveCustom = async () => {
    const name = newName.trim();
    if (!name) return;
    if (PREVIEW_MODE) {
      setExercises((prev) =>
        editTarget
          ? prev.map((e) => (e.id === editTarget.id ? { ...e, name } : e))
          : [...prev, { id: `custom-${Date.now()}`, body_part: bodyPart, name, user_id: 'preview', is_custom: true }],
      );
      closeForm();
      return;
    }
    if (!session) return;
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      showAlert('Could not save', (e as Error).message);
      return;
    }
    const { error } = editTarget
      ? await supabase
          .from('exercises')
          .update({ name })
          .eq('id', editTarget.id)
          .eq('user_id', userId)
      : await supabase.from('exercises').insert({ body_part: bodyPart, name, user_id: userId, is_custom: true });
    if (error) {
      showAlert('Could not save', error.message);
      return;
    }
    closeForm();
    load();
  };

  const deleteCustom = (ex: Exercise) => {
    const remove = async () => {
      if (PREVIEW_MODE) {
        setExercises((prev) => prev.filter((e) => e.id !== ex.id));
        return;
      }
      let userId: string;
      try {
        userId = await requireUserId();
      } catch (e) {
        showAlert('Could not delete', (e as Error).message);
        return;
      }
      const { error } = await supabase
        .from('exercises')
        .delete()
        .eq('id', ex.id)
        .eq('user_id', userId);
      if (error) {
        showAlert('Could not delete', error.message);
        return;
      }
      load();
    };
    showAlert(
      'Delete exercise?',
      `“${ex.name}” will be removed from your list, along with any sets you’ve logged under it. To just fix a typo, use Edit instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: remove },
      ],
    );
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: bodyPart ? titleCase(bodyPart) : 'Exercises' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {bodyPart ? (
          <Button
            title="📈  View progress"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/workout/group-progress/[bodyPart]', params: { bodyPart } })
            }
          />
        ) : null}

        {exercises.length === 0 && !loading ? (
          <Card>
            <ThemedText themeColor="textSecondary">
              No exercises yet. Add your first one below.
            </ThemedText>
          </Card>
        ) : null}

        {exercises.map((ex) => (
          <Card key={ex.id} style={styles.row}>
            <Pressable
              style={styles.rowMain}
              onPress={() =>
                router.push({
                  pathname: '/workout/exercise/[id]',
                  params: { id: ex.id, name: ex.name, bodyPart: ex.body_part },
                })
              }>
              <ThemedText style={{ flex: 1 }}>{ex.name}</ThemedText>
              {ex.is_custom ? (
                <View style={[styles.customTag, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    custom
                  </ThemedText>
                </View>
              ) : null}
              <ThemedText type="small" style={{ color: theme.primary }}>
                Log ›
              </ThemedText>
            </Pressable>
            {ex.is_custom ? (
              <View style={styles.rowActions}>
                <Pressable onPress={() => openEdit(ex)} hitSlop={8} style={styles.iconBtn}>
                  <ThemedText type="small" themeColor="primary">
                    ✎ Edit
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => deleteCustom(ex)} hitSlop={8} style={styles.iconBtn}>
                  <ThemedText type="small" themeColor="danger">
                    🗑 Delete
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </Card>
        ))}

        <View style={{ height: Spacing.two }} />
        <Button title="＋ Add custom exercise" variant="secondary" onPress={openAdd} />
      </ScrollView>

      <Modal visible={formOpen} transparent animationType="fade" onRequestClose={closeForm}>
        <View style={styles.overlay}>
          <Card style={{ gap: Spacing.three }}>
            <ThemedText type="smallBold">
              {editTarget ? 'Rename exercise' : `New ${bodyPart} exercise`}
            </ThemedText>
            <Field
              label="Exercise name"
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Incline dumbbell press"
              autoFocus
            />
            <Button title={editTarget ? 'Save' : 'Add'} onPress={saveCustom} />
            <Button title="Cancel" variant="secondary" onPress={closeForm} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  row: { gap: Spacing.two },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  customTag: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: 999 },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  iconBtn: { paddingVertical: 2, paddingHorizontal: Spacing.one },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
