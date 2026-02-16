/**
 * friday chat — Interactive conversation with the agent runtime
 *
 * Spawns the runtime's stdio transport (friday-server.js) as a child process
 * and provides a bottom-pinned input bar with clean, user-friendly output.
 *
 * Use --verbose to see raw debug output (session IDs, tool inputs, etc.)
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Chat modules ─────────────────────────────────────────────────────────

import {
  DIM, RESET, BOLD, YELLOW, RED, CYAN, GREEN, ORANGE,
  PURPLE, PROMPT_STRING,
} from './chat/ui.js';
import { renderWelcome } from './chat/welcomeScreen.js';
import {
  routeSlashCommand, handleColonCommand, checkPendingResponse,
} from './chat/slashCommands.js';
import { checkPreQueryHint, checkPostResponseHint } from './chat/smartAffordances.js';
import { runtimeDir } from '../resolveRuntime.js';
import { loadApiKeysToEnv } from '../secureKeyStore.js';
import InputLine from './chat/inputLine.js';
const serverScript = path.join(runtimeDir, 'friday-server.js');

// ── Tool humanization ────────────────────────────────────────────────────

/** Format a tool name like "mcp__filesystem__read_file" into "Reading file..." */
function humanizeToolUse(toolName, toolInput) {
  const name = toolName || 'tool';
  const parts = name.split('__');
  const action = parts[parts.length - 1];
  const server = parts.length >= 3 ? parts[1] : null;

  const descriptions = {
    read_file: () => {
      const p = toolInput?.path || toolInput?.file_path;
      return p ? `Reading ${path.basename(p)}` : 'Reading file';
    },
    write_file: () => {
      const p = toolInput?.path || toolInput?.file_path;
      return p ? `Writing ${path.basename(p)}` : 'Writing file';
    },
    edit_file: () => {
      const p = toolInput?.path || toolInput?.file_path;
      return p ? `Editing ${path.basename(p)}` : 'Editing file';
    },
    create_directory: () => {
      const p = toolInput?.path;
      return p ? `Creating directory ${path.basename(p)}` : 'Creating directory';
    },
    list_directory: () => {
      const p = toolInput?.path;
      return p ? `Listing ${path.basename(p)}/` : 'Listing directory';
    },
    search_files: () => 'Searching files',
    move_file: () => 'Moving file',
    execute_command: () => {
      const cmd = toolInput?.command;
      return cmd ? `Running: ${cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd}` : 'Running command';
    },
    bash: () => {
      const cmd = toolInput?.command;
      return cmd ? `Running: ${cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd}` : 'Running command';
    },
    search: () => {
      const q = toolInput?.query;
      return q ? `Searching: ${q.length > 50 ? q.slice(0, 47) + '...' : q}` : 'Searching';
    },
    scrape: () => {
      const u = toolInput?.url;
      return u ? `Fetching ${u.length > 50 ? u.slice(0, 47) + '...' : u}` : 'Fetching page';
    },
    list_processes: () => 'Listing processes',
    kill_process: () => 'Killing process',
  };

  if (descriptions[action]) {
    return descriptions[action]();
  }

  const humanized = action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c);
  return humanized;
}

/** Humanize a tool name for permission prompts — hide MCP internals */
function humanizePermission(toolName, description) {
  // Map tool actions to friendly descriptions
  const friendlyNames = {
    'generate_image': 'Generate Image',
    'generate image': 'Generate Image',
    'generate_video': 'Generate Video',
    'generate video': 'Generate Video',
    'text_to_speech': 'Text to Speech',
    'text to speech': 'Text to Speech',
    'speech_to_text': 'Speech to Text',
    'speech to text': 'Speech to Text',
    'query_model': 'Query AI Model',
    'list_voices': 'List Voices',
    'clone_voice': 'Clone Voice',
    'execute_command': 'Run Terminal Command',
    'execute command': 'Run Terminal Command',
    'start_preview': 'Start Preview Server',
    'stop_preview': 'Stop Preview Server',
    'WebSearch': 'Search the Web',
    'WebFetch': 'Fetch Web Page',
    'scrape': 'Scrape Web Page',
    'crawl': 'Crawl Website',
  };

  if (description) {
    // Strip MCP server prefixes: "mcp__server__" or "mcp server-name "
    let cleaned = description
      .replace(/mcp__[\w-]+__/gi, '')           // mcp__server__tool
      .replace(/mcp\s+[\w-]+\s+/gi, '')         // mcp server-name tool
      .replace(/_/g, ' ')
      .trim();

    // Check if cleaned text matches a friendly name
    const lowerCleaned = cleaned.toLowerCase();
    for (const [key, value] of Object.entries(friendlyNames)) {
      if (lowerCleaned === key.toLowerCase() || lowerCleaned.startsWith(key.toLowerCase())) {
        return value;
      }
    }
    return cleaned;
  }

  if (!toolName) return 'use a tool';
  const parts = toolName.split('__');
  const action = parts[parts.length - 1];

  return friendlyNames[action] || `Allow Friday to use ${action.replace(/_/g, ' ')}`;
}

