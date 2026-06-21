// Input sanitizers for numeric text fields. They strip anything that isn't a
// valid part of a positive number so users can't enter commas, letters, signs,
// or multiple dots. Final range checks still happen on save.

/** Digits + a single decimal point (e.g. weights: "60.5"). No sign, no commas. */
export function sanitizeDecimal(text: string): string {
  let s = text.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    // Keep the first dot, drop any later ones.
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  }
  return s;
}

/** Digits only (e.g. reps, age, calorie targets — whole numbers). */
export function sanitizeInt(text: string): string {
  return text.replace(/[^0-9]/g, '');
}
