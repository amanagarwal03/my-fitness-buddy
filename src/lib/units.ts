import type { Unit } from './types';

const KG_PER_LB = 0.45359237;
const LB_PER_KG = 1 / KG_PER_LB;

export function kgToLbs(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

/** Convert a canonical kg value into the user's preferred display unit. */
export function fromKg(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kgToLbs(kg);
}

/** Convert a value entered in the user's unit back into canonical kg for storage. */
export function toKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : lbsToKg(value);
}

/** Round to one decimal place for clean display. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatWeight(kg: number, unit: Unit): string {
  return `${round1(fromKg(kg, unit))} ${unit}`;
}

// --- Speed (canonical: km/h) ---
const MI_PER_KM = 0.621371;

export type SpeedUnit = 'kmph' | 'mph';

export function fromKmh(kmh: number, unit: SpeedUnit): number {
  return unit === 'kmph' ? kmh : kmh * MI_PER_KM;
}

export function toKmh(value: number, unit: SpeedUnit): number {
  return unit === 'kmph' ? value : value / MI_PER_KM;
}