/**
 * Make absolute file paths clickable in terminal output using OSC 8 hyperlinks.
 */
function linkifyPaths(text) {
  return text.replace(/(\/(?:Users|home|tmp|var|opt|etc)\/\S+)/g, (match) => {
    const trailingMatch = match.match(/([.,;:!?)}\]]+)$/);
    const cleanPath = trailingMatch ? match.slice(0, -trailingMatch[1].length) : match;
    const trailing = trailingMatch ? trailingMatch[1] : '';
    const url = `file://${cleanPath}`;
    return `\x1b]8;;${url}\x07${cleanPath}\x1b]8;;\x07${trailing}`;
  });
}

// ── Spinner ──────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];

function createSpinner() {
  let interval = null;
  let frameIndex = 0;
  let currentText = 'Friday is thinking';
  let lineLength = 0;

  function clear() {
    if (lineLength > 0) {
      process.stdout.write('\r' + ' '.repeat(lineLength) + '\r');
      lineLength = 0;
    }
  }

  function render() {
    clear();
    const frame = `${DIM}${SPINNER_FRAMES[frameIndex]} ${currentText}...${RESET}`;
    process.stdout.write(frame);
    lineLength = 2 + currentText.length + 3;
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
  }

  return {
    start(text = 'Friday is thinking') {
      currentText = text;
      frameIndex = 0;
      if (interval) clearInterval(interval);
      render();
      interval = setInterval(render, 80);
    },
    update(text) {
      currentText = text;
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      clear();
    },
    get active() {
      return interval !== null;
    },
  };
}

// ── Interactive selector ─────────────────────────────────────────────────

/**
 * Show an interactive arrow-key selector in the terminal.
 * Returns the selected option object { label, value }.
 */
function selectOption(options, { prompt: promptText = '', rl: rlInterface } = {}) {
  return new Promise((resolve) => {
    let selectedIndex = 0;

    if (rlInterface) rlInterface.pause();

    const render = () => {
      if (render._rendered) {
        process.stdout.write(`\x1b[${options.length}A`);
      }
      options.forEach((opt, i) => {
        const prefix = i === selectedIndex ? `${CYAN}\u276f${RESET} ${BOLD}` : '  ';
        const suffix = i === selectedIndex ? RESET : '';
        const dimLabel = i === selectedIndex ? opt.label : `${DIM}${opt.label}${RESET}`;
        process.stdout.write(`\r\x1b[K${prefix}${dimLabel}${suffix}\n`);
      });
      render._rendered = true;
    };

    render();

    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onKey = (data) => {
      const key = data.toString();

      if (key === '\x1b[A') {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        render();
        return;
      }
      if (key === '\x1b[B') {
        selectedIndex = (selectedIndex + 1) % options.length;
        render();
        return;
      }
      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(options[selectedIndex]);
        return;
      }
      const num = parseInt(key);
      if (num >= 1 && num <= options.length) {
        selectedIndex = num - 1;
        render();
        cleanup();
        resolve(options[selectedIndex]);
        return;
      }
      if (key === '\x03') {
        cleanup();
        resolve(options.find((o) => o.value === 'deny') || options[options.length - 1]);
        return;
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onKey);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw || false);
      }
      if (rlInterface) rlInterface.resume();
    };

    process.stdin.on('data', onKey);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────

