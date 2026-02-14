#!/usr/bin/env node

/**
 * Terminal MCP Server
 * Provides tools for terminal command execution and management
 *
 * This server ACTUALLY EXECUTES commands using child_process
 * and tracks processes via ProcessRegistry for sandboxing
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Process tracking (simplified inline registry for MCP server isolation)
const trackedProcesses = new Map();
let commandIdCounter = 0;

// Configuration from environment
const workspacePath = process.env.FRIDAY_WORKSPACE || process.cwd();
const commandTimeout = parseInt(process.env.FRIDAY_COMMAND_TIMEOUT || '300000', 10); // 5 minutes default
const maxOutputSize = parseInt(process.env.FRIDAY_MAX_OUTPUT_SIZE || '1048576', 10); // 1MB default

// Protected PIDs - processes that should never be killed
const protectedPids = new Set();
protectedPids.add(process.pid); // This MCP server
if (process.ppid) {
  protectedPids.add(process.ppid); // Parent (Claude backend)
}

// =============================================================================
// DANGEROUS COMMAND FILTERING (Sandboxing)
// =============================================================================
//
// WHY THIS EXISTS:
// The agent can execute arbitrary shell commands via execute_command. Without
// filtering, it could run destructive commands like:
//   - `kill/pkill/killall` to terminate system processes (including this app)
//   - `rm -rf /` to delete the entire filesystem
//   - `sudo` to gain elevated privileges
//   - Commands that modify system configuration
//
// This filter blocks commands that could:
//   1. Kill processes outside the agent's control (use kill_process tool instead)
//   2. Delete files outside the workspace
//   3. Gain elevated privileges
//   4. Modify system configuration
//   5. Access sensitive system files
//
// The agent should use the dedicated `kill_process` tool to terminate processes
// it started, which has proper sandboxing (only kills processes in the registry).
// =============================================================================

const DANGEROUS_PATTERNS = [
  // Process killing - agent should use kill_process tool instead
  // These bypass the process registry and could kill system processes
  { pattern: /\bkill\s+-9?\s*\d+/i, reason: 'Use the kill_process tool to terminate processes started by the agent' },
  { pattern: /\bkill\s+-9?\s+-/i, reason: 'Killing processes by signal is not allowed' },
  { pattern: /\bpkill\b/i, reason: 'pkill can terminate critical system processes. Use kill_process tool for agent-started processes' },
  { pattern: /\bkillall\b/i, reason: 'killall can terminate critical system processes. Use kill_process tool for agent-started processes' },
  { pattern: /\bxkill\b/i, reason: 'xkill is not allowed' },

  // Destructive file operations outside workspace
  // These patterns catch attempts to delete root, home, or system directories
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*\s+)*[\/~](?!\S*\/Users\/.*\/)/i, reason: 'Recursive deletion outside workspace is not allowed' },
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*\/(?:etc|usr|bin|sbin|var|lib|boot|root|sys|proc|dev)\b/i, reason: 'Deleting system directories is not allowed' },
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*~\//i, reason: 'Deleting home directory contents requires explicit paths within workspace' },

  // Privilege escalation
  // These could give the agent root access or bypass security
  { pattern: /\bsudo\b/i, reason: 'Elevated privileges are not allowed for security reasons' },
  { pattern: /\bsu\s+-?\s*\w*/i, reason: 'Switching users is not allowed' },
  { pattern: /\bdoas\b/i, reason: 'Elevated privileges are not allowed' },

  // System modification
  // These modify system-wide configuration that could break the host
  { pattern: /\bsystemctl\s+(start|stop|restart|enable|disable|mask)/i, reason: 'Modifying system services is not allowed' },
  { pattern: /\blaunchctl\s+(load|unload|start|stop|kill)/i, reason: 'Modifying macOS services is not allowed' },
  { pattern: /\bchmod\s+[0-7]*\s+\/(?!Users)/i, reason: 'Changing permissions on system files is not allowed' },
  { pattern: /\bchown\b.*\/(?!Users)/i, reason: 'Changing ownership of system files is not allowed' },

  // Disk/filesystem operations
  { pattern: /\bmkfs\b/i, reason: 'Creating filesystems is not allowed' },
  { pattern: /\bfdisk\b/i, reason: 'Disk partitioning is not allowed' },
  { pattern: /\bdd\s+.*of=\/dev/i, reason: 'Writing directly to devices is not allowed' },
  { pattern: /\bmount\b/i, reason: 'Mounting filesystems is not allowed' },
  { pattern: /\bumount\b/i, reason: 'Unmounting filesystems is not allowed' },

  // Network security
  { pattern: /\biptables\b/i, reason: 'Modifying firewall rules is not allowed' },
  { pattern: /\bpfctl\b/i, reason: 'Modifying packet filter is not allowed' },

  // Dangerous redirects that could overwrite system files
  { pattern: />\s*\/etc\//i, reason: 'Writing to /etc is not allowed' },
  { pattern: />\s*\/usr\//i, reason: 'Writing to /usr is not allowed' },
  { pattern: />\s*\/bin\//i, reason: 'Writing to /bin is not allowed' },
  { pattern: />\s*\/sbin\//i, reason: 'Writing to /sbin is not allowed' },

  // Fork bombs and resource exhaustion
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/i, reason: 'Fork bombs are not allowed' },
  { pattern: /\bwhile\s+true\s*;\s*do\s+[^;]*;\s*done\s*&/i, reason: 'Infinite background loops are not allowed' },
];

/**
 * Check if a command is dangerous and should be blocked
 *
 * @param {string} command - The shell command to check
 * @returns {{ blocked: boolean, reason?: string }} - Result with optional reason
 */
function checkDangerousCommand(command) {
  // Normalize the command (handle multi-line, extra spaces)
  const normalizedCommand = command.replace(/\s+/g, ' ').trim();

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      return { blocked: true, reason };
    }
  }

  return { blocked: false };
}

