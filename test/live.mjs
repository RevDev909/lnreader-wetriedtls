// Live smoke test: run the built bundle through LNReader's exact loader
// wrapper with real network and exercise all four plugin methods.
import { readFileSync } from 'fs';

const code = readFileSync('.dist/wetriedtls-1.0.0.js', 'utf8');
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

const popular = await plugin.popularNovels(1, {});
check('popular returns 12', popular.length === 12, String(popular.length));

const novel = await plugin.parseNovel('a-knight-who-eternally-regresses');
check('novel name', novel.name === 'A Knight who Eternally Regresses', novel.name);
check('novel has many chapters', novel.chapters.length > 700, String(novel.chapters.length));

const body = await plugin.parseChapter('a-knight-who-eternally-regresses/chapter-1');
check('chapter body loaded', body.includes('My dream was to be a knight.'));
check('chapter promo stripped', !body.includes('dsc.gg/wetried'));

const locked = await plugin.parseChapter('a-knight-who-eternally-regresses/chapter-754');
check('premium chapter shows notice', locked.includes('premium'), locked.slice(0, 80));

console.log(failures ? `\n${failures} FAILURES` : '\nALL LIVE CHECKS PASSED');
process.exit(failures ? 1 : 0);
