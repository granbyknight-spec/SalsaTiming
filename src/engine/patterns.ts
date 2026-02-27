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
   * '&1' is a single audio cue ("and-one") triggered at position 0.
   * '&5' is a single audio cue ("and-five") triggered at position 8.
   * These are single audio files containing the full phrase.
   */
  on2_soft_mambo: [
    '&1', null, '2', null, '3', null, null, null,
    '&5', null, '6', null, '7', null, null, null,
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
  '1':  'voice_one',
  '2':  'voice_two',
  '3':  'voice_three',
  '4':  'voice_four',
  '5':  'voice_five',
  '6':  'voice_six',
  '7':  'voice_seven',
  '8':  'voice_eight',
  '&1': 'voice_and_one',
  '&5': 'voice_and_five',
};
