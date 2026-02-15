/**
 * chat/ui.js — Visual system for Friday CLI chat
 *
 * Brand palette (ANSI 256-color), box drawing, prompt styling,
 * and formatting helpers shared across all chat modules.
 */

// ── Brand palette (ANSI 256-color) ──────────────────────────────────────

export const PURPLE = '\x1b[38;5;141m';   // brand primary — prompt, headers
export const BLUE = '\x1b[38;5;75m';      // links, URLs
export const TEAL = '\x1b[38;5;43m';      // success, active status
export const ORANGE = '\x1b[38;5;215m';   // warnings, costs
export const PINK = '\x1b[38;5;211m';     // media capabilities

// ── Standard ANSI ────────────────────────────────────────────────────────

export const DIM = '\x1b[2m';
export const RESET = '\x1b[0m';
export const BOLD = '\x1b[1m';
export const YELLOW = '\x1b[33m';
export const RED = '\x1b[31m';
export const CYAN = '\x1b[36m';
export const GREEN = '\x1b[32m';

// ── Prompt ───────────────────────────────────────────────────────────────

export const PROMPT_STRING = `${PURPLE}f${RESET} ${BOLD}>${RESET} `;

// ── Box drawing ──────────────────────────────────────────────────────────

/**
 * Draw a box around content lines.
 * @param {string} title - Box title (shown in top border)
 * @param {string[]} lines - Content lines to render inside the box
 * @param {number} [width=60] - Outer box width
 * @returns {string} Rendered box string
 */
export function drawBox(title, lines, width = 60) {
  const innerWidth = width - 2; // account for side borders
  const titleStr = title ? ` ${title} ` : '';
  const dashCount = innerWidth - titleStr.length;
  const topBorder = `${PURPLE}\u256d\u2500${titleStr}${'\u2500'.repeat(Math.max(0, dashCount))}\u256e${RESET}`;
  const bottomBorder = `${PURPLE}\u2570${'\u2500'.repeat(innerWidth)}\u256f${RESET}`;

  const boxLines = [topBorder];
  for (const line of lines) {
    // Calculate visible length (strip ANSI codes)
    const visible = stripAnsi(line);
    const padding = Math.max(0, innerWidth - visible.length);
    boxLines.push(`${PURPLE}\u2502${RESET}${line}${' '.repeat(padding)}${PURPLE}\u2502${RESET}`);
  }
  boxLines.push(bottomBorder);
  return boxLines.join('\n');
}

/**
 * Strip ANSI escape codes from a string to get visible length.
 */
export function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x07]*\x07[^\x1b]*\x1b\]8;;\x07/g, (match) => {
    // OSC 8 hyperlinks — extract display text
    const displayMatch = match.match(/\x07([^\x1b]*)\x1b/);
    return displayMatch ? displayMatch[1] : '';
  });
}

// ── Formatting helpers ───────────────────────────────────────────────────

/**
 * Format a label + value pair with consistent alignment.
 */
export function labelValue(label, value, labelWidth = 14) {
  const padded = (label + ':').padEnd(labelWidth);
  return `  ${DIM}${padded}${RESET} ${value}`;
}

/**
 * Render a status badge: green dot for active, dim dot for inactive.
 */
export function statusBadge(active, label) {
  if (active) {
    return `${TEAL}\u25cf${RESET} ${label}`;
  }
  return `${DIM}\u25cb ${label}${RESET}`;
}

/**
 * Format a capability icon with optional dim for unconfigured.
 */
export function capabilityIcon(emoji, label, configured) {
  if (configured) {
    return `${emoji} ${label}`;
  }
  return `${DIM}${emoji} ${label}${RESET}`;
}

/**
 * Print a section header.
 */
export function sectionHeader(text) {
  return `\n${PURPLE}${BOLD}${text}${RESET}`;
}

/**
 * Print a hint message (orange, indented).
 */
export function hint(text) {
  return `  ${ORANGE}${text}${RESET}`;
}

/**
 * Print a success message.
 */
export function success(text) {
  return `  ${TEAL}${text}${RESET}`;
}

/**
 * Print an error message.
 */
export function error(text) {
  return `  ${RED}${text}${RESET}`;
}

/**
 * Mask a secret value, showing only last 4 chars.
 */
export function maskSecret(value) {
  if (!value || value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

/**
 * Group items by a key.
 */
export function groupBy(items, keyFn) {
  const groups = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}
