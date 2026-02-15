/**
 * chat/slashCommands.js — Slash command system for Friday CLI chat
 *
 * Command registry, router, waitForResponse infrastructure,
 * and all /command handler implementations.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import {
  PURPLE, BLUE, TEAL, ORANGE, PINK, DIM, RESET, BOLD,
  RED, GREEN, CYAN, YELLOW,
  sectionHeader, labelValue, statusBadge, hint, success, error as errorMsg,
  maskSecret, groupBy, drawBox,
} from './ui.js';
import { runtimeDir } from '../../resolveRuntime.js';

const CONFIG_DIR = process.env.FRIDAY_CONFIG_DIR || path.join(os.homedir(), '.friday');
const ENV_FILE = path.join(CONFIG_DIR, '.env');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PERMISSIONS_FILE = path.join(CONFIG_DIR, 'permissions.json');

// ── Command Registry ─────────────────────────────────────────────────────

const commands = [
  { name: 'help',     aliases: ['h'],   description: 'Show all commands' },
  { name: 'status',   aliases: ['s'],   description: 'Session, costs, capabilities' },
  { name: 'plugins',  aliases: ['p'],   description: 'Install/uninstall/list plugins' },
  { name: 'models',   aliases: ['m'],   description: 'List available models' },
  { name: 'keys',     aliases: ['k'],   description: 'Add/update API keys' },
  { name: 'config',   aliases: [],      description: 'Permission profile, workspace' },
  { name: 'schedule', aliases: [],      description: 'Manage scheduled agents' },
  { name: 'new',      aliases: ['n'],   description: 'New session' },
  { name: 'quit',     aliases: ['q'],   description: 'Exit' },
  { name: 'image',    aliases: ['img'], description: 'Quick image generation' },
  { name: 'voice',    aliases: ['v'],   description: 'Quick text-to-speech' },
  { name: 'clear',    aliases: [],      description: 'Clear screen' },
  { name: 'verbose',  aliases: [],      description: 'Toggle debug output' },
];

// Build lookup maps
const commandMap = new Map();
for (const cmd of commands) {
  commandMap.set(cmd.name, cmd);
  for (const alias of cmd.aliases) {
    commandMap.set(alias, cmd);
  }
}

// ── waitForResponse infrastructure ───────────────────────────────────────

const pendingResponses = new Map();

/**
 * Register a pending response listener for a server message type.
 * Returns a promise that resolves when a matching message arrives.
 */
export function waitForResponse(type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResponses.delete(type);
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeoutMs);

    pendingResponses.set(type, (msg) => {
      clearTimeout(timer);
      pendingResponses.delete(type);
      resolve(msg);
    });
  });
}

/**
 * Check if there's a pending response handler for this message type.
 * If so, call it and return true. Otherwise return false.
 */
export function checkPendingResponse(msg) {
  const handler = pendingResponses.get(msg.type);
  if (handler) {
    handler(msg);
    return true;
  }
  return false;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch { /* ignore */ }
  return null;
}

function readEnvKeys() {
  const keys = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  };

  // Also check the env files
  const envFiles = [
    ENV_FILE,
    path.join(runtimeDir, '..', '.env'),
  ];
  for (const envFile of envFiles) {
    try {
      if (!fs.existsSync(envFile)) continue;
      const content = fs.readFileSync(envFile, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        const k = key.trim();
        const v = rest.join('=').trim();
        if (keys.hasOwnProperty(k) && !keys[k] && v) {
          keys[k] = v;
        }
      }
    } catch { /* ignore */ }
  }
  return keys;
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * Read input with secret masking (hides characters with *).
 */
function askSecret(rl, prompt) {
  return new Promise((resolve) => {
    // Pause readline so we can use raw mode
    rl.pause();

    process.stdout.write(prompt);

    let input = '';
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onData = (data) => {
      const char = data.toString();
      if (char === '\r' || char === '\n') {
        // Done
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(wasRaw || false);
        }
        process.stdout.write('\n');
        rl.resume();
        resolve(input);
        return;
      }
      if (char === '\x03') {
        // Ctrl+C
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(wasRaw || false);
        }
        process.stdout.write('\n');
        rl.resume();
        resolve('');
        return;
      }
      if (char === '\x7f' || char === '\b') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      input += char;
      process.stdout.write('*');
    };

    process.stdin.on('data', onData);
  });
}

