/**
 * friday chat — Interactive conversation with the agent runtime
 *
 * Spawns the runtime's stdio transport (friday-server.js) as a child process
 * and provides a readline-based REPL with clean, user-friendly output.
 *
 * Use --verbose to see raw debug output (session IDs, tool inputs, etc.)
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the runtime package's friday-server.js
const require = createRequire(import.meta.url);
let runtimeDir;
try {
  const runtimePkg = require.resolve('friday-runtime/package.json');
  runtimeDir = path.dirname(runtimePkg);
} catch {
  runtimeDir = path.resolve(__dirname, '..', '..', '..', 'runtime');
}
const serverScript = path.join(runtimeDir, 'friday-server.js');

// ── Styling helpers ──────────────────────────────────────────────────────

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';

/** Format a tool name like "mcp__filesystem__read_file" into "Reading file..." */
function humanizeToolUse(toolName, toolInput) {
  const name = toolName || 'tool';
  const parts = name.split('__');
  // Extract the action part (last segment)
  const action = parts[parts.length - 1];
  const server = parts.length >= 3 ? parts[1] : null;

  // Common tool name -> friendly description mappings
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

  // Fallback: humanize the action name
  const humanized = action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c);
  if (server) {
    return `${humanized} (${server})`;
  }
  return humanized;
}

