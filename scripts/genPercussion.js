#!/usr/bin/env node
/**
 * genPercussion.js — Generates real percussion WAV files using raw Buffer manipulation.
 *
 * Produces:
 *   cowbell.wav   — Two mixed sine waves (587Hz + 845Hz), sharp exponential decay
 *   conga_slap.wav — Short noise burst with bandpass-like filtering, very short decay
 *   conga_open.wav — Low-frequency drum tone with harmonics, longer decay
 *
 * Format: 16-bit PCM WAV, 44100 Hz, mono, 0.5s duration each.
 * No external dependencies required.
 */

const fs = require('fs');
const path = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const DURATION = 0.5;          // seconds
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION);
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

// Output directories
const OUTPUT_DIRS = [
  path.resolve(__dirname, '..', 'assets', 'samples'),
  path.resolve(__dirname, '..', 'docs', 'assets', 'samples'),
];

// ─── WAV Writer ──────────────────────────────────────────────────────────────

/**
 * Creates a 16-bit PCM WAV file buffer from an array of float samples in [-1, 1].
 */
function createWavBuffer(samples) {
  const dataSize = samples.length * 2; // 16-bit = 2 bytes per sample
  const headerSize = 44;
  const fileSize = headerSize + dataSize;
  const buf = Buffer.alloc(fileSize);

  let offset = 0;

  // RIFF header
  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;

  // fmt  sub-chunk
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;            // Sub-chunk size (PCM = 16)
  buf.writeUInt16LE(1, offset); offset += 2;             // Audio format (1 = PCM)
  buf.writeUInt16LE(NUM_CHANNELS, offset); offset += 2;  // Num channels
  buf.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;   // Sample rate
  buf.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE / 8, offset); offset += 4; // Byte rate
  buf.writeUInt16LE(NUM_CHANNELS * BITS_PER_SAMPLE / 8, offset); offset += 2; // Block align
  buf.writeUInt16LE(BITS_PER_SAMPLE, offset); offset += 2; // Bits per sample

  // data sub-chunk
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  // Write PCM sample data
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    const intVal = s < 0 ? Math.max(-32768, Math.floor(s * 32768)) : Math.min(32767, Math.floor(s * 32767));
    buf.writeInt16LE(intVal, offset);
    offset += 2;
  }

  return buf;
}

// ─── Envelope Helpers ────────────────────────────────────────────────────────

/**
 * Attack-decay envelope using exponential curves.
 * @param {number} t - Time in seconds
 * @param {number} attack - Attack time in seconds
 * @param {number} decay - Decay time constant in seconds
 * @returns {number} Envelope value [0, 1]
 */
function attackDecayEnvelope(t, attack, decay) {
  let env;
  if (t < attack) {
    // Linear attack ramp
    env = t / attack;
  } else {
    // Exponential decay from the end of the attack
    env = Math.exp(-(t - attack) / decay);
  }
  return env;
}

// ─── Sound Generators ────────────────────────────────────────────────────────

/**
 * Cowbell: Two mixed sine waves at 587Hz and 845Hz with sharp exponential decay.
 * Attack ~2ms, decay ~150ms. Amplitude ~0.6.
 */
function generateCowbell() {
  const samples = new Float64Array(NUM_SAMPLES);
  const freq1 = 587;
  const freq2 = 845;
  const attack = 0.002;   // 2ms
  const decay = 0.050;    // decay time constant (~150ms to silence with exp)
  const amplitude = 0.6;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const env = attackDecayEnvelope(t, attack, decay);

    // Two sine waves mixed equally
    const wave1 = Math.sin(2 * Math.PI * freq1 * t);
    const wave2 = Math.sin(2 * Math.PI * freq2 * t);

    // Mix at roughly equal levels; the inharmonic relationship gives metallic timbre
    samples[i] = amplitude * env * (0.5 * wave1 + 0.5 * wave2);

    // Add a slight square-ish character by soft-clipping
    samples[i] = Math.tanh(samples[i] * 2.0) * 0.5;
  }

  return samples;
}

/**
 * Conga Slap: Short noise burst filtered through a bandpass-like shape.
 * Very short attack (~1ms), short decay (~80ms). Higher frequency emphasis.
 */
