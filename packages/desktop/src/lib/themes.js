export const themes = {
  dark: {
    id: 'dark',
    label: 'Dark',
    vars: {
      '--surface-0': '#0a0a0f',
      '--surface-1': '#111118',
      '--surface-2': '#1a1a24',
      '--surface-3': '#24243a',
      '--accent': '#7c5cfc',
      '--accent-hover': '#9478ff',
      '--accent-muted': 'rgba(124, 92, 252, 0.15)',
      '--text-primary': '#e8e8ed',
      '--text-secondary': '#a0a0b0',
      '--text-muted': '#606070',
      '--border': '#2a2a3a',
      '--border-subtle': '#1e1e2e',
      '--success': '#34d399',
      '--warning': '#fbbf24',
      '--danger': '#f87171',
    },
  },
  light: {
    id: 'light',
    label: 'Light',
    vars: {
      '--surface-0': '#ffffff',
      '--surface-1': '#f8f8fa',
      '--surface-2': '#f0f0f4',
      '--surface-3': '#e4e4ec',
      '--accent': '#6d4de8',
      '--accent-hover': '#5a3ad0',
      '--accent-muted': 'rgba(109, 77, 232, 0.1)',
      '--text-primary': '#1a1a2e',
      '--text-secondary': '#555568',
      '--text-muted': '#999aab',
      '--border': '#dddde4',
      '--border-subtle': '#eeeeef',
      '--success': '#22c55e',
      '--warning': '#f59e0b',
      '--danger': '#ef4444',
    },
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    vars: {
      '--surface-0': '#080810',
      '--surface-1': '#0e0e1a',
      '--surface-2': '#161628',
      '--surface-3': '#1e1e38',
      '--accent': '#6366f1',
      '--accent-hover': '#818cf8',
      '--accent-muted': 'rgba(99, 102, 241, 0.15)',
      '--text-primary': '#dcdce8',
      '--text-secondary': '#8888a8',
      '--text-muted': '#555570',
      '--border': '#222238',
      '--border-subtle': '#1a1a2e',
      '--success': '#34d399',
      '--warning': '#fbbf24',
      '--danger': '#f87171',
    },
  },
};

export function applyTheme(themeId) {
  const theme = themes[themeId] || themes.dark;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
}
