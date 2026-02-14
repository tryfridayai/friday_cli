import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

class GlobalConfig {
  constructor() {
    this.ensureConfigDir();
    this.cache = this.load();
  }

  ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
      try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      } catch (e) {
        console.error('[GlobalConfig] Failed to create config dir:', e);
      }
    }
  }

  load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[GlobalConfig] Failed to load config:', error.message);
    }
    return {};
  }

  save() {
    try {
      this.ensureConfigDir(); // Ensure dir exists before write
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch (error) {
      console.error('[GlobalConfig] Failed to save config:', error.message);
    }
  }

  /**
   * Get a value by key. Supports dot notation for nested paths.
   * @param {string} keyPath - Key or dot-separated path (e.g., 'permissions.alwaysAllow.bash')
   * @returns {*} The value at the path, or undefined if not found
   */
  get(keyPath) {
    if (!keyPath || typeof keyPath !== 'string') return undefined;

    // Support dot notation for nested paths
    if (keyPath.includes('.')) {
      return keyPath.split('.').reduce((obj, key) => obj?.[key], this.cache);
    }
    return this.cache[keyPath];
  }

  /**
   * Set a value by key. Supports dot notation for nested paths.
   * @param {string} keyPath - Key or dot-separated path (e.g., 'permissions.alwaysAllow.bash')
   * @param {*} value - The value to set
   */
  set(keyPath, value) {
    if (!keyPath || typeof keyPath !== 'string') return;

    // Support dot notation for nested paths
    if (keyPath.includes('.')) {
      const keys = keyPath.split('.');
      const lastKey = keys.pop();
      const target = keys.reduce((obj, key) => {
        if (obj[key] === undefined || obj[key] === null) {
          obj[key] = {};
        }
        return obj[key];
      }, this.cache);
      target[lastKey] = value;
    } else {
      this.cache[keyPath] = value;
    }
    this.save();
  }

  /**
   * Delete a value by key. Supports dot notation for nested paths.
   * @param {string} keyPath - Key or dot-separated path
   */
  delete(keyPath) {
    if (!keyPath || typeof keyPath !== 'string') return;

    if (keyPath.includes('.')) {
      const keys = keyPath.split('.');
      const lastKey = keys.pop();
      const target = keys.reduce((obj, key) => obj?.[key], this.cache);
      if (target && typeof target === 'object') {
        delete target[lastKey];
        this.save();
      }
    } else {
      delete this.cache[keyPath];
      this.save();
    }
  }

  /**
   * Check if a key exists. Supports dot notation for nested paths.
   * @param {string} keyPath - Key or dot-separated path
   * @returns {boolean}
   */
  has(keyPath) {
    if (!keyPath || typeof keyPath !== 'string') return false;

    if (keyPath.includes('.')) {
      const keys = keyPath.split('.');
      const lastKey = keys.pop();
      const target = keys.reduce((obj, key) => obj?.[key], this.cache);
      return target !== undefined && target !== null &&
             Object.prototype.hasOwnProperty.call(target, lastKey);
    }
    return Object.prototype.hasOwnProperty.call(this.cache, keyPath);
  }

  /**
   * Get all keys at a nested path (for listing permissions, etc.)
   * @param {string} keyPath - Dot-separated path to an object
   * @returns {string[]} Array of keys at that path
   */
  getKeys(keyPath) {
    const obj = this.get(keyPath);
    if (obj && typeof obj === 'object') {
      return Object.keys(obj);
    }
    return [];
  }
}

export const globalConfig = new GlobalConfig();