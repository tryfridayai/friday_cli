import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BaseAdapter } from '../src/providers/adapters/BaseAdapter.js';
import { OpenAIAdapter } from '../src/providers/adapters/OpenAIAdapter.js';
import { GoogleAdapter } from '../src/providers/adapters/GoogleAdapter.js';
import { ElevenLabsAdapter } from '../src/providers/adapters/ElevenLabsAdapter.js';
import ProviderRegistry, { CAPABILITIES, PROVIDERS } from '../providers/ProviderRegistry.js';

describe('BaseAdapter', () => {
  it('throws on abstract methods', () => {
    const base = new BaseAdapter('test');
    assert.rejects(() => base._loadSdk(), /must be implemented/);
    assert.throws(() => base._hasApiKey(), /must be implemented/);
    assert.throws(() => base.getCapabilities(), /must be implemented/);
  });

  it('estimateCost returns 0 by default', () => {
    const base = new BaseAdapter('test');
    assert.equal(base.estimateCost('anything'), 0);
  });
});

describe('OpenAIAdapter', () => {
  it('extends BaseAdapter', () => {
    const adapter = new OpenAIAdapter();
    assert.ok(adapter instanceof BaseAdapter);
    assert.equal(adapter.providerId, 'openai');
  });

  it('reports correct capabilities', () => {
    const caps = new OpenAIAdapter().getCapabilities();
    assert.ok(caps.includes('image-gen'));
    assert.ok(caps.includes('tts'));
    assert.ok(caps.includes('stt'));
    assert.ok(caps.includes('chat'));
  });

  it('estimates image cost by quality', () => {
    const adapter = new OpenAIAdapter();
    assert.equal(adapter.estimateCost('image-gen', { quality: 'low' }), 0.011);
    assert.equal(adapter.estimateCost('image-gen', { quality: 'medium' }), 0.042);
    assert.equal(adapter.estimateCost('image-gen', { quality: 'high' }), 0.167);
  });

  it('estimates TTS cost by character count', () => {
    const adapter = new OpenAIAdapter();
    const cost = adapter.estimateCost('tts', { text: 'a'.repeat(1000) });
    assert.ok(cost > 0);
  });

  it('isAvailable returns false without API key', async () => {
    const adapter = new OpenAIAdapter();
    const orig = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    adapter._available = null;
    adapter._client = null;
    const available = await adapter.isAvailable();
    assert.equal(available, false);
    if (orig) process.env.OPENAI_API_KEY = orig;
  });
});

describe('GoogleAdapter', () => {
  it('extends BaseAdapter', () => {
    const adapter = new GoogleAdapter();
    assert.ok(adapter instanceof BaseAdapter);
    assert.equal(adapter.providerId, 'google');
  });

  it('reports correct capabilities', () => {
    const caps = new GoogleAdapter().getCapabilities();
    assert.ok(caps.includes('image-gen'));
    assert.ok(caps.includes('video-gen'));
    assert.ok(caps.includes('tts'));
    assert.ok(caps.includes('stt'));
    assert.ok(caps.includes('chat'));
  });

  it('estimates costs', () => {
    const adapter = new GoogleAdapter();
    assert.ok(adapter.estimateCost('image-gen') > 0);
    assert.ok(adapter.estimateCost('video-gen') > 0);
    assert.ok(adapter.estimateCost('tts') > 0);
  });
});

describe('ElevenLabsAdapter', () => {
  it('extends BaseAdapter', () => {
    const adapter = new ElevenLabsAdapter();
    assert.ok(adapter instanceof BaseAdapter);
    assert.equal(adapter.providerId, 'elevenlabs');
  });

  it('only supports TTS', () => {
    const caps = new ElevenLabsAdapter().getCapabilities();
    assert.deepEqual(caps, ['tts']);
  });

  it('estimates TTS cost', () => {
    const adapter = new ElevenLabsAdapter();
    const cost = adapter.estimateCost('tts', { text: 'hello world' });
    assert.ok(cost > 0);
  });
});

describe('ProviderRegistry', () => {
  it('exports CAPABILITIES constants', () => {
    assert.equal(CAPABILITIES.IMAGE_GEN, 'image-gen');
    assert.equal(CAPABILITIES.TTS, 'tts');
    assert.equal(CAPABILITIES.STT, 'stt');
    assert.equal(CAPABILITIES.VIDEO_GEN, 'video-gen');
    assert.equal(CAPABILITIES.CHAT, 'chat');
  });

  it('exports PROVIDERS constants', () => {
    assert.equal(PROVIDERS.OPENAI, 'openai');
    assert.equal(PROVIDERS.GOOGLE, 'google');
    assert.equal(PROVIDERS.ELEVENLABS, 'elevenlabs');
  });

  it('resolveProvider returns null without API keys', () => {
    const reg = new ProviderRegistry({ preferencesDir: '/tmp/test-pr-' + Date.now() });
    assert.equal(reg.resolveProvider(CAPABILITIES.IMAGE_GEN), null);
  });

  it('preferences round-trip', () => {
    const reg = new ProviderRegistry({ preferencesDir: '/tmp/test-pr-' + Date.now() });
    reg.setPreference(CAPABILITIES.TTS, PROVIDERS.ELEVENLABS, 'eleven_v3');
    const pref = reg.getPreference(CAPABILITIES.TTS);
    assert.equal(pref.provider, 'elevenlabs');
    assert.equal(pref.model, 'eleven_v3');
  });

  it('getAdapter returns adapter instance', async () => {
    const reg = new ProviderRegistry({ preferencesDir: '/tmp/test-pr-' + Date.now() });
    const adapter = await reg.getAdapter('openai');
    assert.ok(adapter instanceof BaseAdapter);
    assert.equal(adapter.providerId, 'openai');
  });

  it('getAdapter caches instances', async () => {
    const reg = new ProviderRegistry({ preferencesDir: '/tmp/test-pr-' + Date.now() });
    const a1 = await reg.getAdapter('openai');
    const a2 = await reg.getAdapter('openai');
    assert.equal(a1, a2); // same instance
  });

  it('getAdapter throws for unknown provider', async () => {
    const reg = new ProviderRegistry({ preferencesDir: '/tmp/test-pr-' + Date.now() });
    await assert.rejects(() => reg.getAdapter('nonexistent'), /Unknown provider/);
  });
});
