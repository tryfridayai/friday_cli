import { useMemo } from 'react';
import { renderMarkdown } from '../../lib/markdown';

export default function MarkdownRenderer({ content }) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div
      className="prose text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
