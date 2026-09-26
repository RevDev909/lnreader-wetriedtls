var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = function(target, all) {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = function(to, from, except, desc) {
  if (from && typeof from === "object" || typeof from === "function")
    for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
      key = keys[i];
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: function(k) {
          return from[k];
        }.bind(null, key), enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
  return to;
};
var __toCommonJS = function(mod) {
  return __copyProps(__defProp({}, "__esModule", { value: true }), mod);
};

// .tsc-build/plugin.js
var plugin_exports = {};
__export(plugin_exports, {
  default: function() {
    return plugin_default;
  }
});

// .tsc-build/parsers.js
var API_BASE = "https://api.wetriedtls.com";
function catalogUrl(pageNo, status) {
  var url = API_BASE + "/query?adult=true&query_string=&page=" + pageNo;
  var s = (status || "").trim();
  if (s && s !== "all")
    url += "&status=" + encodeURIComponent(s);
  return url;
}
function extractFlightText(html) {
  var re = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)\s*;?\s*<\/script>/g;
  var out = "";
  var m;
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch (_a) {
    }
  }
  return out;
}
function decodeEntities(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"').replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013").replace(/&hellip;/g, "\u2026");
}
function stripHtml(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_a) {
    return null;
  }
}
function parseQueryResults(jsonText) {
  var root = safeJson(jsonText);
  var items = [];
  var lastPage = 1;
  if (root && typeof root === "object") {
    if (root.meta && typeof root.meta.last_page === "number")
      lastPage = root.meta.last_page;
    var data = Array.isArray(root.data) ? root.data : [];
    for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
      var it = data_1[_i];
      if (!it || typeof it !== "object")
        continue;
      if (it.series_type && it.series_type !== "Novel")
        continue;
      var slug = typeof it.series_slug === "string" ? it.series_slug.trim() : "";
      var title = typeof it.title === "string" ? it.title.trim() : "";
      if (!slug || !title)
        continue;
      items.push({
        slug: slug,
        title: decodeEntities(title),
        cover: typeof it.thumbnail === "string" ? it.thumbnail : ""
      });
    }
  }
  return { items: items, lastPage: lastPage };
}
function parseChapterList(jsonText, locked) {
  if (locked === void 0) {
    locked = false;
  }
  var root = safeJson(jsonText);
  var items = [];
  var lastPage = 1;
  if (root && typeof root === "object") {
    if (root.meta && typeof root.meta.last_page === "number")
      lastPage = root.meta.last_page;
    var data = Array.isArray(root.data) ? root.data : [];
    for (var _i = 0, data_2 = data; _i < data_2.length; _i++) {
      var c = data_2[_i];
      if (!c || typeof c !== "object")
        continue;
      var slug = typeof c.chapter_slug === "string" ? c.chapter_slug.trim() : "";
      var name_1 = typeof c.chapter_name === "string" ? c.chapter_name.trim() : "";
      if (!slug || !name_1)
        continue;
      var title = typeof c.chapter_title === "string" && c.chapter_title.trim() ? decodeEntities(c.chapter_title.trim()) : "";
      var idx = parseFloat(c.index);
      items.push({
        slug: slug,
        name: title ? name_1 + ": " + title : name_1,
        number: isNaN(idx) ? 0 : idx,
        publishedAt: typeof c.created_at === "string" ? c.created_at : "",
        locked: locked
      });
    }
  }
  return { items: items, lastPage: lastPage };
}
function chapterDisplayName(c) {
  return c.locked ? "\uD83D\uDD12 " + c.name : c.name;
}
function proxiedImageUrl(url, width) {
  var bare = url.replace(/^https?:\/\//i, "");
  return "https://images.weserv.nl/?url=" + encodeURIComponent(bare) + "&w=" + width + "&q=80&output=webp";
}
function coverUrl(thumbnail) {
  var t = (thumbnail || "").trim();
  if (!/^https?:\/\//i.test(t))
    return t;
  return proxiedImageUrl(t, 400);
}
function shrinkIllustrations(html) {
  return html.replace(/<img\b([^>]*?)\bsrc="(https?:\/\/media\.reaperscans\.net\/[^"]+)"([^>]*?)>/gi, function(_m, pre, src, post) {
    return "<img" + pre + ' src="' + proxiedImageUrl(src, 800) + '"' + post + ">";
  });
}
function parseSeriesDetail(jsonText) {
  var s = safeJson(jsonText);
  if (!s || typeof s !== "object" || typeof s.id !== "number")
    return null;
  var tags = Array.isArray(s.tags) ? s.tags : [];
  var genres = tags.map(function(t) {
    return t && typeof t.name === "string" ? t.name.trim() : "";
  }).filter(function(g) {
    return g.length > 0;
  });
  return {
    id: s.id,
    name: typeof s.title === "string" ? decodeEntities(s.title.trim()) : "",
    author: typeof s.author === "string" ? s.author.trim() : "",
    genres: genres,
    status: typeof s.status === "string" ? s.status.trim() : "",
    cover: typeof s.thumbnail === "string" ? s.thumbnail : "",
    summary: typeof s.description === "string" ? stripHtml(s.description) : ""
  };
}
function sliceUtf8Bytes(s, start, byteLen) {
  var bytes = 0;
  var i = start;
  while (i < s.length && bytes < byteLen) {
    var code = s.charCodeAt(i);
    if (code >= 55296 && code <= 56319 && i + 1 < s.length) {
      var next = s.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) {
        i += 2;
        bytes += 4;
        continue;
      }
    }
    bytes += code < 128 ? 1 : code < 2048 ? 2 : 3;
    i++;
  }
  return s.slice(start, i);
}
function paragraphText(p) {
  return decodeEntities(p.replace(/<[^>]+>/g, "")).trim();
}
function isTitleRepeat(p) {
  var inner = p.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "").trim();
  return /^<strong>[\s\S]*<\/strong>$/.test(inner);
}
function isPromoParagraph(p) {
  if (/<img[\s>]/i.test(p))
    return false;
  var t = paragraphText(p).toLowerCase();
  if (!t || t === "= = =")
    return true;
  if (t.indexOf("we tried translations") !== -1)
    return true;
  if (t.indexOf("dsc.gg") !== -1 || t.indexOf("join our discord") !== -1)
    return true;
  return false;
}
function parseChapterContent(html) {
  if (/this chapter is premium!/i.test(html))
    return { status: "premium" };
  var title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title && /^\s*404/i.test(title[1]))
    return { status: "notfound" };
  var flight = extractFlightText(html);
  var contentM = /"chapter_content":"((?:[^"\\]|\\.)*)"/.exec(flight);
  if (!contentM)
    return { status: "empty" };
  var raw;
  try {
    raw = JSON.parse('"' + contentM[1] + '"');
  } catch (_a) {
    return { status: "empty" };
  }
  var payload;
  var rowRef = /^\$([0-9a-z]{1,4})$/.exec(raw);
  if (rowRef) {
    var rowRe = new RegExp("\\n" + rowRef[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":T([0-9a-f]+),");
    var row = rowRe.exec(flight);
    if (!row)
      return { status: "empty" };
    var byteLen = parseInt(row[1], 16);
    if (!(byteLen > 0))
      return { status: "empty" };
    var payloadStart = row.index + row[0].length;
    payload = sliceUtf8Bytes(flight, payloadStart, byteLen);
  } else if (/^\s*</.test(raw)) {
    payload = raw;
  } else {
    return { status: "empty" };
  }
  if (!payload)
    return { status: "empty" };
  var body = payload.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n").trim();
  if (!body)
    return { status: "empty" };
  var blocks = body.match(/<p[\s\S]*?<\/p>|<h[1-6][\s\S]*?<\/h[1-6]>|<figure[\s\S]*?<\/figure>|<img[^>]*>/gi) || [body];
  var start = 0;
  var end = blocks.length;
  var isEdgeJunk = function(p) {
    return isPromoParagraph(p) || isTitleRepeat(p);
  };
  while (start < end && isEdgeJunk(blocks[start]))
    start++;
  while (end > start && isEdgeJunk(blocks[end - 1]))
    end--;
  var cleaned = blocks.slice(start, end).join("\n");
  if (!paragraphText(cleaned))
    return { status: "empty" };
  return { status: "ok", html: shrinkIllustrations(cleaned) };
}