// ── Route ────────────────────────────────────────────────────────────────

/**
 * Route a slash command input.
 * Returns true if handled, false if not a slash command.
 *
 * @param {string} input - The full input line (e.g., "/help" or "/plugins install")
 * @param {Object} ctx - Context: { rl, writeMessage, sessionId, spinner, verbose,
 *                         setVerbose, backend, selectOption, workspacePath }
 */
export async function routeSlashCommand(input, ctx) {
  // Parse command and args
  const [rawCmd, ...rest] = input.slice(1).split(' ');
  const cmdName = rawCmd.toLowerCase();
  const argString = rest.join(' ').trim();

  const cmd = commandMap.get(cmdName);
  if (!cmd) {
    console.log(`${DIM}Unknown command /${cmdName}. Type /help for commands.${RESET}`);
    ctx.rl.prompt();
    return true;
  }

  // Dispatch
  switch (cmd.name) {
    case 'help':    cmdHelp(ctx); break;
    case 'status':  await cmdStatus(ctx); break;
    case 'plugins': await cmdPlugins(ctx, argString); break;
    case 'models':  cmdModels(ctx); break;
    case 'keys':    await cmdKeys(ctx); break;
    case 'config':  await cmdConfig(ctx); break;
    case 'schedule': await cmdSchedule(ctx); break;
    case 'new':     cmdNew(ctx); break;
    case 'quit':    cmdQuit(ctx); break;
    case 'image':   cmdImage(ctx, argString); return true; // don't re-prompt, spinner is active
    case 'voice':   cmdVoice(ctx, argString); return true;
    case 'clear':   cmdClear(ctx); break;
    case 'verbose': cmdVerbose(ctx); break;
    default: break;
  }

  // Commands that don't send queries should re-prompt
  if (cmd.name !== 'image' && cmd.name !== 'voice' && cmd.name !== 'quit') {
    ctx.rl.prompt();
  }
  return true;
}

/**
 * Handle backward-compatible `:command` input.
 * Returns true if it was a colon command (handled or migrated), false otherwise.
 */
export function handleColonCommand(input, ctx) {
  const [rawCmd] = input.slice(1).split(' ');
  const cmdName = rawCmd.toLowerCase();

  // Check if this matches a slash command
  if (commandMap.has(cmdName)) {
    console.log(`${ORANGE}Hint:${RESET} ${DIM}Commands now use / prefix. Try ${BOLD}/${cmdName}${RESET}${DIM} instead.${RESET}`);
    // Fall through to route it anyway
    return false; // let the caller re-route via /
  }
  return false;
}

// ── Command Implementations ──────────────────────────────────────────────

function cmdHelp() {
  console.log('');
  console.log(sectionHeader('Commands'));
  console.log('');

  const maxLen = Math.max(...commands.map(c => {
    const aliasStr = c.aliases.length ? `, /${c.aliases.join(', /')}` : '';
    return `/${c.name}${aliasStr}`.length;
  }));

  for (const cmd of commands) {
    const aliasStr = cmd.aliases.length ? `${DIM}, /${cmd.aliases.join(', /')}${RESET}` : '';
    const nameStr = `${BOLD}/${cmd.name}${RESET}${aliasStr}`;
    const visibleLen = `/${cmd.name}${cmd.aliases.length ? `, /${cmd.aliases.join(', /')}` : ''}`.length;
    const padding = ' '.repeat(Math.max(1, maxLen - visibleLen + 2));
    console.log(`  ${nameStr}${padding}${DIM}${cmd.description}${RESET}`);
  }

  console.log('');
  console.log(`  ${DIM}Permissions use arrow-key selection by default.${RESET}`);
  console.log(`  ${DIM}Use :allow, :deny, :rule for permission shortcuts.${RESET}`);
  console.log('');
}

