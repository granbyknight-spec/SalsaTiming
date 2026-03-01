/**
 * Thin wrapper around the ElevenLabs REST API for text-to-speech generation.
 *
 * Uses the REST API directly (no SDK) so it works reliably in web/Expo environments.
 */

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel — deep British male
const MODEL_ID = 'eleven_turbo_v2';
const VOICE_SPEED = 1.15;

function getApiKey(): string | undefined {
  // Expo public env vars are inlined at build time via process.env.EXPO_PUBLIC_*
  return process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
}

/**
 * Generate speech audio from text using the ElevenLabs TTS API.
 *
 * @param text - The text to synthesize (e.g., "one", "and five").
 * @param voiceId - Optional ElevenLabs voice ID. Defaults to Rachel.
 * @returns A Blob containing the MP3 audio data.
 * @throws If the API key is missing or the request fails.
 */
export async function generateSpeech(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
): Promise<Blob> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error(
      'ElevenLabs API key is not set. ' +
      'Please set EXPO_PUBLIC_ELEVENLABS_API_KEY in your environment.',
    );
  }

  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`;

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
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.75,
      },
      speed: VOICE_SPEED,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorText}`,
    );
  }

  const blob = await response.blob();
  return blob;
}
