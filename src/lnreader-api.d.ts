// Minimal LNReader plugin API surface used by this plugin.
// (The real definitions live in lnreader-plugins' src/types/plugin.ts.)

export declare namespace Plugin {
  interface NovelItem {
    name: string;
    path: string;
    cover?: string;
  }
  interface ChapterItem {
    name: string;
    path: string;
    releaseTime?: string;
    chapterNumber?: number;
  }
  interface SourceNovel {
    path: string;
    name: string;
    cover?: string;
    author?: string;
    artist?: string;
    genres?: string;
    status?: string;
    summary?: string;
    chapters?: ChapterItem[];
  }
  interface PopularNovelsOptions {
    showLatestNovels?: boolean;
    filters?: unknown;
  }
  interface PluginBase {
    id: string;
    name: string;
    icon: string;
    site: string;
    version: string;
    popularNovels(
      pageNo: number,
      options: PopularNovelsOptions,
    ): Promise<NovelItem[]>;
    parseNovel(novelPath: string): Promise<SourceNovel>;
    parseChapter(chapterPath: string): Promise<string>;
    searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]>;
    resolveUrl(path: string, isNovel?: boolean): string;
  }
}
