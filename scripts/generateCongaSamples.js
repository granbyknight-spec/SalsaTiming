#!/usr/bin/env node
// ---------------------------------------------------------------------------
// generateCongaSamples.js — Generate conga drum samples via ElevenLabs SFX API
//
// Uses the ElevenLabs Sound Effects API (v1/sound-generation) to create
// realistic conga drum hits. Generated once, committed to the repo.
//
// Usage:
//   node scripts/generateCongaSamples.js                        # reads ELEVENLABS_API_KEY from env
//   node scripts/generateCongaSamples.js --key sk-xxxxxxxxxxxx  # pass key as CLI arg
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * Each conga sound we want to generate.
 * "text" is the prompt sent to the Sound Effects API.
 * "filename" is what gets saved to disk.
 */
const CONGA_SOUNDS = [
  {
    name: 'conga_slap',
    filename: 'conga_slap.mp3',
    text: 'Single dry conga drum slap hit, sharp percussive attack, latin percussion, studio recording, no reverb',
    duration_seconds: 0.8,
    prompt_influence: 0.7,
  },
  {
    name: 'conga_open',
    filename: 'conga_open.mp3',
    text: 'Single open conga drum tone hit, warm resonant sustain, latin percussion, studio recording, no reverb',
    duration_seconds: 1.0,
    prompt_influence: 0.7,
  },
  {
    name: 'conga_mute',
    filename: 'conga_mute.mp3',
    text: 'Single muted conga drum hit, short dead thud, hand muffled, latin percussion, studio recording, no reverb',
    duration_seconds: 0.6,
    prompt_influence: 0.7,
  },
];

// Output directories (relative to project root)
const OUTPUT_DIRS = [
  path.resolve(__dirname, '..', 'assets', 'samples'),
  path.resolve(__dirname, '..', 'docs', 'assets', 'samples'),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveApiKey() {
  const args = process.argv.slice(2);
  const keyFlagIndex = args.indexOf('--key');
  if (keyFlagIndex !== -1 && args[keyFlagIndex + 1]) {
    return args[keyFlagIndex + 1];
  }
  return process.env.ELEVENLABS_API_KEY;
}

function ensureOutputDirs() {
  for (const dir of OUTPUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Call the ElevenLabs Sound Effects API and return the audio as a Buffer.
 */
async function generateSoundEffect(apiKey, text, durationSeconds, promptInfluence) {
  const url = `${ELEVENLABS_API_BASE}/sound-generation`;

  const body = {
    text,
    duration_seconds: durationSeconds,
    prompt_influence: promptInfluence,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = 'Unable to read error response body';
    }

    if (response.status === 401) {
      throw new Error(
        `Authentication failed (401). Your API key is invalid or expired.\n` +
        `Response: ${errorBody}`,
      );
    }
    if (response.status === 429) {
      throw new Error(
        `Rate limited (429). Wait a moment and try again.\nResponse: ${errorBody}`,
      );
    }
    throw new Error(
      `ElevenLabs Sound Effects API error (${response.status}): ${errorBody}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Write a Buffer to every output directory.
 */
function writeToAllOutputDirs(filename, buffer) {
  const writtenPaths = [];
  for (const dir of OUTPUT_DIRS) {
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    writtenPaths.push(filePath);
  }
  return writtenPaths;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== SalsaTiming Conga Sample Generator (ElevenLabs SFX) ===\n');

  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error(
      'Error: No ElevenLabs API key provided.\n\n' +
      'Provide your key in one of two ways:\n' +
      '  1. Environment variable:  export ELEVENLABS_API_KEY=sk-xxxx\n' +
      '  2. CLI argument:          node scripts/generateCongaSamples.js --key sk-xxxx\n',
    );
    process.exit(1);
  }

  ensureOutputDirs();
  console.log('Output directories:');
  for (const dir of OUTPUT_DIRS) {
    console.log(`  ${dir}`);
  }
  console.log();

  const total = CONGA_SOUNDS.length;
  let completed = 0;

  for (const sound of CONGA_SOUNDS) {
    completed++;
    const label = `[${completed}/${total}]`;

    process.stdout.write(
      `${label} Generating "${sound.name}" (${sound.duration_seconds}s) ... `,
    );
    console.log(`\n      Prompt: "${sound.text}"`);

    try {
      const audioBuffer = await generateSoundEffect(
        apiKey,
        sound.text,
        sound.duration_seconds,
        sound.prompt_influence,
      );
      const paths = writeToAllOutputDirs(sound.filename, audioBuffer);
      const sizeKB = (audioBuffer.length / 1024).toFixed(1);
      console.log(`      Done (${sizeKB} KB, written to ${paths.length} locations)`);
    } catch (err) {
      console.log('      FAILED');
      console.error(`\n  Error for "${sound.name}": ${err.message}\n`);
      process.exit(1);
    }

    console.log();
  }

  // Verification
  console.log('Verification:');
  for (const dir of OUTPUT_DIRS) {
    console.log(`\n  Directory: ${dir}`);
    for (const sound of CONGA_SOUNDS) {
      const filePath = path.join(dir, sound.filename);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        console.log(`    ${sound.filename}: ${stat.size} bytes`);
      } else {
        console.error(`    ERROR: ${sound.filename} does not exist!`);
      }
    }
  }

  console.log(`\nAll ${total} conga samples generated successfully.`);
}

main();
