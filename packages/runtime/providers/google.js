/**
 * Google Provider
 *
 * Wraps the @google/genai SDK for:
 * - Image generation (Imagen 4 Ultra, Standard, Fast)
 * - Video generation (Veo 3.1, Veo 3.1 Fast, Veo 3)
 * - Text-to-speech (Google Cloud TTS via Gemini)
 * - Speech-to-text (Google Cloud STT via Gemini)
 * - Chat completions (Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Pro)
 */

import fs from 'fs';
import path from 'path';

// Lazy-load the Google GenAI SDK
let genaiModule = null;
let clientInstance = null;

async function ensureClient() {
  if (clientInstance) return clientInstance;
  const mod = await import('@google/genai');
  genaiModule = mod;
  const GoogleGenAI = mod.GoogleGenAI || mod.default;
  clientInstance = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  return clientInstance;
}

// ─── Default Models ──────────────────────────────────────────────

export const DEFAULTS = {
  imageGen: 'imagen-4',
  videoGen: 'veo-3.1',
  tts: 'gemini-2.5-flash-lite',  // Gemini multimodal for TTS
  stt: 'gemini-2.5-flash-lite',  // Gemini multimodal for STT
  chat: 'gemini-3-pro',
};

export const MODELS = {
  imageGen: [
    { id: 'imagen-4-ultra', name: 'Imagen 4 Ultra', description: 'Highest fidelity' },
    { id: 'imagen-4', name: 'Imagen 4 Standard', description: 'Balanced quality' },
    { id: 'imagen-4-fast', name: 'Imagen 4 Fast', description: 'Quick generation' },
  ],
  videoGen: [
    { id: 'veo-3.1', name: 'Veo 3.1', description: 'Native audio, 4K support' },
    { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', description: 'Lower latency' },
    { id: 'veo-3', name: 'Veo 3', description: 'GA, lower pricing' },
  ],
  tts: [
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Fast multimodal TTS' },
  ],
  stt: [
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Fast multimodal STT' },
  ],
  chat: [
    { id: 'gemini-3-pro', name: 'Gemini 3 Pro', description: 'Reasoning-first, 1M context (preview)' },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', description: 'Fast + strong reasoning (preview)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Stable, production-ready' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Low-cost, fast' },
  ],
};

// ─── Image Generation ────────────────────────────────────────────

/**
 * Generate an image using Google Imagen.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]
 * @param {number} [opts.n] - Number of images (1-4)
 * @param {string} [opts.aspectRatio] - '1:1', '16:9', '9:16', '4:3', '3:4'
 * @param {string} opts.outputDir
 * @returns {Promise<{ path: string, model: string, metadata: object }>}
 */
