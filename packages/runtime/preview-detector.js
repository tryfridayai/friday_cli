/**
 * PreviewDetector - Simplified
 * Detects dev server commands and signals PreviewService to start
 */

/**
 * Main detection method - checks if a preview should be started
 * @param {Object} queryContext - The query context containing tool uses
 * @param {string} workspacePath - The current workspace path
 * @returns {Object|null} Preview info or null if no preview detected
 */
export function detectPreview(queryContext, workspacePath) {
  console.error('[PREVIEW] Detect function triggered.');

  if (!queryContext || !queryContext.toolUses || queryContext.toolUses.length === 0) {
    console.error('[PREVIEW] No tool uses found in query context.');
    return null;
  }

  // Check the last few Bash tool uses for dev server commands
  const bashTools = queryContext.toolUses.filter(
    tool => tool.name === 'bash' || tool.name === 'execute_command'
  );

  console.error(`[PREVIEW] Found ${bashTools.length} bash commands.`);

  if (bashTools.length === 0) {
    return null;
  }

  // Look at the last 5 bash commands
  const recentBashTools = bashTools.slice(-5);

  for (const tool of recentBashTools) {
    const command = tool.input?.command || '';

    console.error(`[PREVIEW] Scanning command: "${command}"`);

    if (isDevServerCommand(command)) {
      console.error(`[PREVIEW] 🚀 Dev server command detected: ${command}`);

      // Try to extract directory from the command
      const directory = extractDirectory(command, workspacePath);

      // Check if command has explicit port
      const url = extractLocalhostURL(command);

      if (url) {
        // Port was explicitly specified in command
        console.error(`[PREVIEW] 🎯 Found explicit URL: ${url}`);
        return {
          type: 'web',
          url: url,
          autoOpen: true,
          confidence: 'high'
        };
      }

      // No explicit port - signal PreviewService to start for this directory
      console.error(`[PREVIEW] 📁 Signaling preview start for directory: ${directory || workspacePath}`);
      return {
        type: 'start_preview',
        directory: directory || workspacePath,
        autoOpen: true,
        confidence: 'medium'
      };
    }
  }

  return null;
}

/**
 * Extract directory from a command like "cd /path/to/app && npm run dev"
 */
function extractDirectory(command, workspacePath) {
  // Pattern: cd /some/path && npm run dev
  const cdMatch = command.match(/cd\s+([^\s&;]+)/);
  if (cdMatch) {
    let dir = cdMatch[1];
    // Handle relative paths
    if (!dir.startsWith('/') && !dir.startsWith('~')) {
      // Relative to workspace
      if (workspacePath) {
        const path = require('path');
        dir = path.resolve(workspacePath, dir);
      }
    }
    // Handle ~ home directory
    if (dir.startsWith('~') && process.env.HOME) {
      dir = dir.replace('~', process.env.HOME);
    }
    console.error(`[PREVIEW] Extracted directory from cd: ${dir}`);
    return dir;
  }

  // Pattern: npm run dev in /some/path
  // Or check if workspace path itself has a subdirectory mentioned

  return null;
}

/**
 * Check if a command starts a dev server
 */
function isDevServerCommand(command) {
  const devServerKeywords = [
    'npm start',
    'npm run dev',
    'npm run serve',
    'yarn start',
    'yarn dev',
    'pnpm start',
    'pnpm dev',
    'bun run dev',
    'vite',
    'next dev',
    'react-scripts start',
    'webpack-dev-server',
    'serve',
    'http-server',
    'python -m http.server',
    'python3 -m http.server',
    'php -S',
    'ng serve'
  ];

  return devServerKeywords.some(keyword =>
    command.toLowerCase().includes(keyword.toLowerCase())
  );
}

/**
 * Extract or guess localhost URL from a dev server command
 *
 * IMPORTANT: Port 5173 is reserved for the Electron app's Vite dev server.
 * We must not return 5173 to avoid showing the app inside itself.
 */
function extractLocalhostURL(command) {
  // Check if command explicitly specifies a port
  const portMatch = command.match(/(?:--port|port|:|\s)(\d{4,5})(?:\s|$)/);

  if (portMatch) {
    const port = portMatch[1];
    // Skip 5173 - that's the Electron app's port
    if (port === '5173') {
      console.error('[PREVIEW] Skipping port 5173 - reserved for Electron app');
      return null;
    }
    return `http://localhost:${port}`;
  }

  // Don't guess ports - let the PreviewService handle port detection
  // Guessing leads to conflicts (e.g., 5173 is used by Electron app)
  // Return null to signal that we detected a dev server but don't know the port
  console.error('[PREVIEW] Dev server detected but port unknown - deferring to PreviewService');
  return null;
}
