// Unit tests for the We Tried TLS parsers (run against captured fixtures).
import { readFileSync } from 'fs';
import {
  API_BASE,
  catalogUrl,
  chapterDisplayName,
  extractFlightText,
  parseChapterContent,
  parseChapterList,
  parseQueryResults,
  parseSeriesDetail,
  shrinkIllustrations,
  stripHtml,
  sanitizeHtml,
} from './parsers.bundle.mjs';

const fx = n => readFileSync(`test/fixtures/${n}`, 'utf8');
let pass = 0,
  fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log('  ok  ' + name);
  } else {
    fail++;
    console.log('  FAIL ' + name + (extra ? ' :: ' + extra : ''));
  }
}

console.log('parseQueryResults');
{
  const p = parseQueryResults(fx('query.json'));
  check('returns items', p.items.length === 3, String(p.items.length));
  check(
    'first item fields',
    p.items[0].slug === 'a-knight-who-eternally-regresses' &&
      p.items[0].title === 'A Knight who Eternally Regresses' &&
      p.items[0].cover.startsWith('https://'),
    JSON.stringify(p.items[0]),
  );
  check('empty json -> empty page', parseQueryResults('{}').items.length === 0);
  check('garbage -> empty page', parseQueryResults('nope').items.length === 0);
}

console.log('parseSeriesDetail');
{
  const d = parseSeriesDetail(fx('series.json'));
  check('parsed', !!d);
  check('id', d && d.id === 32);
  check('name', d && d.name === 'A Knight who Eternally Regresses');
  check('author', d && d.author.length > 0, d && d.author);
  check('genres', d && d.genres.includes('Action'), d && d.genres.join(','));
  check('status', d && d.status === 'Ongoing');
  check('cover', d && d.cover.startsWith('https://'));
  check('summary text', d && d.summary.includes('dream'), (d && d.summary.slice(0, 60)) || '');
  check('no html in summary', d && !/<p/.test(d.summary));
  check('garbage -> null', parseSeriesDetail('nope') === null);
}

console.log('parseChapterList');
{
  const p = parseChapterList(fx('chapters.json'));
  check('items', p.items.length === 2, String(p.items.length));
  check(
    'first chapter',
    p.items[0].slug === 'chapter-0' && p.items[0].name.startsWith('Chapter 0'),
    JSON.stringify(p.items[0]),
  );
  check('chapter number', p.items[1].number === 1, String(p.items[1].number));
  const throws = fn => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  check(
    'non-JSON -> throws (a malformed page must never look like an empty page)',
    throws(() => parseChapterList('nope')),
  );
  check(
    'error page -> throws',
    throws(() => parseChapterList('<html><body>502 Bad Gateway</body></html>')),
  );
  check(
    'wrong shape -> throws',
    throws(() => parseChapterList('{"foo":1}')),
  );
  check(
    'non-array data -> throws',
    throws(() => parseChapterList('{"meta":{"last_page":3},"data":{}}')),
  );
  check(
    'blank response throws (a failed fetch must never look like the end of the list)',
    (() => {
      try {
        parseChapterList('');
        return false;
      } catch {
        return true;
      }
    })(),
  );
  check(
    'whitespace response throws',
    (() => {
      try {
        parseChapterList('   ');
        return false;
      } catch {
        return true;
      }
    })(),
  );
  check('free chapters not locked', p.items.every(c => c.locked === false));
}

console.log('parseChapterList (paid)');
{
  const p = parseChapterList(fx('paid.json'), true);
  check('paid items', p.items.length === 50, String(p.items.length));
  check('all locked', p.items.every(c => c.locked === true));
  check(
    'first paid chapter',
    p.items[0].slug === 'chapter-705' && p.items[0].number === 705,
    JSON.stringify(p.items[0]),
  );
  check(
    'last paid chapter',
    p.items[49].slug === 'chapter-754' && p.items[49].number === 754,
    JSON.stringify(p.items[49]),
  );
  check('name has title', p.items[0].name === 'Chapter 705: Information Matters', p.items[0].name);
}

