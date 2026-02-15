/**
 * friday setup — Guided onboarding wizard
 *
 * Walks the user through:
 * 1. Anthropic API key entry
 * 2. Permission profile selection
 * 3. Workspace configuration
 *
 * Stores config at ~/.friday/config.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ENV_FILE = path.join(CONFIG_DIR, '.env');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function saveEnvFile(vars) {
  ensureConfigDir();
  const lines = Object.entries(vars)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', 'utf8');
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function maskKey(key) {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

export default async function setup(args) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const config = loadConfig();
  const envVars = {};

  console.log('');
  console.log('  Welcome to Friday!');
  console.log('');

  // Step 1: Anthropic API key
  const existingKey = process.env.ANTHROPIC_API_KEY || config.anthropicApiKey;
  if (existingKey) {
    console.log(`  Anthropic API key found: ${maskKey(existingKey)}`);
    const change = await ask(rl, '  Change it? (y/N): ');
    if (change.toLowerCase() === 'y') {
      const key = await ask(rl, '  Paste your Anthropic API key: ');
      if (key) {
        envVars.ANTHROPIC_API_KEY = key;
        config.anthropicApiKey = key;
        console.log('  Key saved.');
      }
    }
  } else {
    console.log('  Friday uses Claude by Anthropic as its AI engine.');
    console.log('  Get a key at: https://console.anthropic.com/settings/keys');
    console.log('');
    const key = await ask(rl, '  Paste your API key: ');
    if (!key) {
      console.log('  No key provided. You can set ANTHROPIC_API_KEY in your environment later.');
    } else {
      envVars.ANTHROPIC_API_KEY = key;
      config.anthropicApiKey = key;
      console.log('  Key saved.');
    }
  }
  console.log('');

  // Step 2: Permission profile
  console.log('  Choose a permission profile:');
  console.log('');
  console.log('  1. Developer (recommended)');
  console.log('     Auto-approves file and terminal operations in your workspace.');
  console.log('');
  console.log('  2. Safe');
  console.log('     Read-only by default. Asks before writing files or running commands.');
  console.log('');
  console.log('  3. Locked');
  console.log('     Asks permission for every action. Maximum control.');
  console.log('');

  const profileChoice = await ask(rl, '  Choose (1/2/3): ');
  const profiles = { '1': 'developer', '2': 'safe', '3': 'locked' };
  config.permissionProfile = profiles[profileChoice] || 'developer';
  console.log(`  Profile set to: ${config.permissionProfile}`);
  console.log('');

  // Step 3: Default workspace
  const defaultWorkspace = config.workspace || path.join(os.homedir(), 'FridayWorkspace');
  console.log('  Friday needs a workspace directory — a folder where it can');
  console.log('  create and edit files. Enter a folder name or full path.');
  console.log('');
  const workspace = await ask(rl, `  Workspace path (${defaultWorkspace}): `);
  let resolvedWorkspace = workspace || defaultWorkspace;
  // If user typed just a name (no path separator), put it in home directory
  if (resolvedWorkspace && !resolvedWorkspace.includes(path.sep) && !resolvedWorkspace.startsWith('~')) {
    resolvedWorkspace = path.join(os.homedir(), resolvedWorkspace);
  }
  // Expand ~ to home directory
  if (resolvedWorkspace.startsWith('~')) {
    resolvedWorkspace = path.join(os.homedir(), resolvedWorkspace.slice(1));
  }
  config.workspace = path.resolve(resolvedWorkspace);

  // Create workspace if it doesn't exist
  if (!fs.existsSync(config.workspace)) {
    fs.mkdirSync(config.workspace, { recursive: true });
  }
  console.log(`  Workspace created: ${config.workspace}`);
  console.log('');

  // Step 4: Optional provider keys
  console.log('  Optional: Add API keys for additional providers.');
  console.log('  (Press Enter to skip any)');
  console.log('');

  const openaiKey = await ask(rl, '  OpenAI API key (for image/video gen): ');
  if (openaiKey) {
    envVars.OPENAI_API_KEY = openaiKey;
    config.openaiApiKey = openaiKey;
  }

  const googleKey = await ask(rl, '  Google AI API key (for Gemini/Imagen): ');
  if (googleKey) {
    envVars.GOOGLE_API_KEY = googleKey;
    config.googleApiKey = googleKey;
  }

  const elevenKey = await ask(rl, '  ElevenLabs API key (for voice): ');
  if (elevenKey) {
    envVars.ELEVENLABS_API_KEY = elevenKey;
    config.elevenlabsApiKey = elevenKey;
  }

  // Save everything
  config.setupComplete = true;
  config.setupDate = new Date().toISOString();
  saveConfig(config);

  if (Object.keys(envVars).length > 0) {
    saveEnvFile(envVars);
  }

  console.log('');
  console.log('  Setup complete!');
  console.log('');

  rl.close();

  // Automatically launch chat after setup
  const chatModule = await import('./chat.js');
  await chatModule.default({ ...args, workspace: config.workspace });
}
