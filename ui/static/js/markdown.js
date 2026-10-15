// markdown.js : minimal Markdown to HTML for the project docs (headings, lists,
// tables, code fences, quotes, bold/italic/inline code, links). Input is escaped first.

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(t) {
  return esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function tableHtml(rows) {
  const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return '<div class="table-wrap"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') +
    '</tr></thead><tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table></div>';
}

export function markdown(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      i++;
    } else if (/^#{1,6} /.test(line)) {
      const n = line.match(/^#+/)[0].length;
      out.push(`<h${Math.min(n + 1, 4)}>${inline(line.slice(n + 1))}</h${Math.min(n + 1, 4)}>`);
      i++;
    } else if (line.trim().startsWith('|') && (lines[i + 1] || '').includes('---')) {
      const buf = [];
      for (; i < lines.length && lines[i].trim().startsWith('|'); i++) buf.push(lines[i]);
      out.push(tableHtml(buf));
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const buf = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i]); i++) {
        buf.push('<li>' + inline(lines[i].replace(/^\s*([-*]|\d+\.) (\[[ x]\] )?/, (m, a, b) => (b ? (b.includes('x') ? '\u2611 ' : '\u2610 ') : ''))) + '</li>');
      }
      out.push((ordered ? '<ol>' : '<ul>') + buf.join('') + (ordered ? '</ol>' : '</ul>'));
    } else if (line.startsWith('>')) {
      out.push('<div class="callout"><div>' + inline(line.replace(/^>\s?/, '')) + '</div></div>');
      i++;
    } else if (/^---+\s*$/.test(line)) {
      out.push('<hr>');
      i++;
    } else if (line.trim() === '') {
      i++;
    } else {
      const buf = [];
      for (; i < lines.length && lines[i].trim() !== '' && !/^(#|```|\||\s*[-*] |\s*\d+\. |>)/.test(lines[i]); i++) buf.push(lines[i]);
      if (!buf.length) { buf.push(lines[i]); i++; }
      out.push('<p>' + inline(buf.join(' ')) + '</p>');
    }
  }
  return out.join('\n');
}