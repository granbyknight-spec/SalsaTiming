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
  VOICE_TIERS,
  getVoiceTier,
  computePlaybackRate,
  voicePlayerKey,
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

/** Voice players keyed by "tierSuffix:cue" (e.g. ":1", "_slow:1", "_fast:&5") */
const voicePlayers: Map<string, Tone.Player> = new Map();

/** Gain nodes for per-track volume control */
let cowbellGain: Tone.Gain | null = null;
let congaGain: Tone.Gain | null = null;
let voiceGain: Tone.Gain | null = null;

/** The running Tone.Sequence instance (if any) */
let sequence: Tone.Sequence | null = null;

/** Current step index (0-15), updated each tick */
let currentStep = 0;

/** Last voice player that was triggered — used to cut off tails before the next cue */
let lastVoicePlayer: Tone.Player | null = null;

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

  // --- Conga samples (ElevenLabs SFX .mp3, falls back to synth .wav) ---
  for (const ext of ['mp3', 'wav']) {
    if (!congaSlapPlayer) {
      const p = await safeLoadPlayer(`${SAMPLE_BASE}/conga_slap.${ext}`);
      if (p && congaGain) {
        p.connect(congaGain);
        congaSlapPlayer = p;
        diag(`Conga slap loaded (${ext})`);
      }
    }
    if (!congaOpenPlayer) {
      const p = await safeLoadPlayer(`${SAMPLE_BASE}/conga_open.${ext}`);
      if (p && congaGain) {
        p.connect(congaGain);
        congaOpenPlayer = p;
        diag(`Conga open loaded (${ext})`);
      }
    }
  }
  if (!congaSlapPlayer) diag('WARNING: no conga slap sample found');
  if (!congaOpenPlayer) diag('WARNING: no conga open sample found');

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
 * Load voice cue samples from assets/samples for all speed tiers.
 * Files follow the pattern: voice_one.mp3 (normal), voice_one_slow.mp3, voice_one_fast.mp3
 */
async function loadVoiceSamples(): Promise<void> {
  const entries = Object.entries(VOICE_FILE_MAP);
  const loadPromises: Promise<void>[] = [];

  for (const tier of VOICE_TIERS) {
    for (const [cue, filename] of entries) {
      loadPromises.push(
        (async () => {
          const url = `${SAMPLE_BASE}/${filename}${tier.suffix}.mp3`;
          const player = await safeLoadPlayer(url);
          if (player && voiceGain) {
            player.connect(voiceGain);
            voicePlayers.set(voicePlayerKey(tier, cue), player);
          }
        })(),
      );
    }
  }

  const results = await Promise.allSettled(loadPromises);
  voiceSamplesReady =
    results.some((r) => r.status === 'fulfilled') && voicePlayers.size > 0;
  diag(`Voice samples loaded: ${voicePlayers.size} players across ${VOICE_TIERS.length} tiers`);
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
  // Blob URLs from browser cache are single-tier — load into all tier slots
  // so they work regardless of BPM (with some pitch shift at extremes)
  const normalTier = VOICE_TIERS.find((t) => t.suffix === '') ?? VOICE_TIERS[0];
  const results = await Promise.allSettled(
    Array.from(urls.entries()).map(async ([cue, blobUrl]) => {
      // Load into all tier slots so tier selection always finds something
      for (const tier of VOICE_TIERS) {
        const key = voicePlayerKey(tier, cue);
        const existing = voicePlayers.get(key);
        if (existing) {
          existing.dispose();
          voicePlayers.delete(key);
        }
      }

      const player = await safeLoadPlayer(blobUrl);
      if (player && voiceGain) {
        player.connect(voiceGain);
        // Put in normal tier; other tiers fall back to this
        voicePlayers.set(voicePlayerKey(normalTier, cue), player);
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

  // --- Voice (mode-aware, tier-based tempo adaptation) ---
  const currentMode: TimingMode = mode ?? 'on1';
  const voiceHit = voicePatterns[currentMode]?.[stepIndex];
  if (voiceHit && voiceSamplesReady) {
    const currentBpm = Tone.getTransport().bpm.value;
    const tier = getVoiceTier(currentBpm);

    // Try the best tier, fall back to normal tier if missing
    let player = voicePlayers.get(voicePlayerKey(tier, voiceHit));
    let activeTier = tier;
    if (!player?.loaded) {
      const normalTier = VOICE_TIERS.find((t) => t.suffix === '');
      if (normalTier) {
        player = voicePlayers.get(voicePlayerKey(normalTier, voiceHit));
        activeTier = normalTier;
      }
    }

    if (player?.loaded) {
      // Playback rate: ratio of current BPM to the tier's reference BPM.
      // Within a tier the ratio stays close to 1.0, so pitch shift is minimal.
      player.playbackRate = computePlaybackRate(currentBpm, activeTier, voiceHit);

      // Emphasis: per-player volume (dB) — avoids clipping on shared gain node
      const emphasis = voiceEmphasis[currentMode]?.[voiceHit] ?? 1.0;
      player.volume.value = emphasis !== 1.0 ? 20 * Math.log10(emphasis) : 0;

      // Stop the previous voice cue so tails don't bleed under the new one
      if (lastVoicePlayer && lastVoicePlayer !== player) {
        lastVoicePlayer.stop(time);
      }
      player.start(time);
      lastVoicePlayer = player;
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
