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
  const [adding, setAdding] = useState(false);
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

  const saveCustom = async () => {
    const name = newName.trim();
    if (!name) return;
    if (PREVIEW_MODE) {
      setExercises((prev) => [
        ...prev,
        { id: `custom-${Date.now()}`, body_part: bodyPart, name, user_id: 'preview', is_custom: true },
      ]);
      setNewName('');
      setAdding(false);
      return;
    }
    if (!session) return;
    let userId: string;
    try {
      userId = await requireUserId();
    } catch (e) {
      showAlert('Could not add', (e as Error).message);
      return;
    }
    const { error } = await supabase.from('exercises').insert({
      body_part: bodyPart,
      name,
      user_id: userId,
      is_custom: true,
    });
    if (error) {
      showAlert('Could not add', error.message);
      return;
    }
    setNewName('');
    setAdding(false);
    load();
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
          <Pressable
            key={ex.id}
            onPress={() =>
              router.push({
                pathname: '/workout/exercise/[id]',
                params: { id: ex.id, name: ex.name, bodyPart: ex.body_part },
              })
            }>
            <Card style={styles.row}>
              <ThemedText style={{ flex: 1 }}>{ex.name}</ThemedText>
              {ex.is_custom ? (
                <ThemedText type="small" themeColor="textSecondary">
                  custom
                </ThemedText>
              ) : null}
              <ThemedText type="small" style={{ color: theme.primary }}>
                Log ›
              </ThemedText>
            </Card>
          </Pressable>
        ))}

        <View style={{ height: Spacing.two }} />
        <Button title="＋ Add custom exercise" variant="secondary" onPress={() => setAdding(true)} />
      </ScrollView>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <View style={styles.overlay}>
          <Card style={{ gap: Spacing.three }}>
            <ThemedText type="smallBold">New {bodyPart} exercise</ThemedText>
            <Field
              label="Exercise name"
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Incline dumbbell press"
              autoFocus
            />
            <Button title="Add" onPress={saveCustom} />
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => {
                setNewName('');
                setAdding(false);
              }}
            />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