async function cmdStatus(ctx) {
  console.log('');
  console.log(sectionHeader('Status'));
  console.log('');

  // Session info
  console.log(labelValue('Session', ctx.sessionId || `${DIM}(new)${RESET}`));
  console.log(labelValue('Workspace', ctx.workspacePath));

  // Permission profile
  const permsData = readJsonSafe(PERMISSIONS_FILE);
  const profile = permsData?.activeProfile || 'developer';
  console.log(labelValue('Profile', profile));

  // Verbose
  console.log(labelValue('Verbose', ctx.verbose ? `${TEAL}on${RESET}` : `${DIM}off${RESET}`));

  // Capabilities
  const envKeys = readEnvKeys();
  const hasOpenAI = !!envKeys.OPENAI_API_KEY;
  const hasGoogle = !!envKeys.GOOGLE_API_KEY;
  const hasElevenLabs = !!envKeys.ELEVENLABS_API_KEY;
  const hasAnthropic = !!envKeys.ANTHROPIC_API_KEY;

  console.log('');
  console.log(`  ${statusBadge(hasAnthropic || hasOpenAI || hasGoogle, 'Chat')}  ${statusBadge(hasOpenAI || hasGoogle, 'Images')}  ${statusBadge(hasOpenAI || hasElevenLabs || hasGoogle, 'Voice')}  ${statusBadge(hasOpenAI || hasGoogle, 'Video')}`);

  // Installed plugins
  const pluginsData = readJsonSafe(path.join(CONFIG_DIR, 'plugins.json'));
  const installedCount = pluginsData?.plugins ? Object.keys(pluginsData.plugins).length : 0;
  console.log('');
  console.log(labelValue('Plugins', `${installedCount} installed`));

  // Scheduled agents — try to get count via server
  try {
    ctx.writeMessage({ type: 'scheduled_agent:list', userId: 'default' });
    const resp = await waitForResponse('scheduled_agent:list', 3000);
    const count = resp.agents?.length || 0;
    console.log(labelValue('Agents', `${count} scheduled`));
  } catch {
    console.log(labelValue('Agents', `${DIM}(unavailable)${RESET}`));
  }

  console.log('');
}

async function cmdPlugins(ctx, argString) {
  const { PluginManager } = await import(path.join(runtimeDir, 'src', 'plugins', 'PluginManager.js'));
  const pm = new PluginManager();

  // Sub-action parsing
  const subAction = argString.split(' ')[0]?.toLowerCase();

  if (subAction === 'install') {
    await pluginInstallFlow(pm, ctx);
    return;
  }
  if (subAction === 'uninstall' || subAction === 'remove') {
    await pluginUninstallFlow(pm, ctx);
    return;
  }

  // Default: show menu
  console.log('');
  console.log(sectionHeader('Plugins'));
  console.log('');

  const choice = await ctx.selectOption([
    { label: 'View installed', value: 'view' },
    { label: 'Install a plugin', value: 'install' },
    { label: 'Uninstall a plugin', value: 'uninstall' },
    { label: 'Cancel', value: 'cancel' },
  ], { rl: ctx.rl });

  if (choice.value === 'cancel') return;

  if (choice.value === 'view') {
    await pluginView(pm);
    return;
  }
  if (choice.value === 'install') {
    await pluginInstallFlow(pm, ctx);
    return;
  }
  if (choice.value === 'uninstall') {
    await pluginUninstallFlow(pm, ctx);
    return;
  }
}

async function pluginView(pm) {
  const available = pm.listAvailable();
  const grouped = groupBy(available, p => p.category);

  console.log('');
  for (const [category, plugins] of Object.entries(grouped)) {
    console.log(`  ${PURPLE}${BOLD}${category.charAt(0).toUpperCase() + category.slice(1)}${RESET}`);
    for (const p of plugins) {
      const status = p.installed
        ? `${TEAL}\u2713 installed${RESET}`
        : `${DIM}not installed${RESET}`;
      console.log(`    ${BOLD}${p.name}${RESET}  ${status}`);
      console.log(`    ${DIM}${p.description}${RESET}`);
    }
    console.log('');
  }
}

