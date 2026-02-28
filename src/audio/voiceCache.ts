/**
 * Voice cue caching layer for the Salsa Timing app (web).
 *
 * Uses the browser Cache API to persist ElevenLabs-generated voice MP3s
 * across sessions. On subsequent loads the cached blobs are returned
 * instantly without hitting the API again.
 *
 * Public API:
 *   - generateAndCacheVoices(apiKey, onProgress?) -> Map<string, string>
 *   - getCachedVoiceUrls()                        -> Map<string, string> | null
 *   - clearVoiceCache()                           -> void
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel
const MODEL_ID = 'eleven_turbo_v2';
const VOICE_SPEED = 1.15;
const CACHE_NAME = 'salsa-timing-voice-cache-v3'; // bumped: speed parameter changed

/**
 * Maps each voice cue key (as used in VOICE_FILE_MAP / patterns) to:
 *   - text: the phrase sent to ElevenLabs for synthesis
 *   - filename: the cache key filename
 */
const VOICE_CUES: { key: string; text: string; filename: string }[] = [
  { key: '1', text: 'one', filename: 'voice_one.mp3' },
  { key: '2', text: 'TWO!', filename: 'voice_two.mp3' },
  { key: '3', text: 'three', filename: 'voice_three.mp3' },
  { key: '4', text: 'four', filename: 'voice_four.mp3' },
  { key: '5', text: 'five', filename: 'voice_five.mp3' },
  { key: '6', text: 'SIX!', filename: 'voice_six.mp3' },
  { key: '7', text: 'seven', filename: 'voice_seven.mp3' },
  { key: '8', text: 'eight', filename: 'voice_eight.mp3' },
  { key: '&1', text: 'and-one', filename: 'voice_and_one.mp3' },
  { key: '&5', text: 'and-five', filename: 'voice_and_five.mp3' },
];

// ---------------------------------------------------------------------------
// In-memory blob URL registry
// ---------------------------------------------------------------------------

/** Blob URLs currently alive — keyed by cue string ('1', '&5', etc.) */
const blobUrls: Map<string, string> = new Map();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the synthetic URL used as cache key in the Cache API. */
function cacheKey(filename: string): string {
  return `/_voice_cache/${filename}`;
}

/** Call ElevenLabs TTS and return the MP3 blob. */
async function synthesize(apiKey: string, text: string): Promise<Blob> {
  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${VOICE_ID}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.75,
      },
      speed: VOICE_SPEED,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
  }

  return response.blob();
}

/** Revoke all in-memory blob URLs so we don't leak memory. */
function revokeBlobUrls(): void {
  for (const url of blobUrls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // best-effort
    }
  }
  blobUrls.clear();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether voices are already cached and return their blob URLs.
 *
 * @returns A Map<cueKey, blobURL> if ALL 10 cues are cached, or null if any
 *          are missing (meaning the user needs to generate them).
 */
export async function getCachedVoiceUrls(): Promise<Map<string, string> | null> {
  if (typeof caches === 'undefined') return null;

  let cache: Cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    return null;
  }

  const result = new Map<string, string>();

  for (const cue of VOICE_CUES) {
    const key = cacheKey(cue.filename);
    const cached = await cache.match(key);
    if (!cached) {
      // At least one cue is missing — cache is incomplete.
      return null;
    }
    const blob = await cached.blob();
    const url = URL.createObjectURL(blob);
    result.set(cue.key, url);
  }

  // Store in the module-level registry as well.
  revokeBlobUrls();
  for (const [k, v] of result) {
    blobUrls.set(k, v);
  }

  return result;
}

/**
 * Generate all 10 voice cues via the ElevenLabs API, cache them in the
 * browser Cache API, and return a Map of cue key -> blob URL.
 *
 * Cues are generated one-at-a-time (sequentially) to avoid hitting API rate
 * limits and to provide smooth progress reporting.
 *
 * @param apiKey - ElevenLabs API key supplied by the user.
 * @param onProgress - Optional callback reporting (currentIndex, total, label).
 * @returns Map<string, string> cue key -> blob URL.
 */
export async function generateAndCacheVoices(
  apiKey: string,
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<Map<string, string>> {
  if (typeof caches === 'undefined') {
    throw new Error('Cache API is not available in this browser.');
  }

  const cache = await caches.open(CACHE_NAME);
  const total = VOICE_CUES.length;
  const result = new Map<string, string>();

  revokeBlobUrls();

  for (let i = 0; i < VOICE_CUES.length; i++) {
    const cue = VOICE_CUES[i];

    // Report progress before starting each cue.
    onProgress?.(i + 1, total, cue.text);

    // Check if already cached (user may be resuming a partial generation).
    const key = cacheKey(cue.filename);
    const existing = await cache.match(key);
    let blob: Blob;

    if (existing) {
      blob = await existing.blob();
    } else {
      blob = await synthesize(apiKey, cue.text);

      // Persist in Cache API.
      const response = new Response(blob, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-Voice-Cue': cue.key,
        },
      });
      await cache.put(key, response);
    }

    const url = URL.createObjectURL(blob);
    result.set(cue.key, url);
    blobUrls.set(cue.key, url);
  }

  return result;
}

/**
 * Delete all cached voice cues and revoke in-memory blob URLs.
 */
export async function clearVoiceCache(): Promise<void> {
  revokeBlobUrls();

  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      // best-effort
    }
  }
}
