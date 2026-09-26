// Unit tests for the We Tried TLS parsers (run against captured fixtures).
import { readFileSync } from 'fs';
import {
  extractFlightText,
  parseChapterContent,
  parseChapterList,
  parseQueryResults,
  parseSeriesDetail,
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
