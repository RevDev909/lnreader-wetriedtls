# We Tried TLS — LNReader plugin

An unofficial [LNReader](https://github.com/LNReader/lnreader) plugin (extension)
for [wetriedtls.com](https://wetriedtls.com/), a translation group hosting
translated Korean web novels.

## Install in the app

1. In LNReader, go to **Settings → Repositories**.
2. Add this repository URL:

   ```
   https://raw.githubusercontent.com/RevDev909/lnreader-wetriedtls/main/.dist/plugins.min.json
   ```

3. Install the **We Tried TLS** plugin from the repository.

## What it supports

- Browse the novel catalog (paginated)
- Novel details: title, author, genres, status, synopsis, cover, full chapter list
- Chapter reading (free chapters)
- Search
- Premium (paid) chapters show a clear notice instead of failing — they require
  a paid subscription on the website, which the app cannot provide

## Notes

The site exposes a public REST API (`api.wetriedtls.com`) for the catalog,
search, novel details, and chapter lists, so those use the API directly.
Chapter bodies are embedded in the chapter pages as Next.js React Flight
payloads (`self.__next_f.push(...)`), parsed with the exact UTF-8 byte length
the flight row declares. Chapter downloads use a 30 s timeout with up to
3 attempts and exponential backoff for transient failures only.

## For developers

- `src/plugin.ts` — the plugin (implements LNReader's `PluginBase`)
- `src/parsers.ts` — pure parsing helpers (API JSON + Flight payloads)
- `test/test.mjs` — unit tests on captured fixtures (`npm test`)
- `test/live.mjs` — end-to-end checks against the live site

Build the distributable bundle with:

```bash
npm install
npm run build
```
