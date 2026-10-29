// ══════════════════════════════════════════════════════════════════
// محوّل Markdown آمن للمدونة (بدون مكتبات) — يُستخدم في المتصفح وفي
// صفحات SEO على السيرفر (api/blog-seo.js) ⇒ نفس الناتج بالضبط.
// الأمان: كل النص يُهرَّب أولاً، والروابط والصور http/https أو داخلية فقط.
// المدعوم: # ## ### ، فقرات، **عريض**، *مائل*، `كود`، [رابط](url)،
// ![صورة](url)، قوائم - و 1.، > اقتباس، جداول | أ | ب |، --- فاصل،
// ::: ملاحظة/تنبيه ... ::: (صندوق ملون)
// ══════════════════════════════════════════════════════════════════

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function safeUrl(u) {
  const url = String(u || '').trim();
  if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) || /^#[\w؀-ۿ-]+$/.test(url) || /^mailto:/i.test(url)) return url;
  return null;
}

/** معرّف عنوان (للفهرس والروابط الداخلية) — يدعم العربي */
export function slugifyHeading(text) {
  return String(text).trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'section';
}

function inline(raw) {
  let s = escapeHtml(raw);
  // كود مضمن (نحميه من باقي التحويلات)
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  // صور ثم روابط
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const u = safeUrl(url.replace(/&amp;/g, '&'));
    return u ? `<img src="${escapeHtml(u)}" alt="${alt}" loading="lazy" decoding="async">` : m;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const u = safeUrl(url.replace(/&amp;/g, '&'));
    if (!u) return text;
    const ext = /^https?:\/\//i.test(u) && !/^https?:\/\/(www\.)?felsy\.org/i.test(u);
    return `<a href="${escapeHtml(u)}"${ext ? ' target="_blank" rel="noopener nofollow"' : ''}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

/** يرجع { html, toc, words } — toc لعناوين ## و ### */
export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; const toc = []; const used = new Set();
  let i = 0; let words = 0;
  const uniqueId = (t) => { let id = slugifyHeading(t); let n = 2; while (used.has(id)) id = `${slugifyHeading(t)}-${n++}`; used.add(id); return id; };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    let m;
    if ((m = /^(#{1,4})\s+(.+)$/.exec(line))) {
      const level = Math.max(2, m[1].length); // # و ## ⇒ h2 (h1 محجوز لعنوان المقالة)، ### ⇒ h3
      const text = m[2].trim(); const id = uniqueId(text);
      if (level <= 3) toc.push({ id, text, level });
      out.push(`<h${level} id="${escapeHtml(id)}">${inline(text)}</h${level}>`);
      words += text.split(/\s+/).length; i++; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if ((m = /^:::\s*(ملاحظة|تنبيه|نصيحة|note|warning|tip)?\s*(.*)$/.exec(line))) {
      const kind = { 'تنبيه': 'warning', warning: 'warning', 'نصيحة': 'tip', tip: 'tip' }[m[1]] || 'note';
      const body = []; i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const inner = renderMarkdown(body.join('\n'));
      words += inner.words;
      out.push(`<aside class="callout callout-${kind}">${m[2] ? `<strong>${inline(m[2])}</strong>` : ''}${inner.html}</aside>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      const inner = renderMarkdown(body.join('\n'));
      words += inner.words;
      out.push(`<blockquote>${inner.html}</blockquote>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*•])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/).test(lines[i])) {
        const t = lines[i++].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/, '');
        words += t.split(/\s+/).length;
        items.push(`<li>${inline(t)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    // فقرة: سطور متتالية حتى سطر فاضي أو بداية عنصر آخر
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\||:::|\s*[-*•]\s|\s*\d+[.)]\s|-{3,}\s*$)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    const text = para.join(' ');
    words += text.split(/\s+/).length;
    out.push(/^!\[[^\]]*\]\([^)]+\)$/.test(text.trim()) ? `<figure>${inline(text)}</figure>` : `<p>${inline(text)}</p>`);
  }
  return { html: out.join('\n'), toc, words };
}

/** دقائق القراءة (العربي ~180 كلمة بالدقيقة) */
export const readingMinutes = (md) => Math.max(1, Math.round(renderMarkdown(md).words / 180));
