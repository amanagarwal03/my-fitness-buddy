import type { BodyPart } from './types';

// Shared per-body-part presentation: label, emoji, and an accent color used for
// tinted badges and section markers across the workout UI.
export const BODY_PART_META: Record<BodyPart, { label: string; emoji: string; color: string }> = {
  chest: { label: 'Chest', emoji: '🏋️', color: '#FF6B6B' },
  back: { label: 'Back', emoji: '🧗', color: '#4D96FF' },
  shoulders: { label: 'Shoulders', emoji: '🤸', color: '#F59E0B' },
  biceps: { label: 'Biceps', emoji: '💪', color: '#9B6BFF' },
  triceps: { label: 'Triceps', emoji: '🦾', color: '#2DD4BF' },
  legs: { label: 'Legs', emoji: '🦵', color: '#34D399' },
  abs: { label: 'Abs', emoji: '🧘', color: '#FBBF24' },
  cardio: { label: 'Cardio', emoji: '🏃', color: '#FF7AB6' },
};
