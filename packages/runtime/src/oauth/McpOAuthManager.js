import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { exec } from 'child_process';
import os from 'os';

const CALLBACK_PORT = 13337;
const CALLBACK_HOST = '127.0.0.1';

/**
 * OAuth provider configurations.
 * Each provider defines its authorization URL, token exchange URL, and default scopes.
 * Adding a new OAuth provider is just adding an entry here.
 */
const OAUTH_PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    defaultScopes: ['openid', 'profile', 'email'],
    extraParams: { access_type: 'offline', prompt: 'consent' }
  },
  slack: {
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    defaultScopes: [
      'channels:history', 'channels:read', 'chat:write',
      'groups:history', 'groups:read', 'im:history', 'im:read',
      'mpim:history', 'mpim:read', 'users:read'
    ],
    scopeParam: 'user_scope'
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    defaultScopes: ['openid', 'profile', 'email', 'w_member_social']
  }
};

/**
 * Generic OAuth flow manager for MCP servers.
 *
 * Flow:
 * 1. Frontend calls `startFlow(providerId, serverId)`
 * 2. Opens system browser to provider's OAuth consent page
 * 3. Spins up a temporary localhost HTTP server to receive the callback
 * 4. Exchanges the authorization code for an access token
 * 5. Stores the token via McpCredentials
 * 6. Triggers config reload + runtime MCP server update
 */
class McpOAuthManager {
  constructor({ mcpCredentials, loadBackendConfig, runtime, config }) {
    this.mcpCredentials = mcpCredentials;
    this.loadBackendConfig = loadBackendConfig;
    this.runtime = runtime;
    this.config = config;
    this.callbackServer = null;
    this.pendingFlows = new Map(); // providerId -> { resolve, reject, serverId, state }
    this.clientConfigs = new Map(); // providerId -> { clientId, clientSecret }
  }

  /**
   * Register OAuth client credentials for a provider.
   * These come from environment variables (set by the user or .env).
   * Must be called before startFlow for that provider.
   */
  registerClient(providerId, { clientId, clientSecret }) {
    this.clientConfigs.set(providerId, { clientId, clientSecret });
  }

  /**
   * Load client configs from environment variables.
   * Call this during initialization.
   */
  loadClientsFromEnv() {
    // Google
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      this.registerClient('google', {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET
      });
    }