// Create server instance
const server = new Server(
  {
    name: 'terminal-server',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Validate and resolve working directory
 * Ensures it's within the workspace
 */
function resolveWorkingDirectory(requestedDir) {
  if (!requestedDir) {
    return workspacePath;
  }

  const resolved = path.isAbsolute(requestedDir)
    ? requestedDir
    : path.resolve(workspacePath, requestedDir);

  const normalizedTarget = path.normalize(resolved);
  const normalizedWorkspace = path.normalize(workspacePath);

  // Check if within workspace
  if (normalizedTarget === normalizedWorkspace ||
      normalizedTarget.startsWith(normalizedWorkspace + path.sep)) {
    return normalizedTarget;
  }

  // Outside workspace - fallback to workspace root
  console.error(`[terminal-server] Requested directory outside workspace: ${requestedDir}`);
  return workspacePath;
}

/**
 * Tool: activate_terminal
 * Activates the terminal view in the Friday AI interface
 */
function activateTerminal() {
  // Send message to frontend to activate terminal UI
  const message = {
    type: 'activate_tool',
    tool: 'terminal',
    params: {}
  };

  console.log(JSON.stringify(message));

  return {
    content: [
      {
        type: 'text',
        text: 'Terminal view activated in Friday AI interface'
      }
    ]
  };
}

/**
 * Tool: execute_command
 * ACTUALLY executes a command and returns real output
 *
 * Security: Commands are filtered against DANGEROUS_PATTERNS before execution.
 * This prevents the agent from running destructive commands that could harm
 * the system or kill processes outside its control.
 */
async function executeCommand(command, workingDirectory = null) {
  // ==========================================================================
  // SECURITY CHECK: Block dangerous commands before execution
  // ==========================================================================
  const dangerCheck = checkDangerousCommand(command);
  if (dangerCheck.blocked) {
    console.error(`[terminal-server] BLOCKED dangerous command: ${command}`);
    console.error(`[terminal-server] Reason: ${dangerCheck.reason}`);

    // Return error to the agent explaining why the command was blocked
    return {
      content: [
        {
          type: 'text',
          text: `Command blocked for security reasons: ${dangerCheck.reason}\n\nThe command "${command}" was not executed.`
        }
      ],
      isError: true
    };
  }

  const commandId = `cmd_${commandIdCounter++}`;
  const cwd = resolveWorkingDirectory(workingDirectory);

  // Detect if the agent is trying to run a background server (ends with &)
  // and automatically redirect output to prevent SIGPIPE crashes.
  let finalCommand = command;
  // let isBackground = command.trim().endsWith('&');
  
  // if (isBackground) {
    // Check if the user already added redirection
    if (!command.includes('>')) {
      console.log(`[terminal-server] Auto-fixing background command to prevent SIGPIPE: ${command}`);
      // Remove the trailing &
      const cmdBase = command.substring(0, command.lastIndexOf('&')).trim();
      // Redirect output to a log file in the workspace so we don't crash
      // using 'nohup' prevents HUP signals, and redirection prevents PIPE signals
      finalCommand = `nohup ${cmdBase} > .friday_server_output.log 2>&1 & echo $!`;
    }
  // }

  // Notify frontend that command is starting
  const startMessage = {
    type: 'tool_command',
    tool: 'terminal',
    command: 'execute',
    commandId: commandId,
    status: 'starting',
    params: {
      command: command,
      workingDirectory: cwd
    }
  };
  console.log(JSON.stringify(startMessage));

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Spawn the process with shell
    const child = spawn(command, [], {
      cwd: cwd,
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: '0', // Disable color codes for cleaner output
        NO_COLOR: '1',
      },
    });

    // Track the process
    const processRecord = {
      pid: child.pid,
      command,
      cwd,
      commandId,
      startedAt: new Date(),
      status: 'running',
    };
    trackedProcesses.set(child.pid, processRecord);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (processRecord.status === 'running') {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, commandTimeout);

    // Capture stdout
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;

      // Truncate if too large
      if (stdout.length > maxOutputSize) {
        stdout = stdout.slice(-maxOutputSize);
      }

      // Stream output to frontend
      const outputMessage = {
        type: 'tool_command',
        tool: 'terminal',
        command: 'output',
        commandId: commandId,
        stream: 'stdout',
        data: chunk
      };
      console.log(JSON.stringify(outputMessage));
    });

    // Capture stderr
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;

      // Truncate if too large
      if (stderr.length > maxOutputSize) {
        stderr = stderr.slice(-maxOutputSize);
      }

      // Stream output to frontend
      const outputMessage = {
        type: 'tool_command',
        tool: 'terminal',
        command: 'output',
        commandId: commandId,
        stream: 'stderr',
        data: chunk
      };
      console.log(JSON.stringify(outputMessage));
    });

    // Handle process exit
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeoutId);

      processRecord.status = exitCode === 0 ? 'completed' : 'failed';
      processRecord.exitCode = exitCode;
      processRecord.signal = signal;
      processRecord.endedAt = new Date();

      // Notify frontend of completion
      const completeMessage = {
        type: 'tool_command',
        tool: 'terminal',
        command: 'complete',
        commandId: commandId,
        exitCode: exitCode,
        signal: signal,
        timedOut: timedOut
      };
      console.log(JSON.stringify(completeMessage));

      // Build response
      let responseText = '';

      if (timedOut) {
        responseText = `Command timed out after ${commandTimeout / 1000} seconds.\n\n`;
      }

      if (stdout.trim()) {
        responseText += `Output:\n${stdout.trim()}\n`;
      }

      if (stderr.trim()) {
        responseText += `\nStderr:\n${stderr.trim()}\n`;
      }

      if (!stdout.trim() && !stderr.trim()) {
        responseText = exitCode === 0
          ? 'Command completed successfully with no output.'
          : `Command failed with exit code ${exitCode}.`;
      } else if (exitCode !== 0 && !timedOut) {
        responseText += `\nExit code: ${exitCode}`;
      }

      resolve({
        content: [
          {
            type: 'text',
            text: responseText.trim()
          }
        ]
      });
    });

    // Handle spawn errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);

      processRecord.status = 'failed';
      processRecord.error = error.message;
      processRecord.endedAt = new Date();

      resolve({
        content: [
          {
            type: 'text',
            text: `Failed to execute command: ${error.message}`
          }
        ],
        isError: true
      });
    });
  });
}

