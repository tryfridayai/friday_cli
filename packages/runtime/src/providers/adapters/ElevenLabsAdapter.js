/**
 * ElevenLabsAdapter — Lazy-loading adapter for ElevenLabs TTS.
 *
 * Supports: text-to-speech with multiple voices and models.
 * SDK is loaded via dynamic import() only when first used.
 */

import fs from 'fs';
import path from 'path';
import { BaseAdapter } from './BaseAdapter.js';

// Well-known default voices
const DEFAULT_VOICES = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  drew: '29vD33N1CtxCmqQRPOHJ',
  paul: '5Q0t7uMcjvnagumLfvZi',
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  emily: 'LcfcDJNUP1GQjkzn1xUU',
  charlie: 'IKne3meq5aSn9XLyUdCD',
  adam: 'pNInz6obpgDQGcFmaJgB',
  alice: 'Xb7hH8MSUJpSbSDYk0k2',
  lily: 'pFZP5JQG7iQjIQuC4Bku',
};

export class ElevenLabsAdapter extends BaseAdapter {
  constructor() {
    super('elevenlabs');
  }

  async _loadSdk() {
    if (this._client) return;
    const mod = await import('@elevenlabs/elevenlabs-js');
    const ElevenLabsClient = mod.ElevenLabsClient || mod.default;
    this._client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
  }

  _hasApiKey() {
    return Boolean(process.env.ELEVENLABS_API_KEY);
  }

  getCapabilities() {
    return ['tts'];
  }

  async textToSpeech({ text, voice, model, format, outputDir }) {
    await this._loadSdk();
    const resolvedModel = model || 'eleven_v3';

    // Resolve voice name to ID
    const voiceInput = voice || 'rachel';
    const voiceId = DEFAULT_VOICES[voiceInput.toLowerCase()] || voiceInput;

    const audioStream = await this._client.textToSpeech.convert(voiceId, {
      text,
      model_id: resolvedModel,
      ...(format ? { output_format: format } : {}),
    });

    // Collect stream chunks into buffer
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (outputDir) {
      const filename = `tts_${Date.now()}.mp3`;
      const filePath = path.join(outputDir, 'audio', filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, buffer);
      return {
        path: filePath,
        buffer,
        metadata: { model: resolvedModel, voice: voiceInput, voiceId, provider: 'elevenlabs' },
      };
    }

    return {
      buffer,
      metadata: { model: resolvedModel, voice: voiceInput, voiceId, provider: 'elevenlabs' },
    };
  }

  async listVoices() {
    await this._loadSdk();
    try {
      const response = await this._client.voices.getAll();
      const voices = response.voices || response;
      return voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        provider: 'elevenlabs',
        category: v.category || 'premade',
      }));
    } catch {
      // Fallback to built-in list
      return Object.entries(DEFAULT_VOICES).map(([name, id]) => ({
        id,
        name,
        provider: 'elevenlabs',
        category: 'premade',
      }));
    }
  }

  estimateCost(capability, params = {}) {
    if (capability === 'tts') {
      const chars = (params.text || '').length;
      return (chars / 1_000) * 0.30; // ~$0.30 per 1K characters
    }
    return 0;
  }
}

export default ElevenLabsAdapter;
