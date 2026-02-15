/**
 * GoogleAdapter — Lazy-loading adapter for Google AI (Gemini/Imagen/Veo).
 *
 * Supports: image generation, video generation, TTS, STT, chat.
 * SDK is loaded via dynamic import() only when first used.
 */

import fs from 'fs';
import path from 'path';
import { BaseAdapter } from './BaseAdapter.js';

export class GoogleAdapter extends BaseAdapter {
  constructor() {
    super('google');
  }

  async _loadSdk() {
    if (this._client) return;
    const mod = await import('@google/genai');
    const GoogleGenAI = mod.GoogleGenAI || mod.default;
    this._client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }

  _hasApiKey() {
    return Boolean(process.env.GOOGLE_API_KEY);
  }

  getCapabilities() {
    return ['image-gen', 'video-gen', 'tts', 'stt', 'chat'];
  }

  async generateImage({ prompt, model, n, aspectRatio, outputDir }) {
    await this._loadSdk();
    const resolvedModel = model || 'imagen-4';
    const count = Math.min(Math.max(n || 1, 1), 4);

    const response = await this._client.models.generateImages({
      model: resolvedModel,
      prompt,
      config: {
        numberOfImages: count,
        aspectRatio: aspectRatio || '1:1',
      },
    });

    const results = [];
    for (let i = 0; i < response.generatedImages.length; i++) {
      const img = response.generatedImages[i];
      const filename = `img_${Date.now()}_${i}.png`;
      const filePath = path.join(outputDir, 'images', filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(img.image.imageBytes, 'base64'));
      results.push({ path: filePath, model: resolvedModel, metadata: { aspectRatio: aspectRatio || '1:1', format: 'png' } });
    }

    return results.length === 1 ? results[0] : results;
  }

  async generateVideo({ prompt, model, seconds, aspectRatio, imageUrl, outputDir }) {
    await this._loadSdk();
    const resolvedModel = model || 'veo-3.1';

    const config = {};
    if (aspectRatio) config.aspectRatio = aspectRatio;
    if (seconds) config.durationSeconds = seconds;

    let operation;
    if (imageUrl) {
      operation = await this._client.models.generateVideos({
        model: resolvedModel,
        prompt,
        image: { imageUri: imageUrl },
        config,
      });
    } else {
      operation = await this._client.models.generateVideos({
        model: resolvedModel,
        prompt,
        config,
      });
    }

    // Poll for completion (max 10 minutes, 20s intervals)
    const maxWait = 600_000;
    const interval = 20_000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, interval));
      elapsed += interval;

      const status = await this._client.operations.get({ name: operation.name });

      if (status.done) {
        const video = status.response?.generatedVideos?.[0];
        if (!video) throw new Error('Video generation completed but no video returned');

        const filename = `vid_${Date.now()}.mp4`;
        const filePath = path.join(outputDir, 'videos', filename);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        if (video.video?.uri) {
          const res = await fetch(video.video.uri);
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(filePath, buf);
        }

        return {
          path: filePath,
          model: resolvedModel,
          metadata: { aspectRatio: aspectRatio || '16:9', seconds: seconds || null },
        };
      }

      if (status.error) {
        throw new Error(`Video generation failed: ${status.error.message || 'Unknown error'}`);
      }
    }

    throw new Error(`Video generation timed out after ${maxWait / 1000}s`);
  }

  async textToSpeech({ text, voice, model, outputDir }) {
    await this._loadSdk();
    const resolvedModel = model || 'gemini-2.5-flash-lite';

    const response = await this._client.models.generateContent({
      model: resolvedModel,
      contents: [{ role: 'user', parts: [{ text: `Read the following text aloud clearly and naturally:\n\n${text}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith('audio/'));
    if (!audioPart) throw new Error('Google TTS did not return audio data');

    if (outputDir) {
      const filename = `tts_${Date.now()}.wav`;
      const filePath = path.join(outputDir, 'audio', filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(audioPart.inlineData.data, 'base64'));
      return {
        path: filePath,
        buffer: Buffer.from(audioPart.inlineData.data, 'base64'),
        metadata: { model: resolvedModel, voice: voice || 'Kore', provider: 'google' },
      };
    }

    return {
      buffer: Buffer.from(audioPart.inlineData.data, 'base64'),
      metadata: { model: resolvedModel, voice: voice || 'Kore', provider: 'google' },
    };
  }

  async speechToText({ audioBuffer, audioPath, model, language }) {
    await this._loadSdk();
    const resolvedModel = model || 'gemini-2.5-flash-lite';

    let base64Data;
    let mimeType = 'audio/wav';

    if (audioPath) {
      base64Data = fs.readFileSync(audioPath).toString('base64');
      const ext = path.extname(audioPath).toLowerCase().replace('.', '');
      mimeType = ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : `audio/${ext}`;
    } else if (audioBuffer) {
      base64Data = audioBuffer.toString('base64');
    } else {
      throw new Error('Either audioBuffer or audioPath is required');
    }

    const languageHint = language ? ` The audio is in ${language}.` : '';

    const response = await this._client.models.generateContent({
      model: resolvedModel,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: `Transcribe the audio accurately. Return only the transcription text, nothing else.${languageHint}` },
        ],
      }],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      text,
      metadata: { model: resolvedModel, provider: 'google' },
    };
  }

  estimateCost(capability, params = {}) {
    switch (capability) {
      case 'image-gen':
        return 0.04; // Imagen pricing varies
      case 'video-gen':
        return 0.35; // Veo pricing varies by duration
      case 'tts':
        return 0.002; // Gemini multimodal TTS
      case 'stt':
        return 0.002; // Gemini multimodal STT
      default:
        return 0;
    }
  }
}

export default GoogleAdapter;
