/**
 * Timing constants and types for the Salsa Timing app.
 */

export type TimingMode = 'on1' | 'on2_son' | 'on2_soft_mambo' | 'on2_hard_mambo';

export const MODE_LABELS: Record<TimingMode, string> = {
  on1: 'On1',
  on2_son: 'Son',
  on2_soft_mambo: 'Soft Mambo',
  on2_hard_mambo: 'Hard Mambo',
};

export const BPM_MIN = 60;
export const BPM_MAX = 220;
export const BPM_DEFAULT = 100;

export const DEFAULT_VOLUMES = {
  conga: 0.8,
  cowbell: 0.7,
  voice: 0.9,
};