export async function generateImage(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.imageGen;
  const n = Math.min(Math.max(opts.n || 1, 1), 4);
  const aspectRatio = opts.aspectRatio || '1:1';

  const response = await client.models.generateImages({
    model,
    prompt: opts.prompt,
    config: {
      numberOfImages: n,
      aspectRatio,
    },
  });

  const results = [];
  for (let i = 0; i < response.generatedImages.length; i++) {
    const img = response.generatedImages[i];
    const filename = `img_${Date.now()}_${i}.png`;
    const filePath = path.join(opts.outputDir, 'images', filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Imagen returns base64 image data
    const imageBytes = img.image.imageBytes;
    fs.writeFileSync(filePath, Buffer.from(imageBytes, 'base64'));

    results.push({
      path: filePath,
      model,
      metadata: { aspectRatio, format: 'png' },
    });
  }

  return results.length === 1 ? results[0] : results;
}

// ─── Video Generation ────────────────────────────────────────────

/**
 * Generate a video using Google Veo.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]
 * @param {number} [opts.seconds] - Duration
 * @param {string} [opts.aspectRatio] - '16:9', '9:16'
 * @param {string} [opts.imageUrl] - Image for image-to-video
 * @param {string} opts.outputDir
 * @returns {Promise<{ path: string, model: string, metadata: object }>}
 */
export async function generateVideo(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.videoGen;

  const config = {};
  if (opts.aspectRatio) config.aspectRatio = opts.aspectRatio;
  if (opts.seconds) config.durationSeconds = opts.seconds;

  // Start async video generation
  let operation;
  if (opts.imageUrl) {
    // Image-to-video
    operation = await client.models.generateVideos({
      model,
      prompt: opts.prompt,
      image: { imageUri: opts.imageUrl },
      config,
    });
  } else {
    operation = await client.models.generateVideos({
      model,
      prompt: opts.prompt,
      config,
    });
  }

  // Poll for completion (max 10 minutes, 20s intervals)
  const maxWait = 600_000;
  const interval = 20_000;
  let elapsed = 0;

  while (elapsed < maxWait) {
    await sleep(interval);
    elapsed += interval;

    const status = await client.operations.get({ name: operation.name });

    if (status.done) {
      const video = status.response?.generatedVideos?.[0];
      if (!video) throw new Error('Video generation completed but no video returned');

      const filename = `vid_${Date.now()}.mp4`;
      const filePath = path.join(opts.outputDir, 'videos', filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      // Download video from URI
      if (video.video?.uri) {
        const res = await fetch(video.video.uri);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(filePath, buf);
      }

      return {
        path: filePath,
        model,
        metadata: {
          aspectRatio: opts.aspectRatio || '16:9',
          seconds: opts.seconds || null,
        },
      };
    }

    if (status.error) {
      throw new Error(`Video generation failed: ${status.error.message || 'Unknown error'}`);
    }
  }

  throw new Error(`Video generation timed out after ${maxWait / 1000}s`);
}

// ─── Text-to-Speech (via Gemini multimodal) ──────────────────────

/**
 * Convert text to speech using Gemini's multimodal capabilities.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} [opts.model]
 * @param {string} [opts.voice] - Voice description/style
 * @param {string} opts.outputDir
 * @returns {Promise<{ path: string, model: string, metadata: object }>}
 */
export async function textToSpeech(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.tts;

  const prompt = opts.voice
    ? `Read the following text aloud in a ${opts.voice} voice:\n\n${opts.text}`
    : `Read the following text aloud clearly and naturally:\n\n${opts.text}`;

  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: opts.voice || 'Kore' },
        },
      },
    },
  });

  const audioPart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith('audio/'));
  if (!audioPart) {
    throw new Error('Google TTS did not return audio data');
  }

  const filename = `tts_${Date.now()}.wav`;
  const filePath = path.join(opts.outputDir, 'audio', filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  fs.writeFileSync(filePath, Buffer.from(audioPart.inlineData.data, 'base64'));

  return {
    path: filePath,
    model,
    metadata: { voice: opts.voice || 'Kore', format: 'wav', textLength: opts.text.length },
  };
}

// ─── Speech-to-Text (via Gemini multimodal) ──────────────────────

/**
 * Transcribe audio using Gemini's multimodal input.
 *
 * @param {object} opts
 * @param {string} opts.audioPath
 * @param {string} [opts.model]
 * @param {string} [opts.language]
 * @param {string} opts.outputDir
 * @returns {Promise<{ text: string, path: string, model: string, metadata: object }>}
 */
export async function speechToText(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.stt;

  const audioBuffer = fs.readFileSync(opts.audioPath);
  const audioBase64 = audioBuffer.toString('base64');
  const ext = path.extname(opts.audioPath).toLowerCase().replace('.', '');
  const mimeType = ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : `audio/${ext}`;

  const languageHint = opts.language ? ` The audio is in ${opts.language}.` : '';

  const response = await client.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: `Transcribe the audio accurately. Return only the transcription text, nothing else.${languageHint}` },
        ],
      },
    ],
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Save transcript
  const filename = `stt_${Date.now()}.txt`;
  const filePath = path.join(opts.outputDir, 'audio', filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');

  return {
    text,
    path: filePath,
    model,
    metadata: { language: opts.language || 'auto', sourceFile: opts.audioPath },
  };
}

// ─── Chat Completion ─────────────────────────────────────────────

/**
 * Query a Google Gemini model.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]
 * @param {string} [opts.systemPrompt]
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.imageUrl]
 * @returns {Promise<{ text: string, model: string, usage: object }>}
 */
export async function chat(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.chat;

  const parts = [];
  if (opts.imageUrl) {
    // For image inputs, fetch and include as inline data
    const imgRes = await fetch(opts.imageUrl);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    const mimeType = imgRes.headers.get('content-type') || 'image/png';
    parts.push({ inlineData: { mimeType, data: imgBuf.toString('base64') } });
  }
  parts.push({ text: opts.prompt });

  const config = {};
  if (opts.temperature != null) config.temperature = opts.temperature;
  if (opts.maxTokens) config.maxOutputTokens = opts.maxTokens;

  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    ...(opts.systemPrompt ? { systemInstruction: { parts: [{ text: opts.systemPrompt }] } } : {}),
    config,
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    text,
    model,
    usage: response.usageMetadata || {},
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
