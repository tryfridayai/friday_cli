export default function MediaViewer({ content }) {
  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        No media to display
      </div>
    );
  }

  const { type, url, alt } = content;

  if (type === 'image') {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <img
          src={url}
          alt={alt || 'Generated image'}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <audio controls src={url} className="w-full max-w-md">
          Your browser does not support audio.
        </audio>
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <video controls src={url} className="max-w-full max-h-full rounded-lg">
          Your browser does not support video.
        </video>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-text-muted text-sm">
      Unsupported media type: {type}
    </div>
  );
}