/**
 * Tool: kill_process
 * Kill a process by PID (only if it was started by this server)
 */
function killProcess(pid) {
  const numericPid = parseInt(pid, 10);

  // Check if protected
  if (protectedPids.has(numericPid)) {
    return {
      content: [{ type: 'text', text: `Cannot kill protected process (PID: ${numericPid})` }],
      isError: true
    };
  }

  // Check if tracked
  if (!trackedProcesses.has(numericPid)) {
    return {
      content: [{ type: 'text', text: `Process ${numericPid} was not started by the agent and cannot be killed` }],
      isError: true
    };
  }

  const record = trackedProcesses.get(numericPid);

  try {
    process.kill(numericPid, 'SIGTERM');
    record.status = 'killed';
    record.endedAt = new Date();

    // Notify frontend
    const message = {
      type: 'tool_command',
      tool: 'terminal',
      command: 'kill',
      pid: numericPid,
      status: 'killed'
    };
    console.log(JSON.stringify(message));

    return {
      content: [{ type: 'text', text: `Process ${numericPid} (${record.command}) has been terminated` }]
    };
  } catch (error) {
    if (error.code === 'ESRCH') {
      record.status = 'completed';
      return {
        content: [{ type: 'text', text: `Process ${numericPid} has already terminated` }]
      };
    }
    return {
      content: [{ type: 'text', text: `Failed to kill process: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Tool: list_processes
 * List all processes started by this session
 */
function listProcesses() {
  const processes = Array.from(trackedProcesses.values());

  if (processes.length === 0) {
    return {
      content: [{ type: 'text', text: 'No processes have been started in this session.' }]
    };
  }

  const running = processes.filter(p => p.status === 'running');
  const completed = processes.filter(p => p.status !== 'running');

  let text = '';

  if (running.length > 0) {
    text += 'Running processes:\n';
    running.forEach(p => {
      text += `  PID ${p.pid}: ${p.command} (started ${p.startedAt.toISOString()})\n`;
    });
  }

  if (completed.length > 0) {
    text += '\nCompleted processes:\n';
    completed.slice(-5).forEach(p => { // Show last 5
      text += `  PID ${p.pid}: ${p.command} [${p.status}]\n`;
    });
  }

  return {
    content: [{ type: 'text', text: text.trim() }]
  };
}

/**
 * Tool: get_terminal_output
 * Get recent output from a command
 */
function getTerminalOutput(commandId) {
  // Find the process by commandId
  for (const [pid, record] of trackedProcesses) {
    if (record.commandId === commandId) {
      let text = `Command: ${record.command}\n`;
      text += `Status: ${record.status}\n`;
      text += `PID: ${pid}\n`;
      if (record.exitCode !== undefined) {
        text += `Exit code: ${record.exitCode}\n`;
      }
      return {
        content: [{ type: 'text', text }]
      };
    }
  }

  return {
    content: [{ type: 'text', text: 'Command not found. Use list_processes to see available processes.' }]
  };
}

/**
 * Tool: clear_terminal
 * Clears the terminal output (frontend only)
 */
function clearTerminal() {
  const message = {
    type: 'tool_command',
    tool: 'terminal',
    command: 'clear',
    params: {}
  };

  console.log(JSON.stringify(message));

  return {
    content: [
      {
        type: 'text',
        text: 'Terminal cleared'
      }
    ]
  };
}


/**
 * Tool: start_preview
 * Starts the dev server for the current workspace using ProcessManager
 * This is the preferred way to start a preview - don't use bash for this
 */
async function startPreview() {
  console.error("[terminal-server] Starting preview via ProcessManager");

  const channelPath = process.env.FRIDAY_PREVIEW_CHANNEL;
  if (!channelPath) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Preview channel not configured. Cannot start preview.' }]
    };
  }

  try {
    const dir = path.dirname(channelPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const entry = {
      type: 'start_preview',
      timestamp: new Date().toISOString()
    };
    fs.appendFileSync(channelPath, `${JSON.stringify(entry)}\n`, 'utf8');

    return {
      content: [{
        type: 'text',
        text: `Preview server starting... The system will automatically detect project type, find an available port, and start the dev server. The preview URL will appear in the preview pane shortly. Use get_preview_status to check the status.`
      }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to start preview: ${error.message}` }]
    };
  }
}

