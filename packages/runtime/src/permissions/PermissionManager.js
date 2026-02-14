/**
 * PermissionManager — Persistent permission profiles and per-tool overrides.
 *
 * Three layers:
 *   1. Permission profile (developer, safe, locked, headless)
 *   2. Per-tool overrides (user-configured)
 *   3. Per-app overrides (for iOS, Electron, third-party clients)
 *
 * All state persists at ~/.friday/permissions.json.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const PERMISSIONS_FILE = path.join(CONFIG_DIR, 'permissions.json');

// Permission decisions
export const PERMISSION = {
  AUTO_APPROVE: 'auto-approve',
  AUTO_APPROVE_IN_WORKSPACE: 'auto-approve-in-workspace',
  ASK_FIRST: 'ask-first',
  DENY: 'deny',
};

// Built-in profiles
const PROFILES = {
  developer: {
    description: 'Auto-approves file and terminal operations in workspace',
    rules: {
      // Filesystem
      'mcp__filesystem__read_file': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__write_file': PERMISSION.AUTO_APPROVE_IN_WORKSPACE,
      'mcp__filesystem__list_directory': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__search_files': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__get_file_info': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__list_allowed_directories': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__read_multiple_files': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__move_file': PERMISSION.AUTO_APPROVE_IN_WORKSPACE,
      'mcp__filesystem__create_directory': PERMISSION.AUTO_APPROVE_IN_WORKSPACE,
      // Terminal
      'mcp__terminal__execute_command': PERMISSION.ASK_FIRST,
      'mcp__terminal__bash': PERMISSION.ASK_FIRST,
      'mcp__terminal__list_processes': PERMISSION.AUTO_APPROVE,
      // Web
      'WebSearch': PERMISSION.AUTO_APPROVE,
      'WebFetch': PERMISSION.AUTO_APPROVE,
      // Internal tools
      'mcp__friday-internal__create_scheduled_agent': PERMISSION.ASK_FIRST,
      // Media (if available)
      'generate_image': PERMISSION.AUTO_APPROVE,
      'generate_video': PERMISSION.ASK_FIRST,
      'text_to_speech': PERMISSION.AUTO_APPROVE,
      'speech_to_text': PERMISSION.AUTO_APPROVE,
      'query_model': PERMISSION.AUTO_APPROVE,
    },
  },
  safe: {
    description: 'Read-only by default. Asks before writing files or running commands.',
    rules: {
      'mcp__filesystem__read_file': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__list_directory': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__search_files': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__get_file_info': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__list_allowed_directories': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__read_multiple_files': PERMISSION.AUTO_APPROVE,
      'WebSearch': PERMISSION.AUTO_APPROVE,
      'WebFetch': PERMISSION.AUTO_APPROVE,
    },
    // Everything else defaults to ASK_FIRST
  },
  locked: {
    description: 'Asks permission for every action. Maximum control.',
    rules: {},
    // Everything defaults to ASK_FIRST
  },
  headless: {
    description: 'For containers/CI. Configurable per-tool policy.',
    rules: {
      'mcp__filesystem__read_file': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__list_directory': PERMISSION.AUTO_APPROVE,
      'mcp__filesystem__search_files': PERMISSION.AUTO_APPROVE,
      'WebSearch': PERMISSION.AUTO_APPROVE,
      'WebFetch': PERMISSION.AUTO_APPROVE,
    },
  },
};

// Tools that should NEVER be auto-approved regardless of profile
const NEVER_AUTO_APPROVE = new Set([
  // These are handled by dangerous command filtering instead
]);

// Tools that are always safe (auto-approved regardless of profile)
const ALWAYS_SAFE = new Set([
  'mcp__terminal__list_processes',
]);

export class PermissionManager {
  constructor() {
    this._data = null; // lazy loaded
  }

  _load() {
    if (this._data) return this._data;
    try {
      if (fs.existsSync(PERMISSIONS_FILE)) {
        this._data = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
      }
    } catch {
      // ignore corrupt file
    }
    if (!this._data || typeof this._data !== 'object') {
      this._data = { profile: 'developer', overrides: {}, apps: {}, sessionApprovals: {} };
    }
    return this._data;
  }

  _save() {
    try {
      const dir = path.dirname(PERMISSIONS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(this._data, null, 2), 'utf8');
    } catch (err) {
      // Silent fail — permissions will work from memory
    }
  }

  /**
   * Get the active profile name
   */
  getProfile() {
    return this._load().profile || 'developer';
  }

  /**
   * Set the active profile
   */
  setProfile(profileName) {
    if (!PROFILES[profileName]) {
      throw new Error(`Unknown profile: ${profileName}. Valid: ${Object.keys(PROFILES).join(', ')}`);
    }
    this._load();
    this._data.profile = profileName;
    this._save();
  }

  /**
   * Set a per-tool override
   */
  setOverride(toolName, permission) {
    this._load();
    if (!this._data.overrides) this._data.overrides = {};
    this._data.overrides[toolName.toLowerCase()] = permission;
    this._save();
  }

  /**
   * Remove a per-tool override (fall back to profile default)
   */
  removeOverride(toolName) {
    this._load();
    if (this._data.overrides) {
      delete this._data.overrides[toolName.toLowerCase()];
      this._save();
    }
  }

  /**
   * Store a session-level approval (cleared on session reset)
   */
  addSessionApproval(toolName) {
    this._load();
    if (!this._data.sessionApprovals) this._data.sessionApprovals = {};
    this._data.sessionApprovals[toolName.toLowerCase()] = {
      approvedAt: new Date().toISOString(),
    };
  }

  /**
   * Clear all session approvals (called on new session)
   */
  clearSessionApprovals() {
    this._load();
    this._data.sessionApprovals = {};
  }

  /**
   * Check if a tool should be auto-approved, needs to ask, or is denied.
   *
   * @param {string} toolName - The tool name to check
   * @param {Object} [context] - Additional context
   * @param {string} [context.workspacePath] - Current workspace path
   * @param {string} [context.filePath] - File path being accessed (for workspace-scoped approvals)
   * @param {string} [context.appId] - App identifier for per-app permissions
   * @returns {{ decision: string, source: string }}
   */
  check(toolName, context = {}) {
    const normalized = (toolName || '').toLowerCase().trim();

    // Always-safe tools
    if (ALWAYS_SAFE.has(normalized)) {
      return { decision: PERMISSION.AUTO_APPROVE, source: 'always-safe' };
    }

    this._load();

    // Session approvals (from user saying "allow" in this session)
    if (this._data.sessionApprovals?.[normalized]) {
      return { decision: PERMISSION.AUTO_APPROVE, source: 'session' };
    }

    // Per-app permissions (for external clients)
    if (context.appId && this._data.apps?.[context.appId]?.permissions?.[normalized]) {
      const appPerm = this._data.apps[context.appId].permissions[normalized];
      if (appPerm === 'granted') {
        return { decision: PERMISSION.AUTO_APPROVE, source: 'app' };
      }
      if (appPerm === 'denied') {
        return { decision: PERMISSION.DENY, source: 'app' };
      }
    }

    // Per-tool overrides
    if (this._data.overrides?.[normalized]) {
      const override = this._data.overrides[normalized];
      // Handle workspace-scoped approvals
      if (override === PERMISSION.AUTO_APPROVE_IN_WORKSPACE && context.filePath && context.workspacePath) {
        const normalizedFile = path.normalize(context.filePath);
        const normalizedWorkspace = path.normalize(context.workspacePath);
        if (normalizedFile.startsWith(normalizedWorkspace)) {
          return { decision: PERMISSION.AUTO_APPROVE, source: 'override-in-workspace' };
        }
        return { decision: PERMISSION.ASK_FIRST, source: 'override-outside-workspace' };
      }
      return { decision: override, source: 'override' };
    }

    // Profile rules
    const profile = PROFILES[this._data.profile] || PROFILES.developer;
    if (profile.rules[normalized]) {
      const rule = profile.rules[normalized];
      if (rule === PERMISSION.AUTO_APPROVE_IN_WORKSPACE && context.filePath && context.workspacePath) {
        const normalizedFile = path.normalize(context.filePath);
        const normalizedWorkspace = path.normalize(context.workspacePath);
        if (normalizedFile.startsWith(normalizedWorkspace)) {
          return { decision: PERMISSION.AUTO_APPROVE, source: 'profile-in-workspace' };
        }
        return { decision: PERMISSION.ASK_FIRST, source: 'profile-outside-workspace' };
      }
      return { decision: rule, source: 'profile' };
    }

    // Default: ask
    return { decision: PERMISSION.ASK_FIRST, source: 'default' };
  }

  /**
   * Grant an app permission for a tool
   */
  grantAppPermission(appId, toolName) {
    this._load();
    if (!this._data.apps) this._data.apps = {};
    if (!this._data.apps[appId]) {
      this._data.apps[appId] = {
        label: appId,
        firstConnected: new Date().toISOString(),
        permissions: {},
      };
    }
    this._data.apps[appId].permissions[toolName.toLowerCase()] = 'granted';
    this._save();
  }

  /**
   * Deny an app permission for a tool
   */
  denyAppPermission(appId, toolName) {
    this._load();
    if (!this._data.apps) this._data.apps = {};
    if (!this._data.apps[appId]) {
      this._data.apps[appId] = {
        label: appId,
        firstConnected: new Date().toISOString(),
        permissions: {},
      };
    }
    this._data.apps[appId].permissions[toolName.toLowerCase()] = 'denied';
    this._save();
  }
}

export default new PermissionManager();
