/**
 * chat/smartAffordances.js — Intent detection and contextual hints
 *
 * Pre-query: Scans user input for image/voice/video/schedule keywords.
 *   If the matching capability requires a missing API key, shows a hint.
 *
 * Post-response: After `complete`, if agent mentioned missing keys or
 *   unavailable plugins, shows a tip.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ORANGE, DIM, RESET, BOLD } from './ui.js';

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const ENV_FILE = path.join(CONFIG_DIR, '.env');

// ── Intent patterns ──────────────────────────────────────────────────────

const INTENT_PATTERNS = [
  {
    capability: 'image',
    patterns: [
      /\b(generate|create|make|draw|design)\s+(an?\s+)?image/i,
      /\b(generate|create|make|draw|design)\s+(an?\s+)?(picture|illustration|photo|artwork|graphic)/i,
      /\bimage\s+(of|for|with)\b/i,
    ],
    requiredKeys: ['OPENAI_API_KEY', 'GOOGLE_API_KEY'],
    keyLabel: 'OpenAI or Google',
    hint: 'images',
  },
  {
    capability: 'voice',
    patterns: [
      /\b(text.to.speech|tts|speak|say|read\s+aloud|voice|narrate)\b/i,
      /\bconvert\s+.*\s+to\s+speech/i,
      /\b(generate|create|make)\s+.*\s+(audio|voice|speech)/i,
    ],
    requiredKeys: ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'GOOGLE_API_KEY'],
    keyLabel: 'OpenAI, ElevenLabs, or Google',
    hint: 'voice',
  },
  {
    capability: 'video',
    patterns: [
      /\b(generate|create|make)\s+(a\s+)?video/i,
      /\bvideo\s+(of|for|with)\b/i,
    ],
    requiredKeys: ['OPENAI_API_KEY', 'GOOGLE_API_KEY'],
    keyLabel: 'OpenAI or Google',
    hint: 'video',
  },
  {
    capability: 'schedule',
    patterns: [
      /\bschedule\b/i,
      /\bevery\s+(day|morning|evening|hour|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b(remind|recurring|automate|cron)\b/i,
    ],
    requiredKeys: null, // no key needed, just a tip
    keyLabel: null,
    hint: null,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function envHasAnyKey(keyNames) {
  for (const keyName of keyNames) {
    if (process.env[keyName]) return true;
  }
  // Check ~/.friday/.env
  try {
    if (fs.existsSync(ENV_FILE)) {
      const content = fs.readFileSync(ENV_FILE, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        if (keyNames.includes(key.trim()) && rest.join('=').trim().length > 0) return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// ── Pre-query hint ───────────────────────────────────────────────────────

/**
 * Check user input for intent patterns and return a hint string if
 * a required API key is missing. Returns null if no hint needed.
 *
 * @param {string} input - User's message text
 * @returns {string|null} Hint message to display, or null
 */
export function checkPreQueryHint(input) {
  for (const intent of INTENT_PATTERNS) {
    const matches = intent.patterns.some(p => p.test(input));
    if (!matches) continue;

    // If this intent needs keys, check if any are available
    if (intent.requiredKeys && !envHasAnyKey(intent.requiredKeys)) {
      return `  ${ORANGE}You need a ${intent.keyLabel} key for ${intent.hint}. Try ${BOLD}/keys${RESET}`;
    }

    // Video intent — warn about cost
    if (intent.capability === 'video') {
      return `  ${ORANGE}⚠ Video generation can be expensive ($0.50–$5+ per video).${RESET}\n  ${DIM}Monitor usage at your provider's dashboard (e.g. platform.openai.com/usage).${RESET}`;
    }

    // Schedule intent — offer the /schedule command
    if (intent.capability === 'schedule') {
      return `  ${DIM}Tip: Use ${BOLD}/schedule${RESET}${DIM} to manage recurring tasks.${RESET}`;
    }
  }
  return null;
}

// ── Post-response hint ───────────────────────────────────────────────────

/**
 * Check the accumulated response text for patterns that suggest
 * the user should take an action. Returns a hint string or null.
 *
 * @param {string} responseText - The accumulated text from the agent response
 * @returns {string|null} Hint message to display, or null
 */
export function checkPostResponseHint(responseText) {
  if (!responseText) return null;
  const lower = responseText.toLowerCase();

  // Agent mentioned missing API key
  if (lower.includes('api key') && (lower.includes('missing') || lower.includes('not set') || lower.includes('not configured') || lower.includes('need'))) {
    return `  ${DIM}Tip: Use ${BOLD}/keys${RESET}${DIM} to add API keys.${RESET}`;
  }

  // Agent mentioned a plugin not being available
  if (lower.includes('plugin') && (lower.includes('not installed') || lower.includes('not available') || lower.includes('not enabled'))) {
    return `  ${DIM}Tip: Use ${BOLD}/plugins${RESET}${DIM} to install plugins.${RESET}`;
  }

  return null;
}
