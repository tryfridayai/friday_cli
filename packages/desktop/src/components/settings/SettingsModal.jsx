import useStore from '../../store/useStore';
import Modal from '../ui/Modal';
import AppsPane from './AppsPane';
import ApiKeysPane from './ApiKeysPane';

export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const settingsTab = useStore((s) => s.settingsTab);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <Modal
      open={showSettings}
      onClose={() => setShowSettings(false)}
      title="Settings"
      width="max-w-2xl"
    >
      {/* Tabs */}
      <div className="flex border-b border-border-subtle">
        {[
          { id: 'apps', label: 'Apps' },
          { id: 'keys', label: 'API Keys' },
          { id: 'appearance', label: 'Appearance' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSettingsTab(tab.id)}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              settingsTab === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panes */}
      {settingsTab === 'apps' && <AppsPane />}
      {settingsTab === 'keys' && <ApiKeysPane />}
      {settingsTab === 'appearance' && (
        <div className="p-6">
          <h3 className="text-sm font-semibold mb-3">Theme</h3>
          <div className="flex gap-3">
            {['dark', 'light', 'midnight'].map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-4 py-2 rounded-lg text-sm capitalize transition-all ${
                  theme === t
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
