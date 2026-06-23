import type { BodyPart } from './types';

// How an exercise is logged:
//  - 'cardio'   → duration + incline + speed (e.g. treadmill, cycling, rowing)
//  - 'duration' → time held only (e.g. plank, wall sit, dead hang)
//  - 'strength' → weight + reps (everything else)
export type LogKind = 'strength' | 'cardio' | 'duration';

// Exercises measured by time-under-tension rather than reps.
const DURATION_RE = /plank|hold|wall ?sit|dead ?hang|hollow|l-?sit|superman|bridge|isometric/i;

export function logKind(bodyPart: BodyPart, name: string): LogKind {
  if (bodyPart === 'cardio') return 'cardio';
  if (DURATION_RE.test(name)) return 'duration';
  return 'strength';
}
