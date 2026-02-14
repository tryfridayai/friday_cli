/**
 * ElevenLabs Provider
 *
 * Wraps the @elevenlabs/elevenlabs-js SDK for:
 * - Text-to-speech (Eleven v3, Flash v2.5, Turbo v2.5, Multilingual v2)
 * - Voice cloning (Instant Voice Clone)
 * - Voice listing
 */

import fs from 'fs';
import path from 'path';

// Lazy-load the ElevenLabs SDK
let clientInstance = null;

async function ensureClient() {
  if (clientInstance) return clientInstance;
  const mod = await import('@elevenlabs/elevenlabs-js');
  const ElevenLabsClient = mod.ElevenLabsClient || mod.default;
  clientInstance = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });
  return clientInstance;
}

// ─── Default Models ──────────────────────────────────────────────

export const DEFAULTS = {
  tts: 'eleven_v3',
};

export const MODELS = {
  tts: [
    { id: 'eleven_v3', name: 'Eleven v3', description: 'Most expressive — sighs, whispers, laughs' },
    { id: 'eleven_v3_conversational', name: 'v3 Conversational', description: 'Optimized for agent dialogue' },
    { id: 'eleven_flash_v2_5', name: 'Flash v2.5', description: 'Ultra-low latency (~75ms)' },
    { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', description: 'Balanced quality and speed (~250ms)' },
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: '32 languages, consistent quality' },
  ],
};

// Well-known default voices (ElevenLabs pre-made voices)
const DEFAULT_VOICES = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  drew: '29vD33N1CtxCmqQRPOHJ',
  clyde: '2EiwWnXFnvU5JabPnv8n',
  paul: '5Q0t7uMcjvnagumLfvZi',
  domi: 'AZnzlk1XvdvUeBnXmlld',
  dave: 'CYw3kZ02Hs0563khs1Fj',
  fin: 'D38z5RcWu1voky8WS1ja',
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  antoni: 'ErXwobaYiN019PkySvjV',
  thomas: 'GBv7mTt0atIp3Br8iCZE',
  charlie: 'IKne3meq5aSn9XLyUdCD',
  emily: 'LcfcDJNUP1GQjkzn1xUU',
  elli: 'MF3mGyEYCl7XYWbV9V6O',
  callum: 'N2lVS1w4EtoT3dr4eOWO',
  patrick: 'ODq5zmih8GrVes37Dizd',
  harry: 'SOYHLrjzK2X1ezoPC6cr',
  liam: 'TX3LPaxmHKxFdv7VOQHJ',
  dorothy: 'ThT5KcBeYPX3keUQqHPh',
  josh: 'TxGEqnHWrfWFTfGW9XjX',
  arnold: 'VR6AewLTigWG4xSOukaG',
  charlotte: 'XB0fDUnXU5powFXDhCwa',
  alice: 'Xb7hH8MSUJpSbSDYk0k2',
  matilda: 'XrExE9yKIg1WjnnlVkGX',
  james: 'ZQe5CZNOzWyzPSCn5a3c',
  jessica: 'cgSgspJ2msm6clMCkdEW',
  lily: 'pFZP5JQG7iQjIQuC4Bku',
  serena: 'pMsXgVXv3BLzUgSXRplE',
  adam: 'pNInz6obpgDQGcFmaJgB',
  nicole: 'piTKgcLEGmPE4e6mEKli',
  bill: 'pqHfZKP75CvOlQylNhV4',
  george: 'JBFqnCBsd6RMkjVDRZzb',
  glinda: 'z9fAnlkpzviPz146aGWa',
};

// ─── Text-to-Speech ──────────────────────────────────────────────

/**
 * Convert text to speech using ElevenLabs.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} [opts.model]
 * @param {string} [opts.voice] - Voice name or ID
 * @param {string} [opts.format] - 'mp3_44100_128' | 'pcm_16000' | 'pcm_22050' | etc.
 * @param {string} opts.outputDir
 * @returns {Promise<{ path: string, model: string, metadata: object }>}
 */
export async function textToSpeech(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.tts;

  // Resolve voice: name → ID
  const voiceInput = opts.voice || 'rachel';
  const voiceId = DEFAULT_VOICES[voiceInput.toLowerCase()] || voiceInput;

  const audioStream = await client.textToSpeech.convert(voiceId, {
    text: opts.text,
    model_id: model,
    ...(opts.format ? { output_format: opts.format } : {}),
  });

  const filename = `tts_${Date.now()}.mp3`;
  const filePath = path.join(opts.outputDir, 'audio', filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Collect stream chunks into buffer
  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  fs.writeFileSync(filePath, Buffer.concat(chunks));

  return {
    path: filePath,
    model,
    metadata: {
      voice: voiceInput,
      voiceId,
      format: opts.format || 'mp3_44100_128',
      textLength: opts.text.length,
    },
  };
}

// ─── Voice Listing ───────────────────────────────────────────────

/**
 * List available ElevenLabs voices.
 *
 * @returns {Promise<Array<{ id: string, name: string, provider: string, preview_url?: string }>>}
 */
export async function listVoices() {
  const client = await ensureClient();

  try {
    const response = await client.voices.getAll();
    const voices = response.voices || response;
    return voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      provider: 'elevenlabs',
      category: v.category || 'premade',
      previewUrl: v.preview_url || null,
    }));
  } catch {
    // Fallback to built-in list if API call fails
    return Object.entries(DEFAULT_VOICES).map(([name, id]) => ({
      id,
      name,
      provider: 'elevenlabs',
      category: 'premade',
    }));
  }
}

// ─── Voice Cloning ───────────────────────────────────────────────

/**
 * Create an instant voice clone from audio samples.
 *
 * @param {object} opts
 * @param {string} opts.name - Name for the voice
 * @param {string[]} opts.audioPaths - Paths to audio sample files
 * @param {string} [opts.description] - Voice description
 * @returns {Promise<{ voiceId: string, name: string }>}
 */
export async function cloneVoice(opts) {
  const client = await ensureClient();

  const files = opts.audioPaths.map((p) => fs.createReadStream(p));

  const response = await client.voices.add({
    name: opts.name,
    files,
    ...(opts.description ? { description: opts.description } : {}),
  });

  return {
    voiceId: response.voice_id,
    name: opts.name,
  };
}
