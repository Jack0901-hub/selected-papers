/* Selected-papers paging and search.
 *
 * First paint reads data/papers/meta.json and one 20-card page.
 * Load-more reads the next page. A year filter reads year/<year>/N.json.
 * Search reads common.json plus the posting
 * shards for the query, then only the pages that hold candidate cards.
 * It never requests the full catalog. Hits are checked with the caller's
 * token matcher (the same rules as /api/search).
 * file:// cannot fetch local JSON, so each slice also has a .js sibling
 * (window.EBOOK_PAPERS["page/0"]). Only the slice being shown is loaded.
 *
 * This standalone copy keeps one slice tree, data/papers/.
 * http(s) fetches the .json page, subject, and search shards.
 * file:// cannot fetch local JSON, so it loads the matching .js twin
 * (window.EBOOK_PAPERS["page/0"]) and never requests /api/popular or /api/clicks.
 */
(function (root) {
  "use strict";

  function fnv1a(text) {
    var hash = 2166136261;
    var value = String(text || "");
    var index;
    for (index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function shardHex(n, shards) {
    var width = Math.max(2, (Math.max(shards, 1) - 1).toString(16).length);
    var hex = (n >>> 0).toString(16);
    while (hex.length < width) hex = "0" + hex;
    return hex;
  }

  function intersectSorted(left, right) {
    var out = [];
    var i = 0;
    var j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        out.push(left[i]);
        i += 1;
        j += 1;
      } else if (left[i] < right[j]) i += 1;
      else j += 1;
    }
    return out;
  }

  function unionSorted(left, right) {
    var out = [];
    var i = 0;
    var j = 0;
    function push(value) {
      if (!out.length || out[out.length - 1] !== value) out.push(value);
    }
    while (i < left.length || j < right.length) {
      if (j >= right.length || (i < left.length && left[i] < right[j])) {
        push(left[i]);
        i += 1;
      } else if (i >= left.length || right[j] < left[i]) {
        push(right[j]);
        j += 1;
      } else {
        push(left[i]);
        i += 1;
        j += 1;
      }
    }
    return out;
  }

  function gramsOf(token) {
    var text = String(token || "");
    if (!text) return [];
    if (text.length < 3) return [text];
    var out = [];
    var index;
    for (index = 0; index <= text.length - 3; index += 1) out.push(text.substr(index, 3));
    return out;
  }

  function createPapersFeed(opts) {
    var options = opts || {};
    var fetchJson = options.fetchJson;
    var prepare = options.prepare;
    var matches = options.matches || function () { return true; };
    var tokenAlts = options.tokenAlts || function (token) { return [token]; };
    var base = options.base || "data/papers/";
    if (base.charAt(base.length - 1) !== "/") base += "/";

    var meta = null;
    var metaPromise = null;
    var commonSet = null;
    var commonPromise = null;
    var shardCache = Object.create(null);
    var shardOrder = [];
    var shardWait = Object.create(null);
    var pageCache = Object.create(null);
    var pageOrder = [];
    var SCAN_BUDGET = 800;

    function isFilePage() {
      return typeof location !== "undefined" && location.protocol === "file:";
    }

    function papersStore() {
      var host = typeof window !== "undefined" ? window : root;
      if (!host.EBOOK_PAPERS) host.EBOOK_PAPERS = {};
      return host.EBOOK_PAPERS;
    }

    function loadScript(src) {
      return new Promise(function (resolve) {
        var script = document.createElement("script");
        script.src = src;
        script.onload = function () {
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(true);
        };
        script.onerror = function () {
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(false);
        };
        (document.body || document.head || document.documentElement).appendChild(script);
      });
    }

    function loadJson(path) {
      if (!isFilePage()) return Promise.resolve(fetchJson(base + path));
      var key = String(path || "").replace(/\.json$/, "");
      var store = papersStore();
      if (Object.prototype.hasOwnProperty.call(store, key)) {
        return Promise.resolve(store[key]);
      }
      return loadScript(base + key + ".js").then(function (ok) {
        if (!ok) return null;
        store = papersStore();
        if (!Object.prototype.hasOwnProperty.call(store, key)) return null;
        return store[key];
      });
    }

    function remember(cache, order, key, value, limit) {
      cache[key] = value;
      order.push(key);
      while (order.length > limit) {
        var old = order.shift();
        if (old !== key) delete cache[old];
      }
    }

    // 线上使用合并块：10 页一块（200 条），减少静态文件数；file:// 仍逐页读 .js。
    var BLOCK_PAGES = 10;

    function pageSize() {
      return (meta && meta.page_size) || 20;
    }

    function blockOf(path) {
      var parts = String(path || "").split("/");
      var name = parts.pop() || "";
      var page = parseInt(name.replace(/\.json$/, ""), 10);
      if (!isFinite(page) || page < 0) return null;
      return {
        path: parts.join("/") + "/block-" + Math.floor(page / BLOCK_PAGES) + ".json",
        offset: (page % BLOCK_PAGES) * pageSize()
      };
    }

    function loadPage(path) {
      if (Object.prototype.hasOwnProperty.call(pageCache, path)) {
        return Promise.resolve(pageCache[path]);
      }
      // Read one page slice. file:// uses the .js twin; http(s) fetches the .json.
      return loadJson(path).then(function (data) {
        var rows = Array.isArray(data) ? data : null;
        remember(pageCache, pageOrder, path, rows, 8);
        return rows;
      });
    }

    function loadShard(hex) {
      if (Object.prototype.hasOwnProperty.call(shardCache, hex)) {
        return Promise.resolve(shardCache[hex]);
      }
      if (shardWait[hex]) return shardWait[hex];
      var pending = loadJson("g/" + hex + ".json").then(function (data) {
        var doc = data && typeof data === "object" && !Array.isArray(data) ? data : {};
        remember(shardCache, shardOrder, hex, doc, 4);
        delete shardWait[hex];
        return doc;
      }, function (error) {
        delete shardWait[hex];
        throw error;
      });
      shardWait[hex] = pending;
      return pending;
    }

    function load() {
      if (meta) return Promise.resolve(meta);
      if (metaPromise) return metaPromise;
      metaPromise = loadJson("meta.json").then(function (doc) {
        if (!doc || typeof doc !== "object" || !Array.isArray(doc.subjects)) {
          throw new Error("papers meta missing");
        }
        meta = doc;
        return doc;
      });
      return metaPromise;
    }

    function loadCommon() {
      if (commonSet) return Promise.resolve(commonSet);
      if (commonPromise) return commonPromise;
      commonPromise = loadJson("common.json").then(function (rows) {
        var set = Object.create(null);
        var list = Array.isArray(rows) ? rows : [];
        var index;
        for (index = 0; index < list.length; index += 1) set[list[index]] = true;
        commonSet = set;
        return set;
      });
      return commonPromise;
    }

    function slugFor(key) {
      var list = meta.subjects || [];
      var index;
      for (index = 0; index < list.length; index += 1) {
        if (list[index].key === key) return list[index].slug;
      }
      return "";
    }

    function subjectOk(book, subjects) {
      if (!subjects || !subjects.length) return true;
      var value = String((book && book.s) || "");
      var index;
      for (index = 0; index < subjects.length; index += 1) {
        if (subjects[index] === value) return true;
      }
      return false;
    }

    function yearOk(book, years) {
      if (!years || !years.length) return true;
      var value = Number(book && book.year);
      if (!value) return false;
      var index;
      for (index = 0; index < years.length; index += 1) {
        if (Number(years[index]) === value) return true;
      }
      return false;
    }

    function bookKey(book) {
      if (!book) return "row:";
      if (book.id != null && book.id !== "") return "id:" + book.id;
      if (book.ord != null) return "ord:" + book.ord;
      return "t:" + (book.t || "") + "\n" + (book.f || "");
    }

    function loadGram(gram) {
      var shards = meta.shards || 128;
      var hex = shardHex(fnv1a(gram) % shards, shards);
      return loadShard(hex).then(function (doc) {
        var list = doc && doc[gram];
        return Array.isArray(list) ? list : [];
      });
    }

    function altPostings(alt) {
      var grams = gramsOf(alt);
      var rare = [];
      var index;
      for (index = 0; index < grams.length; index += 1) {
        if (!commonSet[grams[index]]) rare.push(grams[index]);
      }
      if (!rare.length) return Promise.resolve({ all: true, ords: null });
      return Promise.all(rare.map(loadGram)).then(function (lists) {
        var acc = lists[0] || [];
        for (index = 1; index < lists.length; index += 1) acc = intersectSorted(acc, lists[index]);
        return { all: false, ords: acc };
      });
    }

    function tokenPostings(token) {
      var alts = tokenAlts(token) || [token];
      if (!alts.length) alts = [token];
      var acc = [];
      function step(index) {
        if (index >= alts.length) return Promise.resolve({ all: false, ords: acc });
        return altPostings(alts[index]).then(function (part) {
          if (part.all) return { all: true, ords: null };
          acc = unionSorted(acc, part.ords || []);
          return step(index + 1);
        });
      }
      return step(0);
    }

    function loadSubjectOrds(subjects) {
      var slugs = [];
      var index;
      for (index = 0; index < subjects.length; index += 1) {
        var slug = slugFor(subjects[index]);
        if (slug) slugs.push(slug);
      }
      if (!slugs.length) return Promise.resolve([]);
      return Promise.all(slugs.map(function (slug) {
        return loadJson("subject/" + encodeURIComponent(slug) + "/ords.json").then(function (rows) {
          return Array.isArray(rows) ? rows : [];
        });
      })).then(function (lists) {
        var acc = lists[0] || [];
        for (index = 1; index < lists.length; index += 1) acc = unionSorted(acc, lists[index]);
        return acc;
      });
    }

    function loadYearOrds(years) {
      var slugs = [];
      var index;
      for (index = 0; index < years.length; index += 1) {
        if (years[index]) slugs.push(String(years[index]));
      }
      if (!slugs.length) return Promise.resolve([]);
      return Promise.all(slugs.map(function (slug) {
        return loadJson("year/" + encodeURIComponent(slug) + "/ords.json").then(function (rows) {
          return Array.isArray(rows) ? rows : [];
        });
      })).then(function (lists) {
        var acc = lists[0] || [];
        for (index = 1; index < lists.length; index += 1) acc = unionSorted(acc, lists[index]);
        return acc;
      });
    }

    function buildPlan(tokens, subjects, years) {
      return loadCommon().then(function () {
        return Promise.all(tokens.map(tokenPostings));
      }).then(function (parts) {
        var ords = null;
        var index;
        for (index = 0; index < parts.length; index += 1) {
          var part = parts[index];
          if (part.all) continue;
          if (!part.ords || !part.ords.length) return { mode: "list", ords: [] };
          ords = ords == null ? part.ords : intersectSorted(ords, part.ords);
          if (!ords.length) return { mode: "list", ords: [] };
        }
        var mode = ords == null ? "scan" : "list";
        var plan = mode === "scan" ? { mode: "scan", ords: null } : { mode: "list", ords: ords };
        var jobs = [];
        if (subjects.length) jobs.push(loadSubjectOrds(subjects));
        if (years.length) jobs.push(loadYearOrds(years));
        if (!jobs.length) return plan;
        return Promise.all(jobs).then(function (masks) {
          var mask = masks[0] || [];
          for (index = 1; index < masks.length; index += 1) mask = intersectSorted(mask, masks[index]);
          if (plan.mode === "scan" || plan.ords == null) return { mode: "list", ords: mask };
          return { mode: "list", ords: intersectSorted(plan.ords, mask) };
        });
      });
    }

    function totalFor(tokens, subjects, years) {
      if (tokens.length) return null;
      var index;
      if (years.length && subjects.length) {
        var cross = meta.year_subjects || null;
        if (!cross) return null;
        var crossed = 0;
        for (index = 0; index < years.length; index += 1) {
          var bag = cross[String(years[index])] || {};
          var subjectIndex;
          for (subjectIndex = 0; subjectIndex < subjects.length; subjectIndex += 1) {
            crossed += bag[subjects[subjectIndex]] || 0;
          }
        }
        return crossed;
      }
      if (years.length) {
        var wantYear = Object.create(null);
        for (index = 0; index < years.length; index += 1) wantYear[String(years[index])] = true;
        var yearTotal = 0;
        var yearList = meta.years || [];
        for (index = 0; index < yearList.length; index += 1) {
          if (wantYear[String(yearList[index].year)]) yearTotal += yearList[index].count || 0;
        }
        return yearTotal;
      }
      if (!subjects.length) return meta.total || 0;
      var want = Object.create(null);
      for (index = 0; index < subjects.length; index += 1) want[subjects[index]] = true;
      var total = 0;
      var list = meta.subjects || [];
      for (index = 0; index < list.length; index += 1) {
        if (want[list[index].key]) total += list[index].count || 0;
      }
      return total;
    }

    function open(spec) {
      var request = spec || {};
      var tokens = request.tokens || [];
      var subjects = request.subjects || [];
      var years = request.years || [];
      var prefer = [];
      var incoming = request.prefer || [];
      var index;
      for (index = 0; index < incoming.length; index += 1) {
        var book = incoming[index];
        if (!book) continue;
        if (!subjectOk(book, subjects) || !yearOk(book, years)) continue;
        if (tokens.length && !matches(book, tokens)) continue;
        prefer.push(book);
      }
      var seen = Object.create(null);
      var queued = [];
      var browse = null;
      var search = null;
      var emitted = 0;
      var planPromise = load().then(function () {
        if (!tokens.length) return { mode: "browse" };
        return buildPlan(tokens, subjects, years);
      });

      function mark(book) {
        var key = bookKey(book);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      }

      function startBrowse() {
        var sources = [];
        var sourceIndex;
        if (years.length) {
          for (sourceIndex = 0; sourceIndex < years.length; sourceIndex += 1) {
            if (!years[sourceIndex]) continue;
            sources.push({
              kind: "year",
              slug: String(years[sourceIndex]),
              page: 0,
              at: 0,
              rows: null,
              eof: false
            });
          }
        } else if (!subjects.length) {
          sources.push({ kind: "page", slug: "", page: 0, at: 0, rows: null, eof: false });
        } else {
          for (sourceIndex = 0; sourceIndex < subjects.length; sourceIndex += 1) {
            var slug = slugFor(subjects[sourceIndex]);
            if (!slug) continue;
            sources.push({ kind: "subject", slug: slug, page: 0, at: 0, rows: null, eof: false });
          }
        }
        return { sources: sources, filterSubject: !!(years.length && subjects.length) };
      }

      function ensureSource(source) {
        if (source.rows && source.at < source.rows.length) return Promise.resolve(true);
        if (source.eof) return Promise.resolve(false);
        var path = source.kind === "year"
          ? "year/" + encodeURIComponent(source.slug) + "/" + source.page + ".json"
          : source.kind === "subject"
            ? "subject/" + encodeURIComponent(source.slug) + "/" + source.page + ".json"
            : "page/" + source.page + ".json";
        return loadPage(path).then(function (rows) {
          if (!rows || !rows.length) {
            source.eof = true;
            source.rows = null;
            return false;
          }
          source.rows = rows;
          source.at = 0;
          source.page += 1;
          return true;
        });
      }

      function pullBrowse() {
        if (!browse) browse = startBrowse();
        var sources = browse.sources;
        if (!sources.length) return Promise.resolve(null);
        return Promise.all(sources.map(ensureSource)).then(function (ready) {
          var best = -1;
          var bestOrd = 0;
          var i;
          for (i = 0; i < sources.length; i += 1) {
            if (!ready[i]) continue;
            var row = sources[i].rows[sources[i].at];
            var ord = row && typeof row.ord === "number" ? row.ord : 0;
            if (best < 0 || ord < bestOrd) {
              best = i;
              bestOrd = ord;
            }
          }
          if (best < 0) return null;
          var chosen = sources[best].rows[sources[best].at];
          sources[best].at += 1;
          if (sources[best].at >= sources[best].rows.length) sources[best].rows = null;
          var book = prepare(chosen);
          if (!book || (browse.filterSubject && !subjectOk(book, subjects))) return pullBrowse();
          return book;
        });
      }

      function takeOrd() {
        var ord;
        if (search.mode === "list" || search.ords) {
          if (!search.ords || search.i >= search.ords.length) return null;
          ord = search.ords[search.i];
          search.i += 1;
          return ord;
        }
        if (search.i >= (meta.total || 0)) return null;
        ord = search.i;
        search.i += 1;
        return ord;
      }

      function ordsRemain() {
        if (search.mode === "list" || search.ords) {
          return search.i < search.ords.length;
        }
        return search.i < (meta.total || 0);
      }

      function loadByOrd(ord) {
        var size = meta.page_size || 20;
        var page = Math.floor(ord / size);
        var at = ord - page * size;
        return loadPage("page/" + page + ".json").then(function (rows) {
          if (!rows || !rows[at]) return null;
          return prepare(rows[at]);
        });
      }

      function pullSearch() {
        function step() {
          if (!ordsRemain()) return Promise.resolve(null);
          if (search.budget <= 0) {
            search.limited = true;
            return Promise.resolve(null);
          }
          var ord = takeOrd();
          search.budget -= 1;
          return loadByOrd(ord).then(function (book) {
            if (!book || !subjectOk(book, subjects) || !yearOk(book, years) || (tokens.length && !matches(book, tokens))) {
              return step();
            }
            return book;
          });
        }
        return step();
      }

      function findNext() {
        if (queued.length) return Promise.resolve(queued.shift());
        if (prefer.length) return Promise.resolve(prefer.shift());
        if (!tokens.length) return pullBrowse();
        return pullSearch();
      }

      function fill(limit) {
        var out = [];
        function step() {
          if (out.length >= limit) return Promise.resolve(out);
          return findNext().then(function (book) {
            if (!book) return out;
            if (!mark(book)) return step();
            out.push(book);
            return step();
          });
        }
        return step();
      }

      function next() {
        var limit = meta.page_size || 20;
        return planPromise.then(function (plan) {
          if (tokens.length && !search) {
            search = {
              mode: plan.mode,
              ords: plan.ords || (plan.mode === "scan" ? null : []),
              i: 0,
              budget: SCAN_BUDGET,
              limited: false
            };
            if (plan.mode === "scan" && plan.ords) search.ords = plan.ords;
          }
          if (search) {
            search.budget = SCAN_BUDGET;
            search.limited = false;
          }
          return fill(limit).then(function (books) {
            emitted += books.length;
            var total = totalFor(tokens, subjects, years);
            if (total != null) {
              return { books: books, more: emitted < total, total: total };
            }
            if (search && search.limited && ordsRemain()) {
              return { books: books, more: true, total: total };
            }
            return findNext().then(function (extra) {
              if (search && search.limited && ordsRemain()) {
                if (extra) queued.unshift(extra);
                return { books: books, more: true, total: total };
              }
              if (extra) queued.unshift(extra);
              return { books: books, more: !!extra, total: total };
            });
          });
        });
      }

      return { next: next };
    }

    return {
      load: load,
      open: open,
      meta: function () { return meta; }
    };
  }

  var api = {
    createPapersFeed: createPapersFeed,
    fnv1a: fnv1a,
    shardHex: shardHex,
    gramsOf: gramsOf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PapersFeed = api;
})(typeof window !== "undefined" ? window : globalThis);
