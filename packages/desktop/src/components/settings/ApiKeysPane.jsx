import { useState, useEffect } from 'react';
import useStore from '../../store/useStore';

const KEY_DEFS = [
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic', unlocks: 'Chat (Claude)', placeholder: 'sk-ant-...' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI', unlocks: 'Chat, Images, Voice, Video', placeholder: 'sk-...' },
  { key: 'GOOGLE_API_KEY', label: 'Google AI', unlocks: 'Chat, Images, Voice, Video', placeholder: 'AIza...' },
  { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs', unlocks: 'Premium Voice', placeholder: 'Enter key...' },
];

function KeyRow({ def, status, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    await onSave(def.key, value.trim());
    setSaving(false);
    setEditing(false);
    setValue('');
  };

  const handleDelete = async () => {
    setSaving(true);
    await onDelete(def.key);
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-4 py-3 border-b border-border-subtle last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{def.label}</span>
          {status?.configured && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">
              Connected
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted mt-0.5">
          Unlocks: {def.unlocks}
          {status?.preview && <span className="ml-2 font-mono">{status.preview}</span>}
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-2">
        {editing ? (
          <>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={def.placeholder}
              className="w-48 px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={!value.trim() || saving}
              className="px-3 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {saving ? '...' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setValue(''); }}
              className="px-2 py-1.5 text-text-muted text-xs hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 bg-surface-2 text-text-secondary text-xs rounded-lg hover:bg-surface-3 transition-colors"
            >
              {status?.configured ? 'Update' : 'Add Key'}
            </button>
            {status?.configured && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-2 py-1.5 text-danger text-xs hover:text-danger/80 transition-colors"
              >
                Remove
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ApiKeysPane() {
  const apiKeys = useStore((s) => s.apiKeys);
  const loadApiKeys = useStore((s) => s.loadApiKeys);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const handleSave = async (keyName, value) => {
    if (!window.friday) return;
    await window.friday.setApiKey(keyName, value);
    await loadApiKeys();
  };

  const handleDelete = async (keyName) => {
    if (!window.friday) return;
    await window.friday.deleteApiKey(keyName);
    await loadApiKeys();
  };

  return (
    <div className="p-6">
      <p className="text-sm text-text-secondary mb-4">
        API keys are stored securely in your system keychain. They are never sent to Friday's servers.
      </p>
      <div>
        {KEY_DEFS.map((def) => (
          <KeyRow
            key={def.key}
            def={def}
            status={apiKeys[def.key]}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