/**
 * Tool: stop_preview
 * Stops the dev server for the current workspace
 */
async function stopPreview() {
  console.error("[terminal-server] Stopping preview");

  const channelPath = process.env.FRIDAY_PREVIEW_CHANNEL;
  if (!channelPath) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Preview channel not configured.' }]
    };
  }

  try {
    const entry = {
      type: 'stop_preview',
      timestamp: new Date().toISOString()
    };
    fs.appendFileSync(channelPath, `${JSON.stringify(entry)}\n`, 'utf8');

    return {
      content: [{ type: 'text', text: 'Preview server stopping...' }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to stop preview: ${error.message}` }]
    };
  }
}

/**
 * Tool: restart_preview
 * Restarts the dev server (stops and starts again on same port)
 */
async function restartPreview() {
  console.error("[terminal-server] Restarting preview");

  const channelPath = process.env.FRIDAY_PREVIEW_CHANNEL;
  if (!channelPath) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Preview channel not configured.' }]
    };
  }

  try {
    const entry = {
      type: 'restart_preview',
      timestamp: new Date().toISOString()
    };
    fs.appendFileSync(channelPath, `${JSON.stringify(entry)}\n`, 'utf8');

    return {
      content: [{ type: 'text', text: 'Preview server restarting on the same port...' }]
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Failed to restart preview: ${error.message}` }]
    };
  }
}

