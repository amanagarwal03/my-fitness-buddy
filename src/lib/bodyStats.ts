import type { ActivityLevel, FitnessGoal } from './types';

// All inputs metric: kg, cm, years. Every output here is an ESTIMATE meant for
// guidance, not a medical measurement — the UI labels them as such.

export type Sex = 'male' | 'female' | 'other';

export type Measurements = {
  neck?: number | null;
  chest?: number | null;
  biceps?: number | null;
  waist?: number | null;
  hips?: number | null;
  thighs?: number | null;
};

const log10 = (x: number) => Math.log(x) / Math.LN10;
const round = (x: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (little/no exercise)',
  light: 'Light (1–3 days/wk)',
  moderate: 'Moderate (3–5 days/wk)',
  active: 'Active (6–7 days/wk)',
  very_active: 'Very active (hard daily/physical job)',
};

// Mifflin–St Jeor BMR (kcal/day). 'other' averages the male/female constants.
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number | null {
  if (!(weightKg > 0) || !(heightCm > 0) || !(age > 0)) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const offset = sex === 'male' ? 5 : sex === 'female' ? -161 : (5 - 161) / 2;
  return round(base + offset);
}

export function tdee(bmrValue: number, activity: ActivityLevel): number {
  return round(bmrValue * ACTIVITY_FACTORS[activity]);
}

// Recommended daily calories from TDEE + goal. Loss/gain use a moderate
// ~500/+350 kcal adjustment, floored so a deficit never drops below BMR.
export function recommendedCalories(
  tdeeValue: number,
  bmrValue: number,
  goal: FitnessGoal,
): number {
  if (goal === 'lose') return round(Math.max(bmrValue, tdeeValue - 500));
  if (goal === 'gain') return round(tdeeValue + 350);
  return round(tdeeValue);
}

// A simple macro split for a calorie target: protein ~1.8 g/kg, fat 25% of
// kcal, carbs fill the rest. Returns grams.
export function macroSplit(calories: number, weightKg: number) {
  const protein_g = round(Math.min(2.2, 1.8) * weightKg);
  const fat_g = round((calories * 0.25) / 9);
  const carbs_g = round(Math.max(0, (calories - protein_g * 4 - fat_g * 9) / 4));
  return { calories: round(calories), protein_g, carbs_g, fat_g };
}

// US Navy body-fat % (metric). Needs neck + waist (+ hips for women). Falls back
// to the BMI-based Deurenberg estimate when girths are missing.
export function bodyFatPct(
  sex: Sex,
  heightCm: number,
  age: number,
  bmi: number | null,
  m: Measurements,
): number | null {
  const waist = m.waist ?? 0;
  const neck = m.neck ?? 0;
  const hips = m.hips ?? 0;
  if (waist > 0 && neck > 0 && heightCm > 0) {
    if (sex === 'female') {
      if (hips > 0 && waist + hips - neck > 0) {
        const bf =
          495 / (1.29579 - 0.35004 * log10(waist + hips - neck) + 0.221 * log10(heightCm)) - 450;
        if (bf > 0 && bf < 70) return round(bf, 1);
      }
    } else if (waist - neck > 0) {
      // male & 'other' use the male girth formula
      const bf = 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(heightCm)) - 450;
      if (bf > 0 && bf < 70) return round(bf, 1);
    }
  }
  // Fallback: Deurenberg (BMI-based).
  if (bmi != null && age > 0) {
    const s = sex === 'male' ? 1 : sex === 'female' ? 0 : 0.5;
    const bf = 1.2 * bmi + 0.23 * age - 10.8 * s - 5.4;
    if (bf > 0 && bf < 70) return round(bf, 1);
  }
  return null;
}

export type HealthyBfRange = { min: number; max: number };
// Rough healthy body-fat ranges by sex (American Council on Exercise "fitness").
export function healthyBfRange(sex: Sex): HealthyBfRange {
  if (sex === 'female') return { min: 21, max: 33 };
  if (sex === 'male') return { min: 14, max: 24 };
  return { min: 18, max: 28 };
}

// Skeletal muscle is roughly half of fat-free mass — a coarse estimate.
export function muscleMassPct(bodyFat: number): number {
  return round((100 - bodyFat) * 0.5, 1);
}

// Most body fat is subcutaneous (~85%); the rest is visceral. Estimate only.
export function subcutaneousFatPct(bodyFat: number): number {
  return round(bodyFat * 0.85, 1);
}

// Ideal body-weight band from the healthy BMI range (18.5–24.9), plus a BMI-22
// midpoint "target".
export function idealWeight(heightCm: number): { min: number; max: number; target: number } | null {
  if (!(heightCm > 0)) return null;
  const m2 = (heightCm / 100) ** 2;
  return { min: round(18.5 * m2, 1), max: round(24.9 * m2, 1), target: round(22 * m2, 1) };
}

// Rough standard girths (cm) estimated from height + sex, as anthropometric
// fractions of height. Used to pre-fill empty measurement fields so the screen
// shows sensible numbers the user can then correct.
const GIRTH_RATIOS: Record<Sex, Record<string, number>> = {
  male: { neck: 0.22, chest: 0.55, biceps: 0.2, waist: 0.45, hips: 0.52, thighs: 0.31 },
  female: { neck: 0.19, chest: 0.52, biceps: 0.17, waist: 0.42, hips: 0.56, thighs: 0.33 },
  other: { neck: 0.205, chest: 0.535, biceps: 0.185, waist: 0.435, hips: 0.54, thighs: 0.32 },
};

export function estimateMeasurements(
  sex: Sex,
  heightCm: number,
): Record<'neck' | 'chest' | 'biceps' | 'waist' | 'hips' | 'thighs', number> | null {
  if (!(heightCm > 0)) return null;
  const r = GIRTH_RATIOS[sex];
  return {
    neck: round(heightCm * r.neck),
    chest: round(heightCm * r.chest),
    biceps: round(heightCm * r.biceps),
    waist: round(heightCm * r.waist),
    hips: round(heightCm * r.hips),
    thighs: round(heightCm * r.thighs),
  };
}

// Metabolic age — a guidance estimate. Anchored to chronological age and shifted
// by how far body fat sits from the healthy midpoint for the person's sex.
export function metabolicAge(age: number, sex: Sex, bodyFat: number | null): number | null {
  if (!(age > 0) || bodyFat == null) return null;
  const range = healthyBfRange(sex);
  const mid = (range.min + range.max) / 2;
  const est = age + (bodyFat - mid) * 0.7;
  return round(Math.min(80, Math.max(16, est)));
}
