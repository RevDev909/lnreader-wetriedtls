// Live smoke test: run the built bundle through LNReader's exact loader
// wrapper with real network and exercise all four plugin methods.
import { readFileSync } from 'fs';

const code = readFileSync('.dist/wetriedtls-1.0.3.js', 'utf8');
const UA = 'Mozilla/5.0 (Linux; Android 10)';

const NovelStatus = {
  Unknown: 'Unknown', Ongoing: 'Ongoing', Completed: 'Completed',
  Licensed: 'Licensed', PublishingFinished: 'Publishing Finished',
  Cancelled: 'Cancelled', OnHiatus: 'On Hiatus',
};
const fetchLib = {
  fetchText: async url => {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  },
  fetchApi: async url => {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  },
};
const _require = name =>
  ({ '@libs/novelStatus': { NovelStatus }, '@libs/fetch': fetchLib })[name];

const plugin = Function(
  'require',
  'module',
  'const exports = module.exports = {};\n' + code + ';\nreturn exports.default',
)(_require, {});

let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log('PASS  ' + name);
  else {
    failures++;
    console.log('FAIL  ' + name + ' ' + extra);
  }
};

console.log('id:', plugin.id, '| version:', plugin.version, '| site:', plugin.site);

const search = await plugin.searchNovels('knight', 1);
check('search returns results', search.length > 0, String(search.length));
check(
  'search finds the knight novel',
  search.some(n => n.path === 'a-knight-who-eternally-regresses'),
  search.map(n => n.path).join(','),
);

const popular = await plugin.popularNovels(1, {});
check('popular returns 12', popular.length === 12, String(popular.length));
const popular2 = await plugin.popularNovels(2, {});
check('popular page 2 differs', popular2.length > 0 && popular2[0].path !== popular[0].path);
check('popular covers proxied', popular.every(n => n.cover.startsWith('https://images.weserv.nl/')), popular[0].cover);

const novel = await plugin.parseNovel('a-knight-who-eternally-regresses');
check('novel name', novel.name === 'A Knight who Eternally Regresses', novel.name);
check('novel cover proxied', novel.cover.startsWith('https://images.weserv.nl/'), novel.cover);
check('novel status', novel.status === 'Ongoing', novel.status);
check('novel has many chapters', novel.chapters.length > 700, String(novel.chapters.length));
const lockedChaps = novel.chapters.filter(c => c.name.startsWith('🔒 '));
check('locked chapters listed', lockedChaps.length === 50, String(lockedChaps.length));
check('locked chapter names', lockedChaps[0].name === '🔒 Chapter 705: Information Matters', lockedChaps[0].name);
check('chapters sorted', novel.chapters[0].chapterNumber === 0 && novel.chapters[novel.chapters.length-1].chapterNumber === 754);
check(
  'first chapter',
  novel.chapters[0].path === 'a-knight-who-eternally-regresses/chapter-0',
  novel.chapters[0].path,
);
check('novel author', !!novel.author, novel.author);
check('novel genres', !!novel.genres, novel.genres);
check('novel summary', !!novel.summary && novel.summary.length > 50);

const body = await plugin.parseChapter('a-knight-who-eternally-regresses/chapter-1');
check('chapter body loaded', body.includes('My dream was to be a knight.'));
check('chapter promo stripped', !body.includes('dsc.gg/wetried') && !body.includes('WE TRIED TRANSLATIONS'));

const locked = await plugin.parseChapter('a-knight-who-eternally-regresses/chapter-754');
check('premium chapter shows notice', locked.includes('premium'), locked.slice(0, 80));
const locked705 = await plugin.parseChapter('a-knight-who-eternally-regresses/chapter-705');
check('paid chapter 705 shows notice', locked705.includes('premium'));

// Gallery/illustration chapters embed their HTML inline (no flight row).
const gallery = await plugin.parseChapter(
  'the-police-do-a-better-job-than-heroes/illustrations',
);
check('gallery chapter loads', gallery.includes('<img'), gallery.slice(0, 80));
check(
  'gallery keeps headings',
  /<h1[^>]*>Official Covers<\/h1>/.test(gallery),
);
check(
  'gallery illustrations proxied',
  gallery.includes('images.weserv.nl') && gallery.includes('w=800'),
  gallery.slice(0, 120),
);

check('resolveUrl', plugin.resolveUrl('a/chapter-1') === 'https://wetriedtls.com/series/a/chapter-1');

console.log(failures ? `\n${failures} FAILURES` : '\nALL LIVE CHECKS PASSED');
process.exit(failures ? 1 : 0);
