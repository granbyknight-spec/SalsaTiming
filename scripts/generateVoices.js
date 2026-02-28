#!/usr/bin/env node
// ---------------------------------------------------------------------------
// generateVoices.js — Generate all salsa timing voice samples via ElevenLabs
//
// Usage:
//   node scripts/generateVoices.js                        # reads ELEVENLABS_API_KEY from env
//   node scripts/generateVoices.js --key sk-xxxxxxxxxxxx  # pass key as CLI arg
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration (mirrors src/audio/elevenlabs.ts)
// ---------------------------------------------------------------------------

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel — clear female voice
const MODEL_ID = 'eleven_turbo_v2';
const VOICE_SETTINGS = { stability: 0.75, similarity_boost: 0.75 };

// ---------------------------------------------------------------------------
// Voice file map (mirrors src/engine/patterns.ts VOICE_FILE_MAP)
// ---------------------------------------------------------------------------

const VOICE_FILE_MAP = {
  '1':  { filename: 'voice_one.mp3',      text: 'one' },
  '2':  { filename: 'voice_two.mp3',      text: 'two' },
  '3':  { filename: 'voice_three.mp3',    text: 'three' },
  '4':  { filename: 'voice_four.mp3',     text: 'four' },
  '5':  { filename: 'voice_five.mp3',     text: 'five' },
  '6':  { filename: 'voice_six.mp3',      text: 'six' },
  '7':  { filename: 'voice_seven.mp3',    text: 'seven' },
  '8':  { filename: 'voice_eight.mp3',    text: 'eight' },
  '&1': { filename: 'voice_and_one.mp3',  text: 'and one' },
  '&5': { filename: 'voice_and_five.mp3', text: 'and five' },
};

// Output directories (relative to project root)
const OUTPUT_DIRS = [
  path.resolve(__dirname, '..', 'assets', 'samples'),
  path.resolve(__dirname, '..', 'docs', 'assets', 'samples'),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the API key from CLI args (--key <value>) or the ELEVENLABS_API_KEY
 * environment variable.
 */
function resolveApiKey() {
  const args = process.argv.slice(2);
  const keyFlagIndex = args.indexOf('--key');

  if (keyFlagIndex !== -1 && args[keyFlagIndex + 1]) {
    return args[keyFlagIndex + 1];
  }

  return process.env.ELEVENLABS_API_KEY;
}

/**
 * Ensure all output directories exist, creating them recursively if needed.
 */
function ensureOutputDirs() {
  for (const dir of OUTPUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Call the ElevenLabs TTS endpoint and return the audio as a Buffer.
 */
async function generateSpeech(text, apiKey) {
  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${VOICE_ID}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
    }),
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
        `Rate limited (429). Wait a moment and try again.\n` +
        `Response: ${errorBody}`,
      );
    }
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorBody}`,
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
  console.log('=== SalsaTiming Voice Sample Generator ===\n');

  // 1. Resolve API key
  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error(
      'Error: No ElevenLabs API key provided.\n\n' +
      'Provide your key in one of two ways:\n' +
      '  1. Environment variable:  export ELEVENLABS_API_KEY=sk-xxxx\n' +
      '  2. CLI argument:          node scripts/generateVoices.js --key sk-xxxx\n',
    );
    process.exit(1);
  }

  // 2. Ensure output directories exist
  ensureOutputDirs();
  console.log('Output directories:');
  for (const dir of OUTPUT_DIRS) {
    console.log(`  ${dir}`);
  }
  console.log();

  // 3. Generate each voice sample sequentially to avoid rate limits
  const entries = Object.entries(VOICE_FILE_MAP);
  const total = entries.length;
  let completed = 0;

  for (const [cue, { filename, text }] of entries) {
    completed++;
    const label = `[${completed}/${total}]`;

    process.stdout.write(`${label} Generating "${text}" -> ${filename} ... `);

    try {
      const audioBuffer = await generateSpeech(text, apiKey);
      const paths = writeToAllOutputDirs(filename, audioBuffer);
      const sizeKB = (audioBuffer.length / 1024).toFixed(1);
      console.log(`done (${sizeKB} KB, written to ${paths.length} locations)`);
    } catch (err) {
      console.log('FAILED');
      console.error(`\n  Error for cue "${cue}": ${err.message}\n`);
      process.exit(1);
    }
  }

  console.log(`\nAll ${total} voice samples generated successfully.`);
}

main();
