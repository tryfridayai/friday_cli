#!/usr/bin/env node

/**
 * Friday Media MCP Server
 *
 * Exposes multi-modal AI capabilities as MCP tools:
 * - generate_image:   Text-to-image (OpenAI gpt-image-1.5, Google Imagen 4)
 * - generate_video:   Text-to-video (OpenAI Sora 2, Google Veo 3.1)
 * - text_to_speech:   TTS (ElevenLabs Eleven v3, OpenAI, Google)
 * - speech_to_text:   STT (OpenAI Whisper, Google Gemini)
 * - query_model:      Query external models (GPT-5.2, Gemini 3 Pro)
 * - list_voices:      List available TTS voices
 * - clone_voice:      Clone a voice from audio samples (ElevenLabs)
 *
 * This server is spawned by the Claude Agent SDK via .mcp.json config.
 * It receives API keys via environment variables.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import ProviderRegistry, { MediaContext, CAPABILITIES } from '../providers/ProviderRegistry.js';
import * as openai from '../providers/openai.js';
import * as google from '../providers/google.js';
import * as elevenlabs from '../providers/elevenlabs.js';

const SERVER_NAME = 'friday-media';
const SERVER_VERSION = '1.0.0';

// Output directory for generated files
const OUTPUT_DIR = process.env.MEDIA_OUTPUT_DIR || process.env.WORKSPACE_PATH
  ? `${process.env.WORKSPACE_PATH || '.'}/generated`
  : './generated';

const registry = new ProviderRegistry();
const mediaContext = new MediaContext();

const log = (msg) => console.error(`[${SERVER_NAME}] ${msg}`);

log(`Media MCP Server v${SERVER_VERSION} started`);
log(`Output directory: ${OUTPUT_DIR}`);

// ─── Provider dispatch ───────────────────────────────────────────

const providerModules = {
  openai,
  google,
  elevenlabs,
};

function getProviderModule(providerId) {
  const mod = providerModules[providerId];
  if (!mod) throw new Error(`Unknown provider: ${providerId}`);
  return mod;
}

// ─── Tool Definitions ────────────────────────────────────────────

const TOOLS = [
  {
    name: 'generate_image',
    description: 'Generate an image from a text prompt. Supports OpenAI (gpt-image-1.5) and Google (Imagen 4). Returns the local file path of the generated image.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate' },
        provider: { type: 'string', enum: ['openai', 'google'], description: 'AI provider (auto-selects if omitted)' },
        model: { type: 'string', description: 'Specific model ID override' },
        size: { type: 'string', enum: ['1024x1024', '1024x1536', '1536x1024'], description: 'Image size (OpenAI)' },
        quality: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Image quality (OpenAI)' },
        aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'], description: 'Aspect ratio (Google)' },
        n: { type: 'number', description: 'Number of images (1-4)', minimum: 1, maximum: 4 },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_video',
    description: 'Generate a video from a text prompt. Supports OpenAI (Sora 2) and Google (Veo 3.1). This is async and may take 1-5 minutes. Returns the local file path.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the video to generate' },
        provider: { type: 'string', enum: ['openai', 'google'], description: 'AI provider (auto-selects if omitted)' },
        model: { type: 'string', description: 'Specific model ID override' },
        seconds: { type: 'number', enum: [4, 8, 12], description: 'Video duration in seconds. Only 4, 8, or 12 are supported.' },
        size: { type: 'string', enum: ['1280x720', '1920x1080'], description: 'Resolution (OpenAI)' },
        aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], description: 'Aspect ratio (Google)' },
        image_url: { type: 'string', description: 'Image URL for image-to-video generation' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'text_to_speech',
    description: 'Convert text to natural-sounding speech audio. Supports ElevenLabs (Eleven v3 — most expressive), OpenAI (gpt-4o-mini-tts), and Google. Returns the local audio file path.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to convert to speech' },
        provider: { type: 'string', enum: ['elevenlabs', 'openai', 'google'], description: 'TTS provider (auto-selects if omitted)' },
        model: { type: 'string', description: 'Specific model ID override' },
        voice: { type: 'string', description: 'Voice name or ID (provider-specific)' },
        speed: { type: 'number', description: 'Playback speed 0.25-4.0 (OpenAI only)', minimum: 0.25, maximum: 4.0 },
        instructions: { type: 'string', description: 'Voice style instructions (OpenAI gpt-4o-mini-tts only)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'speech_to_text',
    description: 'Transcribe audio to text. Supports OpenAI (Whisper) and Google (Gemini). Returns the transcription text and saves it to a file.',
    inputSchema: {
      type: 'object',
      properties: {
        audio_path: { type: 'string', description: 'Path to the audio file to transcribe' },
        provider: { type: 'string', enum: ['openai', 'google'], description: 'STT provider (auto-selects if omitted)' },
        model: { type: 'string', description: 'Specific model ID override' },
        language: { type: 'string', description: 'ISO 639-1 language code (e.g., "en", "es", "fr")' },
        timestamps: { type: 'boolean', description: 'Include word-level timestamps (OpenAI only)' },
      },
      required: ['audio_path'],
    },
  },
  {
    name: 'query_model',
    description: 'Query an external AI model directly (OpenAI GPT-5.2 or Google Gemini 3 Pro). Useful for getting a second opinion, specialized knowledge, or comparing outputs.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The query to send to the model' },
        provider: { type: 'string', enum: ['openai', 'google'], description: 'Which provider to query (required)' },
        model: { type: 'string', description: 'Specific model (defaults to best available)' },
        system_prompt: { type: 'string', description: 'Optional system context' },
        temperature: { type: 'number', description: '0.0-2.0 sampling temperature', minimum: 0, maximum: 2 },
        max_tokens: { type: 'number', description: 'Maximum response tokens' },
        image_url: { type: 'string', description: 'Image URL for vision queries' },
      },
      required: ['prompt', 'provider'],
    },
  },
  {
    name: 'list_voices',
    description: 'List available TTS voices for a provider. Returns voice names and IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['openai', 'elevenlabs'], description: 'Which provider to list voices for' },
      },
    },
  },
  {
    name: 'clone_voice',
    description: 'Create a custom voice clone from audio samples using ElevenLabs. Requires ElevenLabs API key.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the cloned voice' },
        audio_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to audio sample files (1-25 files)',
        },
        description: { type: 'string', description: 'Voice description' },
      },
      required: ['name', 'audio_paths'],
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────────

async function handleGenerateImage(input) {
  const providerId = registry.resolveProvider(CAPABILITIES.IMAGE_GEN, input.provider);
  if (!providerId) throw new Error('No image generation provider available. Set OPENAI_API_KEY or GOOGLE_API_KEY.');

  const model = registry.resolveModel(CAPABILITIES.IMAGE_GEN, providerId, input.model);
  const provider = getProviderModule(providerId);

  log(`Generating image with ${providerId}/${model || 'default'}...`);

  const result = await provider.generateImage({
    prompt: input.prompt,
    model,
    size: input.size,
    quality: input.quality,
    aspectRatio: input.aspect_ratio,
    n: input.n,
    outputDir: OUTPUT_DIR,
  });

  const primary = Array.isArray(result) ? result[0] : result;
  mediaContext.addAsset({
    type: 'image',
    provider: providerId,
    model: primary.model,
    prompt: input.prompt,
    path: primary.path,
    metadata: primary.metadata,
  });

  if (Array.isArray(result)) {
    return `Generated ${result.length} images:\n${result.map((r, i) => `${i + 1}. ${r.path}`).join('\n')}\n\nProvider: ${providerId}, Model: ${primary.model}`;
  }
  return `Image saved to: ${primary.path}\nProvider: ${providerId}, Model: ${primary.model}`;
}

async function handleGenerateVideo(input) {
  const providerId = registry.resolveProvider(CAPABILITIES.VIDEO_GEN, input.provider);
  if (!providerId) throw new Error('No video generation provider available. Set OPENAI_API_KEY or GOOGLE_API_KEY.');

  const model = registry.resolveModel(CAPABILITIES.VIDEO_GEN, providerId, input.model);
  const provider = getProviderModule(providerId);

  log(`Generating video with ${providerId}/${model || 'default'} (this may take several minutes)...`);

  const result = await provider.generateVideo({
    prompt: input.prompt,
    model,
    size: input.size,
    seconds: input.seconds,
    aspectRatio: input.aspect_ratio,
    imageUrl: input.image_url,
    outputDir: OUTPUT_DIR,
  });

  mediaContext.addAsset({
    type: 'video',
    provider: providerId,
    model: result.model,
    prompt: input.prompt,
    path: result.path,
    metadata: result.metadata,
  });

  return `Video saved to: ${result.path}\nProvider: ${providerId}, Model: ${result.model}, Duration: ${result.metadata.seconds || 'N/A'}s`;
}

async function handleTextToSpeech(input) {
  const providerId = registry.resolveProvider(CAPABILITIES.TTS, input.provider);
  if (!providerId) throw new Error('No TTS provider available. Set ELEVENLABS_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.');

  const model = registry.resolveModel(CAPABILITIES.TTS, providerId, input.model);
  const provider = getProviderModule(providerId);

  log(`Converting text to speech with ${providerId}/${model || 'default'}...`);

  const result = await provider.textToSpeech({
    text: input.text,
    model,
    voice: input.voice,
    speed: input.speed,
    instructions: input.instructions,
    format: input.format,
    outputDir: OUTPUT_DIR,
  });

  mediaContext.addAsset({
    type: 'audio',
    provider: providerId,
    model: result.model,
    prompt: `TTS: "${input.text.substring(0, 100)}${input.text.length > 100 ? '...' : ''}"`,
    path: result.path,
    metadata: result.metadata,
  });

  return `Audio saved to: ${result.path}\nProvider: ${providerId}, Model: ${result.model}, Voice: ${result.metadata.voice || 'default'}`;
}

async function handleSpeechToText(input) {
  const providerId = registry.resolveProvider(CAPABILITIES.STT, input.provider);
  if (!providerId) throw new Error('No STT provider available. Set OPENAI_API_KEY or GOOGLE_API_KEY.');

  const model = registry.resolveModel(CAPABILITIES.STT, providerId, input.model);
  const provider = getProviderModule(providerId);

  log(`Transcribing audio with ${providerId}/${model || 'default'}...`);

  const result = await provider.speechToText({
    audioPath: input.audio_path,
    model,
    language: input.language,
    timestamps: input.timestamps,
    outputDir: OUTPUT_DIR,
  });

  mediaContext.addAsset({
    type: 'transcript',
    provider: providerId,
    model: result.model,
    prompt: `STT: ${input.audio_path}`,
    path: result.path,
    metadata: result.metadata,
  });

  return `Transcription:\n${result.text}\n\nSaved to: ${result.path}\nProvider: ${providerId}, Model: ${result.model}`;
}

async function handleQueryModel(input) {
  const providerId = input.provider;
  if (!registry.hasApiKey(providerId)) {
    throw new Error(`No API key for ${providerId}. Set ${providerId === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_API_KEY'}.`);
  }

  const model = registry.resolveModel(CAPABILITIES.CHAT, providerId, input.model);
  const provider = getProviderModule(providerId);

  log(`Querying ${providerId}/${model || 'default'}...`);

  const result = await provider.chat({
    prompt: input.prompt,
    model,
    systemPrompt: input.system_prompt,
    temperature: input.temperature,
    maxTokens: input.max_tokens,
    imageUrl: input.image_url,
  });

  return `[${providerId}/${result.model}]\n\n${result.text}`;
}

async function handleListVoices(input) {
  const providerId = input?.provider;

  const allVoices = [];

  if (!providerId || providerId === 'openai') {
    if (registry.hasApiKey('openai')) {
      allVoices.push(...openai.listVoices());
    }
  }

  if (!providerId || providerId === 'elevenlabs') {
    if (registry.hasApiKey('elevenlabs')) {
      const elVoices = await elevenlabs.listVoices();
      allVoices.push(...elVoices);
    }
  }

  if (!allVoices.length) {
    return 'No voices available. Ensure OPENAI_API_KEY or ELEVENLABS_API_KEY is set.';
  }

  const grouped = {};
  for (const v of allVoices) {
    if (!grouped[v.provider]) grouped[v.provider] = [];
    grouped[v.provider].push(v);
  }

  let output = '';
  for (const [provider, voices] of Object.entries(grouped)) {
    output += `\n## ${provider} (${voices.length} voices)\n`;
    output += voices.map((v) => `- ${v.name} (${v.id})`).join('\n');
    output += '\n';
  }

  return output.trim();
}

async function handleCloneVoice(input) {
  if (!registry.hasApiKey('elevenlabs')) {
    throw new Error('Voice cloning requires ELEVENLABS_API_KEY.');
  }

  log(`Cloning voice "${input.name}" from ${input.audio_paths.length} samples...`);

  const result = await elevenlabs.cloneVoice({
    name: input.name,
    audioPaths: input.audio_paths,
    description: input.description,
  });

  return `Voice cloned successfully!\nName: ${result.name}\nVoice ID: ${result.voiceId}\n\nYou can now use this voice with text_to_speech by setting voice="${result.voiceId}".`;
}

// ─── MCP Server Setup ────────────────────────────────────────────

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'generate_image':
        result = await handleGenerateImage(args);
        break;
      case 'generate_video':
        result = await handleGenerateVideo(args);
        break;
      case 'text_to_speech':
        result = await handleTextToSpeech(args);
        break;
      case 'speech_to_text':
        result = await handleSpeechToText(args);
        break;
      case 'query_model':
        result = await handleQueryModel(args);
        break;
      case 'list_voices':
        result = await handleListVoices(args);
        break;
      case 'clone_voice':
        result = await handleCloneVoice(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // Append media context summary if there are assets
    const contextSummary = mediaContext.getContextSummary();
    if (contextSummary && name !== 'list_voices' && name !== 'query_model') {
      result += `\n\n---\n[Session Media Context]${contextSummary}`;
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    log(`Error in ${name}: ${error.message}`);
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ─── Start Server ────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('Connected via stdio transport');
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
