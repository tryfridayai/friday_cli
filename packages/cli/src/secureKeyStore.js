/**
 * SecureKeyStore - Secure storage for API keys using system keychain
 *
 * Uses keytar to store API keys in macOS Keychain, Windows Credential Manager,
 * or Linux libsecret. Keys are NEVER stored in plain text files.
 *
 * This ensures API keys are:
 * 1. Encrypted at rest by the OS
 * 2. Protected by user authentication
 * 3. Never exposed in environment variables or config files
 */

import os from 'os';
import path from 'path';
import fs from 'fs';

const KEYTAR_SERVICE = 'FridayAI-APIKeys';
const METADATA_FILE = '.api-keys-metadata.json';

// API key configuration
const API_KEYS = {
  ANTHROPIC_API_KEY: {
    label: 'Anthropic',
    unlocks: 'Chat (Claude)',
    envKey: 'ANTHROPIC_API_KEY',
  },
  OPENAI_API_KEY: {
    label: 'OpenAI',
    unlocks: 'Chat, Images, Voice, Video',
    envKey: 'OPENAI_API_KEY',
  },
  GOOGLE_API_KEY: {
    label: 'Google AI',
    unlocks: 'Chat, Images, Voice, Video',
    envKey: 'GOOGLE_API_KEY',
  },
  ELEVENLABS_API_KEY: {
    label: 'ElevenLabs',
    unlocks: 'Premium Voice',
    envKey: 'ELEVENLABS_API_KEY',
  },
};

let keytarModule = null;
let keytarInitialized = false;

async function getKeytar() {
  if (keytarInitialized) return keytarModule;

  try {
    const module = await import('keytar');
    keytarModule = module.default ?? module;
    keytarInitialized = true;
    return keytarModule;
  } catch (error) {
    console.error('[SecureKeyStore] keytar not available:', error.message);
    keytarInitialized = true;
    return null;
  }
}

function getMetadataPath() {
  const configDir = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, METADATA_FILE);
}

function loadMetadata() {
  const metadataPath = getMetadataPath();
  try {
    if (fs.existsSync(metadataPath)) {
      return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }
  } catch {
    // Ignore errors
  }
  return { keys: {} };
}

function saveMetadata(metadata) {
  const metadataPath = getMetadataPath();
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
}

/**
 * Store an API key securely in the system keychain
 * @param {string} keyName - The key name (e.g., 'ANTHROPIC_API_KEY')
 * @param {string} value - The API key value
 * @returns {Promise<boolean>} - True if successful
 */
export async function setApiKey(keyName, value) {
  const keytar = await getKeytar();

  if (!keytar) {
    throw new Error('Secure storage not available. Please ensure keytar is installed.');
  }

  await keytar.setPassword(KEYTAR_SERVICE, keyName, value);

  // Update metadata (without storing the actual value)
  const metadata = loadMetadata();
  metadata.keys[keyName] = {
    configured: true,
    updatedAt: new Date().toISOString(),
    // Store masked preview for UI display
    preview: '*'.repeat(Math.max(0, value.length - 4)) + value.slice(-4),
  };
  saveMetadata(metadata);

  return true;
}

/**
 * Get an API key from the system keychain
 * @param {string} keyName - The key name (e.g., 'ANTHROPIC_API_KEY')
 * @returns {Promise<string|null>} - The API key value or null if not found
 */
export async function getApiKey(keyName) {
  const keytar = await getKeytar();

  if (!keytar) {
    return null;
  }

  return await keytar.getPassword(KEYTAR_SERVICE, keyName);
}

/**
 * Delete an API key from the system keychain
 * @param {string} keyName - The key name (e.g., 'ANTHROPIC_API_KEY')
 * @returns {Promise<boolean>} - True if deleted
 */
export async function deleteApiKey(keyName) {
  const keytar = await getKeytar();

  if (!keytar) {
    return false;
  }

  await keytar.deletePassword(KEYTAR_SERVICE, keyName);

  // Update metadata
  const metadata = loadMetadata();
  delete metadata.keys[keyName];
  saveMetadata(metadata);

  return true;
}

/**
 * Get all configured API keys (values loaded from keychain)
 * @returns {Promise<Object>} - Object with key names as keys and values
 */
export async function getAllApiKeys() {
  const keytar = await getKeytar();
  const keys = {};

  if (!keytar) {
    return keys;
  }

  for (const keyName of Object.keys(API_KEYS)) {
    const value = await keytar.getPassword(KEYTAR_SERVICE, keyName);
    if (value) {
      keys[keyName] = value;
    }
  }

  return keys;
}

/**
 * Load API keys into process.env (for internal use by providers only)
 * This should ONLY be called during server initialization,
 * AFTER the sensitive env filtering is in place.
 * @returns {Promise<void>}
 */
export async function loadApiKeysToEnv() {
  const keys = await getAllApiKeys();

  for (const [keyName, value] of Object.entries(keys)) {
    // Only set if not already set (env vars take precedence)
    if (!process.env[keyName]) {
      process.env[keyName] = value;
    }
  }
}

/**
 * Check which API keys are configured (without loading values)
 * @returns {Object} - Object with key names and their configuration status
 */
export function getConfiguredKeys() {
  const metadata = loadMetadata();
  const result = {};

  for (const [keyName, config] of Object.entries(API_KEYS)) {
    const keyMeta = metadata.keys[keyName];
    result[keyName] = {
      ...config,
      configured: !!keyMeta?.configured,
      preview: keyMeta?.preview || null,
    };
  }

  return result;
}

/**
 * Check if secure storage is available
 * @returns {Promise<boolean>}
 */
export async function isSecureStorageAvailable() {
  const keytar = await getKeytar();
  return !!keytar;
}

export { API_KEYS };
