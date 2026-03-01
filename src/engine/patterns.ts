// ---------------------------------------------------------------------------
// patterns.ts — Salsa rhythm patterns on a 16-step grid
// Grid positions 0-15 map to: [1, &, 2, &, 3, &, 4, &, 5, &, 6, &, 7, &, 8, &]
// ---------------------------------------------------------------------------

/** A single hit descriptor (instrument-specific string) or null for silence. */
export type Hit = string | null;

/** A full 16-step pattern. */
export type Pattern = Hit[];

/** Supported timing / dance modes. */
export type TimingMode = 'on1' | 'on2_son' | 'on2_soft_mambo' | 'on2_hard_mambo';

// ---------------------------------------------------------------------------
// Cowbell — hits on beats 1, 3, 5, 7 (grid positions 0, 4, 8, 12)
// ---------------------------------------------------------------------------
export const cowbellPattern: Pattern = [
  'hit',  null, null, null,   // 1  &  2  &
  'hit',  null, null, null,   // 3  &  4  &
  'hit',  null, null, null,   // 5  &  6  &
  'hit',  null, null, null,   // 7  &  8  &
];

// ---------------------------------------------------------------------------
// Conga — slap on 2 and 6, open-open ("cu-cu") on 8 and &8
// ---------------------------------------------------------------------------
export const congaPattern: Pattern = [
  null,   null, 'slap', null,   // 1  &  2  &
  null,   null,  null,  null,   // 3  &  4  &
  null,   null, 'slap', null,   // 5  &  6  &
  null,   null, 'open', 'open', // 7  &  8  &
];

// ---------------------------------------------------------------------------
// Voice patterns — one per timing mode
// ---------------------------------------------------------------------------
export const voicePatterns: Record<TimingMode, Pattern> = {
  /**
   * On1 (LA style): step on 1-2-3, pause 4, step on 5-6-7, pause 8
   */
  on1: [
    '1',  null, '2', null, '3', null, null, null,
    '5',  null, '6', null, '7', null, null, null,
  ],

  /**
   * On2 Son (classic NY Son timing): step on 2-3-4, pause, step on 6-7-8
   */
  on2_son: [
    null, null, '2', null, '3', null, '4', null,
    null, null, '6', null, '7', null, '8', null,
  ],

  /**
   * On2 Soft Mambo (Eddie Torres style):
   * Full counting phrases — a single audio file plays the entire count.
   * '&123' = "and one, two, three" triggered at position 0.
   * '&567' = "and five, six, seven" triggered at position 8.
   * The phrase plays naturally over the beats without being cut off.
   */
  on2_soft_mambo: [
    '&123', null, null, null, null, null, null, null,
    '&567', null, null, null, null, null, null, null,
  ],

  /**
   * On2 Hard Mambo (Palladium / power-on-2):
   * Same count words as On1 but the relationship to the music shifts.
   */
  on2_hard_mambo: [
    '1',  null, '2', null, '3', null, null, null,
    '5',  null, '6', null, '7', null, null, null,
  ],
};

// ---------------------------------------------------------------------------
// Voice file map — maps each voice cue string to its audio filename
// (without extension; the sequencer appends .mp3)
// ---------------------------------------------------------------------------
export const VOICE_FILE_MAP: Record<string, string> = {
  '1':    'voice_one',
  '2':    'voice_two',
  '3':    'voice_three',
  '4':    'voice_four',
  '5':    'voice_five',
  '6':    'voice_six',
  '7':    'voice_seven',
  '8':    'voice_eight',
  '&1':   'voice_and_one',
  '&5':   'voice_and_five',
  '&123': 'voice_and_one_two_three',
  '&567': 'voice_and_five_six_seven',
};

// ---------------------------------------------------------------------------
// Voice emphasis — gain multiplier per mode per cue.
// Cues not listed default to 1.0 (no change).
// Values > 1.0 create a "spike" — louder than surrounding counts.
// ---------------------------------------------------------------------------
export const voiceEmphasis: Partial<Record<TimingMode, Record<string, number>>> = {
  // Soft mambo uses full phrases now — no per-cue emphasis needed
};

// ---------------------------------------------------------------------------
// Per-cue playback speed multiplier (stacks on top of tempo scaling).
// Compound cues like "&1" / "&5" must be spoken faster so they finish
// before the next beat arrives.
// ---------------------------------------------------------------------------
export const VOICE_SPEED_OVERRIDES: Record<string, number> = {
  '&1': 1.05,
  '&5': 1.05,
};

// ---------------------------------------------------------------------------
// Voice speed tiers — pre-generated at different ElevenLabs speaking speeds.
//
// Strategy: instead of using GrainPlayer (which creates "orc" artifacts on
// short speech cues), we pre-generate each word at 3 speaking speeds via the
// ElevenLabs API. At runtime, Tone.Player (plain sample playback) selects the
// closest tier and applies only a small residual playbackRate adjustment.
//
// The residual pitch shift is kept to ~15% max, which is barely noticeable
// for short rhythmic speech cues. This eliminates granular synthesis artifacts
// entirely.
//
// Tier reference BPMs are derived from the ElevenLabs generation speed:
//   referenceBpm = 135 * (generationSpeed / 1.15)
// where 135 BPM is the natural tempo for speed=1.15 (the normal tier).
//
// BPM range boundaries are set at the geometric midpoints between tiers:
//   slow/normal boundary: sqrt(105 * 135) = ~119
//   normal/fast boundary: sqrt(135 * 176) = ~154 (using 170 for rounder number)
// ---------------------------------------------------------------------------
export interface VoiceTier {
  name: string;
  suffix: string;       // filename suffix: '' | '_slow' | '_fast'
  referenceBpm: number; // BPM at which this tier plays at rate 1.0
  maxBpm: number;       // use this tier up to (but not including) this BPM
}

export const VOICE_TIERS: VoiceTier[] = [
  { name: 'slow',   suffix: '_slow', referenceBpm: 105, maxBpm: 120 },
  { name: 'normal', suffix: '',      referenceBpm: 135, maxBpm: 170 },
  { name: 'fast',   suffix: '_fast', referenceBpm: 176, maxBpm: Infinity },
];

/** Pick the best voice tier for a given BPM. */
export function getVoiceTier(bpm: number): VoiceTier {
  for (const tier of VOICE_TIERS) {
    if (bpm < tier.maxBpm) return tier;
  }
  return VOICE_TIERS[VOICE_TIERS.length - 1];
}

/**
 * Compute the playbackRate for Tone.Player given a BPM, selected tier, and
 * optional cue string (for compound-cue speed overrides).
 *
 * Typical output range: 0.86x - 1.15x (imperceptible pitch shift for speech).
 * Hard-clamped to 0.75x - 1.30x to prevent obviously wrong playback.
 */
export function computePlaybackRate(bpm: number, tier: VoiceTier, cue?: string): number {
  let rate = bpm / tier.referenceBpm;

  // Extra speed for compound cues (&1, &5) so they finish before the next beat
  if (cue) {
    const override = VOICE_SPEED_OVERRIDES[cue];
    if (override) rate *= override;
  }

  return Math.max(0.75, Math.min(rate, 1.30));
}

/**
 * Build the player map key for a given tier and cue.
 * Format: "suffix:cue" e.g. ":1", "_slow:&5", "_fast:2"
 */
export function voicePlayerKey(tier: VoiceTier, cue: string): string {
  return `${tier.suffix}:${cue}`;
}
