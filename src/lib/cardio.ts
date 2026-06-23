// Rough cardio estimates for treadmill/run/walk-style activities.
// These are directional, not lab-grade — surfaced to the user as "est.".

const DEFAULT_WEIGHT_KG = 70;

/** Distance covered (km) from average speed (km/h) over a duration (seconds). */
export function distanceKm(speedKmh: number | null | undefined, durationSec: number | null | undefined): number {
  if (!speedKmh || !durationSec || speedKmh <= 0 || durationSec <= 0) return 0;
  return speedKmh * (durationSec / 3600);
}

/**
 * Estimated calories burnt, using the ACSM walking/running VO2 equations:
 *   VO2 (ml/kg/min) → kcal/min = VO2 * weightKg / 1000 * 5
 * Incline is the treadmill grade in percent. Falls back to ~70kg if no weight.
 */
export function estimateCalories(opts: {
  durationSec: number | null | undefined;
  speedKmh: number | null | undefined;
  incline?: number | null;
  weightKg?: number | null;
}): number {
  const { durationSec, speedKmh } = opts;
  if (!durationSec || durationSec <= 0) return 0;
  const minutes = durationSec / 60;
  const w = opts.weightKg && opts.weightKg > 0 ? opts.weightKg : DEFAULT_WEIGHT_KG;
  const grade = (opts.incline ?? 0) / 100;
  const speedMperMin = ((speedKmh ?? 0) * 1000) / 60;
  // Walking equation below ~6.4 km/h (4 mph); running equation above.
  const vo2 =
    (speedKmh ?? 0) < 6.4
      ? 0.1 * speedMperMin + 1.8 * speedMperMin * grade + 3.5
      : 0.2 * speedMperMin + 0.9 * speedMperMin * grade + 3.5;
  const kcalPerMin = (vo2 * w) / 1000 * 5;
  return Math.max(0, Math.round(kcalPerMin * minutes));
}
