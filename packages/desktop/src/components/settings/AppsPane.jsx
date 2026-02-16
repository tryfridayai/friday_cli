import { useEffect, useState } from 'react';
import useStore from '../../store/useStore';

// Map of MCP server IDs to the keytar API keys they depend on.
// If ANY of these keys are configured in the API Keys tab, the server
// is considered "available via env" and shouldn't prompt for credentials.
const ENV_KEY_MAP = {
  'friday-media': ['OPENAI_API_KEY', 'GOOGLE_API_KEY', 'ELEVENLABS_API_KEY'],
};

function getServerStatus(server, apiKeys) {
  // If this server maps to env keys and any of them are configured,
  // treat it as connected (keys are injected via env on backend start)
  const envKeys = ENV_KEY_MAP[server.id];
  if (envKeys && apiKeys) {
    const hasEnvKey = envKeys.some((k) => apiKeys[k]?.configured);
    if (hasEnvKey) return { label: 'Connected', color: 'text-success', showConnect: false, showDisconnect: false };
  }

  if (server.configured) {
    return { label: 'Connected', color: 'text-success', showConnect: false, showDisconnect: true };
  }
  if (server.requiresCredentials) {
    return { label: 'Requires setup', color: 'text-text-muted', showConnect: true, showDisconnect: false };
  }
  return { label: 'Available', color: 'text-success', showConnect: false, showDisconnect: false };
}

function AppCard({ server, apiKeys }) {
  const [showCredForm, setShowCredForm] = useState(false);
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);

  const credAuth = (server.auth || []).find((a) => a.type === 'credentials');
  const oauthAuth = (server.auth || []).find((a) => a.type === 'oauth' || a.type === 'remote-oauth');
  const status = getServerStatus(server, apiKeys);

  const handleConnect = async () => {
    if (oauthAuth) {
      if (window.friday) {
        window.friday.startMcpOAuth(oauthAuth.provider || oauthAuth.id, server.id, oauthAuth.scopes);
      }
      return;
    }
    if (credAuth) {
      setShowCredForm(true);
    }
  };

  const handleSaveCredentials = async () => {
    setSaving(true);
    if (window.friday) {
      const credentials = {
        authId: credAuth.id || 'default',
        fields: Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, { value: v }])
        ),
      };
      window.friday.updateMcpCredentials(server.id, credentials);
    }
    setSaving(false);
    setShowCredForm(false);
    setFields({});
  };

  const handleDisconnect = () => {
    if (window.friday) {
      window.friday.deleteMcpCredentials(server.id);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center text-sm font-bold text-accent">
            {server.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h4 className="text-sm font-medium">{server.name}</h4>
            <span className={`text-xs ${status.color}`}>
              {status.label}
            </span>
          </div>
        </div>
        <div>
          {status.showDisconnect && (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1 rounded-lg text-xs text-danger bg-danger/10 hover:bg-danger/20 transition-colors"
            >
              Disconnect
            </button>
          )}
          {status.showConnect && (
            <button
              onClick={handleConnect}
              className="px-3 py-1 rounded-lg text-xs text-white bg-accent hover:bg-accent-hover transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {showCredForm && credAuth && (
        <div className="mt-3 pt-3 border-t border-border-subtle space-y-2">
          {(credAuth.fields || []).map((field) => (
            <div key={field.key}>
              <label className="text-xs text-text-secondary block mb-1">
                {field.label || field.key}
                {field.required && <span className="text-danger ml-0.5">*</span>}
              </label>
              <input
                type={field.type === 'password' ? 'password' : 'text'}
                value={fields[field.key] || ''}
                onChange={(e) => setFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder || ''}
                className="w-full px-3 py-1.5 bg-surface-1 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveCredentials}
              disabled={saving}
              className="px-3 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent-hover transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowCredForm(false); setFields({}); }}
              className="px-3 py-1.5 text-text-muted text-xs hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppsPane() {
  const mcpServers = useStore((s) => s.mcpServers);
  const apiKeys = useStore((s) => s.apiKeys);

  useEffect(() => {
    if (window.friday) window.friday.getMcpServers();
  }, []);

  return (
    <div className="p-6">
      <p className="text-sm text-text-secondary mb-4">
        Apps extend Friday with new capabilities. Connect your accounts to enable them.
      </p>

      {mcpServers.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          Loading apps...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {mcpServers.map((server) => (
            <AppCard key={server.id} server={server} apiKeys={apiKeys} />
          ))}
        </div>
      )}
    </div>
  );
}