function generateCongaSlap() {
  const samples = new Float64Array(NUM_SAMPLES);
  const attack = 0.001;   // 1ms
  const decay = 0.025;    // fast decay constant for ~80ms effective envelope
  const amplitude = 0.7;

  // We'll generate noise and apply a simple one-pole highpass + lowpass to
  // create a bandpass effect, then shape with the envelope.
  // Bandpass center approx 1500-3000 Hz range for slap character.

  // Generate raw white noise first
  const noise = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    noise[i] = (Math.random() * 2 - 1);
  }

  // Simple biquad-style bandpass via cascaded one-pole filters
  // Highpass: cutoff ~800Hz
  const hpAlpha = 0.9;  // high value = more high-pass
  let hpPrev = 0;
  let hpPrevIn = 0;
  const highpassed = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    highpassed[i] = hpAlpha * (hpPrev + noise[i] - hpPrevIn);
    hpPrevIn = noise[i];
    hpPrev = highpassed[i];
  }

  // Lowpass: cutoff ~5000Hz
  const lpCutoff = 5000;
  const lpRC = 1.0 / (2 * Math.PI * lpCutoff);
  const lpDt = 1.0 / SAMPLE_RATE;
  const lpAlpha = lpDt / (lpRC + lpDt);
  let lpPrev = 0;
  const bandpassed = new Float64Array(NUM_SAMPLES);
  for (let i = 0; i < NUM_SAMPLES; i++) {
    lpPrev = lpPrev + lpAlpha * (highpassed[i] - lpPrev);
    bandpassed[i] = lpPrev;
  }

  // Add a subtle tonal "pop" component for realism — a short sine burst
  const popFreq = 800;
  const popDecay = 0.015;

  // Apply envelope and mix
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const env = attackDecayEnvelope(t, attack, decay);
    const popEnv = attackDecayEnvelope(t, attack, popDecay);

    const noiseComponent = bandpassed[i] * env;
    const popComponent = 0.3 * Math.sin(2 * Math.PI * popFreq * t) * popEnv;

    samples[i] = amplitude * (noiseComponent + popComponent);

    // Soft clip to prevent harsh digital artifacts
    samples[i] = Math.tanh(samples[i] * 1.5) * 0.7;
  }

  return samples;
}

/**
 * Conga Open: Low-frequency drum tone (~200Hz fundamental with harmonics at 400Hz, 600Hz).
 * Longer decay (~300ms), moderate attack (~3ms).
 */
function generateCongaOpen() {
  const samples = new Float64Array(NUM_SAMPLES);
  const fundamental = 200;
  const attack = 0.003;   // 3ms
  const decay = 0.100;    // decay time constant for ~300ms effective envelope
  const amplitude = 0.65;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const env = attackDecayEnvelope(t, attack, decay);

    // Fundamental and two harmonics with decreasing amplitude
    const f1 = Math.sin(2 * Math.PI * fundamental * t);
    const f2 = Math.sin(2 * Math.PI * (fundamental * 2) * t);
    const f3 = Math.sin(2 * Math.PI * (fundamental * 3) * t);

    // Mix: fundamental is strongest, harmonics add body
    const wave = 0.6 * f1 + 0.25 * f2 + 0.15 * f3;

    // Add a very short initial transient/click for attack realism
    let transient = 0;
    if (t < 0.010) {
      const transientEnv = attackDecayEnvelope(t, 0.001, 0.003);
      transient = 0.3 * (Math.random() * 2 - 1) * transientEnv;
    }

    samples[i] = amplitude * (env * wave + transient);
  }

  return samples;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Generating percussion WAV files...\n');

  const sounds = [
    { name: 'cowbell.wav', generator: generateCowbell },
    { name: 'conga_slap.wav', generator: generateCongaSlap },
    { name: 'conga_open.wav', generator: generateCongaOpen },
  ];

  for (const { name, generator } of sounds) {
    console.log(`  Synthesizing ${name}...`);
    const samples = generator();
    const wavBuffer = createWavBuffer(samples);

    for (const dir of OUTPUT_DIRS) {
      // Ensure directory exists
      fs.mkdirSync(dir, { recursive: true });

      const filePath = path.join(dir, name);
      fs.writeFileSync(filePath, wavBuffer);
      console.log(`    Written: ${filePath} (${wavBuffer.length} bytes)`);
    }
    console.log();
  }

  // ─── Verification ───────────────────────────────────────────────────────
  const crypto = require('crypto');
  console.log('Verification:');
  const hashes = {};
  for (const dir of OUTPUT_DIRS) {
    console.log(`\n  Directory: ${dir}`);
    for (const { name } of sounds) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const data = fs.readFileSync(filePath);
        const hash = crypto.createHash('md5').update(data).digest('hex').slice(0, 12);
        // Read max sample amplitude to confirm non-silence
        let maxAbs = 0;
        for (let i = 44; i < data.length - 1; i += 2) {
          const val = Math.abs(data.readInt16LE(i));
          if (val > maxAbs) maxAbs = val;
        }
        const pct = (maxAbs / 32767 * 100).toFixed(1);
        console.log(`    ${name}: ${stat.size} bytes, hash=${hash}, peak=${pct}%`);
        hashes[name] = hash;
      } else {
        console.error(`    ERROR: ${name} does not exist!`);
      }
    }
  }

  // Verify files contain distinct audio (different hashes)
  const uniqueHashes = new Set(Object.values(hashes));
  if (uniqueHashes.size === Object.keys(hashes).length) {
    console.log(`\n  OK: All ${Object.keys(hashes).length} files have unique content (distinct hashes).`);
  } else if (uniqueHashes.size === 1) {
    console.error('\n  ERROR: All files are identical — generation failed.');
  } else {
    console.log(`\n  OK: ${uniqueHashes.size} distinct files out of ${Object.keys(hashes).length}.`);
  }

  console.log('\nDone.');
}

main();
