import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { CollapsibleCalendar } from '@/components/calendar';
import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bmiCategory, computeBmi } from '@/lib/bmi';
import { BODY_PART_META } from '@/lib/bodyparts';
import { formatDuration, isoDate } from '@/lib/date';
import { signedPhotoUrls } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import type { BodyPart, Meal, Profile, Unit, WorkoutSession, WorkoutSet } from '@/lib/types';
import { fromKg, round1 } from '@/lib/units';

// A set with its exercise's name/body part joined in.
type JoinedSet = WorkoutSet & { exercises: { name: string; body_part: BodyPart } | null };
// Sets grouped under one exercise (within a session, or a manual day log).
type ExerciseGroup = { exerciseId: string; name: string; bodyPart: BodyPart; sets: WorkoutSet[] };

function dayLabel(d: Date): string {
  const today = isoDate();
  const target = isoDate(d);
  if (target === today) return 'Today';
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (target === isoDate(yest)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByExercise(rows: JoinedSet[]): ExerciseGroup[] {
  const map = new Map<string, ExerciseGroup>();
  for (const r of rows) {
    const g = map.get(r.exercise_id) ?? {
      exerciseId: r.exercise_id,
      name: r.exercises?.name ?? 'Exercise',
      bodyPart: r.exercises?.body_part ?? 'chest',
      sets: [],
    };
    g.sets.push(r);
    map.set(r.exercise_id, g);
  }
  return [...map.values()];
}

export default function SharedProfileScreen() {
  const theme = useTheme();
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const [label, setLabel] = useState<string>('Shared profile');
  const [profile, setProfile] = useState<Profile | null>(null);

  // Calendar selection + marked days (any day with a meal or workout logged).
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [markedDays, setMarkedDays] = useState<Set<string>>(new Set());

  // Per-day data for the selected date.
  const [meals, setMeals] = useState<Meal[]>([]);
  const [daySessions, setDaySessions] = useState<WorkoutSession[]>([]);
  const [sessionGroups, setSessionGroups] = useState<Record<string, ExerciseGroup[]>>({});
  const [manualGroups, setManualGroups] = useState<ExerciseGroup[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // One-time: identity, profile/BMI, and the marked-days set for the calendar.
  const loadHeader = useCallback(async () => {
    if (!ownerId) return;
    const since = new Date();
    since.setDate(since.getDate() - 365);
    const [grantRes, profileRes, mealDaysRes, setDaysRes] = await Promise.all([
      supabase.from('share_grants').select('owner_label').eq('owner_id', ownerId).maybeSingle(),
      supabase.from('profiles').select('*').eq('user_id', ownerId).maybeSingle(),
      supabase.from('meals').select('eaten_at').eq('user_id', ownerId).gte('eaten_at', `${isoDate(since)}T00:00:00`),
      supabase.from('workout_sets').select('performed_on').eq('user_id', ownerId).gte('performed_on', isoDate(since)),
    ]);
    if (grantRes.data?.owner_label) setLabel(grantRes.data.owner_label);
    setProfile((profileRes.data as Profile) ?? null);

    const marks = new Set<string>();
    for (const r of (mealDaysRes.data ?? []) as { eaten_at: string }[]) marks.add(isoDate(new Date(r.eaten_at)));
    for (const r of (setDaysRes.data ?? []) as { performed_on: string }[]) marks.add(r.performed_on);
    setMarkedDays(marks);
  }, [ownerId]);

  // Per-day: meals + workout sessions/sets for the selected date.
  const loadDay = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const day = isoDate(selectedDate);
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const [mealsRes, setsRes, sessRes] = await Promise.all([
      supabase
        .from('meals')
        .select('*')
        .eq('user_id', ownerId)
        .gte('eaten_at', dayStart.toISOString())
        .lte('eaten_at', dayEnd.toISOString())
        .order('eaten_at', { ascending: false }),
      supabase
        .from('workout_sets')
        .select('*, exercises(name, body_part)')
        .eq('user_id', ownerId)
        .eq('performed_on', day)
        .order('set_number', { ascending: true }),
      supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', ownerId)
        .gte('started_at', dayStart.toISOString())
        .lte('started_at', dayEnd.toISOString())
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: true }),
    ]);

    const mealList = (mealsRes.data as Meal[]) ?? [];
    setMeals(mealList);
    const paths = mealList.map((m) => m.image_url).filter((p): p is string => !!p);
    setPhotoUrls(paths.length ? await signedPhotoUrls(paths) : {});

    setDaySessions((sessRes.data as WorkoutSession[]) ?? []);
    const rows = (setsRes.data ?? []) as JoinedSet[];
    const bySession: Record<string, JoinedSet[]> = {};
    const manual: JoinedSet[] = [];
    for (const r of rows) {
      if (r.session_id) (bySession[r.session_id] ??= []).push(r);
      else manual.push(r);
    }
    const grouped: Record<string, ExerciseGroup[]> = {};
    for (const [sid, srows] of Object.entries(bySession)) grouped[sid] = groupByExercise(srows);
    setSessionGroups(grouped);
    setManualGroups(groupByExercise(manual));
    setLoading(false);
  }, [ownerId, selectedDate]);

  useEffect(() => {
    loadHeader();
  }, [loadHeader]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const unit: Unit = profile?.unit_pref ?? 'kg';
  const totals = meals.reduce(
    (a, m) => ({
      calories: a.calories + (m.calories ?? 0),
      protein_g: a.protein_g + (m.protein_g ?? 0),
      carbs_g: a.carbs_g + (m.carbs_g ?? 0),
      fat_g: a.fat_g + (m.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  const bmi =
    profile?.height_cm && profile?.weight_kg ? computeBmi(profile.height_cm, profile.weight_kg) : null;
  const initial = (label.trim()[0] ?? '?').toUpperCase();
  const hasWorkout = daySessions.length > 0 || manualGroups.length > 0;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Shared profile' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Identity header */}
        <Card style={styles.headerCard}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.avatarText}>{initial}</ThemedText>
          </View>
          <View style={{ flex: 1, gap: Spacing.one }}>
            <ThemedText type="subtitle" numberOfLines={1}>
              {label}
            </ThemedText>
            <View style={[styles.pill, { backgroundColor: theme.backgroundSelected }]}>
              <View style={[styles.dot, { backgroundColor: theme.success }]} />
              <ThemedText type="small" themeColor="textSecondary">
                Read-only access
              </ThemedText>
            </View>
          </View>
        </Card>

        {/* Body stats */}
        {profile ? (
          <View style={styles.statsRow}>
            <Stat label="BMI" value={bmi ? bmi.toFixed(1) : '—'} sub={bmi ? bmiCategory(bmi) : ''} />
            <Stat
              label="Weight"
              value={profile.weight_kg != null ? `${round1(fromKg(profile.weight_kg, unit))}` : '—'}
              sub={profile.weight_kg != null ? unit : ''}
            />
            <Stat
              label="Height"
              value={profile.height_cm != null ? `${profile.height_cm}` : '—'}
              sub={profile.height_cm != null ? 'cm' : ''}
            />
          </View>
        ) : null}

        {/* Calendar: tap a day to see that day's meals + workouts */}
        <CollapsibleCalendar
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          markedDays={markedDays}
        />

        {/* Selected day's nutrition */}
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
          NUTRITION · {dayLabel(selectedDate).toUpperCase()}
        </ThemedText>
        <Card>
          <View style={styles.calRow}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <ThemedText type="title" style={{ fontSize: 32 }}>
                {Math.round(totals.calories)}
              </ThemedText>
              <ThemedText themeColor="textSecondary"> kcal</ThemedText>
            </View>
            <View style={styles.macroChips}>
              <Chip color={theme.carbs} label="C" value={Math.round(totals.carbs_g)} />
              <Chip color={theme.fat} label="F" value={Math.round(totals.fat_g)} />
              <Chip color={theme.protein} label="P" value={Math.round(totals.protein_g)} />
            </View>
          </View>

          {meals.length > 0 ? (
            <View style={styles.mealList}>
              {meals.map((m) => {
                const url = m.image_url ? photoUrls[m.image_url] : undefined;
                return (
                  <View key={m.id} style={styles.row}>
                    {url ? <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" /> : null}
                    <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>
                      {m.name || 'Meal'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {Math.round(m.calories)} kcal
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {loading ? 'Loading…' : 'No meals logged.'}
            </ThemedText>
          )}
        </Card>

        {/* Selected day's workouts */}
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
          WORKOUTS · {dayLabel(selectedDate).toUpperCase()}
        </ThemedText>
        {loading ? (
          <View style={{ padding: Spacing.four, alignItems: 'center' }}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : !hasWorkout ? (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              No workouts logged.
            </ThemedText>
          </Card>
        ) : (
          <>
            {daySessions.map((s, i) => (
              <SessionCard
                key={s.id}
                index={i}
                session={s}
                groups={sessionGroups[s.id] ?? []}
                unit={unit}
              />
            ))}
            {manualGroups.length > 0 ? (
              <ThemedText type="smallBold" themeColor="textSecondary">
                QUICK LOGS
              </ThemedText>
            ) : null}
            {manualGroups.map((g) => (
              <Card key={g.exerciseId}>
                <ExerciseDetail group={g} unit={unit} />
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function SessionCard({
  index,
  session,
  groups,
  unit,
}: {
  index: number;
  session: WorkoutSession;
  groups: ExerciseGroup[];
  unit: Unit;
}) {
  const theme = useTheme();
  const clock = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const start = new Date(session.started_at);
  const end = session.ended_at ? new Date(session.ended_at) : null;
  const totalSets = groups.reduce((a, g) => a + g.sets.length, 0);

  return (
    <Card>
      <View style={styles.sessionHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">⏱  Session {index + 1}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {clock(start)}
            {end ? ` – ${clock(end)}` : ''}
          </ThemedText>
        </View>
        <View style={styles.sessionStats}>
          <ThemedText type="smallBold" themeColor="primary">
            {formatDuration(session.duration_seconds ?? 0)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {totalSets} {totalSets === 1 ? 'set' : 'sets'}
          </ThemedText>
        </View>
      </View>

      {groups.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No sets recorded.
        </ThemedText>
      ) : (
        groups.map((g) => (
          <View key={g.exerciseId} style={[styles.exerciseBlock, { borderTopColor: theme.border }]}>
            <ExerciseDetail group={g} unit={unit} />
          </View>
        ))
      )}
    </Card>
  );
}

function ExerciseDetail({ group, unit }: { group: ExerciseGroup; unit: Unit }) {
  const isCardio = group.bodyPart === 'cardio';
  const meta = BODY_PART_META[group.bodyPart];
  return (
    <View>
      <View style={styles.exerciseTitleRow}>
        <ThemedText type="smallBold">
          {meta?.emoji ?? '🏋️'}  {group.name}
        </ThemedText>
        {meta ? (
          <View style={[styles.groupTag, { backgroundColor: meta.color + '22' }]}>
            <ThemedText type="small" style={{ color: meta.color, fontWeight: '600' }}>
              {meta.label}
            </ThemedText>
          </View>
        ) : null}
      </View>
      {isCardio
        ? group.sets.map((s) => (
            <ThemedText key={s.id} type="small" themeColor="textSecondary">
              {formatDuration(s.duration_seconds ?? 0)}
              {s.speed_kmh != null ? ` · ${round1(s.speed_kmh)} km/h` : ''}
              {s.incline != null ? ` · ${s.incline}% incline` : ''}
            </ThemedText>
          ))
        : group.sets.map((s, i) => (
            <ThemedText key={s.id} type="small">
              Set {i + 1}:{'  '}
              <ThemedText type="smallBold">
                {s.weight_kg != null ? `${round1(fromKg(s.weight_kg, unit))} ${unit}` : '—'}
              </ThemedText>
              {s.reps != null ? ` × ${s.reps} reps` : ''}
            </ThemedText>
          ))}
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card style={styles.statCard}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="title" style={{ fontSize: 24 }}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {sub || ' '}
      </ThemedText>
    </Card>
  );
}

function Chip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label} {value}g
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statsRow: { flexDirection: 'row', gap: Spacing.three },
  statCard: { flex: 1, alignItems: 'center', gap: Spacing.half },
  section: { marginTop: Spacing.one },
  calRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  macroChips: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', justifyContent: 'flex-end' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  mealList: { gap: Spacing.one, marginTop: Spacing.two, paddingTop: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.one },
  thumb: { width: 32, height: 32, borderRadius: 6 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionStats: { alignItems: 'flex-end' },
  exerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  groupTag: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: 999 },
  exerciseBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    marginTop: Spacing.two,
    gap: 2,
  },
});
