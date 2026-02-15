/**
 * OpenAI Provider
 *
 * Wraps the OpenAI SDK for:
 * - Image generation (gpt-image-1.5, gpt-image-1, gpt-image-1-mini)
 * - Video generation (sora-2, sora-2-pro)
 * - Text-to-speech (gpt-4o-mini-tts)
 * - Speech-to-text (whisper-1)
 * - Chat completions (gpt-5.2, gpt-5.2-codex, gpt-5.2-pro)
 */

import fs from 'fs';
import path from 'path';

// Lazy-load the OpenAI SDK
let OpenAI = null;
let clientInstance = null;

// Use dynamic import for lazy loading
async function ensureClient() {
  if (clientInstance) return clientInstance;
  try {
    const mod = await import('openai');
    OpenAI = mod.default || mod.OpenAI;
    clientInstance = new OpenAI();
    return clientInstance;
  } catch {
    throw new Error('openai package not installed. Run: npm install openai');
  }
}

// ─── Default Models ──────────────────────────────────────────────

export const DEFAULTS = {
  imageGen: 'gpt-image-1.5',
  videoGen: 'sora-2',
  tts: 'gpt-4o-mini-tts',
  stt: 'whisper-1',
  chat: 'gpt-5.2',
};

export const MODELS = {
  imageGen: [
    { id: 'gpt-image-1.5', name: 'GPT Image 1.5', description: 'Latest, best quality, 4x faster' },
    { id: 'gpt-image-1', name: 'GPT Image 1', description: 'High quality generation and edits' },
    { id: 'gpt-image-1-mini', name: 'GPT Image 1 Mini', description: 'Cost-effective' },
  ],
  videoGen: [
    { id: 'sora-2', name: 'Sora 2', description: 'Fast, flexible video generation' },
    { id: 'sora-2-pro', name: 'Sora 2 Pro', description: 'Higher fidelity, production quality' },
  ],
  tts: [
    { id: 'gpt-4o-mini-tts', name: 'GPT-4o Mini TTS', description: 'Latest, steerable, low WER' },
    { id: 'tts-1-hd', name: 'TTS-1 HD', description: 'High definition' },
    { id: 'tts-1', name: 'TTS-1', description: 'Standard quality' },
  ],
  stt: [
    { id: 'whisper-1', name: 'Whisper', description: 'General-purpose speech recognition' },
  ],
  chat: [
    { id: 'gpt-5.2', name: 'GPT-5.2', description: 'Flagship model' },
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', description: 'Coding-optimized' },
    { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', description: 'More compute, harder problems' },
  ],
};

export const VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
];

// ─── Image Generation ────────────────────────────────────────────

/**
 * Generate an image from a text prompt.
 *
 * @param {object} opts
 * @param {string} opts.prompt - Image description
 * @param {string} [opts.model] - Model ID (default: gpt-image-1.5)
 * @param {string} [opts.size] - '1024x1024' | '1024x1536' | '1536x1024'
 * @param {string} [opts.quality] - 'low' | 'medium' | 'high'
 * @param {string} [opts.outputFormat] - 'png' | 'webp' | 'jpeg'
 * @param {string} [opts.background] - 'transparent' | 'opaque'
 * @param {number} [opts.n] - Number of images (1-4)
 * @param {string} opts.outputDir - Directory to save the file
 * @returns {Promise<{ path: string, model: string, metadata: object }>}
 */
export async function generateImage(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.imageGen;
  const size = opts.size || '1024x1024';
  const quality = opts.quality || 'high';
  const outputFormat = opts.outputFormat || 'png';
  const n = Math.min(Math.max(opts.n || 1, 1), 4);

  const response = await client.images.generate({
    model,
    prompt: opts.prompt,
    size,
    quality,
    output_format: outputFormat,
    ...(opts.background ? { background: opts.background } : {}),
    n,
  });

  // GPT Image models return b64_json
  const results = [];
  for (let i = 0; i < response.data.length; i++) {
    const item = response.data[i];
    const filename = `img_${Date.now()}_${i}.${outputFormat}`;
    const filePath = path.join(opts.outputDir, 'images', filename);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (item.b64_json) {
      fs.writeFileSync(filePath, Buffer.from(item.b64_json, 'base64'));
    } else if (item.url) {
      // DALL-E models (deprecated) return URLs
      const res = await fetch(item.url);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filePath, buf);
    }

    results.push({
      path: filePath,
      model,
      metadata: {
        size,
        quality,
        format: outputFormat,
        revisedPrompt: item.revised_prompt || null,
      },
    });
  }

  return results.length === 1 ? results[0] : results;
}

// ─── Video Generation ────────────────────────────────────────────

/**
 * Generate a video from a text prompt.
 * This is an async job — we poll for completion.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model] - 'sora-2' | 'sora-2-pro'
 * @param {string} [opts.size] - '1280x720' | '1920x1080'
 * @param {number} [opts.seconds] - Duration (5-25)
 * @param {string} opts.outputDir
 * @returns {Promise<{ path: string, model: string, metadata: object }>}
 */
