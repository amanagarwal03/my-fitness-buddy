// Tiny in-memory hand-off so the Add-Exercise picker can return a selection to
// the Log-Workout screen without resetting its state (no nav params / deps).
export type PickedExercise = { id: string; name: string; bodyPart: string };

let pending: PickedExercise | null = null;

export const setPendingExercise = (e: PickedExercise) => {
  pending = e;
};

export const takePendingExercise = (): PickedExercise | null => {
  const p = pending;
  pending = null;
  return p;
};
