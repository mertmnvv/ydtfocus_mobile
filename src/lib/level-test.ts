// Zorunlu seviye tespit sınavının puanlama tablosu — bkz. src/app/level-test.tsx.
export type CefrLevel = 'A2' | 'B1' | 'B2' | 'C1';

export const LEVEL_THRESHOLDS: { min: number; max: number; level: CefrLevel }[] = [
  { min: 0, max: 3, level: 'A2' },
  { min: 4, max: 6, level: 'B1' },
  { min: 7, max: 8, level: 'B2' },
  { min: 9, max: 10, level: 'C1' },
];

export function calculateLevel(correctCount: number): CefrLevel {
  const match = LEVEL_THRESHOLDS.find((t) => correctCount >= t.min && correctCount <= t.max);
  return match?.level ?? 'A2';
}