export async function generateVideo(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.videoGen;
  const size = opts.size || '1280x720';
  const seconds = String(Math.min(Math.max(opts.seconds || 8, 5), 25));

  // Start the video generation job
  const job = await client.videos.create({
    model,
    prompt: opts.prompt,
    size,
    seconds,
  });

  // Poll for completion (max 5 minutes, 15s intervals)
  const videoId = job.id;
  const maxWait = 300_000;
  const interval = 15_000;
  let elapsed = 0;

  while (elapsed < maxWait) {
    await sleep(interval);
    elapsed += interval;

    const status = await client.videos.retrieve(videoId);

    if (status.status === 'completed') {
      // Download the video
      const filename = `vid_${Date.now()}.mp4`;
      const filePath = path.join(opts.outputDir, 'videos', filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      // The completed video has a download URL
      if (status.url) {
        const res = await fetch(status.url);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(filePath, buf);
      }

      return {
        path: filePath,
        model,
        metadata: { size, seconds: Number(seconds), duration: Number(seconds) },
      };
    }

    if (status.status === 'failed') {
      throw new Error(`Video generation failed: ${status.error || 'Unknown error'}`);
    }
  }

  throw new Error(`Video generation timed out after ${maxWait / 1000}s (job: ${videoId})`);
}

// ─── Text-to-Speech ──────────────────────────────────────────────

/**
 * Convert text to speech audio.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {string} [opts.model] - TTS model
 * @param {string} [opts.voice] - Voice name (default: 'nova')
 * @param {string} [opts.format] - 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
 * @param {number} [opts.speed] - 0.25 to 4.0
 * @param {string} [opts.instructions] - Steer voice style (gpt-4o-mini-tts only)
 * @param {string} opts.outputDir
 * @returns {Promise<{ path: string, model: string, metadata: object }>}
 */
export async function textToSpeech(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.tts;
  const voice = opts.voice || 'nova';
  const format = opts.format || 'mp3';
  const speed = opts.speed || 1.0;

  const response = await client.audio.speech.create({
    model,
    voice,
    input: opts.text,
    response_format: format,
    speed,
    ...(opts.instructions && model.includes('gpt-4o') ? { instructions: opts.instructions } : {}),
  });

  const filename = `tts_${Date.now()}.${format}`;
  const filePath = path.join(opts.outputDir, 'audio', filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return {
    path: filePath,
    model,
    metadata: { voice, format, speed, textLength: opts.text.length },
  };
}

// ─── Speech-to-Text ──────────────────────────────────────────────

/**
 * Transcribe audio to text.
 *
 * @param {object} opts
 * @param {string} opts.audioPath - Path to audio file
 * @param {string} [opts.model]
 * @param {string} [opts.language] - ISO 639-1 code
 * @param {boolean} [opts.timestamps] - Include word timestamps
 * @param {string} opts.outputDir
 * @returns {Promise<{ text: string, path: string, model: string, metadata: object }>}
 */
export async function speechToText(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.stt;

  const audioFile = fs.createReadStream(opts.audioPath);

  const response = await client.audio.transcriptions.create({
    model,
    file: audioFile,
    ...(opts.language ? { language: opts.language } : {}),
    ...(opts.timestamps ? { timestamp_granularities: ['word'], response_format: 'verbose_json' } : {}),
  });

  const text = typeof response === 'string' ? response : response.text;

  // Save transcript
  const filename = `stt_${Date.now()}.txt`;
  const filePath = path.join(opts.outputDir, 'audio', filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');

  return {
    text,
    path: filePath,
    model,
    metadata: {
      language: opts.language || 'auto',
      sourceFile: opts.audioPath,
      ...(response.words ? { words: response.words } : {}),
    },
  };
}

// ─── Chat Completion ─────────────────────────────────────────────

/**
 * Query an OpenAI chat model.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]
 * @param {string} [opts.systemPrompt]
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.imageUrl] - Image URL for vision queries
 * @returns {Promise<{ text: string, model: string, usage: object }>}
 */
export async function chat(opts) {
  const client = await ensureClient();
  const model = opts.model || DEFAULTS.chat;

  const messages = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }

  // Build user message (with optional image)
  if (opts.imageUrl) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: opts.prompt },
        { type: 'image_url', image_url: { url: opts.imageUrl } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: opts.prompt });
  }

  const response = await client.chat.completions.create({
    model,
    messages,
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
  });

  return {
    text: response.choices[0]?.message?.content || '',
    model,
    usage: response.usage || {},
  };
}

// ─── Voice Listing ───────────────────────────────────────────────

export function listVoices() {
  return VOICES.map((v) => ({ id: v, name: v, provider: 'openai' }));
}

// ─── Helpers ─────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