/**
 * Tool: set_preview_url
 * Updates the Friday AI preview pane to show a specific URL
 */
async function setPreviewUrl(url) {
  console.error("[terminal-server] Setting preview URL:", url);

  // Validate URL
  const trimmed = url.trim();
  const hasProtocol = /^[a-zA-Z][\w+.-]*:\/\//.test(trimmed);
  const finalUrl = hasProtocol ? trimmed : `http://${trimmed}`;

  const channelPath = process.env.FRIDAY_PREVIEW_CHANNEL;
  if (channelPath) {
    try {
      const dir = path.dirname(channelPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const entry = {
        type: 'preview_url',
        url: finalUrl,
        timestamp: new Date().toISOString()
      };
      fs.appendFileSync(channelPath, `${JSON.stringify(entry)}\n`, 'utf8');

      return {
        content: [{ type: 'text', text: `Preview URL updated via file channel: ${finalUrl}` }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to write to preview channel: ${error.message}` }]
      };
    }
  }

  // Fallback to "Network Mode" (Web/Bridge)
  const endpoint = process.env.FRIDAY_PREVIEW_BRIDGE_ENDPOINT || 'http://127.0.0.1:5175/api/preview/url';

  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(endpoint); } catch (e) {
      resolve({ isError: true, content: [{ type: 'text', text: 'Invalid bridge endpoint URL' }] });
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const data = JSON.stringify({ url: finalUrl });

    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve({ content: [{ type: 'text', text: `Preview URL posted to bridge: ${finalUrl}` }] });
      } else {
        resolve({ isError: true, content: [{ type: 'text', text: `Bridge responded with ${res.statusCode}` }] });
      }
    });

    req.on('error', (err) => {
      resolve({ isError: true, content: [{ type: 'text', text: `Network error: ${err.message}` }] });
    });
    req.write(data);
    req.end();
  });
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'activate_terminal',
        description: 'Activates the terminal view in Friday AI. Use this before executing commands to show the terminal to the user.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'execute_command',
        description: 'Executes a shell command in the terminal and returns the actual output. Commands run within the workspace directory.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute (e.g., "ls -la", "npm install", "python script.py")'
            },
            workingDirectory: {
              type: 'string',
              description: 'Optional working directory for the command (must be within workspace). If not specified, uses workspace root.'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'kill_process',
        description: 'Kills a running process by PID. Can only kill processes that were started by the agent in this session.',
        inputSchema: {
          type: 'object',
          properties: {
            pid: {
              type: 'number',
              description: 'The process ID to kill'
            }
          },
          required: ['pid']
        }
      },
      {
        name: 'list_processes',
        description: 'Lists all processes started by the agent in this session, showing their status (running/completed/failed).',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_terminal_output',
        description: 'Gets information about a specific command by its command ID.',
        inputSchema: {
          type: 'object',
          properties: {
            commandId: {
              type: 'string',
              description: 'The command ID returned when the command was executed'
            }
          },
          required: ['commandId']
        }
      },
      {
        name: 'clear_terminal',
        description: 'Clears all output from the terminal view.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'start_preview',
        description: 'Starts the dev server for the current workspace. This is the PREFERRED way to start a preview. The system automatically detects project type (Next.js, Vite, etc.), finds an available port, and starts the appropriate dev command. Do NOT use bash to start dev servers - use this tool instead.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'stop_preview',
        description: 'Stops the currently running dev server for this workspace.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'restart_preview',
        description: 'Restarts the dev server (stops and starts again on the same port). Use this after making changes that require a server restart.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'set_preview_url',
        description: 'Updates the Friday AI preview pane to show a specific URL. Only use this if you need to show a specific URL that is different from the dev server URL.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The full URL to preview (e.g., http://localhost:3000)'
            }
          },
          required: ['url']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'activate_terminal':
        return activateTerminal();

      case 'execute_command':
        if (!args.command) {
          throw new Error('Command is required');
        }
        return await executeCommand(args.command, args.workingDirectory);

      case 'kill_process':
        if (!args.pid) {
          throw new Error('PID is required');
        }
        return killProcess(args.pid);

      case 'list_processes':
        return listProcesses();

      case 'get_terminal_output':
        return getTerminalOutput(args.commandId);

      case 'clear_terminal':
        return clearTerminal();

      case 'start_preview':
        return await startPreview();

      case 'stop_preview':
        return await stopPreview();

      case 'restart_preview':
        return await restartPreview();

      case 'set_preview_url':
        if (!args.url) throw new Error('URL is required');
        return await setPreviewUrl(args.url);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Cleanup on exit
process.on('SIGTERM', () => {
  console.error('[terminal-server] Received SIGTERM, cleaning up...');
  for (const [pid, record] of trackedProcesses) {
    if (record.status === 'running') {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (e) {
        // Ignore errors on cleanup
      }
    }
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[terminal-server] Received SIGINT, cleaning up...');
  for (const [pid, record] of trackedProcesses) {
    if (record.status === 'running') {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (e) {
        // Ignore errors on cleanup
      }
    }
  }
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is used for MCP protocol)
  console.error('[terminal-server] Terminal MCP Server v2.0.0 started');
  console.error(`[terminal-server] Workspace: ${workspacePath}`);
  console.error(`[terminal-server] Command timeout: ${commandTimeout}ms`);
}

main().catch((error) => {
  console.error('[terminal-server] Server error:', error);
  process.exit(1);
});
