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
var MAX_RESPONSE_CHARS = 1e7;
function catalogUrl(pageNo, status) {
  var url = API_BASE + "/query?adult=true&query_string=&page=" + pageNo;
  var s = (status || "").trim();
  if (s && s !== "all")
    url += "&status=" + encodeURIComponent(s);
  return url;
}
function extractFlightText(html) {
  if (html.length > MAX_RESPONSE_CHARS)
    throw new Error("Page too large to parse safely");
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
  return decodeEntitiesOnce(s);
}
function stripHtml(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")).replace(/[ \t\u00a0]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_a) {
    return null;
  }
}
function isRecord(v) {
  return typeof v === "object" && v !== null;
}
function str(v) {
  return typeof v === "string" ? v : "";
}
function parseQueryResults(jsonText) {
  var root = safeJson(jsonText);
  var items = [];
  var lastPage = 1;
  if (isRecord(root)) {
    lastPage = readLastPage(root);
    var data = Array.isArray(root.data) ? root.data : [];
    for (var _i = 0, data_1 = data; _i < data_1.length; _i++) {
      var it = data_1[_i];
      if (!isRecord(it))
        continue;
      if (it.series_type && it.series_type !== "Novel")
        continue;
      var slug = str(it.series_slug).trim();
      var title = str(it.title).trim();
      if (!slug || !title)
        continue;
      items.push({
        slug: slug,
        title: decodeEntities(title),
        cover: str(it.thumbnail).trim()
      });
    }
  }
  return { items: items, lastPage: lastPage };
}
function parseChapterList(jsonText, locked) {
  if (locked === void 0) {
    locked = false;
  }
  if (!jsonText || !jsonText.trim()) {
    throw new Error("Empty response while fetching the chapter list");
  }
  var root = safeJson(jsonText);
  if (!isRecord(root) || !Array.isArray(root.data)) {
    throw new Error("Invalid chapter-list response (not the expected JSON)");
  }
  var items = [];
  var lastPage = readLastPage(root);
  for (var _i = 0, _a = root.data; _i < _a.length; _i++) {
    var c = _a[_i];
    if (!isRecord(c))
      continue;
    var slug = str(c.chapter_slug).trim();
    var name_1 = str(c.chapter_name).trim();
    if (!slug || !name_1)
      continue;
    var title = str(c.chapter_title).trim();
    var idx = parseFloat(str(c.index));
    items.push({
      slug: slug,
      name: title ? name_1 + ": " + decodeEntities(title) : name_1,
      number: isNaN(idx) ? 0 : idx,
      publishedAt: str(c.created_at),
      locked: locked
    });
  }
  if (root.data.length > 0 && items.length === 0) {
    throw new Error("Invalid chapter-list response (no usable entries)");
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
function shrinkIllustrations(html) {
  return html.replace(/<img\b([^>]*?)\bsrc="(https?:\/\/media\.reaperscans\.net\/[^"]+)"([^>]*?)>/gi, function(_m, pre, src, post) {
    return "<img" + pre + ' src="' + proxiedImageUrl(src, 800) + '"' + post + ">";
  });
}
function parseSeriesDetail(jsonText) {
  var s = safeJson(jsonText);
  if (!isRecord(s) || typeof s.id !== "number")
    return null;
  var tags = Array.isArray(s.tags) ? s.tags : [];
  return {
    id: s.id,
    name: decodeEntities(str(s.title)),
    author: decodeEntities(str(s.author)),
    genres: tags.map(function(t) {
      return isRecord(t) ? decodeEntities(str(t.name)) : "";
    }).filter(function(g) {
      return g.length > 0;
    }),
    status: str(s.status),
    cover: str(s.thumbnail).trim(),
    summary: stripHtml(str(s.description))
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
function isTitleRepeat(p, knownTitles) {
  var inner = p.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "").trim();
  if (!/^<strong>[\s\S]*<\/strong>$/.test(inner))
    return false;
  if (!knownTitles || knownTitles.length === 0)
    return false;
  var text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim().toLowerCase();
  return knownTitles.some(function(t) {
    return t.trim().toLowerCase() === text;
  });
}
function isCreditLine(p) {
  var t = paragraphText(p);
  return /^(translator|editor|proofreader|typesetter)\s*:/i.test(t);
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
var NAMED_ENTITIES = {
  Tab: "	",
  NewLine: "\n",
  colon: ":",
  semi: ";",
  comma: ",",
  period: ".",
  sol: "/",
  bsol: "\\",
  plus: "+",
  equals: "=",
  lpar: "(",
  rpar: ")",
  excl: "!",
  quest: "?",
  num: "#",
  percnt: "%",
  dollar: "$",
  ast: "*",
  commat: "@",
  Hat: "^",
  lowbar: "_",
  grave: "`",
  lcub: "{",
  rcub: "}",
  lsqb: "[",
  rsqb: "]",
  verbar: "|",
  tilde: "~",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  laquo: "\xAB",
  raquo: "\xBB",
  middot: "\xB7",
  bull: "\u2022",
  dagger: "\u2020",
  deg: "\xB0",
  plusmn: "\xB1",
  times: "\xD7",
  divide: "\xF7",
  minus: "\u2212",
  infin: "\u221E",
  ne: "\u2260",
  le: "\u2264",
  ge: "\u2265"
};
function decodeEntitiesOnce(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+)(;?)/gi, function(m, body, semi, offset, whole) {
    if (body.charAt(0) === "#") {
      var hex = body.charAt(1) === "x" || body.charAt(1) === "X";
      var code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!isNaN(code) && code > 0 && code <= 1114111)
        return String.fromCodePoint(code);
      return m;
    }
    var named = Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : void 0;
    if (named === void 0)
      return m;
    if (!semi) {
      var legacy = body === "amp" || body === "lt" || body === "gt" || body === "quot";
      var next = whole.charAt(offset + m.length);
      if (!legacy || /[0-9a-zA-Z=]/.test(next))
        return m;
    }
    return named;
  });
}
function safeUrl(rawValue, allowMailto) {
  var decoded = decodeEntitiesOnce(rawValue).replace(/[\t\n\r]/g, "");
  var trimmed = decoded.replace(/^[\u0000-\u0020]+/, "");
  var m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (!m)
    return trimmed;
  var scheme = m[1].toLowerCase();
  if (scheme === "http" || scheme === "https")
    return trimmed;
  if (allowMailto && scheme === "mailto")
    return trimmed;
  return null;
}
function escapeAttrValue(v) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function parseTag(html, lt) {
  var n = html.length;
  var c1 = html.charAt(lt + 1);
  if (c1 === "!" || c1 === "?") {
    if (html.startsWith("<!--", lt)) {
      var close_1 = html.indexOf("-->", lt + 4);
      return {
        kind: "comment",
        name: "",
        attrs: [],
        selfClosing: false,
        unterminated: false,
        end: close_1 === -1 ? n : close_1 + 3
      };
    }
    var gt = html.indexOf(">", lt + 2);
    return {
      kind: "comment",
      name: "",
      attrs: [],
      selfClosing: false,
      unterminated: false,
      end: gt === -1 ? n : gt + 1
    };
  }
  var i = lt + 1;
  var kind = "open";
  if (c1 === "/") {
    kind = "close";
    i = lt + 2;
  }
  if (!/[a-zA-Z]/.test(html.charAt(i)))
    return null;
  var name = "";
  while (i < n && /[a-zA-Z0-9-]/.test(html.charAt(i))) {
    name += html.charAt(i).toLowerCase();
    i++;
  }
  if (kind === "close") {
    var gt = html.indexOf(">", i);
    return {
      kind: kind,
      name: name,
      attrs: [],
      selfClosing: false,
      unterminated: gt === -1,
      end: gt === -1 ? n : gt + 1
    };
  }
  var attrs = [];
  var selfClosing = false;
  var unterminated = true;
  while (i < n) {
    while (i < n && /\s/.test(html.charAt(i)))
      i++;
    if (i >= n)
      break;
    var ch = html.charAt(i);
    if (ch === ">") {
      unterminated = false;
      i++;
      break;
    }
    if (ch === "/") {
      if (html.charAt(i + 1) === ">") {
        selfClosing = true;
        unterminated = false;
        i += 2;
        break;
      }
      i++;
      continue;
    }
    var aname = "";
    while (i < n && !/[\s=/>]/.test(html.charAt(i))) {
      aname += html.charAt(i).toLowerCase();
      i++;
    }
    while (i < n && /\s/.test(html.charAt(i)))
      i++;
    var value = null;
    if (html.charAt(i) === "=") {
      i++;
      while (i < n && /\s/.test(html.charAt(i)))
        i++;
      var q = html.charAt(i);
      if (q === '"' || q === "'") {
        var start = ++i;
        while (i < n && html.charAt(i) !== q)
          i++;
        value = html.slice(start, i);
        if (i < n)
          i++;
      } else {
        var start = i;
        while (i < n && !/[\s>]/.test(html.charAt(i)))
          i++;
        value = html.slice(start, i);
      }
    }
    if (aname)
      attrs.push({ name: aname, value: value });
  }
  return { kind: kind, name: name, attrs: attrs, selfClosing: selfClosing, unterminated: unterminated, end: i };
}
var SANITIZE_RAWTEXT = /* @__PURE__ */ new Set(["script", "style", "textarea", "title"]);
function skipElementContent(html, from, name) {
  var rawText = SANITIZE_RAWTEXT.has(name);
  var depth = 1;
  var i = from;
  while (i < html.length) {
    var lt = html.indexOf("<", i);
    if (lt === -1)
      return html.length;
    var tag = parseTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    i = tag.end;
    if (tag.name !== name || tag.kind === "comment")
      continue;
    if (tag.kind === "close") {
      depth--;
      if (depth === 0)
        return i;
    } else if (!rawText && !tag.selfClosing) {
      depth++;
    }
  }
  return html.length;
}
var SANITIZE_ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
]);
var SANITIZE_DROP_CONTENT = /* @__PURE__ */ new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "button",
  "select",
  "textarea",
  "input",
  "link",
  "meta",
  "base",
  "noscript",
  "template",
  "svg",
  "math",
  "title",
  "frame",
  "frameset",
  "applet",
  "audio",
  "video",
  "source",
  "track"
]);
var SANITIZE_VOID = /* @__PURE__ */ new Set([
  "br",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "base",
  "embed",
  "source",
  "track",
  "wbr",
  "col",
  // `frame` is void too (no closing tag exists): without it here, a stray
  // <frame> makes the drop-with-content skipper scan to end of input and
  // swallow the rest of the chapter.
  "frame"
]);
var SANITIZE_ALLOWED_ATTRS = {
  a: /* @__PURE__ */ new Set(["href", "title"]),
  img: /* @__PURE__ */ new Set(["src", "alt", "title", "width", "height"]),
  td: /* @__PURE__ */ new Set(["colspan", "rowspan"]),
  th: /* @__PURE__ */ new Set(["colspan", "rowspan"]),
  ol: /* @__PURE__ */ new Set(["start"]),
  li: /* @__PURE__ */ new Set(["value"])
};
function sanitizeAttrs(tagName, tag) {
  var allowed = SANITIZE_ALLOWED_ATTRS[tagName];
  if (!allowed)
    return "";
  var out = "";
  var emitted = /* @__PURE__ */ new Set();
  for (var _i = 0, _a = tag.attrs; _i < _a.length; _i++) {
    var attr = _a[_i];
    if (!allowed.has(attr.name) || emitted.has(attr.name))
      continue;
    emitted.add(attr.name);
    var value = attr.value === null ? "" : attr.value;
    if (attr.name === "href" || attr.name === "src") {
      var safe = safeUrl(value, attr.name === "href");
      if (safe === null)
        continue;
      out += " " + attr.name + '="' + escapeAttrValue(safe) + '"';
    } else {
      out += " " + attr.name + '="' + escapeAttrValue(decodeEntitiesOnce(value)) + '"';
    }
  }
  return out;
}
function sanitizeHtml(html) {
  var out = "";
  var i = 0;
  var n = html.length;
  while (i < n) {
    var lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    var tag = parseTag(html, lt);
    if (!tag) {
      out += "<";
      i = lt + 1;
      continue;
    }
    i = tag.end;
    if (tag.kind === "comment" || tag.unterminated)
      continue;
    if (SANITIZE_DROP_CONTENT.has(tag.name)) {
      if (tag.kind === "open" && !tag.selfClosing && !SANITIZE_VOID.has(tag.name)) {
        i = skipElementContent(html, i, tag.name);
      }
      continue;
    }
    if (!SANITIZE_ALLOWED_TAGS.has(tag.name))
      continue;
    if (tag.kind === "close") {
      out += "</" + tag.name + ">";
    } else {
      out += "<" + tag.name + sanitizeAttrs(tag.name, tag) + ">";
    }
  }
  return out;
}
function readLastPage(root) {
  var meta = root.meta;
  if (meta === void 0 || meta === null)
    return 1;
  if (!isRecord(meta))
    throw new Error("Invalid API response (bad metadata)");
  var lp = meta.last_page;
  if (lp === void 0)
    return 1;
  if (typeof lp !== "number" || !(lp >= 1))
    throw new Error("Invalid API response (bad last_page)");
  return Math.floor(lp);
}
function noBodyStatus(html) {
  if (/this chapter is premium!/i.test(html))
    return { status: "premium" };
  var title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title && /^\s*404/i.test(title[1]))
    return { status: "notfound" };
  return { status: "empty" };
}
function parseChapterContent(html, knownTitles) {
  var flight = extractFlightText(html);
  var contentM = /"chapter_content":"((?:[^"\\]|\\.)*)"/.exec(flight);
  if (!contentM)
    return noBodyStatus(html);
  var raw;
  try {
    raw = JSON.parse('"' + contentM[1] + '"');
  } catch (_a) {
    return noBodyStatus(html);
  }
  var payload;
  var rowRef = /^\$([0-9a-z]{1,4})$/.exec(raw);
  if (rowRef) {
    var rowRe = new RegExp("\\n" + rowRef[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":T([0-9a-f]+),");
    var row = rowRe.exec(flight);
    if (!row)
      return noBodyStatus(html);
    var byteLen = parseInt(row[1], 16);
    if (!(byteLen > 0))
      return noBodyStatus(html);
    var payloadStart = row.index + row[0].length;
    payload = sliceUtf8Bytes(flight, payloadStart, byteLen);
  } else if (/^\s*</.test(raw)) {
    payload = raw;
  } else {
    return noBodyStatus(html);
  }
  if (!payload)
    return { status: "empty" };
  var body = payload.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n").trim();
  if (!body)
    return { status: "empty" };
  var blocks = [];
  var blockRe = /<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>|<table[\s\S]*?<\/table>|<blockquote[\s\S]*?<\/blockquote>|<div[\s\S]*?<\/div>|<p[\s\S]*?<\/p>|<h[1-6][\s\S]*?<\/h[1-6]>|<figure[\s\S]*?<\/figure>|<img[^>]*>/gi;
  var last = 0;
  var bm;
  while ((bm = blockRe.exec(body)) !== null) {
    var gap = body.slice(last, bm.index);
    if (gap.replace(/<[^>]+>/g, "").trim())
      blocks.push(gap.trim());
    blocks.push(bm[0]);
    last = bm.index + bm[0].length;
  }
  var tail = body.slice(last);
  if (tail.replace(/<[^>]+>/g, "").trim())
    blocks.push(tail.trim());
  if (blocks.length === 0)
    blocks.push(body);
  var start = 0;
  var end = blocks.length;
  var isEdgeJunk = function(p) {
    return isPromoParagraph(p) || isCreditLine(p) || isTitleRepeat(p, knownTitles);
  };
  while (start < end && isEdgeJunk(blocks[start]))
    start++;
  while (end > start && isEdgeJunk(blocks[end - 1]))
    end--;
  var cleaned = blocks.slice(start, end).join("\n");
  if (!paragraphText(cleaned) && !/<img[\s>]/i.test(cleaned))
    return { status: "empty" };
  return { status: "ok", html: sanitizeHtml(shrinkIllustrations(cleaned)) };
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
function fetchApiText(url) {
  return __awaiter(this, void 0, void 0, function() {
    var text;
    return __generator(this, function(_a) {
      switch (_a.label) {
        case 0:
          return [4, fetchText(url)];
        case 1:
          text = _a.sent();
          if (text.length > MAX_RESPONSE_CHARS)
            throw new Error("Response too large to parse safely");
          return [2, text];
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
var MAX_TITLE_CACHE_ENTRIES = 4e3;
var MAX_LIST_PAGES = 200;
var WeTriedTLS = (
  /** @class */
  (function() {
    function WeTriedTLS2() {
      var _this = this;
      this.id = "wetriedtls";
      this.name = "We Tried TLS";
      this.icon = "src/en/wetriedtls/icon.png";
      this.site = "https://wetriedtls.com";
      this.version = "1.0.7";
      this.chapterTitles = /* @__PURE__ */ new Map();
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
    WeTriedTLS2.prototype.rememberTitles = function(path, titles) {
      this.chapterTitles.set(path, titles);
      while (this.chapterTitles.size > MAX_TITLE_CACHE_ENTRIES) {
        var oldest = this.chapterTitles.keys().next();
        if (oldest.done)
          break;
        this.chapterTitles.delete(oldest.value);
      }
    };
    WeTriedTLS2.prototype.popularNovels = function(pageNo, options) {
      return __awaiter(this, void 0, void 0, function() {
        var status, json, page;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              status = extractFilterValue(options && options.filters, "status");
              return [4, fetchApiText(catalogUrl(pageNo, status))];
            case 1:
              json = _a.sent();
              page = parseQueryResults(json);
              if (pageNo > page.lastPage)
                return [2, []];
              return [2, page.items.map(function(n) {
                return {
                  name: n.title,
                  path: n.slug,
                  cover: n.cover
                };
              })];
          }
        });
      });
    };
    WeTriedTLS2.prototype.parseNovel = function(novelPath) {
      return __awaiter(this, void 0, void 0, function() {
        var slug, detail, _a, all, pageNo, lastPage, json, page, _i, _b, c, paidPageNo, paidLastPage, json, page, _c, _d, c, e_2, seen, chapters, novel;
        var _this = this;
        return __generator(this, function(_e) {
          switch (_e.label) {
            case 0:
              slug = novelPath.split("/").filter(Boolean).pop() || "";
              _a = parseSeriesDetail;
              return [4, fetchApiText(API_BASE + "/series/" + slug)];
            case 1:
              detail = _a.apply(void 0, [_e.sent()]);
              if (!detail)
                throw new Error("Could not load novel details");
              all = [];
              pageNo = 1;
              lastPage = 1;
              _e.label = 2;
            case 2:
              if (pageNo > MAX_LIST_PAGES)
                throw new Error("Chapter list pagination did not terminate");
              return [4, fetchApiText(API_BASE + "/chapters/" + detail.id + "?page=" + pageNo + "&perPage=500&order=asc")];
            case 3:
              json = _e.sent();
              if (!json || !json.trim())
                throw new Error("Failed to load the chapter list (page " + pageNo + ")");
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
              if (paidPageNo > MAX_LIST_PAGES)
                throw new Error("Paid chapter list pagination did not terminate");
              return [4, fetchApiText(API_BASE + "/chapters/" + detail.id + "/paid?query=&page=" + paidPageNo + "&perPage=1000&order=asc")];
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
              seen = /* @__PURE__ */ new Set();
              chapters = [];
              all.filter(function(c2) {
                if (!c2.slug || seen.has(c2.slug))
                  return false;
                seen.add(c2.slug);
                return true;
              }).sort(function(a, b) {
                return a.number - b.number;
              }).forEach(function(c2) {
                var displayName = chapterDisplayName(c2);
                var chapterPath = slug + "/" + c2.slug;
                chapters.push({
                  name: displayName,
                  path: chapterPath,
                  releaseTime: c2.publishedAt,
                  chapterNumber: c2.number
                });
                _this.rememberTitles(chapterPath, [
                  detail.name,
                  displayName.replace(/^🔒\s*/, "")
                ]);
              });
              novel = {
                path: novelPath,
                name: detail.name,
                status: mapStatus(detail.status)
              };
              if (detail.cover)
                novel.cover = detail.cover;
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
              result = parseChapterContent(html, this.chapterTitles.get(chapterPath));
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
              return [4, fetchApiText(API_BASE + "/query?adult=true&query_string=" + encodeURIComponent(searchTerm) + "&page=" + pageNo)];
            case 1:
              json = _a.sent();
              page = parseQueryResults(json);
              if (pageNo > page.lastPage)
                return [2, []];
              return [2, page.items.map(function(n) {
                return {
                  name: n.title,
                  path: n.slug,
                  cover: n.cover
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
