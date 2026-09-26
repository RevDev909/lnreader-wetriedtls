import {
  ChapterInfo,
  chapterDisplayName,
  coverUrl,
  extractFlightText,
  parseChapterContent,
  parseChapterList,
  parseQueryResults,
  parseSeriesDetail,
} from './parsers';
import type { Plugin } from './lnreader-api';

// The host app injects these via `require`, but their exact shape has varied
// across app versions, so resolve them defensively at load with fallbacks.
declare function require(name: string): any;

function loadFetchLib(): {
  fetchText?: (url: string) => Promise<string>;
  fetchApi?: (url: string) => Promise<{ text: () => Promise<string> }>;
} {
  try {
    return require('@libs/fetch') || {};
  } catch (e) {
    return {};
  }
}

function loadNovelStatus(): Record<string, string> {
  try {
    const lib = require('@libs/novelStatus');
    if (lib && lib.NovelStatus) return lib.NovelStatus;
  } catch (e) {
    // fall through to the built-in copy below
  }
  // Built-in copy of the NovelStatus string enum, so the plugin keeps
  // working even if the host does not provide @libs/novelStatus.
  return {
    Unknown: 'Unknown',
    Ongoing: 'Ongoing',
    Completed: 'Completed',
    Licensed: 'Licensed',
    PublishingFinished: 'Publishing Finished',
    Cancelled: 'Cancelled',
    OnHiatus: 'On Hiatus',
  };
}

const fetchLib = loadFetchLib();
const NovelStatus = loadNovelStatus();

// --- Resilient fetching -------------------------------------------------
// The same pattern as the Nightjar Reads plugin: one HTTP request per
// chapter/page, so a single flaky request used to fail the whole call.
// This wrapper adds a timeout and retries transient failures with
// exponential backoff. It never fires parallel requests and never
// retries definite client errors, so the site is treated respectfully.
const FETCH_TIMEOUT_MS = 30000;
const MAX_FETCH_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    if (typeof setTimeout === 'function') setTimeout(resolve, ms);
    else resolve();
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: any = undefined;
  const timeout = new Promise<T>((_, reject) => {
    if (typeof setTimeout === 'function') {
      timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    }
  });
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(
    v => {
      clear();
      return v;
    },
    e => {
      clear();
      throw e;
    },
  );
}

interface RawFetchResult {
  status?: number;
  text: string;
}

async function fetchRaw(url: string): Promise<RawFetchResult> {
  if (typeof fetchLib.fetchApi === 'function') {
    const res: any = await fetchLib.fetchApi(url);
    const status =
      res && typeof res.status === 'number' ? res.status : undefined;
    const text =
      res && typeof res.text === 'function' ? await res.text() : '';
    return { status, text };
  }
  if (typeof fetchLib.fetchText === 'function') {
    return { text: await fetchLib.fetchText(url) };
  }
  throw new Error('No fetch implementation provided by the host app');
}

/** Pull an HTTP status out of errors like "HTTP 503". */
function statusFromError(e: any): number | undefined {
  const m = /HTTP (\d{3})/.exec(String((e && e.message) || e || ''));
  return m ? parseInt(m[1], 10) : undefined;
}

