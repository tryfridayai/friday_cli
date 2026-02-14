/**
 * friday chat — Interactive conversation with the agent runtime
 *
 * Spawns the runtime's stdio transport (friday-server.js) as a child process
 * and provides a readline-based REPL for sending messages and handling
 * permission requests.
 *
 * This mirrors backend_new/dev-runner.js but works as a proper CLI command.
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
// In workspace mode, friday-runtime is linked via node_modules
const require = createRequire(import.meta.url);
let runtimeDir;
try {
  const runtimePkg = require.resolve('friday-runtime/package.json');
  runtimeDir = path.dirname(runtimePkg);
} catch {
  // Fallback: relative path within the monorepo
  runtimeDir = path.resolve(__dirname, '..', '..', '..', 'runtime');
}
const serverScript = path.join(runtimeDir, 'friday-server.js');

function printHelp() {
  console.log(`
Friday interactive chat

Commands:
  :q, :quit           Exit
  :new                Start fresh session
  :allow [json]       Approve pending permission (optional JSON overrides tool_input)
  :deny [message]     Deny pending permission with optional reason
  :rule <id|#>        Pick action from current rule prompt
  :raw <json>         Send raw JSON to backend
  :help               Show this help
`);
}

export default async function chat(args) {
  const workspacePath = path.resolve(
    args.workspace || process.env.FRIDAY_WORKSPACE || path.join(os.homedir(), 'FridayWorkspace')
  );
  fs.mkdirSync(workspacePath, { recursive: true });

  const env = { ...process.env, FRIDAY_WORKSPACE: workspacePath };
  console.log(`Starting Friday with workspace: ${workspacePath}`);

  const backend = spawn('node', [serverScript], {
    cwd: runtimeDir,
    env,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  backend.on('exit', (code, signal) => {
    console.log(`Backend exited (code=${code ?? 'null'} signal=${signal ?? 'none'})`);
    process.exit(code ?? 0);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'you> ',
  });

  let sessionId = null;
  let pendingPermission = null;
  let pendingRulePrompt = null;
  const rulePromptQueue = [];

  function writeMessage(payload) {
    backend.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  function sendPermissionResponse(approved, { updatedInput, message } = {}) {
    if (!pendingPermission) {
      console.log('No permission request to respond to.');
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
  }

  function showRulePrompt() {
    if (pendingRulePrompt || rulePromptQueue.length === 0) return;
    pendingRulePrompt = rulePromptQueue.shift();
    const prompt = pendingRulePrompt;
    console.log('\n=== Rule Prompt =================================');
    console.log(`Title : ${prompt.title}`);
    console.log(`Message: ${prompt.message}`);
    prompt.actions.forEach((action, index) => {
      console.log(`  [${index + 1}] ${action.label} (id=${action.id})`);
    });
    console.log('Type :rule <number|actionId> to choose.');
    console.log('===============================================\n');
  }

  function handleRuleAction(actionIdOrIndex) {
    if (!pendingRulePrompt) {
      console.log('No rule prompt to respond to.');
      return;
    }
    let resolvedActionId = actionIdOrIndex;
    const prompt = pendingRulePrompt;
    if (/^\d+$/.test(actionIdOrIndex)) {
      const idx = Number(actionIdOrIndex) - 1;
      const action = prompt.actions[idx];
      if (!action) {
        console.log(`No action at index ${actionIdOrIndex}`);
        return;
      }
      resolvedActionId = action.id;
    }
    if (!prompt.actions.some((a) => a.id === resolvedActionId)) {
      console.log(`Unknown action id ${resolvedActionId}`);
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

  function handleBackendLine(line) {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
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
          console.log('');  // newline after streamed chunks
          rl.prompt();
          break;
        default:
          // Show raw for tool_use, tool_result, etc.
          if (msg.type === 'tool_use') {
            console.log(`\n[tool] ${msg.tool_name}: ${JSON.stringify(msg.tool_input || {}).slice(0, 200)}`);
          } else if (msg.type === 'tool_result') {
            const preview = typeof msg.content === 'string' ? msg.content.slice(0, 200) : JSON.stringify(msg.content).slice(0, 200);
            console.log(`[result] ${preview}`);
          }
      }
    } catch {
      // Non-JSON output (e.g. stderr leak)
      process.stdout.write(line);
    }
  }

  // Buffer partial lines from stdout
  let buffer = '';
  backend.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';  // keep incomplete last line in buffer
    lines.forEach(handleBackendLine);
  });

  printHelp();

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
          backend.kill();
          rl.close();
          return;
        case 'new':
          sessionId = null;
          writeMessage({ type: 'new_session' });
          console.log('Started new session.');
          break;
        case 'allow': {
          let updatedInput;
          if (argString) {
            try {
              updatedInput = JSON.parse(argString);
            } catch {
              console.log('Failed to parse JSON for updated input.');
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
            console.log('Usage: :rule <actionId|number>');
            break;
          }
          handleRuleAction(argString);
          break;
        case 'raw':
          if (!argString) {
            console.log('Usage: :raw {"type":"info"...}');
            break;
          }
          try {
            writeMessage(JSON.parse(argString));
          } catch {
            console.log('raw payload must be valid JSON');
          }
          break;
        case 'help':
          printHelp();
          break;
        default:
          console.log(`Unknown command :${command}. Type :help for commands.`);
      }
      rl.prompt();
      return;
    }

    writeMessage({ type: 'query', message: line, session_id: sessionId });
  });

  rl.on('close', () => {
    backend.kill('SIGINT');
    process.exit(0);
  });
}
