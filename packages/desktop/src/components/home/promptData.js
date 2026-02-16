export const promptSuggestions = [
  {
    id: 'build',
    emoji: '\u{1F680}',
    title: 'Build a project',
    description: 'Scaffold a new app from scratch',
    prompt: 'Help me build a new web application. Ask me what kind of app I want to create.',
  },
  {
    id: 'analyze',
    emoji: '\u{1F50D}',
    title: 'Analyze code',
    description: 'Understand and review existing code',
    prompt: 'Analyze the codebase in my workspace. Give me an overview of the architecture, key files, and potential improvements.',
  },
  {
    id: 'debug',
    emoji: '\u{1F41B}',
    title: 'Debug an issue',
    description: 'Find and fix bugs',
    prompt: 'Help me debug an issue I\'m having. I\'ll describe the problem and you can investigate.',
  },
  {
    id: 'automate',
    emoji: '\u{26A1}',
    title: 'Automate a task',
    description: 'Scripts, cron jobs, workflows',
    prompt: 'Help me automate a repetitive task. Ask me what I want to automate.',
  },
];

export const appFilters = [
  { id: 'all', label: 'All' },
  { id: 'code', label: 'Code' },
  { id: 'research', label: 'Research' },
  { id: 'creative', label: 'Creative' },
  { id: 'data', label: 'Data' },
];