async function fetchText(url: string): Promise<string> {
  let lastError: any = new Error('Request failed');
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    let status: number | undefined;
    try {
      const res = await withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS);
      status = res.status;
      if (status === 429 || (status !== undefined && status >= 500)) {
        throw new Error('Server responded with HTTP ' + status);
      }
      return res.text;
    } catch (e) {
      lastError = e;
      if (status === undefined) status = statusFromError(e);
      const msg = String((e && (e as Error).message) || e || '');
      const retryable =
        status === undefined ||
        status === 429 ||
        status >= 500 ||
        /timed out/i.test(msg);
      if (!retryable || attempt === MAX_FETCH_ATTEMPTS) break;
      // Exponential backoff with jitter: ~1s, ~2s. Gentle on the site.
      await sleep(1000 * Math.pow(2, attempt - 1) + Math.random() * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const API = 'https://api.wetriedtls.com';

function mapStatus(s: string): string {
  if (s === 'Ongoing') return NovelStatus.Ongoing;
  if (s === 'Completed') return NovelStatus.Completed;
  if (s === 'Hiatus' || s === 'On Hiatus') return NovelStatus.OnHiatus;
  if (s === 'Cancelled' || s === 'Dropped') return NovelStatus.Cancelled;
  return NovelStatus.Unknown;
}

class WeTriedTLS implements Plugin.PluginBase {
  id = 'wetriedtls';
  name = 'We Tried TLS';
  icon = 'src/en/wetriedtls/icon.png';
  site = 'https://wetriedtls.com';
  version = '1.0.1';

  async popularNovels(
    pageNo: number,
    _options: Plugin.PopularNovelsOptions,
  ): Promise<Plugin.NovelItem[]> {
    const json = await fetchText(
      API + '/query?adult=true&query_string=&page=' + pageNo,
    );
    const page = parseQueryResults(json);
    if (pageNo > page.lastPage) return [];
    return page.items.map(n => ({
      name: n.title,
      path: n.slug,
      cover: coverUrl(n.cover),
    }));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const slug = novelPath.split('/').filter(Boolean).pop() || '';
    const detail = parseSeriesDetail(await fetchText(API + '/series/' + slug));
    if (!detail) throw new Error('Could not load novel details');

    // The chapter list is paginated (500 per page keeps it to ~2
    // requests even for the longest series). Free chapters come from
    // /chapters/{id} and paywalled chapters from /chapters/{id}/paid;
    // the two are merged so locked chapters show up with a 🔒 prefix.
    // Opening a locked chapter shows a notice: it needs a paid
    // subscription on the website and cannot be read here.
    const all: ChapterInfo[] = [];
    let pageNo = 1;
    let lastPage = 1;
    do {
      const json = await fetchText(
        API +
          '/chapters/' +
          detail.id +
          '?page=' +
          pageNo +
          '&perPage=500&order=asc',
      );
      const page = parseChapterList(json);
      lastPage = page.lastPage;
      for (const c of page.items) all.push(c);
      pageNo++;
    } while (pageNo <= lastPage);

    // Paid chapters are a bonus, not a requirement: if this endpoint
    // ever fails, the novel still loads with its free chapters.
    try {
      let paidPageNo = 1;
      let paidLastPage = 1;
      do {
        const json = await fetchText(
          API +
            '/chapters/' +
            detail.id +
            '/paid?query=&page=' +
            paidPageNo +
            '&perPage=1000&order=asc',
        );
        const page = parseChapterList(json, true);
        paidLastPage = page.lastPage;
        for (const c of page.items) all.push(c);
        paidPageNo++;
      } while (paidPageNo <= paidLastPage);
    } catch (e) {
      // ignore: free chapters are already collected above
    }

    const seen: { [slug: string]: boolean } = {};
    const chapters: Plugin.ChapterItem[] = [];
    all
      .filter(c => {
        if (!c.slug || seen[c.slug]) return false;
        seen[c.slug] = true;
        return true;
      })
      .sort((a, b) => a.number - b.number)
      .forEach(c => {
        chapters.push({
          name: chapterDisplayName(c),
          path: slug + '/' + c.slug,
          releaseTime: c.publishedAt,
          chapterNumber: c.number,
        });
      });

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: detail.name,
      status: mapStatus(detail.status),
    };
    if (detail.cover) novel.cover = coverUrl(detail.cover);
    if (detail.author) novel.author = detail.author;
    if (detail.genres.length) novel.genres = detail.genres.join(', ');
    if (detail.summary) novel.summary = detail.summary;
    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await fetchText(this.site + '/series/' + chapterPath);
    const result = parseChapterContent(html);
    if (result.status === 'ok') return result.html;
    if (result.status === 'premium') {
      return (
        '<p><strong>This chapter is premium on We Tried TLS.</strong></p>' +
        '<p>It requires a paid subscription on the website and cannot be read here. ' +
        'Free chapters of this novel still work.</p>'
      );
    }
    if (result.status === 'notfound') {
      return (
        '<p><strong>This chapter is no longer available on We Tried TLS.</strong></p>' +
        '<p>It may have been removed or moved. Refresh the novel to update the chapter list.</p>'
      );
    }
    return (
      '<p><strong>Could not load this chapter.</strong></p>' +
      '<p>It may be temporarily unavailable on We Tried TLS.</p>'
    );
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const json = await fetchText(
      API +
        '/query?adult=true&query_string=' +
        encodeURIComponent(searchTerm) +
        '&page=' +
        pageNo,
    );
    const page = parseQueryResults(json);
    if (pageNo > page.lastPage) return [];
    return page.items.map(n => ({
      name: n.title,
      path: n.slug,
      cover: coverUrl(n.cover),
    }));
  }

  resolveUrl = (path: string, _isNovel?: boolean): string =>
    this.site + '/series/' + path;
}

export default new WeTriedTLS();