    // Slack
    if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
      this.registerClient('slack', {
        clientId: process.env.SLACK_CLIENT_ID,
        clientSecret: process.env.SLACK_CLIENT_SECRET
      });
    }

    // LinkedIn
    if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
      this.registerClient('linkedin', {
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET
      });
    }
  }

  /**
   * Start an OAuth flow for a provider + MCP server.
   * @param {string} providerId - 'google', 'slack', 'linkedin'
   * @param {string} serverId - MCP server ID ('google-drive', 'gmail', 'slack', 'linkedin')
   * @param {string[]} [scopes] - Override default scopes
   * @returns {Promise<{success: boolean, token?: string, error?: string}>}
   */
  async startFlow(providerId, serverId, scopes) {
    const provider = OAUTH_PROVIDERS[providerId];
    if (!provider) {
      return { success: false, error: `Unknown OAuth provider: ${providerId}` };
    }

    const clientConfig = this.clientConfigs.get(providerId);
    if (!clientConfig) {
      return {
        success: false,
        error: `No OAuth client credentials configured for ${providerId}. Set ${providerId.toUpperCase()}_CLIENT_ID and ${providerId.toUpperCase()}_CLIENT_SECRET environment variables.`
      };
    }

    // Generate state for CSRF protection
    const state = `${providerId}_${serverId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const redirectUri = `http://${CALLBACK_HOST}:${CALLBACK_PORT}/callback`;

    // Build authorization URL
    const resolvedScopes = scopes || provider.defaultScopes || [];
    const params = new URLSearchParams({
      client_id: clientConfig.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      ...(provider.extraParams || {})
    });

    // Some providers use different scope parameter names
    const scopeParam = provider.scopeParam || 'scope';
    if (resolvedScopes.length > 0) {
      params.set(scopeParam, resolvedScopes.join(' '));
    }

    const authorizationUrl = `${provider.authUrl}?${params.toString()}`;

    // Start callback server if not running
    await this.ensureCallbackServer();

    // Create a promise that resolves when the callback arrives
    return new Promise((resolve) => {
      // Set a timeout to auto-reject after 5 minutes
      const timeout = setTimeout(() => {
        this.pendingFlows.delete(state);
        resolve({ success: false, error: 'OAuth flow timed out (5 minutes)' });
      }, 5 * 60 * 1000);

      this.pendingFlows.set(state, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        serverId,
        providerId,
        clientConfig,
        redirectUri
      });

      // Open system browser
      this.openBrowser(authorizationUrl);
      console.log(`[OAuth] Flow started for ${providerId}/${serverId}, waiting for callback...`);
    });
  }

  /**
   * Check if a provider has valid OAuth credentials stored for a server.
   */
  async getStatus(serverId) {
    const creds = await this.mcpCredentials.getCredentials(serverId);
    const hasToken = Boolean(
      creds.accessToken?.value || creds.token?.value || creds.botToken?.value || creds.refreshToken?.value
    );
    return { configured: hasToken, serverId };
  }

  /**
   * Disconnect: remove stored OAuth tokens for a server.
   */
  async disconnect(serverId) {
    await this.mcpCredentials.deleteCredentials(serverId);
    const newConfig = await this.loadBackendConfig();
    this.runtime.updateMcpServers(newConfig.mcpServers);
    this.config.mcpServers = newConfig.mcpServers;
    return { success: true, serverId };
  }

  /**
   * Ensure the localhost callback server is running.
   */
  async ensureCallbackServer() {
    if (this.callbackServer) return;

    this.callbackServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${CALLBACK_HOST}:${CALLBACK_PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          const flow = state ? this.pendingFlows.get(state) : null;
          this.sendCallbackResponse(res, false, `OAuth error: ${error}`);
          if (flow) {
            this.pendingFlows.delete(state);
            flow.resolve({ success: false, error: `OAuth denied: ${error}` });
          }
          return;
        }

        if (!code || !state) {
          this.sendCallbackResponse(res, false, 'Missing code or state parameter');
          return;
        }

        const flow = this.pendingFlows.get(state);
        if (!flow) {
          this.sendCallbackResponse(res, false, 'Unknown or expired OAuth flow');
          return;
        }

        this.pendingFlows.delete(state);
        this.sendCallbackResponse(res, true, 'Authorization successful! You can close this tab.');

        // Exchange code for token
        try {
          const result = await this.exchangeCode(flow, code);
          flow.resolve(result);
        } catch (err) {
          console.error('[OAuth] Token exchange failed:', err.message);
          flow.resolve({ success: false, error: `Token exchange failed: ${err.message}` });
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    return new Promise((resolve, reject) => {
      this.callbackServer.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
        console.log(`[OAuth] Callback server listening on http://${CALLBACK_HOST}:${CALLBACK_PORT}`);
        resolve();
      });
      this.callbackServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[OAuth] Port ${CALLBACK_PORT} in use, trying next port...`);
          this.callbackServer = null;
          reject(new Error(`Port ${CALLBACK_PORT} is already in use`));
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Exchange authorization code for access token.
   */
  async exchangeCode(flow, code) {
    const { serverId, providerId, clientConfig, redirectUri } = flow;
    const provider = OAUTH_PROVIDERS[providerId];

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientConfig.clientId,
      client_secret: clientConfig.clientSecret
    });

    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token endpoint returned ${response.status}: ${errorText}`);
    }

    const tokenData = await response.json();

    // Google Drive uses file-based tokens - write directly to the tokens file
    if (serverId === 'google-drive') {
      this.writeGoogleDriveTokens(tokenData);
    }

    // Store credentials via McpCredentials
    const credentials = this.buildCredentialPayload(providerId, serverId, tokenData);
    const serverDef = this.config.mcpServers[serverId] || {};
    await this.mcpCredentials.setCredentials(serverId, credentials, { auth: serverDef.auth || [] });

    // Reload config and update runtime
    const newConfig = await this.loadBackendConfig();
    this.runtime.updateMcpServers(newConfig.mcpServers);
    this.config.mcpServers = newConfig.mcpServers;

    console.log(`[OAuth] Successfully stored tokens for ${providerId}/${serverId}`);
    return { success: true, serverId, providerId };
  }

  /**
   * Write tokens to the file Google Drive MCP server reads (~/.friday/google-drive-tokens.json).
   */
  writeGoogleDriveTokens(tokenData) {
    const tokensPath = path.join(os.homedir(), '.friday', 'google-drive-tokens.json');
    const tokens = {
      access_token: tokenData.access_token || '',
      refresh_token: tokenData.refresh_token || '',
      scope: tokenData.scope || '',
      token_type: tokenData.token_type || 'Bearer',
      expiry_date: tokenData.expiry_date || (Date.now() + (tokenData.expires_in || 3600) * 1000)
    };

    try {
      const dir = path.dirname(tokensPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
      console.log(`[OAuth] Wrote Google Drive tokens to ${tokensPath}`);
    } catch (error) {
      console.error(`[OAuth] Failed to write Google Drive tokens: ${error.message}`);
    }
  }

  /**
   * Build credential payload based on provider type and what the MCP server expects.
   */
  buildCredentialPayload(providerId, serverId, tokenData) {
    switch (providerId) {
      case 'google':
        if (serverId === 'gmail') {
          // Gmail MCP expects CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN env vars
          return {
            fields: {
              refreshToken: { value: tokenData.refresh_token || '' },
              accessToken: { value: tokenData.access_token || '' }
            }
          };
        }
        // Google Drive MCP uses file-based token storage
        return {
          fields: {
            accessToken: { value: tokenData.access_token || '' },
            refreshToken: { value: tokenData.refresh_token || '' }
          }
        };

      case 'slack':
        // Slack MCP server expects SLACK_MCP_XOXB_TOKEN or SLACK_MCP_XOXP_TOKEN
        return {
          fields: {
            botToken: {
              value: tokenData.access_token || tokenData.authed_user?.access_token || ''
            }
          }
        };

      case 'linkedin':
        return {
          fields: {
            accessToken: { value: tokenData.access_token || '' }
          }
        };

      default:
        return {
          fields: {
            accessToken: { value: tokenData.access_token || '' },
            refreshToken: { value: tokenData.refresh_token || '' }
          }
        };
    }
  }

  /**
   * Send HTML response to the browser callback page.
   */
  sendCallbackResponse(res, success, message) {
    const color = success ? '#22c55e' : '#ef4444';
    const icon = success ? '&#10003;' : '&#10007;';
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Friday AI - OAuth ${success ? 'Success' : 'Error'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
    .card { text-align: center; padding: 3rem; border-radius: 1rem; background: #1a1a1a; border: 1px solid #333; max-width: 400px; }
    .icon { font-size: 3rem; color: ${color}; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { color: #999; font-size: 0.875rem; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${success ? 'Connected!' : 'Connection Failed'}</h1>
    <p>${message}</p>
    <p style="margin-top: 1rem; font-size: 0.75rem; color: #666;">You can close this tab and return to Friday.</p>
  </div>
</body>
</html>`;
    res.writeHead(success ? 200 : 400, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Open URL in system default browser.
   */
  openBrowser(url) {
    const platform = os.platform();
    let cmd;
    if (platform === 'darwin') {
      cmd = `open "${url}"`;
    } else if (platform === 'win32') {
      cmd = `start "" "${url}"`;
    } else {
      cmd = `xdg-open "${url}"`;
    }

    exec(cmd, (err) => {
      if (err) {
        console.error('[OAuth] Failed to open browser:', err.message);
      }
    });
  }

  /**
   * Shut down the callback server cleanly.
   */
  shutdown() {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
    }
    // Reject all pending flows
    for (const [state, flow] of this.pendingFlows) {
      flow.resolve({ success: false, error: 'OAuth manager shutting down' });
    }
    this.pendingFlows.clear();
  }
}

export default McpOAuthManager;
