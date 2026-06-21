// ---------------------------------------------------------------------------
// TEMPORARY PREVIEW MODE
// ---------------------------------------------------------------------------
// While Supabase isn't configured yet, PREVIEW_MODE lets the app boot straight
// into the tabs with realistic sample data so the UI can be reviewed.
//
// ‼️ Set PREVIEW_MODE = false once Supabase is set up (see README). When off,
//    the app uses real auth + live data and none of the sample data below runs.
// ---------------------------------------------------------------------------

import type { BodyPart, Exercise, Meal, NutritionGoals, Profile, WorkoutSession } from './types';

export const PREVIEW_MODE = false;

const now = new Date();
const iso = (h: number) => {
  const d = new Date(now);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

export const previewGoals: NutritionGoals = {
  user_id: 'preview',
  calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 65,
  micro_targets: null,
};

export const previewMeals: Meal[] = [
  {
    id: 'm1',
    user_id: 'preview',
    eaten_at: iso(13),
    name: 'Grilled chicken & rice bowl',
    calories: 540,
    protein_g: 46,
    carbs_g: 55,
    fat_g: 14,
    micros: [
      { name: 'Sodium', amount: 620, unit: 'mg' },
      { name: 'Iron', amount: 3.2, unit: 'mg' },
      { name: 'Fiber', amount: 5, unit: 'g' },
    ],
    raw_response: null,
    image_url: null,
  },
  {
    id: 'm2',
    user_id: 'preview',
    eaten_at: iso(9),
    name: 'Greek yogurt & berries',
    calories: 220,
    protein_g: 18,
    carbs_g: 24,
    fat_g: 6,
    micros: [{ name: 'Calcium', amount: 250, unit: 'mg' }],
    raw_response: null,
    image_url: null,
  },
  {
    id: 'm3',
    user_id: 'preview',
    eaten_at: iso(8),
    name: 'Avocado toast',
    calories: 330,
    protein_g: 9,
    carbs_g: 30,
    fat_g: 20,
    micros: [{ name: 'Potassium', amount: 480, unit: 'mg' }],
    raw_response: null,
    image_url: null,
  },
];

export const previewProfile: Profile = {
  user_id: 'preview',
  first_name: 'Alex',
  last_name: 'Carter',
  age: 28,
  height_cm: 178,
  weight_kg: 74,
  unit_pref: 'kg',
  sex: 'male',
  dob: null,
  updated_at: now.toISOString(),
};

export const previewTodaySessions: WorkoutSession[] = [
  {
    id: 's1',
    user_id: 'preview',
    started_at: iso(7),
    ended_at: iso(8),
    duration_seconds: 58 * 60 + 24,
  },
];

const ex = (id: string, body_part: BodyPart, name: string, is_custom = false): Exercise => ({
  id,
  body_part,
  name,
  user_id: is_custom ? 'preview' : null,
  is_custom,
});

export const previewExercises: Record<BodyPart, Exercise[]> = {
  chest: [
    ex('chest-1', 'chest', 'Barbell Bench Press'),
    ex('chest-2', 'chest', 'Incline Dumbbell Press'),
    ex('chest-3', 'chest', 'Chest Fly'),
    ex('chest-4', 'chest', 'Push-up'),
  ],
  back: [
    ex('back-1', 'back', 'Deadlift'),
    ex('back-2', 'back', 'Pull-up'),
    ex('back-3', 'back', 'Bent-over Row'),
    ex('back-4', 'back', 'Lat Pulldown'),
  ],
  shoulders: [
    ex('shoulders-1', 'shoulders', 'Overhead Press'),
    ex('shoulders-2', 'shoulders', 'Dumbbell Shoulder Press'),
    ex('shoulders-3', 'shoulders', 'Lateral Raise'),
    ex('shoulders-4', 'shoulders', 'Face Pull'),
  ],
  biceps: [
    ex('biceps-1', 'biceps', 'Barbell Curl'),
    ex('biceps-2', 'biceps', 'Dumbbell Curl'),
    ex('biceps-3', 'biceps', 'Hammer Curl'),
  ],
  triceps: [
    ex('triceps-1', 'triceps', 'Tricep Pushdown'),
    ex('triceps-2', 'triceps', 'Overhead Tricep Extension'),
    ex('triceps-3', 'triceps', 'Close-grip Bench Press'),
  ],
  legs: [
    ex('legs-1', 'legs', 'Back Squat'),
    ex('legs-2', 'legs', 'Leg Press'),
    ex('legs-3', 'legs', 'Romanian Deadlift'),
    ex('legs-4', 'legs', 'Leg Curl'),
    ex('legs-5', 'legs', 'Calf Raise'),
  ],
  abs: [
    ex('abs-1', 'abs', 'Plank'),
    ex('abs-2', 'abs', 'Hanging Leg Raise'),
    ex('abs-3', 'abs', 'Cable Crunch'),
  ],
  cardio: [
    ex('cardio-1', 'cardio', 'Treadmill Run'),
    ex('cardio-2', 'cardio', 'Cycling'),
    ex('cardio-3', 'cardio', 'Rowing Machine'),
  ],
};

// Three prefilled sets shown when opening an exercise in preview (canonical kg).
export const previewSets = [
  { weight: '60', reps: '8' },
  { weight: '60', reps: '6' },
  { weight: '55', reps: '6' },
];

// Sample top-set history (kg) for the progress chart, oldest → newest.
export const previewProgressKg = [45, 47.5, 50, 50, 52.5, 55, 55, 57.5, 60];

// Sample cardio entry shown when opening a cardio exercise in preview.
export const previewCardio = { durationSec: 30 * 60, incline: 2, speedKmh: 9.5 };

// Sample top-speed history (km/h) for the cardio progress chart, oldest → newest.
export const previewProgressKmh = [7.5, 8, 8, 8.5, 9, 9, 9.5, 10, 10.5];