async function pluginInstallFlow(pm, ctx) {
  const available = pm.listAvailable().filter(p => !p.installed);
  if (available.length === 0) {
    console.log(success('All plugins are already installed!'));
    return;
  }

  console.log('');
  console.log(`  ${BOLD}Select a plugin to install:${RESET}`);
  console.log('');

  const options = available.map(p => ({
    label: `${p.name} — ${p.description}`,
    value: p.id,
  }));
  options.push({ label: 'Cancel', value: 'cancel' });

  const choice = await ctx.selectOption(options, { rl: ctx.rl });
  if (choice.value === 'cancel') return;

  const pluginId = choice.value;
  const fields = pm.getCredentialFields(pluginId);

  // Collect credentials
  const credentials = {};
  if (fields.length > 0) {
    console.log('');
    console.log(`  ${DIM}Enter credentials for ${pm.getPluginManifest(pluginId).name}:${RESET}`);
    if (pm.getPluginManifest(pluginId).setup?.note) {
      console.log(`  ${DIM}${pm.getPluginManifest(pluginId).setup.note}${RESET}`);
    }
    console.log('');

    for (const field of fields) {
      const label = `  ${field.label}${field.required ? '' : ` ${DIM}(optional)${RESET}`}: `;
      if (field.instructions) {
        console.log(`  ${DIM}${field.instructions}${RESET}`);
      }
      let value;
      if (field.type === 'secret') {
        value = await askSecret(ctx.rl, label);
      } else {
        value = await askQuestion(ctx.rl, label);
      }
      if (value) {
        credentials[field.key] = value;
      } else if (field.required) {
        console.log(errorMsg(`${field.label} is required. Aborting install.`));
        return;
      }
    }
  }

  try {
    pm.install(pluginId, credentials);
    const name = pm.getPluginManifest(pluginId).name;
    console.log('');
    console.log(success(`\u2713 ${name} installed successfully!`));
    console.log(hint('Start a /new session to activate the plugin.'));
    console.log('');
  } catch (err) {
    console.log(errorMsg(`Install failed: ${err.message}`));
  }
}

async function pluginUninstallFlow(pm, ctx) {
  const installed = pm.listInstalled();
  if (installed.length === 0) {
    console.log(`  ${DIM}No plugins installed.${RESET}`);
    return;
  }

  console.log('');
  console.log(`  ${BOLD}Select a plugin to uninstall:${RESET}`);
  console.log('');

  const options = installed.map(p => ({
    label: `${p.name}`,
    value: p.id,
  }));
  options.push({ label: 'Cancel', value: 'cancel' });

  const choice = await ctx.selectOption(options, { rl: ctx.rl });
  if (choice.value === 'cancel') return;

  try {
    pm.uninstall(choice.value);
    console.log('');
    console.log(success(`\u2713 ${choice.label} uninstalled.`));
    console.log(hint('Start a /new session to apply changes.'));
    console.log('');
  } catch (err) {
    console.log(errorMsg(`Uninstall failed: ${err.message}`));
  }
}

