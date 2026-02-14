/**
 * ProcessRegistry - Tracks and manages processes spawned by the agent
 *
 * Key responsibilities:
 * - Track all processes started by the agent
 * - Only allow killing processes that were started by the agent
 * - Prevent killing protected system processes (Electron, Bridge)
 * - Clean up all tracked processes on session end
 */

import { spawn, exec } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';

class ProcessRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.processes = new Map(); // pid -> ProcessRecord
    this.workspacePath = options.workspacePath || process.env.FRIDAY_WORKSPACE;
    this.sessionId = options.sessionId || null;

    // Protected PIDs that should never be killed
    // These will be populated with Electron main process, bridge server, etc.
    this.protectedPids = new Set(options.protectedPids || []);

    // Add current process and parent as protected
    this.protectedPids.add(process.pid);
    if (process.ppid) {
      this.protectedPids.add(process.ppid);
    }

    // Configuration
    this.maxConcurrentProcesses = options.maxConcurrentProcesses || 10;
    this.defaultTimeout = options.defaultTimeout || 300000; // 5 minutes

    // Reserved ports that the agent should not bind to
    this.reservedPorts = new Set(options.reservedPorts || [5173, 5175]);
  }

  /**
   * Spawn a new process and track it
   * @param {string} command - The command to run
   * @param {string[]} args - Command arguments
   * @param {object} options - Spawn options
   * @returns {object} - { process, record }
   */
  spawnProcess(command, args = [], options = {}) {
    // Check concurrent process limit
    const runningCount = this.getRunningProcesses().length;
    if (runningCount >= this.maxConcurrentProcesses) {
      throw new Error(`Maximum concurrent processes (${this.maxConcurrentProcesses}) reached`);
    }

    // Ensure working directory is within workspace
    let cwd = options.cwd || this.workspacePath;
    if (this.workspacePath && !this.isWithinWorkspace(cwd)) {
      cwd = this.workspacePath;
    }

    const spawnOptions = {
      ...options,
      cwd,
      env: { ...process.env, ...options.env },
      shell: options.shell !== false, // Default to shell mode
    };

    const child = spawn(command, args, spawnOptions);

    const record = {
      pid: child.pid,
      command,
      args,
      cwd,
      startedAt: new Date(),
      workspacePath: this.workspacePath,
      sessionId: this.sessionId,
      type: options.type || 'command', // 'command' | 'server' | 'background'
      status: 'running',
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
    };

    this.processes.set(child.pid, record);
    this.emit('process:started', record);

    // Track process completion
    child.on('exit', (code, signal) => {
      record.status = code === 0 ? 'completed' : 'failed';
      record.exitCode = code;
      record.signal = signal;
      record.endedAt = new Date();
      this.emit('process:exit', record);
    });

    child.on('error', (error) => {
      record.status = 'failed';
      record.error = error.message;
      this.emit('process:error', { record, error });
    });

    return { process: child, record };
  }

  /**
   * Execute a command and wait for completion
   * @param {string} command - Full command string
   * @param {object} options - Execution options
   * @returns {Promise<{ stdout, stderr, exitCode }>}
   */
  async executeCommand(command, options = {}) {
    const timeout = options.timeout || this.defaultTimeout;

    // Ensure working directory is within workspace
    let cwd = options.cwd || this.workspacePath;
    if (this.workspacePath && !this.isWithinWorkspace(cwd)) {
      cwd = this.workspacePath;
    }

    return new Promise((resolve, reject) => {
      const execOptions = {
        cwd,
        env: { ...process.env, ...options.env },
        timeout,
        maxBuffer: options.maxBuffer || 10 * 1024 * 1024, // 10MB
        shell: options.shell !== false,
      };

      const child = exec(command, execOptions, (error, stdout, stderr) => {
        const record = this.processes.get(child.pid);
        if (record) {
          record.stdout = stdout;
          record.stderr = stderr;
          record.status = error ? 'failed' : 'completed';
          record.exitCode = error?.code || 0;
          record.endedAt = new Date();
        }

        if (error && error.killed) {
          reject(new Error(`Command timed out after ${timeout}ms`));
        } else {
          resolve({
            stdout,
            stderr,
            exitCode: error?.code || 0,
            pid: child.pid,
          });
        }
      });

      // Track the process
      const record = {
        pid: child.pid,
        command,
        args: [],
        cwd,
        startedAt: new Date(),
        workspacePath: this.workspacePath,
        sessionId: this.sessionId,
        type: 'command',
        status: 'running',
        exitCode: null,
        stdout: '',
        stderr: '',
      };

      this.processes.set(child.pid, record);
      this.emit('process:started', record);
    });
  }

  /**
   * Kill a process by PID
   * @param {number} pid - Process ID to kill
   * @param {string} signal - Signal to send (default: SIGTERM)
   * @returns {boolean} - True if killed, false if not allowed
   */
  kill(pid, signal = 'SIGTERM') {
    // Check if PID is protected
    if (this.protectedPids.has(pid)) {
      this.emit('kill:blocked', { pid, reason: 'protected' });
      return { success: false, reason: 'Cannot kill protected process' };
    }

    // Check if PID is owned by this registry
    if (!this.processes.has(pid)) {
      this.emit('kill:blocked', { pid, reason: 'not_owned' });
      return { success: false, reason: 'Process not started by agent' };
    }

    const record = this.processes.get(pid);

    try {
      process.kill(pid, signal);
      record.status = 'killed';
      record.signal = signal;
      record.endedAt = new Date();
      this.emit('process:killed', record);
      return { success: true, pid };
    } catch (error) {
      if (error.code === 'ESRCH') {
        // Process already dead
        record.status = 'completed';
        record.endedAt = new Date();
        return { success: true, pid, note: 'Process already terminated' };
      }
      return { success: false, reason: error.message };
    }
  }

  /**
   * Kill all tracked processes
   */
  killAll() {
    const results = [];
    for (const [pid, record] of this.processes) {
      if (record.status === 'running') {
        const result = this.kill(pid);
        results.push({ pid, ...result });
      }
    }
    return results;
  }

  /**
   * Check if a PID is owned by this registry
   */
  isOwned(pid) {
    return this.processes.has(pid);
  }

  /**
   * Check if a PID is protected
   */
  isProtected(pid) {
    return this.protectedPids.has(pid);
  }

  /**
   * Add a PID to the protected list
   */
  addProtectedPid(pid) {
    this.protectedPids.add(pid);
  }

  /**
   * Get all tracked processes
   */
  getProcesses() {
    return Array.from(this.processes.values());
  }

  /**
   * Get running processes
   */
  getRunningProcesses() {
    return this.getProcesses().filter(p => p.status === 'running');
  }

  /**
   * Get a specific process record
   */
  getProcess(pid) {
    return this.processes.get(pid);
  }

  /**
   * Check if a path is within the workspace
   */
  isWithinWorkspace(targetPath) {
    if (!this.workspacePath) return true;

    const normalizedTarget = path.normalize(path.resolve(targetPath));
    const normalizedWorkspace = path.normalize(path.resolve(this.workspacePath));

    return normalizedTarget === normalizedWorkspace ||
           normalizedTarget.startsWith(normalizedWorkspace + path.sep);
  }

  /**
   * Clean up all processes and resources
   */
  cleanup() {
    this.killAll();
    this.processes.clear();
    this.emit('cleanup');
  }

  /**
   * Update workspace path
   */
  setWorkspacePath(workspacePath) {
    this.workspacePath = workspacePath;
  }

  /**
   * Update session ID
   */
  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  /**
   * Get process statistics
   */
  getStats() {
    const processes = this.getProcesses();
    return {
      total: processes.length,
      running: processes.filter(p => p.status === 'running').length,
      completed: processes.filter(p => p.status === 'completed').length,
      failed: processes.filter(p => p.status === 'failed').length,
      killed: processes.filter(p => p.status === 'killed').length,
    };
  }
}

// Singleton instance for global use
let globalRegistry = null;

export function getProcessRegistry(options = {}) {
  if (!globalRegistry) {
    globalRegistry = new ProcessRegistry(options);
  } else if (options.workspacePath) {
    globalRegistry.setWorkspacePath(options.workspacePath);
  }
  return globalRegistry;
}

export function createProcessRegistry(options = {}) {
  return new ProcessRegistry(options);
}

export default ProcessRegistry;
