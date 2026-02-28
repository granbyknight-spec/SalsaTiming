// ---------------------------------------------------------------------------
// sequencer.ts — Tone.js-based salsa rhythm sequencer
//
// All timing is driven exclusively by Tone.Transport (no setInterval).
// Percussion uses Tone.js synthesizers (MetalSynth / MembraneSynth) so there
// are ZERO file-loading dependencies for rhythm tracks.
// Voice samples degrade gracefully: if a voice file is not loaded yet the
// step is silently skipped.
// ---------------------------------------------------------------------------

import * as Tone from 'tone';
import {
  cowbellPattern,
  congaPattern,
  voicePatterns,
  VOICE_FILE_MAP,
  type TimingMode,
} from './patterns';
import { appStore } from '../store/appStore';

// ---- Constants ------------------------------------------------------------

const SAMPLE_BASE = 'assets/samples';

const MIN_BPM = 60;
const MAX_BPM = 220;
const TOTAL_STEPS = 16;

// ---- Module state ---------------------------------------------------------

/** Percussion synths (no file loading required) */
let cowbellSynth: Tone.MetalSynth | null = null;
let congaSlapSynth: Tone.MembraneSynth | null = null;
let congaOpenSynth: Tone.MembraneSynth | null = null;

/** Voice players keyed by the raw cue string ('1', '&1', etc.) */
const voicePlayers: Map<string, Tone.Player> = new Map();

/** Gain nodes for per-track volume control */
let cowbellGain: Tone.Gain | null = null;
let congaGain: Tone.Gain | null = null;
let voiceGain: Tone.Gain | null = null;

/** The running Tone.Sequence instance (if any) */
let sequence: Tone.Sequence | null = null;

/** Current step index (0-15), updated each tick */
let currentStep = 0;

/** Whether initSequencer() has completed successfully */
let initialized = false;

/** Whether voice samples have been loaded */
let voiceSamplesReady = false;

// ---- Helpers --------------------------------------------------------------

function clampBPM(bpm: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
}

/**
 * Attempt to load a single Tone.Player.
 * Returns the player on success, or null if the file is missing / fails.
 */
async function safeLoadPlayer(url: string): Promise<Tone.Player | null> {
  try {
    const player = new Tone.Player();
    await player.load(url);
    return player;
  } catch {
    console.warn(`[sequencer] could not load sample: ${url}`);
    return null;
  }
}

// ---- Initialisation -------------------------------------------------------

/**
 * Create percussion synthesizers and wire up gain nodes.
 * Call once at app boot (does not require user gesture).
 */
export async function initSequencer(): Promise<void> {
  if (initialized) return;

  // --- Gain nodes (connect to master output) ---
  cowbellGain = new Tone.Gain(1).toDestination();
  congaGain = new Tone.Gain(1).toDestination();
  voiceGain = new Tone.Gain(1).toDestination();

  // --- Percussion synths (no file loading!) ---
  cowbellSynth = new Tone.MetalSynth({
    frequency: 800,
    envelope: { attack: 0.001, decay: 0.15, release: 0.05 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
    volume: -10,
  });
  cowbellSynth.connect(cowbellGain);

  congaSlapSynth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
    volume: -8,
  });
  congaSlapSynth.connect(congaGain);

  congaOpenSynth = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.1 },
    volume: -8,
  });
  congaOpenSynth.connect(congaGain);

  // --- Voice samples (file-based, graceful degradation) ---
  await loadVoiceSamples();

  // --- Wait for any voice buffers to finish decoding ---
  try {
    await Tone.loaded();
  } catch {
    console.warn('[sequencer] Tone.loaded() failed — some voice samples may be missing');
  }

  initialized = true;
}

/**
 * Load voice cue samples from the assets/samples directory.
 * Each entry in VOICE_FILE_MAP becomes a Tone.Player keyed by the cue string.
 * These are the espeak fallback files shipped with the app.
 */
async function loadVoiceSamples(): Promise<void> {
  const entries = Object.entries(VOICE_FILE_MAP);
  const results = await Promise.allSettled(
    entries.map(async ([cue, filename]) => {
      const url = `${SAMPLE_BASE}/${filename}.mp3`;
      const player = await safeLoadPlayer(url);
      if (player && voiceGain) {
        player.connect(voiceGain);
        voicePlayers.set(cue, player);
      }
    }),
  );

  // Consider voice ready if at least one file loaded successfully
  voiceSamplesReady =
    results.some((r) => r.status === 'fulfilled') && voicePlayers.size > 0;
}

/**
 * Load voice samples from externally-provided blob URLs (e.g. browser-cached
 * ElevenLabs audio). Replaces any previously loaded voice players for the
 * given cue strings.
 *
 * @param urls — Map where keys are cue strings ('1', '2', '&1', etc.)
 *               and values are blob URLs (e.g. blob:http://…)
 */
