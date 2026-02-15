#!/usr/bin/env node

/**
 * postinstall — friendly welcome after npm install -g friday-ai
 *
 * Shows a brief message so the user knows what to do next.
 * Skips output in CI environments to avoid noise.
 */

if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
  process.exit(0);
}

const PURPLE = '\x1b[38;5;141m';
const TEAL = '\x1b[38;5;43m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

console.log('');
console.log(`  ${PURPLE}${BOLD}Friday AI${RESET} installed successfully.`);
console.log('');
console.log(`  Get started:`);
console.log(`    ${TEAL}friday${RESET}          Open chat`);
console.log(`    ${TEAL}friday setup${RESET}    First-time setup (API key, workspace)`);
console.log(`    ${TEAL}friday --help${RESET}   See all commands`);
console.log('');