export default async function chat(args) {
  let verbose = args.verbose || false;
  const workspacePath = path.resolve(
    args.workspace || process.env.FRIDAY_WORKSPACE || path.join(os.homedir(), 'FridayWorkspace')
  );
  fs.mkdirSync(workspacePath, { recursive: true });

  // Load API keys from secure storage (system keychain)
  // Keys are loaded into process.env for the runtime to access,
  // but are filtered out before being passed to the agent (see AgentRuntime.js)
  try {
    await loadApiKeysToEnv();
  } catch (err) {
    if (verbose) {
      console.log(`${DIM}Note: Could not load from secure storage: ${err.message}${RESET}`);
    }
  }

  // Fallback: Also check ~/.friday/.env for legacy keys (will be migrated to keychain)
  const fridayEnvPath = path.join(os.homedir(), '.friday', '.env');
  try {
    if (fs.existsSync(fridayEnvPath)) {
      const content = fs.readFileSync(fridayEnvPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const eqIdx = trimmed.indexOf('=');
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        // Only use .env values if not already set from secure storage
        if (key && val && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch { /* ignore */ }

  const env = { ...process.env, FRIDAY_WORKSPACE: workspacePath };

  if (verbose) {
    console.log(`Starting Friday with workspace: ${workspacePath}`);
  }

  const backend = spawn(process.execPath, [serverScript], {
    cwd: runtimeDir,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (verbose) {
    backend.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });
  } else {
    backend.stderr.resume();
  }

  backend.on('exit', (code, signal) => {
    if (verbose) {
      console.log(`Backend exited (code=${code ?? 'null'} signal=${signal ?? 'none'})`);
    }
    process.exit(code ?? 0);
  });

  // ── InputLine (replaces readline) ──────────────────────────────────────

  const inputLine = new InputLine();

  // Compatibility adapter for slashCommands.js (expects ctx.rl)
  const rlCompat = {
    pause()  { inputLine.pause(); },
    resume() { inputLine.resume(); },
    prompt() { inputLine.prompt(); },
    close()  { inputLine.destroy(); },
  };

  let sessionId = null;
  let pendingPermission = null;
  let pendingRulePrompt = null;
  const rulePromptQueue = [];
  let isStreaming = false;
  let accumulatedResponse = ''; // Track response text for post-response hints

  // ── Permission queue (fixes issues b & c) ──────────────────────────────
  // Multiple permission_request messages can arrive simultaneously.
  // We queue them and show only one selectOption at a time, preventing
  // stacked prompts and the `tool_use ids must be unique` API error.

  const permissionQueue = [];
  let showingPermission = false;

  const spinner = createSpinner();

  function writeMessage(payload) {
    backend.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  function sendPermissionResponse(approved, { updatedInput, message } = {}) {
    if (!pendingPermission) {
      console.log(`${DIM}No pending permission request.${RESET}`);
      return;
    }
    const response = {
      type: 'permission_response',
      permission_id: pendingPermission.permission_id,
      approved,
    };
    if (updatedInput) response.updated_input = updatedInput;
    if (typeof message === 'string' && message.length > 0) response.message = message;
    writeMessage(response);
    pendingPermission = null;
    if (approved) {
      spinner.start('Working');
    }
  }

  /**
   * Display the next queued permission prompt. Only one is shown at a time.
   * When the user responds, processNextPermission() is called again to
   * dequeue the next one (if any).
   */
  function processNextPermission() {
    if (showingPermission) return; // one at a time
    if (permissionQueue.length === 0) return;

    showingPermission = true;
    const msg = permissionQueue.shift();
    pendingPermission = msg;

    if (spinner.active) {
      spinner.stop();
    }
    if (isStreaming) {
      process.stdout.write('\n');
      isStreaming = false;
    }

    console.log('');
    console.log(`${YELLOW}${BOLD}Permission needed:${RESET} ${humanizePermission(msg.tool_name, msg.description)}`);
    if (msg.tool_input) {
      const entries = Object.entries(msg.tool_input);
      const preview = entries.slice(0, 3).map(([k, v]) => {
        const val = typeof v === 'string' ? v : JSON.stringify(v);
        const short = val.length > 70 ? val.slice(0, 67) + '...' : val;
        return `  ${DIM}${k}: ${short}${RESET}`;
      });
      preview.forEach((line) => console.log(line));
      if (entries.length > 3) {
        console.log(`  ${DIM}...and ${entries.length - 3} more${RESET}`);
      }
    }
    console.log('');
    selectOption(
      [
        { label: 'Allow', value: 'allow' },
        { label: 'Allow for this session', value: 'session' },
        { label: 'Deny', value: 'deny' },
      ],
      { rl: rlCompat }
    ).then((choice) => {
      showingPermission = false;

      if (!pendingPermission) {
        // Permission was cancelled while user was choosing
        inputLine.prompt();
        processNextPermission();
        return;
      }
      if (choice.value === 'deny') {
        sendPermissionResponse(false, {});
      } else {
        sendPermissionResponse(true, {});
      }

      // Process next queued permission (if any)
      if (permissionQueue.length > 0) {
        processNextPermission();
      } else {
        inputLine.prompt();
      }
    });
  }

  function showRulePrompt() {
    if (pendingRulePrompt || rulePromptQueue.length === 0) return;
    pendingRulePrompt = rulePromptQueue.shift();
    const prompt = pendingRulePrompt;
    console.log('');
    console.log(`${BOLD}${prompt.title}${RESET}`);
    if (prompt.message) {
      console.log(`${DIM}${prompt.message}${RESET}`);
    }
    prompt.actions.forEach((action, index) => {
      console.log(`  ${BOLD}${index + 1}${RESET}  ${action.label}`);
    });
    console.log(`${DIM}Type :rule <number> to choose.${RESET}`);
    console.log('');
  }

  function handleRuleAction(actionIdOrIndex) {
    if (!pendingRulePrompt) {
      console.log(`${DIM}No rule prompt to respond to.${RESET}`);
      return;
    }
    let resolvedActionId = actionIdOrIndex;
    const prompt = pendingRulePrompt;
    if (/^\d+$/.test(actionIdOrIndex)) {
      const idx = Number(actionIdOrIndex) - 1;
      const action = prompt.actions[idx];
      if (!action) {
        console.log(`${RED}No action at index ${actionIdOrIndex}${RESET}`);
        return;
      }
      resolvedActionId = action.id;
    }
    if (!prompt.actions.some((a) => a.id === resolvedActionId)) {
      console.log(`${RED}Unknown action: ${resolvedActionId}${RESET}`);
      return;
    }
    writeMessage({
      type: 'rule_action',
      prompt_id: prompt.prompt_id,
      action_id: resolvedActionId,
    });
    pendingRulePrompt = null;
    showRulePrompt();
  }

  // ── Slash command context ──────────────────────────────────────────────

  const slashCtx = {
    get rl() { return rlCompat; },
    get sessionId() { return sessionId; },
    get workspacePath() { return workspacePath; },
    get verbose() { return verbose; },
    get spinner() { return spinner; },
    get backend() { return backend; },
    writeMessage,
    selectOption,
    resetSession() { sessionId = null; },
    toggleVerbose() {
      verbose = !verbose;
      if (verbose) {
        backend.stderr.removeAllListeners('data');
        backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
        console.log(`${GREEN}Verbose mode on${RESET}`);
      } else {
        backend.stderr.removeAllListeners('data');
        backend.stderr.resume();
        console.log(`${DIM}Verbose mode off${RESET}`);
      }
    },
  };

  // ── Backend message handler ────────────────────────────────────────────

  function handleBackendLine(line) {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);

      // Check if a slash command is waiting for this response type
      if (checkPendingResponse(msg)) {
        return;
      }

      // In verbose mode, show everything raw (original behavior)
      if (verbose) {
        handleBackendLineVerbose(msg);
        return;
      }

      switch (msg.type) {
        case 'ready':
          console.log(renderWelcome());
          console.log('');
          inputLine.init();
          inputLine.prompt();
          break;

        case 'session':
          sessionId = msg.session_id;
          break;

        case 'thinking':
          if (!spinner.active) {
            if (isStreaming) {
              process.stdout.write('\n');
              isStreaming = false;
            }
            spinner.start('Friday is thinking');
          }
          break;

        case 'info':
          break;

        case 'chunk':
          if (spinner.active) {
            spinner.stop();
          }
          if (!isStreaming) {
            isStreaming = true;
            // Start agent output on a fresh line
            process.stdout.write('\n');
          }
          {
            const text = msg.text || msg.content || '';
            accumulatedResponse += text;
            process.stdout.write(linkifyPaths(text));
          }
          break;

        case 'thinking_complete':
          break;

        case 'tool_use': {
          if (spinner.active) {
            spinner.stop();
          }
          if (isStreaming) {
            process.stdout.write('\n');
            isStreaming = false;
          }
          const desc = humanizeToolUse(msg.tool_name, msg.tool_input);
          spinner.start(desc);
          break;
        }

        case 'tool_result':
          break;

        case 'permission_request':
          // Queue the permission and process one at a time (fixes issues b & c)
          permissionQueue.push(msg);
          processNextPermission();
          break;

        case 'permission_cancelled':
          if (pendingPermission && pendingPermission.permission_id === msg.permission_id) {
            pendingPermission = null;
          }
          // Also remove from queue if still pending
          const cancelIdx = permissionQueue.findIndex(p => p.permission_id === msg.permission_id);
          if (cancelIdx !== -1) {
            permissionQueue.splice(cancelIdx, 1);
          }
          break;

        case 'rule_prompt':
          if (spinner.active) {
            spinner.stop();
          }
          rulePromptQueue.push(msg);
          if (!pendingRulePrompt) showRulePrompt();
          break;

        case 'error':
          if (spinner.active) {
            spinner.stop();
          }
          console.log(`\n${RED}Error: ${msg.message}${RESET}`);
          inputLine.prompt();
          break;

        case 'complete':
          if (spinner.active) {
            spinner.stop();
          }
          if (isStreaming) {
            isStreaming = false;
          }
          // Show cost summary if available
          if (msg.cost && msg.cost.estimated > 0) {
            const cost = msg.cost.estimated;
            const costStr = cost < 0.01 ? `${(cost * 100).toFixed(2)}c` : `$${cost.toFixed(4)}`;
            const tokens = msg.cost.tokens;
            console.log(`\n${DIM}${costStr} \u00b7 ${tokens.input + tokens.output} tokens${RESET}`);
          } else {
            console.log('');
          }
          // Post-response smart affordance hint
          if (accumulatedResponse) {
            const postHint = checkPostResponseHint(accumulatedResponse);
            if (postHint) {
              console.log(postHint);
            }
            accumulatedResponse = '';
          }
          inputLine.prompt();
          break;

        default:
          break;
      }
    } catch {
      if (verbose) {
        process.stdout.write(line);
      }
    }
  }

  // ── Verbose handler (original behavior) ────────────────────────────────

  function handleBackendLineVerbose(msg) {
    switch (msg.type) {
      case 'ready':
        console.log('Friday is ready. Type your prompt to begin.');
        inputLine.init();
        inputLine.prompt();
        break;
      case 'session':
        sessionId = msg.session_id;
        console.log(`Session: ${sessionId}`);
        break;
      case 'thinking':
        console.log(`[thinking] ${msg.content}`);
        break;
      case 'info':
        console.log(`[info] ${msg.message}`);
        break;
      case 'chunk':
        process.stdout.write(msg.text || msg.content || '');
        break;
      case 'permission_request':
        // Queue the permission in verbose mode too
        permissionQueue.push(msg);
        processNextPermission();
        break;
      case 'permission_cancelled':
        if (pendingPermission && pendingPermission.permission_id === msg.permission_id) {
          pendingPermission = null;
        }
        console.log(`Permission ${msg.permission_id} cancelled.`);
        break;
      case 'rule_prompt':
        rulePromptQueue.push(msg);
        if (!pendingRulePrompt) showRulePrompt();
        break;
      case 'error':
        console.log(`[error] ${msg.message}`);
        break;
      case 'complete':
        console.log('');
        inputLine.prompt();
        break;
      default:
        if (msg.type === 'tool_use') {
          console.log(`\n[tool] ${msg.tool_name}: ${JSON.stringify(msg.tool_input || {}).slice(0, 200)}`);
        } else if (msg.type === 'tool_result') {
          const preview =
            typeof msg.content === 'string'
              ? msg.content.slice(0, 200)
              : JSON.stringify(msg.content).slice(0, 200);
          console.log(`[result] ${preview}`);
        }
    }
  }

  // ── Buffer partial lines from stdout ───────────────────────────────────

  let buffer = '';
  backend.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach(handleBackendLine);
  });

  // ── Input handler ──────────────────────────────────────────────────────

  // Flag to prevent leaked input from askSecret from being sent as query
  let processingSlashCommand = false;

  // Safety patterns to detect accidentally leaked API keys
  const API_KEY_PATTERNS = [
    /^sk-[a-zA-Z0-9-_]{20,}$/,           // OpenAI/Anthropic style
    /^sk-ant-[a-zA-Z0-9-_]{20,}$/,       // Anthropic
    /^sk-proj-[a-zA-Z0-9-_]{20,}$/,      // OpenAI project keys
    /^AIza[a-zA-Z0-9-_]{30,}$/,          // Google API keys
    /^[a-f0-9]{32}$/,                     // Generic 32-char hex keys
  ];

  function looksLikeApiKey(text) {
    return API_KEY_PATTERNS.some(pattern => pattern.test(text));
  }

  inputLine.onSubmit(async (input) => {
    const line = input.trim();
    if (!line) {
      inputLine.prompt();
      return;
    }

    // SECURITY: Silently block any input that looks like an API key
    // This is a fallback in case askSecret leaks input to readline buffer
    if (looksLikeApiKey(line)) {
      // Silently ignore - don't alarm the user, just don't send to agent
      inputLine.prompt();
      return;
    }

    // Ignore input while processing a slash command (e.g., leaked from askSecret)
    if (processingSlashCommand) {
      inputLine.prompt();
      return;
    }

    // ── Slash commands (/help, /plugins, etc.) ──────────────────────────
    if (line.startsWith('/')) {
      processingSlashCommand = true;
      try {
        await routeSlashCommand(line, slashCtx);
      } finally {
        processingSlashCommand = false;
      }
      return;
    }

    // ── Colon commands (backward compatibility) ─────────────────────────
    if (line.startsWith(':')) {
      const [command, ...rest] = line.slice(1).split(' ');
      const argString = rest.join(' ').trim();

      // Check if this is a slash command alias — show migration hint
      const migrated = handleColonCommand(line, slashCtx);

      // Handle legacy colon-only commands (:allow, :deny, :rule, :raw)
      switch (command) {
        case 'q':
        case 'quit':
          // Migrate to /quit
          console.log(`${ORANGE}Hint:${RESET} ${DIM}Commands now use / prefix. Try ${BOLD}/quit${RESET}`);
          spinner.stop();
          backend.kill();
          inputLine.destroy();
          return;
        case 'new':
          console.log(`${ORANGE}Hint:${RESET} ${DIM}Commands now use / prefix. Try ${BOLD}/new${RESET}`);
          sessionId = null;
          writeMessage({ type: 'new_session' });
          console.log(`${DIM}New session started.${RESET}`);
          break;
        case 'allow': {
          let updatedInput;
          if (argString) {
            try {
              updatedInput = JSON.parse(argString);
            } catch {
              console.log(`${RED}Invalid JSON for updated input.${RESET}`);
              break;
            }
          }
          sendPermissionResponse(true, { updatedInput });
          break;
        }
        case 'deny':
          sendPermissionResponse(false, { message: argString });
          break;
        case 'rule':
          if (!argString) {
            console.log(`${DIM}Usage: :rule <number|actionId>${RESET}`);
            break;
          }
          handleRuleAction(argString);
          break;
        case 'raw':
          if (!argString) {
            console.log(`${DIM}Usage: :raw {"type":"..."} ${RESET}`);
            break;
          }
          try {
            writeMessage(JSON.parse(argString));
          } catch {
            console.log(`${RED}Payload must be valid JSON.${RESET}`);
          }
          break;
        case 'help':
          console.log(`${ORANGE}Hint:${RESET} ${DIM}Commands now use / prefix. Try ${BOLD}/help${RESET}`);
          await routeSlashCommand('/help', slashCtx);
          return;
        case 'verbose':
          console.log(`${ORANGE}Hint:${RESET} ${DIM}Commands now use / prefix. Try ${BOLD}/verbose${RESET}`);
          slashCtx.toggleVerbose();
          break;
        default:
          // Check if it maps to a slash command
          if (!migrated) {
            console.log(`${DIM}Unknown command :${command}. Type /help for commands.${RESET}`);
          } else {
            // Route through slash system
            await routeSlashCommand(`/${command} ${argString}`.trim(), slashCtx);
            return;
          }
      }
      inputLine.prompt();
      return;
    }

    // ── Pre-query smart affordance hint ──────────────────────────────────
    const preHint = checkPreQueryHint(line);
    if (preHint) {
      console.log(preHint);
    }

    // ── Send user query ─────────────────────────────────────────────────
    // Echo user input so it's visible in the scroll region
    console.log(`\n${PURPLE}▸${RESET} ${BOLD}${line}${RESET}`);
    accumulatedResponse = '';
    spinner.start('Friday is thinking');
    writeMessage({ type: 'query', message: line, session_id: sessionId });
  });
}
