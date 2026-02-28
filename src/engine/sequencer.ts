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
  voiceEmphasis,
  VOICE_SPEED_OVERRIDES,
  VOICE_REFERENCE_BPM,
  type TimingMode,
} from './patterns';
import { appStore } from '../store/appStore';

// ---- Constants ------------------------------------------------------------

const SAMPLE_BASE = 'assets/samples';

const MIN_BPM = 60;
const MAX_BPM = 220;
const TOTAL_STEPS = 16;

// ---- Module state ---------------------------------------------------------

/** Percussion — cowbell is synthesized, congas use samples */
let cowbellSynth: Tone.MetalSynth | null = null;
let congaSlapPlayer: Tone.Player | null = null;
let congaOpenPlayer: Tone.Player | null = null;

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

/** Diagnostic log visible in the UI (since user has no console access) */
const _diagLog: string[] = [];
function diag(msg: string): void {
  const ts = new Date().toLocaleTimeString();
  _diagLog.push(`[${ts}] ${msg}`);
  if (_diagLog.length > 30) _diagLog.shift();
}

/** Read-only access to diagnostic log from UI */
export function getDiagLog(): readonly string[] {
  return _diagLog;
}

/** Get a snapshot of internal state for the debug panel */
export function getDebugState(): Record<string, string> {
  return {
    audioContextState: Tone.getContext().state,
    transportState: Tone.getTransport().state,
    initialized: String(initialized),
    cowbellSynth: cowbellSynth ? 'created' : 'null',
    congaSlapPlayer: congaSlapPlayer?.loaded ? 'loaded' : (congaSlapPlayer ? 'loading' : 'null'),
    congaOpenPlayer: congaOpenPlayer?.loaded ? 'loaded' : (congaOpenPlayer ? 'loading' : 'null'),
    voicePlayers: `${voicePlayers.size} loaded`,
    voiceSamplesReady: String(voiceSamplesReady),
    currentStep: String(currentStep),
    sequence: sequence ? 'active' : 'null',
    bpm: String(Tone.getTransport().bpm.value.toFixed(1)),
  };
}

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

  // --- Conga samples (real recordings instead of MembraneSynth) ---
  const slapPlayer = await safeLoadPlayer(`${SAMPLE_BASE}/conga_slap.wav`);
  if (slapPlayer && congaGain) {
    slapPlayer.connect(congaGain);
    congaSlapPlayer = slapPlayer;
    diag('Conga slap sample loaded');
  } else {
    diag('WARNING: conga_slap.wav failed to load');
  }

  const openPlayer = await safeLoadPlayer(`${SAMPLE_BASE}/conga_open.wav`);
  if (openPlayer && congaGain) {
    openPlayer.connect(congaGain);
    congaOpenPlayer = openPlayer;
    diag('Conga open sample loaded');
  } else {
    diag('WARNING: conga_open.wav failed to load');
  }

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
let _stepCount = 0;
function onStep(time: number, stepIndex: number): void {
  currentStep = stepIndex;
  _stepCount++;
  // Log first few steps to confirm the callback is firing
  if (_stepCount <= 3) {
    diag(`onStep fired: step=${stepIndex} time=${time.toFixed(3)} (call #${_stepCount})`);
  }

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

  // --- Conga (sample-based) ---
  const congaHit = congaPattern[stepIndex];
  if (congaHit === 'slap' && congaSlapPlayer?.loaded) {
    congaSlapPlayer.start(time);
  } else if (congaHit === 'open' && congaOpenPlayer?.loaded) {
    congaOpenPlayer.start(time);
  }

  // --- Voice (mode-aware, tempo-adaptive, with emphasis) ---
  const currentMode: TimingMode = mode ?? 'on1';
  const voiceHit = voicePatterns[currentMode]?.[stepIndex];
  if (voiceHit && voiceSamplesReady) {
    const player = voicePlayers.get(voiceHit);
    if (player?.loaded) {
      // Tempo-adaptive playback rate: scale voice speed with BPM
      const currentBpm = Tone.getTransport().bpm.value;
      let rate = currentBpm / VOICE_REFERENCE_BPM;

      // Extra speed for compound cues (&1, &5) so they don't bleed
      const speedOverride = VOICE_SPEED_OVERRIDES[voiceHit];
      if (speedOverride) {
        rate *= speedOverride;
      }

      player.playbackRate = rate;

      // Emphasis: temporarily boost voice gain for "spike" beats (e.g. 2 & 6)
      const emphasis = voiceEmphasis[currentMode]?.[voiceHit] ?? 1.0;
      if (voiceGain && emphasis !== 1.0) {
        const baseVol = volumes?.voice ?? 0.9;
        voiceGain.gain.setValueAtTime(baseVol * emphasis, time);
        // Reset after one 16th note
        const sixteenthSec = 60 / currentBpm / 4;
        voiceGain.gain.setValueAtTime(baseVol, time + sixteenthSec);
      }

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
  diag('startSequencer() called');
  diag(`AudioContext state BEFORE Tone.start(): ${Tone.getContext().state}`);

  // Resume / unlock the audio context (user-gesture requirement)
  try {
    await Tone.start();
    diag(`AudioContext state AFTER Tone.start(): ${Tone.getContext().state}`);
  } catch (err) {
    diag(`Tone.start() THREW: ${err}`);
    throw err;
  }

  if (!initialized) {
    diag('Calling initSequencer()...');
    try {
      await initSequencer();
      diag(`initSequencer() done. cowbell=${!!cowbellSynth} congaSlap=${!!congaSlapPlayer} congaOpen=${!!congaOpenPlayer}`);
    } catch (err) {
      diag(`initSequencer() THREW: ${err}`);
      throw err;
    }
  }

  // Ensure all loaded buffers are decoded
  try {
    await Tone.loaded();
  } catch {
    diag('Tone.loaded() failed (non-fatal)');
  }

  // Set initial BPM from store
  const { bpm } = appStore.getState();
  const clampedBpm = clampBPM(bpm ?? 180);
  Tone.getTransport().bpm.value = clampedBpm;
  diag(`BPM set to ${clampedBpm}`);

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
  diag('Sequence created and started');

  Tone.getTransport().start();
  diag(`Transport started. State: ${Tone.getTransport().state}`);
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