export async function loadVoiceFromUrls(urls: Map<string, string>): Promise<void> {
  const results = await Promise.allSettled(
    Array.from(urls.entries()).map(async ([cue, blobUrl]) => {
      // Dispose of any existing player for this cue
      const existing = voicePlayers.get(cue);
      if (existing) {
        existing.dispose();
        voicePlayers.delete(cue);
      }

      const player = await safeLoadPlayer(blobUrl);
      if (player && voiceGain) {
        player.connect(voiceGain);
        voicePlayers.set(cue, player);
      }
    }),
  );

  // Update readiness — voice is ready if we have at least one player
  voiceSamplesReady =
    results.some((r) => r.status === 'fulfilled') && voicePlayers.size > 0;

  // Ensure new buffers are decoded
  try {
    await Tone.loaded();
  } catch {
    console.warn('[sequencer] Tone.loaded() failed after loading voice blob URLs');
  }
}

// ---- Sequence callback ----------------------------------------------------

/**
 * Called by Tone.Sequence on every 16th-note subdivision.
 * Reads the *current* mode from the store so mode switches take effect
 * immediately on the next step without restarting transport.
 */
function onStep(time: number, stepIndex: number): void {
  currentStep = stepIndex;

  // Push current step to the store so the UI BeatIndicator can reflect it
  appStore.getState().setCurrentStep(stepIndex);

  const { mode, volumes } = appStore.getState();

  // --- Apply volumes (cheap to set every step) ---
  if (cowbellGain && volumes?.cowbell !== undefined) {
    cowbellGain.gain.value = volumes.cowbell;
  }
  if (congaGain && volumes?.conga !== undefined) {
    congaGain.gain.value = volumes.conga;
  }
  if (voiceGain && volumes?.voice !== undefined) {
    voiceGain.gain.value = volumes.voice;
  }

  // --- Cowbell (MetalSynth) ---
  const cowbellHit = cowbellPattern[stepIndex];
  if (cowbellHit && cowbellSynth) {
    cowbellSynth.triggerAttackRelease('16n', time);
  }

  // --- Conga (MembraneSynth) ---
  const congaHit = congaPattern[stepIndex];
  if (congaHit === 'slap' && congaSlapSynth) {
    congaSlapSynth.triggerAttackRelease('C4', '16n', time);
  } else if (congaHit === 'open' && congaOpenSynth) {
    congaOpenSynth.triggerAttackRelease('G3', '16n', time);
  }

  // --- Voice (mode-aware, gracefully skips if not loaded) ---
  const currentMode: TimingMode = mode ?? 'on1';
  const voiceHit = voicePatterns[currentMode]?.[stepIndex];
  if (voiceHit && voiceSamplesReady) {
    const player = voicePlayers.get(voiceHit);
    if (player?.loaded) {
      player.start(time);
    }
  }
}

// ---- Public API -----------------------------------------------------------

/**
 * Start the sequencer. Must be called from a user-gesture handler
 * (Tone.start() requires it for the AudioContext to resume).
 */
export async function startSequencer(): Promise<void> {
  // Resume / unlock the audio context (user-gesture requirement)
  await Tone.start();

  if (!initialized) {
    await initSequencer();
  }

  // Ensure all loaded buffers are decoded
  try {
    await Tone.loaded();
  } catch {
    // Non-fatal — we can still play whatever is loaded
  }

  // Set initial BPM from store
  const { bpm } = appStore.getState();
  Tone.getTransport().bpm.value = clampBPM(bpm ?? 180);

  // Tear down any previous sequence
  if (sequence) {
    sequence.dispose();
    sequence = null;
  }

  // Build a new 16-step sequence on '16n' subdivision
  const stepIndices = Array.from({ length: TOTAL_STEPS }, (_, i) => i);
  sequence = new Tone.Sequence(onStep, stepIndices, '16n');
  sequence.loop = true;
  sequence.start(0);

  Tone.getTransport().start();
}

/**
 * Stop the sequencer and reset the step counter.
 */
export function stopSequencer(): void {
  Tone.getTransport().stop();

  if (sequence) {
    sequence.stop();
    sequence.dispose();
    sequence = null;
  }

  currentStep = 0;
  appStore.getState().setCurrentStep(0);
}

/**
 * Update BPM on the fly. Clamped to 60-220.
 */
export function updateBPM(bpm: number): void {
  Tone.getTransport().bpm.value = clampBPM(bpm);
}

/**
 * Switch timing mode. The change is picked up on the very next step callback
 * because onStep reads the mode from the store each tick.
 *
 * This function updates the store so the mode change propagates to both the
 * sequencer (via onStep reading getState()) and any React UI subscribed to
 * the store.
 */
export function setMode(mode: TimingMode): void {
  appStore.setState({ mode });
}

/**
 * Apply volume levels immediately.
 * @param volumes — object with optional keys: cowbell, conga, voice (0-1)
 */
export function updateVolumes(volumes: {
  cowbell?: number;
  conga?: number;
  voice?: number;
}): void {
  if (cowbellGain && volumes.cowbell !== undefined) {
    cowbellGain.gain.value = volumes.cowbell;
  }
  if (congaGain && volumes.conga !== undefined) {
    congaGain.gain.value = volumes.conga;
  }
  if (voiceGain && volumes.voice !== undefined) {
    voiceGain.gain.value = volumes.voice;
  }
}

/**
 * Returns the current step index (0-15).
 */
export function getCurrentStep(): number {
  return currentStep;
}
