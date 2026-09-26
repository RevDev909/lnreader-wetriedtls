// Unit tests for the We Tried TLS parsers (run against captured fixtures).
import { readFileSync } from 'fs';
import {
  chapterDisplayName,
  coverUrl,
  extractFlightText,
  parseChapterContent,
  parseChapterList,
  parseQueryResults,
  parseSeriesDetail,
  shrinkIllustrations,
  stripHtml,
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
  check('garbage -> empty', parseChapterList('nope').items.length === 0);
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

console.log('coverUrl');
{
  const out = coverUrl('https://media.reaperscans.net/file/7BSHk1m/covers/abc.jpg');
  check('proxied', out.startsWith('https://images.weserv.nl/?url='), out);
  check('keeps source', out.includes('media.reaperscans.net'), out);
  check('width param', out.includes('w=400'), out);
  check('webp output', out.includes('output=webp'), out);
  check('empty passthrough', coverUrl('') === '');
  check('non-url passthrough', coverUrl('notaurl') === 'notaurl');
}

console.log('parseChapterContent (free chapter)');
{
  const r = parseChapterContent(fx('chapter.html'));
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

console.log('stripHtml');
{
  check(
    'strips tags',
    stripHtml('<p>Hello <strong>world</strong></p>') === 'Hello world',
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