console.log('chapterDisplayName');
{
  check(
    'locked gets lock prefix',
    chapterDisplayName({ slug: 'x', name: 'Chapter 705: Foo', number: 705, publishedAt: '', locked: true }) ===
      '🔒 Chapter 705: Foo',
  );
  check(
    'free has no prefix',
    chapterDisplayName({ slug: 'x', name: 'Chapter 1: Bar', number: 1, publishedAt: '', locked: false }) ===
      'Chapter 1: Bar',
  );
}

console.log('catalogUrl');
{
  const base = API_BASE + '/query?adult=true&query_string=&page=1';
  check('default has no status', catalogUrl(1) === base, catalogUrl(1));
  check('all has no status', catalogUrl(1, 'all') === base);
  check('empty has no status', catalogUrl(1, '') === base);
  const completed = catalogUrl(1, 'Completed');
  check(
    'completed adds param',
    completed === base + '&status=Completed',
    completed,
  );
  check('page number', catalogUrl(3, 'Ongoing').includes('page=3'));
  check(
    'value encoded',
    catalogUrl(1, 'On Hold').includes('status=On%20Hold'),
  );
}

console.log('covers (direct CDN, trimmed at source)');
{
  // The coverUrl() identity wrapper was removed in the audit pass: the
  // parsers now trim cover URLs at the source and pass them through
  // directly (no proxy dependency).
  const d = parseSeriesDetail(
    '{"id":1,"title":"T","thumbnail":" https://media.reaperscans.net/file/7BSHk1m/covers/abc.jpg "}',
  );
  check(
    'detail cover direct + trimmed',
    d !== null &&
      d.cover === 'https://media.reaperscans.net/file/7BSHk1m/covers/abc.jpg',
    d && d.cover,
  );
  const q = parseQueryResults(
    '{"data":[{"series_slug":"x","title":"T","series_type":"Novel","thumbnail":" https://example.com/c.jpg "}],"meta":{"last_page":1}}',
  );
  check(
    'catalog cover direct + trimmed',
    q.items.length === 1 && q.items[0].cover === 'https://example.com/c.jpg',
    JSON.stringify(q.items),
  );
}

