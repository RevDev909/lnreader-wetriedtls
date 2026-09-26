// Pure parsing helpers for the We Tried TLS LNReader plugin.
// These functions take raw HTML / JSON and have no dependencies,
// so they can be unit-tested in plain Node.

export interface NovelCard {
  slug: string;
  title: string;
  cover: string;
}

export interface NovelDetails {
  id: number;
  name: string;
  author: string;
  genres: string[];
  status: string;
  cover: string;
  summary: string;
}

export interface ChapterInfo {
  slug: string;
  name: string;
  number: number;
  publishedAt: string;
}

export interface QueryPage {
  items: NovelCard[];
  lastPage: number;
}

export interface ChapterListPage {
  items: ChapterInfo[];
  lastPage: number;
}

export type ChapterContentResult =
  | { status: 'ok'; html: string }
  | { status: 'premium' | 'notfound' | 'empty' };

/**
 * Next.js app-router pages embed their data in
 *   self.__next_f.push([1,"<escaped payload>"])</script>
 * scripts. Decode every payload into one searchable text blob.
 * The closing tag match tolerates an optional semicolon / whitespace
 * (some Next.js versions emit `);</script>`), so chunks are never
 * silently skipped due to formatting.
 */
export function extractFlightText(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)\s*;?\s*<\/script>/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch {
      /* skip malformed chunk */
    }
  }
  return out;
}

/** Decode a handful of HTML entities; the site uses a small set. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
}

/** Strip tags and collapse whitespace: used for the novel summary. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Parse one page of the /query API (used for both the browse list and
 * search; an empty query_string returns the whole catalog paginated).
 */
export function parseQueryResults(jsonText: string): QueryPage {
  const root = safeJson(jsonText);
  const items: NovelCard[] = [];
  let lastPage = 1;
  if (root && typeof root === 'object') {
    if (root.meta && typeof root.meta.last_page === 'number')
      lastPage = root.meta.last_page;
    const data = Array.isArray(root.data) ? root.data : [];
    for (const it of data) {
      if (!it || typeof it !== 'object') continue;
      if (it.series_type && it.series_type !== 'Novel') continue;
      const slug =
        typeof it.series_slug === 'string' ? it.series_slug.trim() : '';
      const title = typeof it.title === 'string' ? it.title.trim() : '';
      if (!slug || !title) continue;
      items.push({
        slug,
        title: decodeEntities(title),
        cover: typeof it.thumbnail === 'string' ? it.thumbnail : '',
      });
    }
  }
  return { items, lastPage };
}

/** Parse the /series/{slug} API response. */
export function parseSeriesDetail(jsonText: string): NovelDetails | null {
  const s = safeJson(jsonText);
  if (!s || typeof s !== 'object' || typeof s.id !== 'number') return null;
  const tags = Array.isArray(s.tags) ? s.tags : [];
  const genres = tags
    .map((t: any) => (t && typeof t.name === 'string' ? t.name.trim() : ''))
    .filter((g: string) => g.length > 0);
  return {
    id: s.id,
    name: typeof s.title === 'string' ? decodeEntities(s.title.trim()) : '',
    author: typeof s.author === 'string' ? s.author.trim() : '',
    genres,
    status: typeof s.status === 'string' ? s.status.trim() : '',
    cover: typeof s.thumbnail === 'string' ? s.thumbnail : '',
    summary:
      typeof s.description === 'string' ? stripHtml(s.description) : '',
  };
}

/** Parse one page of the /chapters/{seriesId} API response. */
export function parseChapterList(jsonText: string): ChapterListPage {
  const root = safeJson(jsonText);
  const items: ChapterInfo[] = [];
  let lastPage = 1;
  if (root && typeof root === 'object') {
    if (root.meta && typeof root.meta.last_page === 'number')
      lastPage = root.meta.last_page;
    const data = Array.isArray(root.data) ? root.data : [];
    for (const c of data) {
      if (!c || typeof c !== 'object') continue;
      const slug =
        typeof c.chapter_slug === 'string' ? c.chapter_slug.trim() : '';
      const name =
        typeof c.chapter_name === 'string' ? c.chapter_name.trim() : '';
      if (!slug || !name) continue;
      const title =
        typeof c.chapter_title === 'string' && c.chapter_title.trim()
          ? decodeEntities(c.chapter_title.trim())
          : '';
      const idx = parseFloat(c.index);
      items.push({
        slug,
        name: title ? name + ': ' + title : name,
        number: isNaN(idx) ? 0 : idx,
        publishedAt:
          typeof c.created_at === 'string' ? c.created_at : '',
      });
    }
  }
  return { items, lastPage };
}

