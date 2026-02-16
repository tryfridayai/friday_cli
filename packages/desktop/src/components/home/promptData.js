export const promptSuggestions = [
  {
    id: 'image',
    category: 'images',
    icon: 'image',
    title: 'Generate an image',
    description: 'Create any image from a text prompt',
    prompt: 'Generate an image for me. Ask me what I want to create.',
  },
  {
    id: 'voiceover',
    category: 'voice',
    icon: 'mic',
    title: 'Create a voiceover',
    description: 'Turn text or a transcript into narration',
    prompt: 'Help me create a voiceover. I have a transcript I want to turn into natural-sounding audio.',
  },
  {
    id: 'video',
    category: 'video',
    icon: 'video',
    title: 'Generate a video',
    description: 'Create short clips from a description',
    prompt: 'Generate a video for me. Ask me what scene or concept I want to bring to life.',
  },
  {
    id: 'produce',
    category: 'chat',
    icon: 'wand',
    title: 'Produce media content',
    description: 'Combine images, voice, and video',
    prompt: 'Help me produce media content. I want to create a polished piece — ask me what I\'m working on.',
  },
];

export const appFilters = [
  { id: 'all', label: 'All' },
  { id: 'images', label: 'Images' },
  { id: 'voice', label: 'Voice' },
  { id: 'video', label: 'Video' },
  { id: 'chat', label: 'Chat' },
];
