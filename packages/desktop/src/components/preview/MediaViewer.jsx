import { useState, useEffect } from 'react';

const CATEGORY_ICONS = { images: '\u{1F5BC}', audio: '\u{1F3B5}', video: '\u{1F3AC}' };
const CATEGORY_LABELS = { images: 'Images', audio: 'Audio', video: 'Video' };

function formatTimeAgo(ms) {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function mediaTypeForCategory(category) {
  if (category === 'images') return 'image';
  if (category === 'audio') return 'audio';
  return 'video';
}

export default function MediaViewer({ content, mediaFiles, onSelect }) {
  const [activeCategory, setActiveCategory] = useState('images');

  // Auto-switch to the category of the selected content
  useEffect(() => {
    if (content) {
      if (content.type === 'image') setActiveCategory('images');
      else if (content.type === 'audio') setActiveCategory('audio');
      else if (content.type === 'video') setActiveCategory('video');
    }
  }, [content?.url]);

  const files = mediaFiles || { images: [], audio: [], video: [] };
  const currentList = files[activeCategory] || [];
  const totalCount = files.images.length + files.audio.length + files.video.length;

  return (
    <div className="flex flex-col h-full">
      {/* Viewer */}
      <div className="flex-shrink-0 border-b border-border-subtle" style={{ minHeight: 180 }}>
        {content ? (
          <div className="flex items-center justify-center p-3" style={{ height: 220 }}>
            {content.type === 'image' && (
              <img
                src={content.url}
                alt={content.alt || 'Media'}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            )}
            {content.type === 'audio' && (
              <audio key={content.url} controls src={content.url} className="w-full max-w-[260px]">
                Your browser does not support audio.
              </audio>
            )}
            {content.type === 'video' && (
              <video key={content.url} controls preload="metadata" src={content.url} className="max-w-full max-h-full rounded-lg">
                Your browser does not support video.
              </video>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center text-text-muted text-xs" style={{ height: 220 }}>
            {totalCount > 0 ? 'Select a file to preview' : 'No media files yet'}
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex border-b border-border-subtle px-2 py-1.5 gap-1 flex-shrink-0">
        {['images', 'audio', 'video'].map((cat) => {
          const count = files[cat]?.length || 0;
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
              }`}
            >
              {CATEGORY_LABELS[cat]}
              {count > 0 && (
                <span className={`ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-accent/20 text-accent' : 'bg-surface-2 text-text-muted'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {currentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs px-4 text-center py-8">
            <span className="text-2xl mb-2">{CATEGORY_ICONS[activeCategory]}</span>
            No {CATEGORY_LABELS[activeCategory].toLowerCase()} yet.
            <span className="mt-1 text-[10px]">Ask Friday to generate some!</span>
          </div>
        ) : (
          <div className="py-1">
            {currentList.map((file) => {
              const mediaUrl = `friday-media://${file.path}`;
              const isSelected = content?.url === mediaUrl;
              return (
                <button
                  key={file.path}
                  onClick={() => onSelect?.({
                    type: mediaTypeForCategory(activeCategory),
                    url: mediaUrl,
                    alt: file.name,
                  })}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-accent-muted text-accent'
                      : 'hover:bg-surface-2 text-text-secondary'
                  }`}
                >
                  {/* Thumbnail for images, icon for others */}
                  {activeCategory === 'images' ? (
                    <img
                      src={mediaUrl}
                      alt=""
                      className="w-8 h-8 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <span className="text-base w-8 h-8 flex items-center justify-center flex-shrink-0">
                      {CATEGORY_ICONS[activeCategory]}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate">{file.name}</div>
                    <div className="text-[10px] text-text-muted">{formatTimeAgo(file.modified)}</div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    title="Open in system app"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.friday?.openFilePath(file.path);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); window.friday?.openFilePath(file.path); } }}
                    className="flex-shrink-0 p-1 rounded hover:bg-surface-3 text-text-muted hover:text-text-secondary transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
