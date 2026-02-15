/**
 * BaseAdapter — Interface for multi-modal provider adapters.
 *
 * Each provider (OpenAI, Google, ElevenLabs) implements this interface.
 * Adapters lazy-load their SDKs via dynamic import() so the runtime
 * doesn't fail if the SDK isn't installed.
 */

export class BaseAdapter {
  constructor(providerId) {
    this.providerId = providerId;
    this._client = null;
    this._available = null;
  }

  /**
   * Check if this provider's SDK is installed and API key is available.
   */
  async isAvailable() {
    if (this._available !== null) return this._available;
    try {
      await this._loadSdk();
      this._available = this._hasApiKey();
    } catch {
      this._available = false;
    }
    return this._available;
  }

  /**
   * Lazy-load the provider's SDK. Override in subclasses.
   */
  async _loadSdk() {
    throw new Error('_loadSdk() must be implemented by subclass');
  }

  /**
   * Check if the required API key is available.
   */
  _hasApiKey() {
    throw new Error('_hasApiKey() must be implemented by subclass');
  }

  /**
   * Get the capabilities this provider supports.
   * @returns {string[]} Array of capability IDs
   */
  getCapabilities() {
    throw new Error('getCapabilities() must be implemented by subclass');
  }

  /**
   * Estimate cost for an operation.
   * @param {string} capability
   * @param {Object} params
   * @returns {number} Estimated cost in USD
   */
  estimateCost(capability, params = {}) {
    return 0;
  }
}

export default BaseAdapter;
