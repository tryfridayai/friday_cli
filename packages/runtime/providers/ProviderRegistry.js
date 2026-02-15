/**
 * ProviderRegistry — Central registry for multi-modal AI providers.
 *
 * Manages provider instances, API key retrieval (via McpCredentials),
 * user preferences for which provider handles each capability, and
 * session-scoped media context for seamless asset referencing.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Adapter classes (lazy-loaded)
const ADAPTER_LOADERS = {
  openai: () => import('../src/providers/adapters/OpenAIAdapter.js').then((m) => m.OpenAIAdapter),
  google: () => import('../src/providers/adapters/GoogleAdapter.js').then((m) => m.GoogleAdapter),
  elevenlabs: () => import('../src/providers/adapters/ElevenLabsAdapter.js').then((m) => m.ElevenLabsAdapter),
};

// Capability types
export const CAPABILITIES = {
  IMAGE_GEN: 'image-gen',
  VIDEO_GEN: 'video-gen',
  TTS: 'tts',
  STT: 'stt',
  CHAT: 'chat',
};

// Provider IDs
export const PROVIDERS = {
  OPENAI: 'openai',
  GOOGLE: 'google',
  ELEVENLABS: 'elevenlabs',
};

// Default priority per capability (first available provider wins)
const DEFAULT_PRIORITY = {
  [CAPABILITIES.IMAGE_GEN]: [PROVIDERS.OPENAI, PROVIDERS.GOOGLE],
  [CAPABILITIES.VIDEO_GEN]: [PROVIDERS.OPENAI, PROVIDERS.GOOGLE],
  [CAPABILITIES.TTS]: [PROVIDERS.ELEVENLABS, PROVIDERS.OPENAI, PROVIDERS.GOOGLE],
  [CAPABILITIES.STT]: [PROVIDERS.OPENAI, PROVIDERS.GOOGLE],
  [CAPABILITIES.CHAT]: [PROVIDERS.OPENAI, PROVIDERS.GOOGLE],
};

// Required env var per provider
const PROVIDER_KEY_ENV = {
  [PROVIDERS.OPENAI]: 'OPENAI_API_KEY',
  [PROVIDERS.GOOGLE]: 'GOOGLE_API_KEY',
  [PROVIDERS.ELEVENLABS]: 'ELEVENLABS_API_KEY',
};

class ProviderRegistry {
  /**
   * @param {object} opts
   * @param {string} [opts.preferencesDir] - Directory for preferences JSON. Defaults to ~/.friday
   */
  constructor(opts = {}) {
    const baseDir = opts.preferencesDir || process.env.FRIDAY_USER_DATA || path.join(os.homedir(), '.friday');
    this.preferencesPath = path.join(baseDir, 'provider-preferences.json');
    this._preferences = null; // lazy
    this._providers = {};      // provider id → module instance (lazy)
  }

  // ─── Preferences ───────────────────────────────────────────────

  _loadPreferences() {
    if (this._preferences) return this._preferences;
    try {
      if (fs.existsSync(this.preferencesPath)) {
        this._preferences = JSON.parse(fs.readFileSync(this.preferencesPath, 'utf8'));
      }
    } catch {
      // ignore corrupt file
    }
    if (!this._preferences || typeof this._preferences !== 'object') {
      this._preferences = {};
    }
    return this._preferences;
  }

  _savePreferences() {
    try {
      const dir = path.dirname(this.preferencesPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this._preferences, null, 2), 'utf8');
    } catch (err) {
      console.error('[ProviderRegistry] Failed to save preferences:', err.message);
    }
  }

  /**
   * Set user preference for a capability.
   * @param {string} capability - One of CAPABILITIES values
   * @param {string} providerId - One of PROVIDERS values
   * @param {string} [model] - Optional specific model override
   */
  setPreference(capability, providerId, model = null) {
    this._loadPreferences();
    this._preferences[capability] = { provider: providerId, ...(model ? { model } : {}) };
    this._savePreferences();
  }

  /**
   * Get user preference for a capability.
   * @returns {{ provider: string, model?: string } | null}
   */
  getPreference(capability) {
    this._loadPreferences();
    return this._preferences[capability] || null;
  }

  /**
   * Get all preferences.
   */
  getAllPreferences() {
    return { ...this._loadPreferences() };
  }

  // ─── API Key Helpers ───────────────────────────────────────────

  /**
   * Get the API key for a provider from environment.
   * The MCP server receives keys via env vars set in .mcp.json.
   */
  getApiKey(providerId) {
    const envVar = PROVIDER_KEY_ENV[providerId];
    return envVar ? (process.env[envVar] || null) : null;
  }

  /**
   * Check if a provider has a valid API key available.
   */
  hasApiKey(providerId) {
    const key = this.getApiKey(providerId);
    return Boolean(key && key.trim());
  }

  // ─── Provider Resolution ──────────────────────────────────────

  /**
   * Resolve which provider to use for a capability.
   * Priority: explicit request → user preference → default priority (first with API key).
   *
   * @param {string} capability
   * @param {string} [requestedProvider] - Explicit provider from tool input
   * @returns {string|null} provider ID or null if none available
   */
  resolveProvider(capability, requestedProvider = null) {
    // 1. Explicit request
    if (requestedProvider && this.hasApiKey(requestedProvider)) {
      return requestedProvider;
    }

    // 2. User preference
    const pref = this.getPreference(capability);
    if (pref?.provider && this.hasApiKey(pref.provider)) {
      return pref.provider;
    }

    // 3. Default priority
    const priorities = DEFAULT_PRIORITY[capability] || [];
    for (const pid of priorities) {
      if (this.hasApiKey(pid)) return pid;
    }

    return null;
  }

  /**
   * Resolve model for a capability + provider.
   * Priority: explicit → user preference → provider default.
   */
  resolveModel(capability, providerId, requestedModel = null) {
    if (requestedModel) return requestedModel;
    const pref = this.getPreference(capability);
    if (pref?.provider === providerId && pref?.model) return pref.model;
    return null; // provider will use its own default
  }

  /**
   * List which providers are available (have API keys) for a capability.
   */
  listAvailableProviders(capability) {
    const priorities = DEFAULT_PRIORITY[capability] || [];
    return priorities.filter((pid) => this.hasApiKey(pid));
  }

  // ─── Adapter Access ─────────────────────────────────────────────

  /**
   * Get a provider adapter instance (lazy-loaded).
   * @param {string} providerId - One of PROVIDERS values
   * @returns {Promise<import('../src/providers/adapters/BaseAdapter.js').BaseAdapter>}
   */
  async getAdapter(providerId) {
    if (this._providers[providerId]) return this._providers[providerId];

    const loader = ADAPTER_LOADERS[providerId];
    if (!loader) throw new Error(`Unknown provider: ${providerId}`);

    const AdapterClass = await loader();
    this._providers[providerId] = new AdapterClass();
    return this._providers[providerId];
  }

  /**
   * Resolve provider and execute a capability method.
   *
   * @param {string} capability - e.g. 'image-gen', 'tts', 'stt'
   * @param {string} method - Adapter method name (e.g. 'generateImage', 'textToSpeech')
   * @param {object} params - Parameters to pass to the method
   * @param {string} [requestedProvider] - Explicit provider override
   * @returns {Promise<object>} - Result from the adapter method
   */
  async execute(capability, method, params, requestedProvider = null) {
    const providerId = this.resolveProvider(capability, requestedProvider);
    if (!providerId) {
      throw new Error(`No provider available for capability: ${capability}. Set up an API key for one of: ${(DEFAULT_PRIORITY[capability] || []).join(', ')}`);
    }

    const adapter = await this.getAdapter(providerId);
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Provider ${providerId} does not support method: ${method}`);
    }

    return adapter[method](params);
  }

  /**
   * List all available adapters with their capabilities.
   */
  async listAvailableAdapters() {
    const results = [];
    for (const [id, loader] of Object.entries(ADAPTER_LOADERS)) {
      try {
        const adapter = await this.getAdapter(id);
        const available = await adapter.isAvailable();
        results.push({
          id,
          available,
          capabilities: adapter.getCapabilities(),
        });
      } catch {
        results.push({ id, available: false, capabilities: [] });
      }
    }
    return results;
  }
}

// ─── MediaContext ──────────────────────────────────────────────────

/**
 * Session-scoped tracker for generated media assets.
 * Enables seamless context transfer: agent knows what it previously
 * generated and can reference assets in follow-up tool calls.
 */
export class MediaContext {
  constructor() {
    this.assets = [];
    this._counter = 0;
  }

  /**
   * Register a generated asset.
   * @param {object} asset
   * @param {string} asset.type - 'image' | 'video' | 'audio' | 'transcript'
   * @param {string} asset.provider
   * @param {string} asset.model
   * @param {string} asset.prompt - The prompt / input used
   * @param {string} asset.path - Local file path
   * @param {object} [asset.metadata] - width, height, duration, format, etc.
   * @returns {string} asset ID
   */
  addAsset(asset) {
    const prefix = asset.type === 'image' ? 'img' : asset.type === 'video' ? 'vid' : asset.type === 'audio' ? 'aud' : 'txt';
    const id = `${prefix}_${String(++this._counter).padStart(3, '0')}`;
    this.assets.push({
      id,
      ...asset,
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  /**
   * Get context summary for injection into system prompt.
   */
  getContextSummary() {
    if (!this.assets.length) return '';
    const lines = this.assets.map(
      (a) => `[${a.type}:${a.id}] "${a.prompt}" → ${a.path} (${a.provider}/${a.model})`
    );
    return `\n[Generated Media Assets]\n${lines.join('\n')}`;
  }

  getAsset(id) {
    return this.assets.find((a) => a.id === id) || null;
  }

  getLatest(type) {
    for (let i = this.assets.length - 1; i >= 0; i--) {
      if (this.assets[i].type === type) return this.assets[i];
    }
    return null;
  }

  toJSON() {
    return this.assets;
  }
}

export default ProviderRegistry;
