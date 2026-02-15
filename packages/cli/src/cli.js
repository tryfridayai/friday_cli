/**
 * CLI command router
 *
 * Parses argv and dispatches to the appropriate command handler.
 * Keeps things simple — no framework dependency (no commander/yargs).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const COMMANDS = {
  chat: () => import('./commands/chat.js'),
  serve: () => import('./commands/serve.js'),
  setup: () => import('./commands/setup.js'),
  install: () => import('./commands/install.js'),
  uninstall: () => import('./commands/uninstall.js'),
  plugins: () => import('./commands/plugins.js'),
  schedule: () => import('./commands/schedule.js'),
};

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--version' || arg === '-V') {
      result.version = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        result[key] = true;
      } else {
        result[key] = next;
        i++;
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function printHelp() {
  console.log(`
friday — AI agent runtime

Usage:
  friday <command> [options]

Commands:
  chat      Interactive conversation with Friday (default)
  setup     Guided onboarding wizard
  install   Install a plugin (e.g. friday install github)
  uninstall Remove a plugin
  plugins   List installed and available plugins
  schedule  Manage scheduled agents
  serve     Start HTTP/WebSocket server for remote clients

Options:
  --workspace <path>   Working directory for the agent (default: ~/FridayWorkspace)
  --port <port>        Server port for 'serve' command (default: 8787)
  --verbose            Show debug output
  --version            Show version
  --help, -h           Show this help message

Examples:
  friday                         Start interactive chat
  friday setup                   First-time setup
  friday install github          Install GitHub plugin
  friday plugins                 See all plugins
  friday chat --workspace ./myproject
  friday serve --port 3000
`);
}

function isFirstRun() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return !config.setupComplete;
    }
  } catch {
    // ignore
  }
  return true;
}

export async function run(argv) {
  const args = parseArgs(argv);

  if (args.version) {
    console.log(`friday v${pkgJson.version}`);
    process.exit(0);
  }

  if (args.help && args._.length === 0) {
    printHelp();
    process.exit(0);
  }

  let commandName = args._[0] || 'chat';

  // First-run detection: if no setup done and user runs chat, prompt setup first
  if (commandName === 'chat' && isFirstRun() && !process.env.ANTHROPIC_API_KEY) {
    console.log('');
    console.log('  Looks like this is your first time. Running setup...');
    console.log('');
    commandName = 'setup';
  }

  if (!COMMANDS[commandName]) {
    console.error(`Unknown command: ${commandName}`);
    console.error(`Run 'friday --help' for usage.`);
    process.exit(1);
  }

  const mod = await COMMANDS[commandName]();
  await mod.default(args);
}
