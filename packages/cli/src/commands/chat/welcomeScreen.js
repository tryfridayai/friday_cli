/**
 * chat/welcomeScreen.js — Branded welcome screen for Friday CLI chat
 *
 * Renders on `ready` message. Large ASCII art logo with the two
 * vertical bars from the Friday brand, followed by capability
 * indicators and quick-start hints. Inspired by Gemini CLI.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { PURPLE, TEAL, DIM, RESET } from './ui.js';
import { runtimeDir } from '../../resolveRuntime.js';

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const ENV_FILE = path.join(CONFIG_DIR, '.env');

// ── Helpers ──────────────────────────────────────────────────────────────

function envHasKey(keyName) {
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

// ── Logo colors ─────────────────────────────────────────────────────────

const GRAY_BAR = '\x1b[38;5;245m';    // left bar — gray
const WHITE_BAR = '\x1b[38;5;255m';   // right bar — bright white

// ── Main render ─────────────────────────────────────────────────────────

/**
 * Render the branded welcome screen with ASCII art logo.
 * @returns {string} The welcome screen string to print
 */
export function renderWelcome() {
  // Read version from package.json
  let version = '0.2.0';
  try {
    const cliPkgPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '..', '..', '..', 'package.json',
    );
    const pkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf8'));
    version = pkg.version || version;
  } catch { /* ignore */ }

  // Check API key availability
  const hasAnthropic = envHasKey('ANTHROPIC_API_KEY');
  const hasOpenAI = envHasKey('OPENAI_API_KEY');
  const hasGoogle = envHasKey('GOOGLE_API_KEY');
  const hasElevenLabs = envHasKey('ELEVENLABS_API_KEY');

  const chatOk = hasAnthropic || hasOpenAI || hasGoogle;
  const imageOk = hasOpenAI || hasGoogle;
  const voiceOk = hasOpenAI || hasElevenLabs || hasGoogle;
  const videoOk = hasOpenAI || hasGoogle;

  // ── ASCII art: two bars (logo) + block-letter FRIDAY ──────────────
  //
  // Layout:  ██  ██  FRIDAY (block text)
  //
  // Bars extend 2 rows above and below the text for visual weight.
  // Left bar is gray, right bar is bright white, text is brand purple.

  const B = (row) => `    ${GRAY_BAR}██${RESET}  ${WHITE_BAR}██${RESET}${row}`;

  const art = [
    B(''),
    B(''),
    B(`  ${PURPLE}█████ ████  ███ ████   ███  █   █${RESET}`),
    B(`  ${PURPLE}█     █   █  █  █   █ █   █  █ █${RESET}`),
    B(`  ${PURPLE}████  ████   █  █   █ █████   █${RESET}`),
    B(`  ${PURPLE}█     █  █   █  █   █ █   █   █${RESET}`),
    B(`  ${PURPLE}█     █   █ ███ ████  █   █   █${RESET}`),
    B(''),
    B(`  ${DIM}v${version}${RESET}`),
  ];

  // ── Capability indicators ─────────────────────────────────────────

  const cap = (label, active) => active
    ? `${TEAL}\u25cf${RESET} ${label}`
    : `${DIM}\u25cb ${label}${RESET}`;

  const caps = [
    cap('Chat', chatOk),
    cap('Images', imageOk),
    cap('Voice', voiceOk),
    cap('Video', videoOk),
  ].join('    ');

  // ── Assemble ──────────────────────────────────────────────────────

  const lines = [
    '',
    ...art,
    '',
    `    ${caps}`,
    '',
    `    ${DIM}/help${RESET} commands  ${DIM}\u00b7${RESET}  ${DIM}/keys${RESET} API keys  ${DIM}\u00b7${RESET}  ${DIM}/model${RESET} configure`,
    '',
  ];

  return lines.join('\n');
}