function cmdModels() {
  console.log('');
  console.log(sectionHeader('Available Models'));
  console.log('');

  let modelsData;
  try {
    const modelsPath = path.join(runtimeDir, 'src', 'providers', 'models.json');
    modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
  } catch {
    console.log(errorMsg('Could not load models.json'));
    return;
  }

  const envKeys = readEnvKeys();

  // Group models by capability
  const capModels = {
    'Chat': [],
    'Image Gen': [],
    'TTS (Voice)': [],
    'Video Gen': [],
    'STT (Transcription)': [],
  };

  const capMap = {
    'chat': 'Chat',
    'image-gen': 'Image Gen',
    'tts': 'TTS (Voice)',
    'video-gen': 'Video Gen',
    'stt': 'STT (Transcription)',
  };

  for (const [providerId, provider] of Object.entries(modelsData.providers)) {
    const keyAvailable = !!envKeys[provider.envKey];
    for (const [modelId, model] of Object.entries(provider.models)) {
      for (const cap of model.capabilities) {
        const groupName = capMap[cap] || cap;
        if (!capModels[groupName]) capModels[groupName] = [];
        const isDefault = model.default_for?.includes(cap);
        capModels[groupName].push({
          name: model.name,
          provider: providerId,
          description: model.description,
          isDefault,
          available: keyAvailable,
        });
      }
    }
  }

  for (const [capName, models] of Object.entries(capModels)) {
    if (models.length === 0) continue;
    console.log(`  ${PURPLE}${BOLD}${capName}${RESET}`);
    for (const m of models) {
      const defaultTag = m.isDefault ? ` ${TEAL}(default)${RESET}` : '';
      const availTag = m.available ? '' : ` ${DIM}(no key)${RESET}`;
      console.log(`    ${BOLD}${m.name}${RESET}${defaultTag}${availTag}  ${DIM}${m.provider}${RESET}`);
      console.log(`    ${DIM}${m.description}${RESET}`);
    }
    console.log('');
  }

  console.log(`  ${DIM}Model selection is automatic based on task. Use /keys to add provider keys.${RESET}`);
  console.log('');
}

