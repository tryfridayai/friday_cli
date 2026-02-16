/**
 * Lightweight markdown-to-HTML converter.
 * Handles: headings, bold, italic, code, code blocks, links, lists, blockquotes, tables, hr.
 */

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(text) {
  if (!text) return '';

  let html = '';
  const lines = text.split('\n');
  let i = 0;
  let inList = false;
  let listType = null;

  function closeList() {
    if (inList) {
      html += listType === 'ul' ? '</ul>' : '</ol>';
      inList = false;
      listType = null;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith('```')) {
      closeList();
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = escapeHtml(codeLines.join('\n'));
      html += `<pre><code class="language-${lang || 'text'}">${code}</code></pre>`;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html += `<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`;
      i++;
      continue;
    }

    // HR
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      closeList();
      html += '<hr />';
      i++;
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith('> ')) {
      closeList();
      const quoteLines = [];
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html += `<blockquote>${quoteLines.map((l) => `<p>${inlineMarkdown(l)}</p>`).join('')}</blockquote>`;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        html += '<ul>';
        inList = true;
        listType = 'ul';
      }
      html += `<li>${inlineMarkdown(ulMatch[2])}</li>`;
      i++;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        html += '<ol>';
        inList = true;
        listType = 'ol';
      }
      html += `<li>${inlineMarkdown(olMatch[2])}</li>`;
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      closeList();
      const headers = line.split('|').map((c) => c.trim()).filter(Boolean);
      i += 2; // skip header + separator
      let tableHtml = '<table><thead><tr>';
      headers.forEach((h) => { tableHtml += `<th>${inlineMarkdown(h)}</th>`; });
      tableHtml += '</tr></thead><tbody>';
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
        tableHtml += '<tr>';
        cells.forEach((c) => { tableHtml += `<td>${inlineMarkdown(c)}</td>`; });
        tableHtml += '</tr>';
        i++;
      }
      tableHtml += '</tbody></table>';
      html += tableHtml;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    // Paragraph
    closeList();
    html += `<p>${inlineMarkdown(line)}</p>`;
    i++;
  }

  closeList();
  return html;
}

function inlineMarkdown(text) {
  let result = escapeHtml(text);

  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');
  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return result;
}
