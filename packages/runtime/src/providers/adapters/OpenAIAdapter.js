/**
 * OpenAIAdapter — Lazy-loading adapter for OpenAI capabilities.
 *
 * Supports: image generation, TTS, STT, video generation, chat.
 * SDK is loaded via dynamic import() only when first used.
 */

import { BaseAdapter } from './BaseAdapter.js';

export class OpenAIAdapter extends BaseAdapter {
  constructor() {
    super('openai');
  }

  async _loadSdk() {
    if (this._client) return;
    const { default: OpenAI } = await import('openai');
    this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  _hasApiKey() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  getCapabilities() {
    return ['image-gen', 'tts', 'stt', 'video-gen', 'chat'];
  }

  async generateImage({ prompt, model, size, quality, n }) {
    await this._loadSdk();
    const response = await this._client.images.generate({
      model: model || 'gpt-image-1',
      prompt,
      size: size || '1024x1024',
      quality: quality || 'auto',
      n: n || 1,
    });
    return {
      data: response.data,
      metadata: { model: model || 'gpt-image-1', provider: 'openai' },
    };
  }

  async textToSpeech({ text, voice, model, speed, format }) {
    await this._loadSdk();
    const response = await this._client.audio.speech.create({
      model: model || 'gpt-4o-mini-tts',
      voice: voice || 'alloy',
      input: text,
      speed: speed || 1.0,
      response_format: format || 'mp3',
    });
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      metadata: { model: model || 'gpt-4o-mini-tts', voice: voice || 'alloy', provider: 'openai' },
    };
  }

  async speechToText({ audioBuffer, model, language }) {
    await this._loadSdk();
    const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
    const response = await this._client.audio.transcriptions.create({
      model: model || 'whisper-1',
      file,
      language,
    });
    return {
      text: response.text,
      metadata: { model: model || 'whisper-1', provider: 'openai' },
    };
  }

  estimateCost(capability, params = {}) {
    switch (capability) {
      case 'image-gen': {
        const quality = params.quality || 'medium';
        const prices = { low: 0.011, medium: 0.042, high: 0.167 };
        return prices[quality] || 0.042;
      }
      case 'tts': {
        const chars = (params.text || '').length;
        return (chars / 1_000_000) * 15; // $15 per 1M characters
      }
      case 'stt':
        return 0.006; // ~$0.006 per minute
      default:
        return 0;
    }
  }
}

export default OpenAIAdapter;
