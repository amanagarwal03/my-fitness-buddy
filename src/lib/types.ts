// Shared domain types for My Fitness Buddy.

export type Unit = 'kg' | 'lbs';

export const BODY_PARTS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'abs',
  'cardio',
] as const;

export type BodyPart = (typeof BODY_PARTS)[number];

export type Profile = {
  user_id: string;
  height_cm: number | null;
  weight_kg: number | null;
  unit_pref: Unit;
  sex: 'male' | 'female' | 'other' | null;
  dob: string | null;
  updated_at: string;
};

export type NutritionGoals = {
  user_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micro_targets: Record<string, number> | null;
};

export type Micronutrient = {
  name: string;
  amount: number;
  unit: string;
};

// One line-item within a meal (e.g. "2 eggs", "1 cup rice"). Lets the user
// confirm/correct the LLM's breakdown before saving.
export type MealItem = {
  name: string;
  quantity: string; // free-form label, e.g. "2 eggs", "1 cup"
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type Meal = {
  id: string;
  user_id: string;
  eaten_at: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micros: Micronutrient[] | null;
  raw_response: unknown;
  image_url: string | null;
};

// Shape returned by the analyze-meal Edge Function (matches the json_schema).
export type MealAnalysis = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'low' | 'medium' | 'high';
  micros: Micronutrient[];
  assumptions: string[];
  items?: MealItem[]; // per-item breakdown (added by newer function deploys)
};

export type Exercise = {
  id: string;
  body_part: BodyPart;
  name: string;
  user_id: string | null;
  is_custom: boolean;
};

export type WorkoutSession = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
};

export type WorkoutSet = {
  id: string;
  user_id: string;
  exercise_id: string;
  session_id: string | null;
  performed_on: string; // date (YYYY-MM-DD)
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  // Cardio entries (e.g. treadmill) use these instead of weight/reps:
  duration_seconds: number | null;
  incline: number | null;
  speed_kmh: number | null; // canonical km/h
};