// .tsc-build/plugin.js
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
function loadFetchLib() {
  try {
    return require("@libs/fetch") || {};
  } catch (e) {
    return {};
  }
}
function loadNovelStatus() {
  try {
    var lib = require("@libs/novelStatus");
    if (lib && lib.NovelStatus)
      return lib.NovelStatus;
  } catch (e) {
  }
  return {
    Unknown: "Unknown",
    Ongoing: "Ongoing",
    Completed: "Completed",
    Licensed: "Licensed",
    PublishingFinished: "Publishing Finished",
    Cancelled: "Cancelled",
    OnHiatus: "On Hiatus"
  };
}
var fetchLib = loadFetchLib();
var NovelStatus = loadNovelStatus();
var FETCH_TIMEOUT_MS = 3e4;
var MAX_FETCH_ATTEMPTS = 3;
function sleep(ms) {
  return new Promise(function(resolve) {
    if (typeof setTimeout === "function")
      setTimeout(resolve, ms);
    else
      resolve();
  });
}
function withTimeout(p, ms) {
  var timer = void 0;
  var timeout = new Promise(function(_, reject) {
    if (typeof setTimeout === "function") {
      timer = setTimeout(function() {
        return reject(new Error("Request timed out"));
      }, ms);
    }
  });
  var clear = function() {
    if (timer !== void 0)
      clearTimeout(timer);
  };
  return Promise.race([p, timeout]).then(function(v) {
    clear();
    return v;
  }, function(e) {
    clear();
    throw e;
  });
}
function fetchRaw(url) {
  return __awaiter(this, void 0, void 0, function() {
    var res, status_1, text, _a;
    var _b;
    return __generator(this, function(_c) {
      switch (_c.label) {
        case 0:
          if (!(typeof fetchLib.fetchApi === "function")) return [3, 5];
          return [4, fetchLib.fetchApi(url)];
        case 1:
          res = _c.sent();
          status_1 = res && typeof res.status === "number" ? res.status : void 0;
          if (!(res && typeof res.text === "function")) return [3, 3];
          return [4, res.text()];
        case 2:
          _a = _c.sent();
          return [3, 4];
        case 3:
          _a = "";
          _c.label = 4;
        case 4:
          text = _a;
          return [2, { status: status_1, text: text }];
        case 5:
          if (!(typeof fetchLib.fetchText === "function")) return [3, 7];
          _b = {};
          return [4, fetchLib.fetchText(url)];
        case 6:
          return [2, (_b.text = _c.sent(), _b)];
        case 7:
          throw new Error("No fetch implementation provided by the host app");
      }
    });
  });
}
function statusFromError(e) {
  var m = /HTTP (\d{3})/.exec(String(e && e.message || e || ""));
  return m ? parseInt(m[1], 10) : void 0;
}
function fetchText(url) {
  return __awaiter(this, void 0, void 0, function() {
    var lastError, attempt, status_2, res, e_1, msg, retryable;
    return __generator(this, function(_a) {
      switch (_a.label) {
        case 0:
          lastError = new Error("Request failed");
          attempt = 1;
          _a.label = 1;
        case 1:
          if (!(attempt <= MAX_FETCH_ATTEMPTS)) return [3, 7];
          status_2 = void 0;
          _a.label = 2;
        case 2:
          _a.trys.push([2, 4, , 6]);
          return [4, withTimeout(fetchRaw(url), FETCH_TIMEOUT_MS)];
        case 3:
          res = _a.sent();
          status_2 = res.status;
          if (status_2 === 429 || status_2 !== void 0 && status_2 >= 500) {
            throw new Error("Server responded with HTTP " + status_2);
          }
          return [2, res.text];
        case 4:
          e_1 = _a.sent();
          lastError = e_1;
          if (status_2 === void 0)
            status_2 = statusFromError(e_1);
          msg = String(e_1 && e_1.message || e_1 || "");
          retryable = status_2 === void 0 || status_2 === 429 || status_2 >= 500 || /timed out/i.test(msg);
          if (!retryable || attempt === MAX_FETCH_ATTEMPTS)
            return [3, 7];
          return [4, sleep(1e3 * Math.pow(2, attempt - 1) + Math.random() * 500)];
        case 5:
          _a.sent();
          return [3, 6];
        case 6:
          attempt++;
          return [3, 1];
        case 7:
          throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
    });
  });
}
function mapStatus(s) {
  if (s === "Ongoing")
    return NovelStatus.Ongoing;
  if (s === "Completed")
    return NovelStatus.Completed;
  if (s === "Hiatus" || s === "On Hiatus")
    return NovelStatus.OnHiatus;
  if (s === "Cancelled" || s === "Dropped")
    return NovelStatus.Cancelled;
  return NovelStatus.Unknown;
}
var STATUS_FILTER_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Ongoing", value: "Ongoing" },
  { label: "Completed", value: "Completed" },
  { label: "Dropped", value: "Dropped" },
  { label: "Canceled", value: "Canceled" }
];
function extractFilterValue(filters, key) {
  if (!filters || typeof filters !== "object")
    return "";
  var f = filters[key];
  if (f === null || f === void 0)
    return "";
  var v = typeof f === "object" && "value" in f ? f.value : f;
  return typeof v === "string" ? v : "";
}
var WeTriedTLS = (
  /** @class */
  (function() {
    function WeTriedTLS2() {
      var _this = this;
      this.id = "wetriedtls";
      this.name = "We Tried TLS";
      this.icon = "src/en/wetriedtls/icon.png";
      this.site = "https://wetriedtls.com";
      this.version = "1.0.4";
      this.filters = {
        status: {
          type: "Picker",
          label: "Status",
          value: "all",
          options: STATUS_FILTER_OPTIONS
        }
      };
      this.resolveUrl = function(path, _isNovel) {
        return _this.site + "/series/" + path;
      };
    }
    WeTriedTLS2.prototype.popularNovels = function(pageNo, options) {
      return __awaiter(this, void 0, void 0, function() {
        var status, json, page;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              status = extractFilterValue(options && options.filters, "status");
              return [4, fetchText(catalogUrl(pageNo, status))];
            case 1:
              json = _a.sent();
              page = parseQueryResults(json);
              if (pageNo > page.lastPage)
                return [2, []];
              return [2, page.items.map(function(n) {
                return {
                  name: n.title,
                  path: n.slug,
                  cover: coverUrl(n.cover)
                };
              })];
          }
        });
      });
    };
    WeTriedTLS2.prototype.parseNovel = function(novelPath) {
      return __awaiter(this, void 0, void 0, function() {
        var slug, detail, _a, all, pageNo, lastPage, json, page, _i, _b, c, paidPageNo, paidLastPage, json, page, _c, _d, c, e_2, seen, chapters, novel;
        return __generator(this, function(_e) {
          switch (_e.label) {
            case 0:
              slug = novelPath.split("/").filter(Boolean).pop() || "";
              _a = parseSeriesDetail;
              return [4, fetchText(API_BASE + "/series/" + slug)];
            case 1:
              detail = _a.apply(void 0, [_e.sent()]);
              if (!detail)
                throw new Error("Could not load novel details");
              all = [];
              pageNo = 1;
              lastPage = 1;
              _e.label = 2;
            case 2:
              return [4, fetchText(API_BASE + "/chapters/" + detail.id + "?page=" + pageNo + "&perPage=500&order=asc")];
            case 3:
              json = _e.sent();
              page = parseChapterList(json);
              lastPage = page.lastPage;
              for (_i = 0, _b = page.items; _i < _b.length; _i++) {
                c = _b[_i];
                all.push(c);
              }
              pageNo++;
              _e.label = 4;
            case 4:
              if (pageNo <= lastPage) return [3, 2];
              _e.label = 5;
            case 5:
              _e.trys.push([5, 10, , 11]);
              paidPageNo = 1;
              paidLastPage = 1;
              _e.label = 6;
            case 6:
              return [4, fetchText(API_BASE + "/chapters/" + detail.id + "/paid?query=&page=" + paidPageNo + "&perPage=1000&order=asc")];
            case 7:
              json = _e.sent();
              page = parseChapterList(json, true);
              paidLastPage = page.lastPage;
              for (_c = 0, _d = page.items; _c < _d.length; _c++) {
                c = _d[_c];
                all.push(c);
              }
              paidPageNo++;
              _e.label = 8;
            case 8:
              if (paidPageNo <= paidLastPage) return [3, 6];
              _e.label = 9;
            case 9:
              return [3, 11];
            case 10:
              e_2 = _e.sent();
              return [3, 11];
            case 11:
              seen = {};
              chapters = [];
              all.filter(function(c2) {
                if (!c2.slug || seen[c2.slug])
                  return false;
                seen[c2.slug] = true;
                return true;
              }).sort(function(a, b) {
                return a.number - b.number;
              }).forEach(function(c2) {
                chapters.push({
                  name: chapterDisplayName(c2),
                  path: slug + "/" + c2.slug,
                  releaseTime: c2.publishedAt,
                  chapterNumber: c2.number
                });
              });
              novel = {
                path: novelPath,
                name: detail.name,
                status: mapStatus(detail.status)
              };
              if (detail.cover)
                novel.cover = coverUrl(detail.cover);
              if (detail.author)
                novel.author = detail.author;
              if (detail.genres.length)
                novel.genres = detail.genres.join(", ");
              if (detail.summary)
                novel.summary = detail.summary;
              novel.chapters = chapters;
              return [2, novel];
          }
        });
      });
    };
    WeTriedTLS2.prototype.parseChapter = function(chapterPath) {
      return __awaiter(this, void 0, void 0, function() {
        var html, result;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fetchText(this.site + "/series/" + chapterPath)];
            case 1:
              html = _a.sent();
              result = parseChapterContent(html);
              if (result.status === "ok")
                return [2, result.html];
              if (result.status === "premium") {
                return [2, "<p><strong>This chapter is premium on We Tried TLS.</strong></p><p>It requires a paid subscription on the website and cannot be read here. Free chapters of this novel still work.</p>"];
              }
              if (result.status === "notfound") {
                return [2, "<p><strong>This chapter is no longer available on We Tried TLS.</strong></p><p>It may have been removed or moved. Refresh the novel to update the chapter list.</p>"];
              }
              return [2, "<p><strong>Could not load this chapter.</strong></p><p>It may be temporarily unavailable on We Tried TLS.</p>"];
          }
        });
      });
    };
    WeTriedTLS2.prototype.searchNovels = function(searchTerm, pageNo) {
      return __awaiter(this, void 0, void 0, function() {
        var json, page;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fetchText(API_BASE + "/query?adult=true&query_string=" + encodeURIComponent(searchTerm) + "&page=" + pageNo)];
            case 1:
              json = _a.sent();
              page = parseQueryResults(json);
              if (pageNo > page.lastPage)
                return [2, []];
              return [2, page.items.map(function(n) {
                return {
                  name: n.title,
                  path: n.slug,
                  cover: coverUrl(n.cover)
                };
              })];
          }
        });
      });
    };
    return WeTriedTLS2;
  })()
);
var plugin_default = new WeTriedTLS();
exports.default = plugin_default;
try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}
