#!/usr/bin/env node
// ---------------------------------------------------------------------------
// generateVoices.js — Generate salsa timing voice samples via ElevenLabs
//
// Strategy: Generate full counting phrases (not individual words) so every
// number shares the same voice timbre and prosody context. Use the ElevenLabs
// "with_timestamps" output format to get word-level alignment, then slice
// individual words out with FFmpeg. Generate at 3 speed tiers for tempo
// adaptation without excessive pitch-shifting.
//
// Usage:
//   node scripts/generateVoices.js                        # reads ELEVENLABS_API_KEY from env
//   node scripts/generateVoices.js --key sk-xxxxxxxxxxxx  # pass key as CLI arg
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel — deep authoritative British male
const MODEL_ID = 'eleven_turbo_v2';
const VOICE_SETTINGS = { stability: 0.85, similarity_boost: 0.85 };
// Bumped stability and similarity for more consistent output across tiers

const EXPECTED_VOICE_NAME = 'Daniel';

// ---------------------------------------------------------------------------
// Speed tiers — each generates a complete set of voice samples
// ---------------------------------------------------------------------------

const SPEED_TIERS = [
  { name: 'slow',   speed: 0.90, suffix: '_slow'   },
  { name: 'normal', speed: 1.15, suffix: ''         }, // default tier, no suffix for backwards compat
  { name: 'fast',   speed: 1.50, suffix: '_fast'    },
];

// ---------------------------------------------------------------------------
// Phrases to generate — words are extracted by timestamp alignment
// ---------------------------------------------------------------------------

// Main counting phrase: all 8 numbers in one utterance.
// Commas add natural pauses that make word boundaries clearer.
const MAIN_PHRASE = 'one, two, three, four, five, six, seven, eight';

// Compound cues (and-one, and-five) as a separate phrase.
const COMPOUND_PHRASE = 'and one, and five';

// Map from word (as it appears in alignment) to output filename stem
const WORD_TO_FILE = {
  'one':   'voice_one',
  'two':   'voice_two',
  'three': 'voice_three',
  'four':  'voice_four',
  'five':  'voice_five',
  'six':   'voice_six',
  'seven': 'voice_seven',
  'eight': 'voice_eight',
};

// For compound phrase, we extract pairs: "and one" -> voice_and_one, "and five" -> voice_and_five
const COMPOUND_EXTRACTIONS = [
  { words: ['and', 'one'],  filename: 'voice_and_one'  },
  { words: ['and', 'five'], filename: 'voice_and_five' },
];

// ---------------------------------------------------------------------------
// Full counting phrases — saved as complete audio files (no slicing).
// These are used for modes where the voice counts over multiple beats.
// ---------------------------------------------------------------------------
const FULL_PHRASES = [
  { text: 'and one, two, three', filename: 'voice_and_one_two_three' },
  { text: 'and five, six, seven', filename: 'voice_and_five_six_seven' },
];

// Output directories (relative to project root)
const OUTPUT_DIRS = [
  path.resolve(__dirname, '..', 'assets', 'samples'),
  path.resolve(__dirname, '..', 'docs', 'assets', 'samples'),
];

// Temp directory for intermediate files
const TEMP_DIR = path.resolve(__dirname, '..', '_voice_gen_tmp');

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureOutputDirs() {
  for (const dir of OUTPUT_DIRS) {
    ensureDir(dir);
  }
  ensureDir(TEMP_DIR);
}

