/**
 * chat/welcomeScreen.js — Branded welcome screen for Friday CLI chat
 *
 * Renders on `ready` message. Reads local config files directly
 * (instant, no server round-trip) to show capabilities and plugin status.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  PURPLE, TEAL, DIM, RESET, BOLD, ORANGE,
  drawBox, capabilityIcon, hint,
} from './ui.js';
import { runtimeDir } from '../../resolveRuntime.js';

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const PLUGINS_FILE = path.join(CONFIG_DIR, 'plugins.json');
const ENV_FILE = path.join(CONFIG_DIR, '.env');

// ── Helpers ──────────────────────────────────────────────────────────────

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch { /* ignore */ }
  return null;
}

function envHasKey(keyName) {
  // Check process.env first, then ~/.friday/.env
  if (process.env[keyName]) return true;
  try {
    if (fs.existsSync(ENV_FILE)) {
      const content = fs.readFileSync(ENV_FILE, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        if (key.trim() === keyName && rest.join('=').trim().length > 0) return true;
      }
    }
  } catch { /* ignore */ }
  // Also check the project-level .env
  try {
    const projectEnv = path.join(runtimeDir, '..', '.env');
    if (fs.existsSync(projectEnv)) {
      const content = fs.readFileSync(projectEnv, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        if (key.trim() === keyName && rest.join('=').trim().length > 0) return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// ── Main render ──────────────────────────────────────────────────────────

/**
 * Render the branded welcome screen.
 * @returns {string} The welcome screen string to print
 */
export function renderWelcome() {
  // Read version from package.json
  let version = '0.2.0';
  try {
    const cliPkgPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf8'));
    version = pkg.version || version;
  } catch { /* ignore */ }

  // Check API key availability
  const hasAnthropic = envHasKey('ANTHROPIC_API_KEY');
  const hasOpenAI = envHasKey('OPENAI_API_KEY');
  const hasGoogle = envHasKey('GOOGLE_API_KEY');
  const hasElevenLabs = envHasKey('ELEVENLABS_API_KEY');

  // Determine capabilities
  const chatOk = hasAnthropic || hasOpenAI || hasGoogle;
  const imageOk = hasOpenAI || hasGoogle;
  const voiceOk = hasOpenAI || hasElevenLabs || hasGoogle;
  const videoOk = hasOpenAI || hasGoogle;

  // Read installed plugins
  const pluginsData = readJsonSafe(PLUGINS_FILE);
  const installedPlugins = pluginsData?.plugins ? Object.keys(pluginsData.plugins) : [];

  // Read catalog for total count
  let totalPlugins = 0;
  let installedNames = [];
  try {
    const catalogPath = path.join(runtimeDir, 'src', 'plugins', 'catalog.json');
    const catalog = readJsonSafe(catalogPath);
    if (catalog?.plugins) {
      totalPlugins = Object.keys(catalog.plugins).length;
      installedNames = installedPlugins
        .map(id => catalog.plugins[id]?.name || id)
        .filter(Boolean);
    }
  } catch { /* ignore */ }

  // Build capability line
  const caps = [
    capabilityIcon('\ud83d\udcac', 'Chat', chatOk),
    capabilityIcon('\ud83c\udfa8', 'Images', imageOk),
    capabilityIcon('\ud83d\udd0a', 'Voice', voiceOk),
    capabilityIcon('\ud83c\udfac', 'Video', videoOk),
  ].join('   ');

  // Build plugin line
  let pluginLine;
  if (installedNames.length > 0) {
    const names = installedNames.slice(0, 4).join(', ');
    const suffix = installedNames.length > 4 ? ` +${installedNames.length - 4} more` : '';
    pluginLine = `  Plugins: ${TEAL}${names}${suffix}${RESET}`;
    pluginLine += `${DIM}  ${installedNames.length} of ${totalPlugins} installed${RESET}`;
  } else {
    pluginLine = `  ${DIM}Plugins: none installed${RESET}${DIM}  0 of ${totalPlugins} available${RESET}`;
  }

  // Build missing-key hints
  const hints = [];
  if (!imageOk || !voiceOk || !videoOk) {
    hints.push(`  ${DIM}\u2191 ${ORANGE}/keys${DIM} to enable more capabilities${RESET}`);
  }

  // Assemble box content
  const boxLines = [
    '',
    `  ${caps}`,
    '',
    pluginLine,
    '',
    `  Type ${BOLD}/help${RESET} for commands, or just start talking.`,
  ];
  if (hints.length > 0) {
    boxLines.push('');
    boxLines.push(...hints);
  }
  boxLines.push('');

  const title = `Friday v${version}`;
  return '\n' + drawBox(title, boxLines);
}
