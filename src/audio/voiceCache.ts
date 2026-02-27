/**
 * Voice cue caching layer for the Salsa Timing app (web).
 *
 * Uses the browser Cache API to persist ElevenLabs-generated voice cues
 * so they only need to be synthesized once. Falls back gracefully if the
 * API key is missing or generation fails -- the app continues to work
 * with instrument sounds only.
 */

import { generateSpeech } from './elevenlabs';
import { appStore } from '../store/appStore';

// ---------------------------------------------------------------------------
// Voice cue definitions
// ---------------------------------------------------------------------------

/** All voice cues the app needs, mapped to their cache filenames. */
const VOICE_CUES: Record<string, string> = {
  one: 'voice_one.mp3',
  two: 'voice_two.mp3',
  three: 'voice_three.mp3',
  four: 'voice_four.mp3',
  five: 'voice_five.mp3',
  six: 'voice_six.mp3',
  seven: 'voice_seven.mp3',
  eight: 'voice_eight.mp3',
  'and one': 'voice_and_one.mp3',
  'and five': 'voice_and_five.mp3',
};

/** Name of the Cache API cache bucket used to store voice files. */
const CACHE_NAME = 'salsa-timing-voice-cache-v1';

/**
 * In-memory map of cue key -> blob URL for fast playback lookups.
 * Populated during initVoiceCache() from cached responses.
 */
const blobUrls: Map<string, string> = new Map();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the voice cache.
 *
 * For each of the 10 voice cues:
 *   1. Check the Cache API for an existing entry.
 *   2. If missing, call ElevenLabs to generate the audio.
 *   3. Store the result in the Cache API for future sessions.
 *   4. Create an in-memory blob URL for instant playback.
 *
 * When all cues are ready (or skipped on error), sets
 * `voiceCacheReady = true` in the app store.
 */
export async function initVoiceCache(): Promise<void> {
  // Guard: Cache API may not be available (e.g., some older browsers, SSR).
  if (typeof caches === 'undefined') {
    console.warn(
      '[voiceCache] Cache API is not available in this environment. ' +
      'Voice cues will not be cached.',
    );
    appStore.getState().setVoiceCacheReady(true);
    return;
  }

  let cache: Cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch (err) {
    console.warn('[voiceCache] Failed to open cache:', err);
    appStore.getState().setVoiceCacheReady(true);
    return;
  }

  const cueEntries = Object.entries(VOICE_CUES);

  // Process cues concurrently but don't let one failure block the rest.
  await Promise.allSettled(
    cueEntries.map(async ([cueText, filename]) => {
      try {
        await loadOrGenerateCue(cache, cueText, filename);
      } catch (err) {
        console.warn(
          `[voiceCache] Skipping cue "${cueText}":`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );

  appStore.getState().setVoiceCacheReady(true);
}

/**
 * Get a playable blob URL for a cached voice cue.
 *
 * @param cue - The cue key (e.g., "one", "and five").
 * @returns A blob URL string if the cue is cached, or null otherwise.
 */
export function getVoiceUrl(cue: string): string | null {
  return blobUrls.get(cue) ?? null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the cache key URL for a given filename.
 * The Cache API indexes by Request/URL, so we use a synthetic origin-relative URL.
 */
function cacheKey(filename: string): string {
  return `/_voice_cache/${filename}`;
}

/**
 * Load a single cue from cache, or generate and store it if missing.
 */
async function loadOrGenerateCue(
  cache: Cache,
  cueText: string,
  filename: string,
): Promise<void> {
  const key = cacheKey(filename);

  // 1. Try to load from cache first.
  const cachedResponse = await cache.match(key);

  if (cachedResponse) {
    const blob = await cachedResponse.blob();
    const url = URL.createObjectURL(blob);
    blobUrls.set(cueText, url);
    return;
  }

  // 2. Not cached -- generate via ElevenLabs.
  const blob = await generateSpeech(cueText);

  // 3. Store in Cache API for persistence across sessions.
  const response = new Response(blob, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-Voice-Cue': cueText,
    },
  });
  await cache.put(key, response);

  // 4. Create blob URL for immediate in-memory access.
  const url = URL.createObjectURL(blob);
  blobUrls.set(cueText, url);
}