/**
 * Slice a JS string by UTF-8 byte offsets (the flight protocol's `T<hex>`
 * length prefix counts UTF-8 bytes of the row payload, not UTF-16 chars).
 * ES5-safe: no TextEncoder needed.
 */
function sliceUtf8Bytes(s: string, start: number, byteLen: number): string {
  let bytes = 0;
  let i = start;
  while (i < s.length && bytes < byteLen) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 2;
        bytes += 4;
        continue;
      }
    }
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
    i++;
  }
  return s.slice(start, i);
}

/** Inner text of one <p>...</p> block, tags stripped. */
function paragraphText(p: string): string {
  return decodeEntities(p.replace(/<[^>]+>/g, '')).trim();
}

function isTitleRepeat(p: string): boolean {
  // A paragraph that is nothing but bold text, e.g. the repeated
  // series / chapter title the site prepends to every chapter body.
  const inner = p
    .replace(/^<p[^>]*>/i, '')
    .replace(/<\/p>$/i, '')
    .trim();
  return /^<strong>[\s\S]*<\/strong>$/.test(inner);
}

function isPromoParagraph(p: string): boolean {
  const t = paragraphText(p).toLowerCase();
  if (!t || t === '= = =') return true;
  if (t.indexOf('we tried translations') !== -1) return true;
  if (t.indexOf('dsc.gg') !== -1 || t.indexOf('join our discord') !== -1)
    return true;
  return false;
}

/**
 * Extract the chapter body from a chapter page's HTML.
 *
 * The page is a Next.js app-router page: the chapter record carries
 * `"chapter_content":"$<rowId>"` and the body HTML lives in the flight
 * row `<rowId>:T<hex>,` that follows. Returns the cleaned HTML, or a
 * non-ok status for locked / missing / unparseable chapters.
 */
export function parseChapterContent(html: string): ChapterContentResult {
  if (/this chapter is premium!/i.test(html)) return { status: 'premium' };
  // Only the real <title> element counts for the 404 check: Next.js flight
  // data always embeds a notFound template containing similar wording.
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title && /^\s*404/i.test(title[1])) return { status: 'notfound' };

  const flight = extractFlightText(html);
  const ref = /"chapter_content":"\$([0-9a-z]{1,4})"/.exec(flight);
  if (!ref) return { status: 'empty' };

  // The row looks like `<rowId>:T<hex>,<payload>` where <hex> is the exact
  // UTF-8 byte length of the payload. Respecting it is the only reliable
  // end boundary: flight metadata follows the payload on the same line,
  // so a "next row" lookahead overshoots.
  const rowRe = new RegExp(
    '\\n' + ref[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':T([0-9a-f]+),',
  );
  const row = rowRe.exec(flight);
  if (!row) return { status: 'empty' };
  const byteLen = parseInt(row[1], 16);
  if (!(byteLen > 0)) return { status: 'empty' };
  const payloadStart = row.index + row[0].length;
  const payload = sliceUtf8Bytes(flight, payloadStart, byteLen);
  if (!payload) return { status: 'empty' };

  // Paragraph breaks inside the payload are literal \r\n / \n sequences.
  const body = payload
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .trim();
  if (!body) return { status: 'empty' };

  // Split into top-level <p> blocks and trim the site's promo header /
  // footer (banner, series/chapter title repeats, discord plug).
  const blocks = body.match(/<p[\s\S]*?<\/p>/gi) || [body];
  let start = 0;
  let end = blocks.length;
  const isEdgeJunk = (p: string) => isPromoParagraph(p) || isTitleRepeat(p);
  while (start < end && isEdgeJunk(blocks[start])) start++;
  while (end > start && isEdgeJunk(blocks[end - 1])) end--;
  const cleaned = blocks.slice(start, end).join('\n');
  if (!paragraphText(cleaned)) return { status: 'empty' };
  return { status: 'ok', html: cleaned };
}