function cleanupTemp() {
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

async function verifyVoice(apiKey) {
  const url = `${ELEVENLABS_API_BASE}/voices/${VOICE_ID}`;
  const response = await fetch(url, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Voice verification failed (${response.status}): could not fetch voice ${VOICE_ID}.\n${body}`,
    );
  }
  const data = await response.json();
  const name = data.name || '(unnamed)';
  if (!name.toLowerCase().includes(EXPECTED_VOICE_NAME.toLowerCase())) {
    throw new Error(
      `Voice mismatch! Expected "${EXPECTED_VOICE_NAME}" but API returned "${name}" for ID ${VOICE_ID}.`,
    );
  }
  console.log(`Voice verified: "${name}" (${VOICE_ID})\n`);
}

/**
 * Generate speech WITH word-level timestamps using ElevenLabs API.
 * Returns { audioBuffer: Buffer, alignment: { words: [...] } }
 *
 * The alignment response contains character-level data. We parse word
 * boundaries from the characters array.
 */
async function generateSpeechWithTimestamps(text, speed, apiKey) {
  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${VOICE_ID}/with-timestamps`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
      speed,
      output_format: 'mp3_44100_128',
    }),
  });

  if (!response.ok) {
    let errorBody;
    try { errorBody = await response.text(); } catch { errorBody = '(unreadable)'; }
    throw new Error(`ElevenLabs API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  // The response has: audio_base64, alignment (with characters, character_start_times_seconds,
  // character_end_times_seconds)
  const audioBuffer = Buffer.from(data.audio_base64, 'base64');
  const alignment = data.alignment;

  return { audioBuffer, alignment };
}

/**
 * Generate speech as a plain audio buffer (no timestamps needed).
 * Used for full counting phrases that are saved as-is.
 */
async function generateSpeech(text, speed, apiKey) {
  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${VOICE_ID}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
      speed,
      output_format: 'mp3_44100_128',
    }),
  });

  if (!response.ok) {
    let errorBody;
    try { errorBody = await response.text(); } catch { errorBody = '(unreadable)'; }
    throw new Error(`ElevenLabs API error (${response.status}): ${errorBody}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Parse word boundaries from the character-level alignment data.
 * Returns array of { word: string, startTime: number, endTime: number }
 */
function parseWordBoundaries(alignment) {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  const words = [];
  let currentWord = '';
  let wordStart = null;
  let wordEnd = null;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (ch === ' ' || ch === ',') {
      // Word boundary — flush current word
      if (currentWord.length > 0 && wordStart !== null) {
        words.push({
          word: currentWord.toLowerCase(),
          startTime: wordStart,
          endTime: wordEnd,
        });
        currentWord = '';
        wordStart = null;
        wordEnd = null;
      }
    } else {
      currentWord += ch;
      if (wordStart === null) {
        wordStart = starts[i];
      }
      wordEnd = ends[i];
    }
  }

  // Flush last word
  if (currentWord.length > 0 && wordStart !== null) {
    words.push({
      word: currentWord.toLowerCase(),
      startTime: wordStart,
      endTime: wordEnd,
    });
  }

  return words;
}

/**
 * Extract a time slice from an audio file using FFmpeg.
 * Adds a small padding before/after the word boundary for natural attack/release.
 * Returns the trimmed audio as a Buffer.
 */
function extractSlice(inputPath, startTime, endTime, outputPath) {
  // Add small padding: 15ms before (catch consonant attacks), 40ms after (catch release)
  const padBefore = 0.015;
  const padAfter = 0.040;
  const start = Math.max(0, startTime - padBefore);
  const duration = (endTime + padAfter) - start;

  execSync(
    `ffmpeg -y -i "${inputPath}" -ss ${start.toFixed(4)} -t ${duration.toFixed(4)} ` +
    `-af "afade=t=out:st=${(duration - 0.020).toFixed(4)}:d=0.020" ` +
    `"${outputPath}"`,
    { stdio: 'pipe' },
  );

  return fs.readFileSync(outputPath);
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
  console.log('=== SalsaTiming Voice Sample Generator (Phrase-Based) ===\n');

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

  // 2. Verify voice
  await verifyVoice(apiKey);

  // 3. Ensure directories exist
  ensureOutputDirs();
  console.log('Output directories:');
  for (const dir of OUTPUT_DIRS) console.log(`  ${dir}`);
  console.log();

  let totalFiles = 0;

  // 4. Generate each speed tier
  for (const tier of SPEED_TIERS) {
    console.log(`\n--- Speed tier: ${tier.name} (ElevenLabs speed=${tier.speed}) ---\n`);

    // 4a. Generate the main counting phrase with timestamps
    console.log(`  Generating main phrase: "${MAIN_PHRASE}" ...`);
    const mainResult = await generateSpeechWithTimestamps(MAIN_PHRASE, tier.speed, apiKey);
    const mainWords = parseWordBoundaries(mainResult.alignment);

    console.log(`  Alignment found ${mainWords.length} words:`);
    for (const w of mainWords) {
      console.log(`    "${w.word}" ${w.startTime.toFixed(3)}s - ${w.endTime.toFixed(3)}s`);
    }

    // Write the full phrase to temp for FFmpeg slicing
    const mainAudioPath = path.join(TEMP_DIR, `main_${tier.name}.mp3`);
    fs.writeFileSync(mainAudioPath, mainResult.audioBuffer);

    // 4b. Extract individual words from main phrase
    for (const [word, fileStem] of Object.entries(WORD_TO_FILE)) {
      const boundary = mainWords.find((w) => w.word === word);
      if (!boundary) {
        console.error(`  WARNING: word "${word}" not found in alignment! Skipping.`);
        continue;
      }

      const filename = `${fileStem}${tier.suffix}.mp3`;
      const slicePath = path.join(TEMP_DIR, filename);
      const audioBuffer = extractSlice(mainAudioPath, boundary.startTime, boundary.endTime, slicePath);
      const paths = writeToAllOutputDirs(filename, audioBuffer);
      const sizeKB = (audioBuffer.length / 1024).toFixed(1);
      console.log(`  Extracted "${word}" -> ${filename} (${sizeKB} KB, ${paths.length} locations)`);
      totalFiles++;
    }

    // 4c. Generate the compound phrase with timestamps
    console.log(`\n  Generating compound phrase: "${COMPOUND_PHRASE}" ...`);
    const compoundResult = await generateSpeechWithTimestamps(COMPOUND_PHRASE, tier.speed, apiKey);
    const compoundWords = parseWordBoundaries(compoundResult.alignment);

    console.log(`  Alignment found ${compoundWords.length} words:`);
    for (const w of compoundWords) {
      console.log(`    "${w.word}" ${w.startTime.toFixed(3)}s - ${w.endTime.toFixed(3)}s`);
    }

    const compoundAudioPath = path.join(TEMP_DIR, `compound_${tier.name}.mp3`);
    fs.writeFileSync(compoundAudioPath, compoundResult.audioBuffer);

    // 4d. Extract compound cues ("and one", "and five")
    // These span two words each — we find the first word's start and second word's end
    for (const extraction of COMPOUND_EXTRACTIONS) {
      const firstWord = extraction.words[0];
      const lastWord = extraction.words[extraction.words.length - 1];

      // Find the matching pair in sequence
      let startBoundary = null;
      let endBoundary = null;

      for (let i = 0; i < compoundWords.length; i++) {
        if (compoundWords[i].word === firstWord &&
            i + 1 < compoundWords.length &&
            compoundWords[i + 1].word === lastWord) {
          startBoundary = compoundWords[i];
          endBoundary = compoundWords[i + 1];
          // Remove matched words so second "and five" isn't confused with first "and one"
          compoundWords.splice(i, 2);
          break;
        }
      }

      if (!startBoundary || !endBoundary) {
        console.error(`  WARNING: compound "${extraction.words.join(' ')}" not found in alignment! Skipping.`);
        continue;
      }

      const filename = `${extraction.filename}${tier.suffix}.mp3`;
      const slicePath = path.join(TEMP_DIR, filename);
      const audioBuffer = extractSlice(compoundAudioPath, startBoundary.startTime, endBoundary.endTime, slicePath);
      const paths = writeToAllOutputDirs(filename, audioBuffer);
      const sizeKB = (audioBuffer.length / 1024).toFixed(1);
      console.log(`  Extracted "${extraction.words.join(' ')}" -> ${filename} (${sizeKB} KB, ${paths.length} locations)`);
      totalFiles++;
    }

    // 4e. Generate full counting phrases (saved as-is, no slicing)
    for (const phrase of FULL_PHRASES) {
      console.log(`\n  Generating full phrase: "${phrase.text}" ...`);
      const audioBuffer = await generateSpeech(phrase.text, tier.speed, apiKey);
      const filename = `${phrase.filename}${tier.suffix}.mp3`;
      const paths = writeToAllOutputDirs(filename, audioBuffer);
      const sizeKB = (audioBuffer.length / 1024).toFixed(1);
      console.log(`  Saved "${phrase.text}" -> ${filename} (${sizeKB} KB, ${paths.length} locations)`);
      totalFiles++;
    }

    // Brief delay between tiers to avoid rate limits
    if (tier !== SPEED_TIERS[SPEED_TIERS.length - 1]) {
      console.log('\n  Waiting 2s before next tier...');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // 5. Cleanup temp dir
  cleanupTemp();

  console.log(`\n=== Done! Generated ${totalFiles} voice files across ${SPEED_TIERS.length} speed tiers. ===`);
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  cleanupTemp();
  process.exit(1);
});