// ── Spinner ──────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner() {
  let interval = null;
  let frameIndex = 0;
  let currentText = 'Thinking';
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
    // Calculate visible length (without ANSI codes)
    lineLength = 2 + currentText.length + 3;
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
  }

  return {
    start(text = 'Thinking') {
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

// ── Help ─────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${DIM}Commands:${RESET}
  ${BOLD}:q${RESET}, ${BOLD}:quit${RESET}           Exit
  ${BOLD}:new${RESET}              Start a new session
  ${BOLD}:allow${RESET} [json]     Approve pending permission
  ${BOLD}:deny${RESET} [message]   Deny pending permission
  ${BOLD}:rule${RESET} <id|#>      Pick action from rule prompt
  ${BOLD}:raw${RESET} <json>       Send raw JSON to backend
  ${BOLD}:help${RESET}             Show this help
`);
}

// ── Main ─────────────────────────────────────────────────────────────────

export default async function chat(args) {
  const verbose = args.verbose || false;
  const workspacePath = path.resolve(
    args.workspace || process.env.FRIDAY_WORKSPACE || path.join(os.homedir(), 'FridayWorkspace')
  );
  fs.mkdirSync(workspacePath, { recursive: true });

  const env = { ...process.env, FRIDAY_WORKSPACE: workspacePath };

  if (verbose) {
    console.log(`Starting Friday with workspace: ${workspacePath}`);
  }

  const backend = spawn('node', [serverScript], {
    cwd: runtimeDir,
    env,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  backend.on('exit', (code, signal) => {
    if (verbose) {
      console.log(`Backend exited (code=${code ?? 'null'} signal=${signal ?? 'none'})`);
    }
    process.exit(code ?? 0);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${BOLD}> ${RESET}`,
  });

  let sessionId = null;
  let pendingPermission = null;
  let pendingRulePrompt = null;
  const rulePromptQueue = [];
  let isStreaming = false;

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

  // ── Backend message handler ──────────────────────────────────────────

  function handleBackendLine(line) {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);

      // In verbose mode, show everything raw (original behavior)
      if (verbose) {
        handleBackendLineVerbose(msg);
        return;
      }

      switch (msg.type) {
        case 'ready':
          console.log(`\n${BOLD}Friday${RESET} v0.2.0\n`);
          rl.prompt();
          break;

        case 'session':
          sessionId = msg.session_id;
          // Session ID is internal — don't show unless verbose
          break;

        case 'thinking':
          // Show thinking state via spinner — don't dump raw thinking text
          if (!spinner.active) {
            spinner.start('Thinking');
          }
          break;

        case 'info':
          // Info messages are internal plumbing — suppress in clean mode
          break;

        case 'chunk':
          // First chunk: stop spinner, start streaming
          if (spinner.active) {
            spinner.stop();
          }
          if (!isStreaming) {
            isStreaming = true;
          }
          process.stdout.write(msg.content || '');
          break;

        case 'tool_use': {
          // Show a brief one-line description of what the tool is doing
          if (spinner.active) {
            spinner.stop();
          }
          if (isStreaming) {
            // End the streamed text block before showing tool action
            process.stdout.write('\n');
            isStreaming = false;
          }
          const desc = humanizeToolUse(msg.tool_name, msg.tool_input);
          spinner.start(desc);
          break;
        }

        case 'tool_result':
          // Tool results are for the agent, not the user — suppress
          break;

        case 'permission_request':
          pendingPermission = msg;
          if (spinner.active) {
            spinner.stop();
          }
          if (isStreaming) {
            process.stdout.write('\n');
            isStreaming = false;
          }
          // Clean, compact permission prompt
          console.log('');
          console.log(`${YELLOW}${BOLD}Permission needed:${RESET} ${msg.description || msg.tool_name}`);
          if (msg.tool_input) {
            // Show a brief summary of key input params
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
          console.log(`${DIM}:allow to approve, :deny to reject${RESET}`);
          console.log('');
          rl.prompt();
          break;

        case 'permission_cancelled':
          if (pendingPermission && pendingPermission.permission_id === msg.permission_id) {
            pendingPermission = null;
          }
          // Silent unless verbose
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
          rl.prompt();
          break;

        case 'complete':
          if (spinner.active) {
            spinner.stop();
          }
          if (isStreaming) {
            isStreaming = false;
          }
          console.log(''); // newline after streamed chunks
          rl.prompt();
          break;

        default:
          // Unknown message types — silently ignore in clean mode
          break;
      }
    } catch {
      // Non-JSON output from backend
      if (verbose) {
        process.stdout.write(line);
      }
    }
  }

  // ── Verbose handler (original behavior) ──────────────────────────────

  function handleBackendLineVerbose(msg) {
    switch (msg.type) {
      case 'ready':
        console.log('Friday is ready. Type your prompt to begin.');
        rl.prompt();
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
        process.stdout.write(msg.content || '');
        break;
      case 'permission_request':
        pendingPermission = msg;
        console.log('\n=== Permission Request ==========================');
        console.log(`Tool : ${msg.tool_name}`);
        console.log(`Desc : ${msg.description}`);
        if (msg.tool_input) {
          const keys = Object.keys(msg.tool_input);
          console.log('Input:');
          keys.slice(0, 5).forEach((key) => {
            console.log(`  ${key}: ${JSON.stringify(msg.tool_input[key])}`);
          });
          if (keys.length > 5) console.log(`  ...and ${keys.length - 5} more`);
        }
        console.log('Type :allow or :deny to respond.');
        console.log('===============================================\n');
        rl.prompt();
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
        rl.prompt();
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

  // ── Buffer partial lines from stdout ─────────────────────────────────

  let buffer = '';
  backend.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || ''; // keep incomplete last line in buffer
    lines.forEach(handleBackendLine);
  });

  // ── Welcome ──────────────────────────────────────────────────────────

  // Don't print help on startup; keep it clean. User can type :help.

  // ── Input handler ────────────────────────────────────────────────────

  rl.on('line', (input) => {
    const line = input.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    if (line.startsWith(':')) {
      const [command, ...rest] = line.slice(1).split(' ');
      const argString = rest.join(' ').trim();
      switch (command) {
        case 'q':
        case 'quit':
          spinner.stop();
          backend.kill();
          rl.close();
          return;
        case 'new':
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
          printHelp();
          break;
        default:
          console.log(`${DIM}Unknown command :${command}. Type :help for commands.${RESET}`);
      }
      rl.prompt();
      return;
    }

    // Send user query
    spinner.start('Thinking');
    writeMessage({ type: 'query', message: line, session_id: sessionId });
  });

  rl.on('close', () => {
    spinner.stop();
    backend.kill('SIGINT');
    process.exit(0);
  });
}