async function cmdKeys(ctx) {
  const envKeys = readEnvKeys();

  const keyInfo = [
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic', unlocks: 'Chat (Claude)', value: envKeys.ANTHROPIC_API_KEY },
    { key: 'OPENAI_API_KEY', label: 'OpenAI', unlocks: 'Chat, Images, Voice, Video', value: envKeys.OPENAI_API_KEY },
    { key: 'GOOGLE_API_KEY', label: 'Google AI', unlocks: 'Chat, Images, Voice, Video', value: envKeys.GOOGLE_API_KEY },
    { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs', unlocks: 'Premium Voice', value: envKeys.ELEVENLABS_API_KEY },
  ];

  console.log('');
  console.log(sectionHeader('API Keys'));
  console.log('');

  for (const k of keyInfo) {
    const status = k.value
      ? `${TEAL}\u2713 configured${RESET}  ${DIM}${maskSecret(k.value)}${RESET}`
      : `${DIM}\u25cb not set${RESET}`;
    console.log(`  ${BOLD}${k.label}${RESET}  ${status}`);
    console.log(`  ${DIM}Unlocks: ${k.unlocks}${RESET}`);
    console.log('');
  }

  // Offer to add/update
  const options = keyInfo.map(k => ({
    label: `${k.value ? 'Update' : 'Add'} ${k.label} key`,
    value: k.key,
  }));
  options.push({ label: 'Done', value: 'done' });

  const choice = await ctx.selectOption(options, { rl: ctx.rl });
  if (choice.value === 'done') return;

  const selected = keyInfo.find(k => k.key === choice.value);
  console.log('');
  console.log(`  ${DIM}Enter your ${selected.label} API key:${RESET}`);
  const newValue = await askSecret(ctx.rl, `  ${selected.label} key: `);

  if (!newValue) {
    console.log(`  ${DIM}No value entered, skipping.${RESET}`);
    return;
  }

  // Write to ~/.friday/.env
  try {
    const dir = path.dirname(ENV_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let content = '';
    if (fs.existsSync(ENV_FILE)) {
      content = fs.readFileSync(ENV_FILE, 'utf8');
    }

    // Replace or append
    const regex = new RegExp(`^${selected.key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${selected.key}=${newValue}`);
    } else {
      content += `${content.endsWith('\n') || content === '' ? '' : '\n'}${selected.key}=${newValue}\n`;
    }

    fs.writeFileSync(ENV_FILE, content, 'utf8');
    console.log('');
    console.log(success(`\u2713 ${selected.label} key saved to ~/.friday/.env`));
    console.log(hint('Start a /new session for changes to take effect.'));
    console.log('');
  } catch (err) {
    console.log(errorMsg(`Failed to save key: ${err.message}`));
  }
}

async function cmdConfig(ctx) {
  console.log('');
  console.log(sectionHeader('Configuration'));
  console.log('');

  // Read current config
  const permsData = readJsonSafe(PERMISSIONS_FILE);
  const profile = permsData?.activeProfile || 'developer';
  const configData = readJsonSafe(CONFIG_FILE) || {};
  const workspace = ctx.workspacePath;

  console.log(labelValue('Profile', `${BOLD}${profile}${RESET}`));
  console.log(labelValue('Workspace', workspace));
  console.log('');

  const choice = await ctx.selectOption([
    { label: 'Change permission profile', value: 'profile' },
    { label: 'Change workspace path', value: 'workspace' },
    { label: 'Done', value: 'done' },
  ], { rl: ctx.rl });

  if (choice.value === 'done') return;

  if (choice.value === 'profile') {
    console.log('');
    const profileChoice = await ctx.selectOption([
      { label: 'developer — Auto-approves file ops in workspace', value: 'developer' },
      { label: 'safe — Read-only by default, asks before writing', value: 'safe' },
      { label: 'locked — Asks permission for everything', value: 'locked' },
      { label: 'Cancel', value: 'cancel' },
    ], { rl: ctx.rl });

    if (profileChoice.value !== 'cancel') {
      try {
        const data = readJsonSafe(PERMISSIONS_FILE) || {};
        data.activeProfile = profileChoice.value;
        const dir = path.dirname(PERMISSIONS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('');
        console.log(success(`\u2713 Profile changed to ${profileChoice.value}`));
        console.log(hint('Start a /new session for changes to take effect.'));
      } catch (err) {
        console.log(errorMsg(`Failed to save profile: ${err.message}`));
      }
    }
    return;
  }

  if (choice.value === 'workspace') {
    const newPath = await askQuestion(ctx.rl, `  New workspace path: `);
    if (newPath) {
      const resolved = path.resolve(newPath);
      try {
        fs.mkdirSync(resolved, { recursive: true });
        const data = readJsonSafe(CONFIG_FILE) || {};
        data.workspace = resolved;
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('');
        console.log(success(`\u2713 Workspace set to ${resolved}`));
        console.log(hint('Start a /new session for changes to take effect.'));
      } catch (err) {
        console.log(errorMsg(`Failed to set workspace: ${err.message}`));
      }
    }
    return;
  }
}

async function cmdSchedule(ctx) {
  console.log('');
  console.log(sectionHeader('Scheduled Agents'));
  console.log('');

  const choice = await ctx.selectOption([
    { label: 'View scheduled agents', value: 'view' },
    { label: 'Create a new agent', value: 'create' },
    { label: 'Trigger an agent now', value: 'trigger' },
    { label: 'Delete an agent', value: 'delete' },
    { label: 'Cancel', value: 'cancel' },
  ], { rl: ctx.rl });

  if (choice.value === 'cancel') return;

  if (choice.value === 'view') {
    try {
      ctx.writeMessage({ type: 'scheduled_agent:list', userId: 'default' });
      const resp = await waitForResponse('scheduled_agent:list', 5000);
      const agents = resp.agents || [];
      if (agents.length === 0) {
        console.log(`  ${DIM}No scheduled agents.${RESET}`);
      } else {
        for (const agent of agents) {
          const status = agent.status === 'active'
            ? `${TEAL}active${RESET}`
            : `${DIM}${agent.status}${RESET}`;
          const schedule = agent.schedule?.humanReadable || agent.schedule?.cron || 'unknown';
          console.log(`  ${BOLD}${agent.name}${RESET}  ${DIM}(${agent.id})${RESET}  ${status}`);
          console.log(`  ${DIM}${schedule}${RESET}`);
          if (agent.description) console.log(`  ${DIM}${agent.description}${RESET}`);
          console.log('');
        }
      }
    } catch {
      console.log(errorMsg('Could not fetch scheduled agents.'));
    }
    return;
  }

  if (choice.value === 'create') {
    console.log(`  ${DIM}Describe what you want in natural language:${RESET}`);
    console.log(`  ${DIM}Examples: "check my emails every morning at 9am"${RESET}`);
    console.log('');
    const description = await askQuestion(ctx.rl, `  > `);
    if (!description) return;

    // Parse schedule using the same pattern as schedule.js
    const scheduleData = parseNaturalSchedule(description);
    if (!scheduleData) {
      console.log(`  ${DIM}Couldn't detect a schedule. When should this run?${RESET}`);
      const schedInput = await askQuestion(ctx.rl, `  Schedule: `);
      const parsed = parseNaturalSchedule(schedInput);
      if (!parsed) {
        console.log(errorMsg(`Could not parse schedule: "${schedInput}"`));
        return;
      }
      Object.assign(scheduleData || {}, parsed);
    }

    if (!scheduleData) return;

    // Extract name
    const name = description
      .replace(/every\s+(day|morning|evening|hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i, '')
      .replace(/\b(at\s+\d{1,2}(:\d{2})?\s*(am|pm)?)\b/gi, '')
      .replace(/\b(daily|hourly|weekdays?)\b/gi, '')
      .replace(/\bevery\s+\d+\s+(minutes?|hours?)\b/gi, '')
      .replace(/\busing\s+\w+\b/gi, '')
      .trim() || description.slice(0, 50);

    const agentName = name.charAt(0).toUpperCase() + name.slice(1);

    try {
      ctx.writeMessage({
        type: 'scheduled_agent:create',
        userId: 'default',
        agentData: {
          name: agentName,
          description: description.slice(0, 100),
          instructions: description,
          schedule: {
            cron: scheduleData.cron,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            humanReadable: scheduleData.humanReadable,
          },
          mcpServers: ['terminal'],
          permissions: { preAuthorized: true, tools: [] },
        },
      });
      const resp = await waitForResponse('scheduled_agent:created', 5000);
      console.log('');
      console.log(success(`\u2713 Agent created: ${resp.agent?.name || agentName}`));
      console.log(`  ${DIM}${scheduleData.humanReadable}${RESET}`);
      console.log('');
    } catch {
      console.log(errorMsg('Failed to create scheduled agent.'));
    }
    return;
  }

  if (choice.value === 'trigger') {
    try {
      ctx.writeMessage({ type: 'scheduled_agent:list', userId: 'default' });
      const resp = await waitForResponse('scheduled_agent:list', 5000);
      const agents = resp.agents || [];
      if (agents.length === 0) {
        console.log(`  ${DIM}No agents to trigger.${RESET}`);
        return;
      }
      const options = agents.map(a => ({
        label: `${a.name} (${a.schedule?.humanReadable || a.schedule?.cron || ''})`,
        value: a.id,
      }));
      options.push({ label: 'Cancel', value: 'cancel' });

      const triggerChoice = await ctx.selectOption(options, { rl: ctx.rl });
      if (triggerChoice.value === 'cancel') return;

      ctx.writeMessage({ type: 'scheduled_agent:trigger', agentId: triggerChoice.value });
      console.log(success('\u2713 Agent triggered.'));
    } catch {
      console.log(errorMsg('Failed to trigger agent.'));
    }
    return;
  }

  if (choice.value === 'delete') {
    try {
      ctx.writeMessage({ type: 'scheduled_agent:list', userId: 'default' });
      const resp = await waitForResponse('scheduled_agent:list', 5000);
      const agents = resp.agents || [];
      if (agents.length === 0) {
        console.log(`  ${DIM}No agents to delete.${RESET}`);
        return;
      }
      const options = agents.map(a => ({ label: a.name, value: a.id }));
      options.push({ label: 'Cancel', value: 'cancel' });

      const delChoice = await ctx.selectOption(options, { rl: ctx.rl });
      if (delChoice.value === 'cancel') return;

      ctx.writeMessage({
        type: 'scheduled_agent:delete',
        userId: 'default',
        agentId: delChoice.value,
      });
      const delResp = await waitForResponse('scheduled_agent:deleted', 5000);
      console.log(success('\u2713 Agent deleted.'));
    } catch {
      console.log(errorMsg('Failed to delete agent.'));
    }
    return;
  }
}

function cmdNew(ctx) {
  ctx.resetSession();
  ctx.writeMessage({ type: 'new_session' });
  console.log(`${DIM}New session started.${RESET}`);
}

function cmdQuit(ctx) {
  ctx.spinner.stop();
  ctx.backend.kill();
  ctx.rl.close();
}

function cmdImage(ctx, argString) {
  if (!argString) {
    console.log(`  ${DIM}Usage: /image <prompt>${RESET}`);
    console.log(`  ${DIM}Example: /image a sunset over mountains${RESET}`);
    ctx.rl.prompt();
    return;
  }
  ctx.spinner.start('Thinking');
  ctx.writeMessage({
    type: 'query',
    message: `Generate an image: ${argString}`,
    session_id: ctx.sessionId,
  });
}

function cmdVoice(ctx, argString) {
  if (!argString) {
    console.log(`  ${DIM}Usage: /voice <text>${RESET}`);
    console.log(`  ${DIM}Example: /voice Hello, welcome to Friday${RESET}`);
    ctx.rl.prompt();
    return;
  }
  ctx.spinner.start('Thinking');
  ctx.writeMessage({
    type: 'query',
    message: `Convert this text to speech: ${argString}`,
    session_id: ctx.sessionId,
  });
}

function cmdClear() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function cmdVerbose(ctx) {
  ctx.toggleVerbose();
}

// ── Natural schedule parser (reused from schedule.js) ────────────────────

function parseNaturalSchedule(input) {
  const lower = input.toLowerCase().trim();

  const hoursMatch = lower.match(/every\s+(\d+)\s+hours?/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1]);
    return { cron: `0 */${hours} * * *`, humanReadable: `Every ${hours} hours` };
  }

  const minutesMatch = lower.match(/every\s+(\d+)\s+minutes?/);
  if (minutesMatch) {
    const mins = parseInt(minutesMatch[1]);
    return { cron: `*/${mins} * * * *`, humanReadable: `Every ${mins} minutes` };
  }

  const dailyMatch = lower.match(/(?:every\s+day|daily)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (dailyMatch) {
    let hour = parseInt(dailyMatch[1]);
    const minute = parseInt(dailyMatch[2] || '0');
    const ampm = dailyMatch[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { cron: `${minute} ${hour} * * *`, humanReadable: `Every day at ${hour}:${minute.toString().padStart(2, '0')}` };
  }

  if (lower.includes('every morning')) {
    return { cron: '0 9 * * *', humanReadable: 'Every morning at 9:00' };
  }
  if (lower.includes('every evening')) {
    return { cron: '0 18 * * *', humanReadable: 'Every evening at 18:00' };
  }
  if (lower === 'every hour' || lower === 'hourly') {
    return { cron: '0 * * * *', humanReadable: 'Every hour' };
  }

  const dayMatch = lower.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (dayMatch) {
    const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const day = days[dayMatch[1].toLowerCase()];
    let hour = parseInt(dayMatch[2]);
    const minute = parseInt(dayMatch[3] || '0');
    const ampm = dayMatch[4];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { cron: `${minute} ${hour} * * ${day}`, humanReadable: `Every ${dayMatch[1]} at ${hour}:${minute.toString().padStart(2, '0')}` };
  }

  const weekdayMatch = lower.match(/weekdays?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (weekdayMatch) {
    let hour = parseInt(weekdayMatch[1]);
    const minute = parseInt(weekdayMatch[2] || '0');
    const ampm = weekdayMatch[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { cron: `${minute} ${hour} * * 1-5`, humanReadable: `Weekdays at ${hour}:${minute.toString().padStart(2, '0')}` };
  }

  return null;
}
