import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LogKind } from './exerciseKind';
import type { Unit } from './types';
import type { SpeedUnit } from './units';

// An in-progress workout, persisted so the user can leave the Log screen (e.g.
// press back) and resume it later from the Workout tab. Timing is stored as an
// accumulated running total plus a "running since" timestamp so pauses survive a
// reload: elapsed = elapsedBeforePause + (runningSince ? now - runningSince : 0).

const KEY = 'active-workout-v1';

export type StoredSet = {
  weight: string;
  reps: string;
  // Cardio + duration-based entries (optional; absent on older strength saves).
  durationSec?: number;
  incline?: string;
  speed?: string;
  done: boolean;
  prevKg?: number | null;
  prevReps?: number | null;
};
export type StoredExercise = {
  key: string;
  id: string;
  name: string;
  bodyPart: string;
  kind?: LogKind; // how this exercise is logged (absent on older saves)
  collapsed?: boolean; // editor folded away (absent on older saves)
  sets: StoredSet[];
};
export type ActiveWorkout = {
  startedAt: number; // ms epoch of the original start (for session started_at)
  elapsedBeforePause: number; // seconds accumulated while running
  runningSince: number | null; // ms epoch when currently running; null when paused
  unit: Unit;
  speedUnit?: SpeedUnit; // for cardio speed entry (absent on older saves)
  // When set, finishing appends to this existing session (Continue session)
  // instead of inserting a new one.
  continueSessionId?: string | null;
  exercises: StoredExercise[];
  updatedAt: number;
};

export function liveElapsed(w: Pick<ActiveWorkout, 'elapsedBeforePause' | 'runningSince'>): number {
  const running = w.runningSince ? (Date.now() - w.runningSince) / 1000 : 0;
  return Math.max(0, Math.floor(w.elapsedBeforePause + running));
}

export async function saveActiveWorkout(w: ActiveWorkout): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    // Non-fatal: persistence is best-effort.
  }
}

export async function loadActiveWorkout(): Promise<ActiveWorkout | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveWorkout) : null;
  } catch {
    return null;
  }
}

export async function clearActiveWorkout(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Non-fatal.
  }
}
