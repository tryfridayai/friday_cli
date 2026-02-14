import fs from 'fs';
import path from 'path';
import os from 'os';

const CREDENTIALS_FILE = '.mcp-credentials.json';
const METADATA_VERSION = 2;
const KEYTAR_SERVICE = 'FridayAI-MCP';

const keytarPromise = import('keytar')
  .then((module) => module.default ?? module)
  .catch((error) => {
    console.warn('[MCP-CREDS] keytar unavailable, falling back to file storage:', error.message);
    return null;
  });

const hasMetadata = (meta = {}) => Boolean(meta.label || meta.description || meta.expiresAt);

const sanitizeMetadata = (input = {}) => {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const metadata = {};
  if (input.label && String(input.label).trim()) {
    metadata.label = String(input.label).trim();
  }
  if (input.description && String(input.description).trim()) {
    metadata.description = String(input.description).trim();
  }
  if (input.expiresAt && String(input.expiresAt).trim()) {
    metadata.expiresAt = String(input.expiresAt).trim();
  }
  return metadata;
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const DEFAULT_SCHEMA = {
  authId: 'default',
  env: {}
};

class McpCredentials {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    const userDataDir = this.getUserDataDirectory();
    this.credentialsPath = path.join(userDataDir, CREDENTIALS_FILE);
    this.ensureDirectory(userDataDir);

    this.metadata = { metadataVersion: METADATA_VERSION, servers: {} };
    this.credentials = {};
    this.keytar = null;
    this.storageMode = 'file';
    this.ready = this.initialize();
  }

  async initialize() {
    this.keytar = await keytarPromise;

    if (this.keytar) {
      this.storageMode = 'keytar';
      const raw = this.loadRawFile();

      if (raw?.metadataVersion === METADATA_VERSION && raw.servers) {
        this.metadata = raw;
      } else if (raw && Object.keys(raw).length > 0) {
        await this.migrateLegacyCredentials(raw);
      } else {
        this.saveMetadata();
      }
    } else {
      this.storageMode = 'file';
      const raw = this.loadRawFile();
      this.credentials =
        raw?.metadataVersion === METADATA_VERSION && raw.servers
          ? {}
          : raw;
    }
  }

  async ensureReady() {
    return this.ready;
  }

  getUserDataDirectory() {
    if (process.env.FRIDAY_USER_DATA) {
      return process.env.FRIDAY_USER_DATA;
    }
    const homeDir = os.homedir();
    if (homeDir) {
      return path.join(homeDir, '.friday');
    }
    console.warn('[MCP-CREDS] Could not determine user data directory, using project root');
    return this.projectRoot;
  }

  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  loadRawFile() {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        const raw = fs.readFileSync(this.credentialsPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (error) {
      console.error('[MCP-CREDS] Failed to read credentials file:', error.message);
    }
    return {};
  }

  saveMetadata() {
    const payload = {
      metadataVersion: METADATA_VERSION,
      servers: this.metadata.servers || {}
    };
    try {
      fs.writeFileSync(this.credentialsPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      console.error('[MCP-CREDS] Failed to persist metadata:', error.message);
    }
  }

  saveLegacyCredentials() {
    try {
      fs.writeFileSync(this.credentialsPath, JSON.stringify(this.credentials, null, 2), 'utf8');
    } catch (error) {
      console.error('[MCP-CREDS] Failed to save credentials:', error.message);
      throw error;
    }
  }

  normalizeCredentialEntry(raw) {
    if (raw == null) {
      return null;
    }
    if (typeof raw === 'string') {
      const value = raw.trim();
      return value ? { value } : null;
    }
    if (typeof raw === 'object') {
      if (Object.prototype.hasOwnProperty.call(raw, 'value')) {
        const value = raw.value == null ? '' : String(raw.value).trim();
        if (!value) {
          return null;
        }
        const metadata = sanitizeMetadata(raw.metadata);
        return hasMetadata(metadata) ? { value, metadata } : { value };
      }
      if (Object.prototype.hasOwnProperty.call(raw, 'secret')) {
        const value = raw.secret == null ? '' : String(raw.secret).trim();
        if (!value) {
          return null;
        }
        const metadata = sanitizeMetadata(raw.metadata);
        return hasMetadata(metadata) ? { value, metadata } : { value };
      }
    }
    return null;
  }

  normalizeCredentialMap(credentials = {}) {
    const normalized = {};
    for (const [key, value] of Object.entries(credentials || {})) {
      if (key === 'updatedAt') {
        continue;
      }
      const entry = this.normalizeCredentialEntry(value);
      if (entry) {
        normalized[key] = entry;
      }
    }
    return normalized;
  }

  buildSchema(authDefinitions = [], requestedAuthId = null) {
    const definitions = Array.isArray(authDefinitions) ? authDefinitions : [];
    // Include fields from ALL auth types (credentials AND oauth) so OAuth tokens get env mappings
    const methodsWithFields = definitions.filter((method) => method?.fields?.length > 0);
    if (!methodsWithFields.length) {
      return { ...DEFAULT_SCHEMA, authId: requestedAuthId || DEFAULT_SCHEMA.authId };
    }
    const resolved =
      methodsWithFields.find((method) => (method.id || method.method || DEFAULT_SCHEMA.authId) === (requestedAuthId || method.id)) ||
      methodsWithFields[0];
    const schema = {
      authId: resolved?.id || requestedAuthId || DEFAULT_SCHEMA.authId,
      env: {}
    };
    // Collect env mappings from the resolved method AND any other methods with fields
    // This handles cases like Slack where OAuth stores a botToken that maps via the credentials entry
    for (const method of methodsWithFields) {
      for (const field of method.fields || []) {
        if (!field || !field.key) continue;
        const envList = Array.isArray(field.env) ? field.env : field.env ? [field.env] : [];
        if (envList.length && !schema.env[field.key]) {
          schema.env[field.key] = envList;
        }
      }
    }
    return schema;
  }

  buildPayload({ fields, schema }) {
    if (!fields || !Object.keys(fields).length) {
      throw new Error('No credential values provided');
    }
    return {
      authId: schema?.authId || DEFAULT_SCHEMA.authId,
      schema: {
        authId: schema?.authId || DEFAULT_SCHEMA.authId,
        env: schema?.env || {}
      },
      updatedAt: new Date().toISOString(),
      fields
    };
  }

  extractMetadata(payload) {
    const descriptor = {
      updatedAt: payload.updatedAt,
      authId: payload.authId || null,
      fields: {}
    };
    for (const [fieldKey, entry] of Object.entries(payload.fields || {})) {
      descriptor.fields[fieldKey] = {
        label: entry.metadata?.label || null,
        description: entry.metadata?.description || null,
        expiresAt: entry.metadata?.expiresAt || null
      };
    }
    return descriptor;
  }

  ensurePayloadShape(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        authId: DEFAULT_SCHEMA.authId,
        schema: { ...DEFAULT_SCHEMA },
        updatedAt: new Date().toISOString(),
        fields: {}
      };
    }

    if (raw.fields && raw.schema) {
      return {
        authId: raw.authId || raw.schema.authId || DEFAULT_SCHEMA.authId,
        schema: {
          authId: raw.schema.authId || raw.authId || DEFAULT_SCHEMA.authId,
          env: raw.schema.env || {}
        },
        updatedAt: raw.updatedAt || new Date().toISOString(),
        fields: raw.fields
      };
    }

    const fields = raw.fields ? raw.fields : this.normalizeCredentialMap(raw);
    return {
      authId: raw.authId || DEFAULT_SCHEMA.authId,
      schema: {
        authId: raw.authId || DEFAULT_SCHEMA.authId,
        env: raw.schema?.env || {}
      },
      updatedAt: raw.updatedAt || new Date().toISOString(),
      fields
    };
  }

  parsePayload(serialized) {
    try {
      const parsed = JSON.parse(serialized);
      return this.ensurePayloadShape(parsed);
    } catch (error) {
      console.error('[MCP-CREDS] Failed to parse credential payload:', error.message);
      return this.ensurePayloadShape({ fields: {} });
    }
  }

  async migrateLegacyCredentials(legacy) {
    if (!this.keytar || !legacy) {
      return;
    }
    if (legacy.metadataVersion === METADATA_VERSION && legacy.servers) {
      return;
    }
    const entries = Object.entries(legacy);
    if (!entries.length) {
      return;
    }
    console.info('[MCP-CREDS] Migrating legacy credentials to secure storage');
    for (const [serverId, creds] of entries) {
      if (!creds || typeof creds !== 'object') {
        continue;
      }
      const payload = this.ensurePayloadShape({
        fields: this.normalizeCredentialMap(creds)
      });
      if (!Object.keys(payload.fields).length) {
        continue;
      }
      await this.keytar.setPassword(KEYTAR_SERVICE, this.getAccountName(serverId), JSON.stringify(payload));
      this.metadata.servers[serverId] = this.extractMetadata(payload);
    }
    this.saveMetadata();
  }

  getAccountName(serverId) {
    return `mcp:${serverId}`;
  }

  async setCredentials(serverId, rawCredentials, options = {}) {
    // OAuth servers that use local OAuth flow (tokens should be saved to Keytar)
    const OAUTH_SERVERS = ['google-drive', 'gmail', 'slack', 'linkedin'];
    const isOAuthServer = OAUTH_SERVERS.includes(serverId);

    // When Clerk auth is enabled, non-OAuth credentials are managed by Supabase
    // But OAuth tokens (from local OAuth flow) should still be saved locally
    if (process.env.SUPABASE_URL && !isOAuthServer) {
      console.log('[MCP-CREDS] Skipping Keytar save - using Supabase for credential storage');
      return;
    }

    await this.ensureReady();
    const requestedAuthId = rawCredentials?.authId || rawCredentials?.auth || options.authId || null;
    const fieldsInput = rawCredentials?.fields ?? rawCredentials?.values ?? rawCredentials;
    const fields = this.normalizeCredentialMap(fieldsInput);
    if (!Object.keys(fields).length) {
      throw new Error('No credential values provided');
    }
    const schema = this.buildSchema(options.auth, requestedAuthId);
    const payload = this.buildPayload({ fields, schema });

    if (this.storageMode === 'keytar') {
      await this.keytar.setPassword(KEYTAR_SERVICE, this.getAccountName(serverId), JSON.stringify(payload));
      this.metadata.servers[serverId] = this.extractMetadata(payload);
      this.saveMetadata();
    } else {
      this.credentials[serverId] = payload;
      this.saveLegacyCredentials();
    }
  }

  async loadPayload(serverId) {
    await this.ensureReady();
    let payload = null;

    if (this.storageMode === 'keytar') {
      const serialized = await this.keytar.getPassword(KEYTAR_SERVICE, this.getAccountName(serverId));
      if (!serialized) {
        return null;
      }
      payload = this.ensurePayloadShape(this.parsePayload(serialized));
    } else {
      const raw = this.credentials[serverId];
      if (!raw) {
        return null;
      }
      payload = this.ensurePayloadShape(raw);
      this.credentials[serverId] = payload;
      this.saveLegacyCredentials();
    }

    return payload;
  }

  async getCredentials(serverId) {
    // OAuth servers that use local OAuth flow (tokens stored in Keytar)
    const OAUTH_SERVERS = ['google-drive', 'gmail', 'slack', 'linkedin'];
    const isOAuthServer = OAUTH_SERVERS.includes(serverId);

    // When Supabase is enabled, non-OAuth credentials come from Supabase via env vars
    // Only return Keytar data for OAuth servers
    if (process.env.SUPABASE_URL && !isOAuthServer) {
      return {};
    }

    const payload = await this.loadPayload(serverId);
    if (!payload) {
      return {};
    }
    return clone(payload.fields || {});
  }

  async deleteCredentials(serverId) {
    // Always try to delete from Keytar - OAuth tokens are stored locally
    // This ensures OAuth tokens are properly cleaned up on disconnect
    await this.ensureReady();
    if (this.storageMode === 'keytar') {
      await this.keytar.deletePassword(KEYTAR_SERVICE, this.getAccountName(serverId));
      delete this.metadata.servers[serverId];
      this.saveMetadata();
    } else {
      delete this.credentials[serverId];
      this.saveLegacyCredentials();
    }
  }

  async getAllCredentials() {
    await this.ensureReady();
    const entries = {};

    if (this.storageMode === 'keytar') {
      const serverIds = Object.keys(this.metadata.servers || {});
      for (const serverId of serverIds) {
        const payload = await this.loadPayload(serverId);
        if (payload) {
          entries[serverId] = clone(payload.fields || {});
        }
      }
      return entries;
    }

    for (const serverId of Object.keys(this.credentials)) {
      const payload = await this.loadPayload(serverId);
      if (payload) {
        entries[serverId] = clone(payload.fields || {});
      }
    }
    return entries;
  }

  async getEnvironmentForServer(serverId, authDefinitions) {
    const payload = await this.loadPayload(serverId);
    if (!payload) {
      return {};
    }

    const env = {};
    const fields = payload.fields || {};
    const valueFor = (entry) => (entry && typeof entry === 'object' ? entry.value : entry);

    // Prefer current auth definitions (from .mcp.json) over the stored schema,
    // so that env mapping changes take effect without re-saving credentials.
    const currentSchema = authDefinitions?.length
      ? this.buildSchema(authDefinitions)
      : null;
    const schema = (currentSchema && Object.keys(currentSchema.env).length)
      ? currentSchema
      : payload.schema;

    if (schema?.env && Object.keys(schema.env).length) {
      for (const [fieldKey, envVars] of Object.entries(schema.env)) {
        const value = valueFor(fields[fieldKey]);
        if (!value) continue;
        (envVars || []).forEach((envVar) => {
          if (envVar) {
            env[envVar] = value;
          }
        });
      }
      return env;
    }

    // Fallback for legacy records without schema
    switch (serverId) {
      case 'figma': {
        const token = valueFor(fields.apiKey) || valueFor(fields.accessToken);
        if (token) {
          env.FIGMA_ACCESS_TOKEN = token;
        }
        break;
      }
      case 'github': {
        const token = valueFor(fields.token);
        if (token) {
          env.GITHUB_TOKEN = token;
        }
        break;
      }
      case 'firecrawl': {
        const apiKey = valueFor(fields.apiKey);
        const baseUrl = valueFor(fields.baseUrl);
        if (apiKey) {
          env.FIRECRAWL_API_KEY = apiKey;
        }
        if (baseUrl) {
          env.FIRECRAWL_BASE_URL = baseUrl;
        }
        break;
      }
      case 'browserbase': {
        const apiKey = valueFor(fields.apiKey);
        const projectId = valueFor(fields.projectId);
        if (apiKey) {
          env.BROWSERBASE_API_KEY = apiKey;
        }
        if (projectId) {
          env.BROWSERBASE_PROJECT_ID = projectId;
        }
        break;
      }
      case 'resend': {
        const apiKey = valueFor(fields.apiKey);
        const senderEmail = valueFor(fields.senderEmail);
        const replyToEmail = valueFor(fields.replyToEmail);
        if (apiKey) {
          env.RESEND_API_KEY = apiKey;
        }
        if (senderEmail) {
          env.RESEND_SENDER_EMAIL = senderEmail;
        }
        if (replyToEmail) {
          env.RESEND_REPLY_TO_EMAIL = replyToEmail;
        }
        break;
      }
    }

    return env;
  }
}

export default McpCredentials;