console.log('parseChapterContent (free chapter)');
{
  // The known titles let the parser strip the site's repeated title
  // header while keeping genuine bold-only content lines.
  const r = parseChapterContent(fx('chapter.html'), [
    'A Knight who Eternally Regresses',
    'Chapter 1: My Dream was to be a Knight',
  ]);
  check('status ok', r.status === 'ok', r.status);
  const html = r.status === 'ok' ? r.html : '';
  check('has chapter text', html.includes('My dream was to be a knight.'));
  check('banner stripped', !html.includes('WE TRIED TRANSLATIONS'));
  check('discord promo stripped', !html.includes('dsc.gg/wetried'));
  check('title repeats stripped', !html.includes('Chapter 1: My Dream was to be a Knight'));
  check('separator stripped', !/= = =/.test(html.replace(/&#61;/g, '=')));
  check('keeps paragraphs', (html.match(/<p/g) || []).length > 10);
  check('no empty body', html.replace(/<[^>]+>/g, '').trim().length > 500);
}

console.log('parseChapterContent (premium chapter)');
{
  const r = parseChapterContent(fx('chapter-premium.html'));
  check('status premium', r.status === 'premium', r.status);
}

console.log('shrinkIllustrations');
{
  const big =
    '<p><img dir="auto" src="https://media.reaperscans.net/file/7BSHk1m/t8njybiciwoxoqavujt3dchg.jpg" alt="cover"></p>';
  const out = shrinkIllustrations(big);
  check('rewrites site media', out.includes('https://images.weserv.nl/?url='), out.slice(0, 80));
  check('800px width', out.includes('w=800'), out.slice(0, 120));
  check('webp output', out.includes('output=webp'));
  check('keeps alt text', out.includes('alt="cover"'), out.slice(0, 160));
  check('original gone', !out.includes('media.reaperscans.net/file/'));
  const other =
    '<p><img src="https://example.com/pic.jpg"></p><p>text</p>';
  check('other hosts untouched', shrinkIllustrations(other) === other);
  check('no images untouched', shrinkIllustrations('<p>hi</p>') === '<p>hi</p>');
}

console.log('parseChapterContent (inline-HTML gallery chapter)');
{
  const r = parseChapterContent(fx('chapter-gallery.html'));
  check('status ok', r.status === 'ok', r.status);
  const html = r.status === 'ok' ? r.html : '';
  check('banner stripped', !html.includes('WE TRIED TRANSLATIONS'));
  check('discord promo stripped', !html.includes('dsc.gg/wetried'));
  check('keeps warning text', html.includes('Spoiler warning'));
  check('keeps h1 heading', /<h1[^>]*>Official Covers<\/h1>/.test(html));
  check(
    'keeps both illustrations',
    (html.match(/<img[^>]*>/g) || []).length === 3,
    (html.match(/<img[^>]*>/g) || []).length + ' imgs',
  );
  check('keeps img src', html.includes('https://media.example.com/cover1.jpg'));
  check(
    'site media proxied end-to-end',
    html.includes('images.weserv.nl') && html.includes('w=800'),
  );
  check('proxied keeps source', html.includes('media.reaperscans.net'));
  check(
    'image blocks keep order',
    html.indexOf('cover1.jpg') < html.indexOf('cover2.png'),
  );
}
console.log('parseChapterContent (edge cases)');
{
  check(
    'missing page -> notfound',
    parseChapterContent('<html><head><title>404: This page could not be found.</title></head></html>')
      .status === 'notfound',
  );
  check('empty html -> empty', parseChapterContent('<html></html>').status === 'empty');
}

console.log('sanitizeHtml');
{
  check(
    'strips event handlers',
    sanitizeHtml('<img src="x.jpg" onerror="alert(1)" alt="a">') ===
      '<img src="x.jpg" alt="a">',
  );
  check(
    'strips script elements',
    !/script/i.test(sanitizeHtml('<p>hi</p><script>alert(1)</script>')),
  );
  check(
    'strips iframes',
    !/iframe/i.test(sanitizeHtml('<p>t</p><iframe src="x"></iframe>')),
  );
  check(
    'neutralizes javascript: urls',
    sanitizeHtml('<a href="javascript:alert(1)">click</a>') === '<a>click</a>',
  );
  check(
    'keeps safe links',
    sanitizeHtml('<a href="https://example.com">click</a>') ===
      '<a href="https://example.com">click</a>',
  );
  check(
    'keeps safe markup',
    sanitizeHtml('<p>Hello <strong>world</strong></p><img src="https://x/y.jpg">') ===
      '<p>Hello <strong>world</strong></p><img src="https://x/y.jpg">',
  );
}

console.log('parseChapterContent (image-only chapter)');
{
  // Build a minimal flight page whose chapter_content is inline HTML with
  // only an illustration and no text: it must parse as real content.
  const inner = JSON.stringify({
    chapter_content: '<p><img src="https://example.com/pic.jpg"></p>',
  })
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  const page =
    '<html><body><script>self.__next_f.push([1,"' +
    inner +
    '"])</script></body></html>';
  const r = parseChapterContent(page);
  check('image-only status ok', r.status === 'ok', r.status);
  check(
    'image kept',
    r.status === 'ok' && r.html.includes('https://example.com/pic.jpg'),
    r.status === 'ok' ? r.html : '',
  );
}

console.log('parseChapterContent (malicious markup sanitized)');
{
  const inner = JSON.stringify({
    chapter_content:
      '<p>Hello <a href="javascript:alert(2)">click</a></p><img src="x.jpg" onerror="alert(1)">',
  })
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  const page =
    '<html><body><script>self.__next_f.push([1,"' +
    inner +
    '"])</script></body></html>';
  const r = parseChapterContent(page);
  check('status ok', r.status === 'ok', r.status);
  const html = r.status === 'ok' ? r.html : '';
  check('text kept', html.includes('Hello') && html.includes('click'));
  check('no event handlers', !/onerror/i.test(html), html);
  check('no javascript: urls', !/javascript:/i.test(html), html);
}

console.log('sanitizeHtml (encoded script URLs)');
{
  check(
    'decimal entity javascript:',
    sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>') === '<a>x</a>',
  );
  check(
    'hex entity javascript:',
    sanitizeHtml('<a href="&#x6A;avascript:alert(1)">x</a>') === '<a>x</a>',
  );
  check(
    'named entity colon',
    sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>') === '<a>x</a>',
  );
  check(
    'tab-smuggled scheme',
    sanitizeHtml('<a href="java\tscript:alert(1)">x</a>') === '<a>x</a>',
  );
  check(
    'vbscript blocked',
    sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>') === '<a>x</a>',
  );
  check(
    'safe https kept',
    // The allowlist sanitizer re-escapes attribute values on emit, so a
    // raw & in a URL comes out as &amp; — the same URL to a browser,
    // and the audited behavior.
    sanitizeHtml('<a href="https://example.com/?a=1&b=2">x</a>') ===
      '<a href="https://example.com/?a=1&amp;b=2">x</a>',
  );
}

console.log('parseChapterContent (mixed containers kept)');
{
  // A chapter mixing paragraphs with a list: the list must not be dropped.
  const inner = JSON.stringify({
    chapter_content:
      '<p>Introduction</p><ul><li>Important note</li></ul><p>Outro</p>',
  })
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  const page =
    '<html><body><script>self.__next_f.push([1,"' +
    inner +
    '"])</script></body></html>';
  const r = parseChapterContent(page);
  check('status ok', r.status === 'ok', r.status);
  const html = r.status === 'ok' ? r.html : '';
  check('list item kept', html.includes('Important note'), html);
  check(
    'paragraphs kept',
    html.includes('Introduction') && html.includes('Outro'),
    html,
  );
}

console.log('parseChapterContent (bold lines)');
{
  const mk = bodyInner => {
    const inner = JSON.stringify({ chapter_content: bodyInner })
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    return (
      '<html><body><script>self.__next_f.push([1,"' +
      inner +
      '"])</script></body></html>'
    );
  };
  const titles = ['My Novel', 'Chapter 1: The Beginning'];
  const r1 = parseChapterContent(
    mk('<p><strong>Meanwhile, at the palace...</strong></p><p>Story.</p>'),
    titles,
  );
  check(
    'genuine bold line kept',
    r1.status === 'ok' && r1.html.includes('Meanwhile, at the palace'),
    r1.status === 'ok' ? r1.html : r1.status,
  );
  const r2 = parseChapterContent(
    mk('<p><strong>Chapter 1: The Beginning</strong></p><p>Story.</p>'),
    titles,
  );
  check(
    'title repeat stripped',
    r2.status === 'ok' &&
      !r2.html.includes('Chapter 1: The Beginning') &&
      r2.html.includes('Story.'),
    r2.status === 'ok' ? r2.html : r2.status,
  );
  const r3 = parseChapterContent(
    mk('<p><strong>Chapter 1: The Beginning</strong></p><p>Story.</p>'),
  );
  check(
    'no titles -> bold kept (safe default)',
    r3.status === 'ok' && r3.html.includes('Chapter 1: The Beginning'),
    r3.status === 'ok' ? r3.html : r3.status,
  );
  const r4 = parseChapterContent(
    mk('<p><strong>Translator: Ryuu</strong></p><p>Story.</p>'),
    titles,
  );
  check(
    'credit line stripped',
    r4.status === 'ok' &&
      !r4.html.includes('Translator: Ryuu') &&
      r4.html.includes('Story.'),
    r4.status === 'ok' ? r4.html : r4.status,
  );
}

console.log('stripHtml');
{
  check(
    'strips tags',
    stripHtml('<p>Hello <strong>world</strong></p>') === 'Hello world',
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
