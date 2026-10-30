/* util.js — DOM, formatting, dates, seeded randomness, storage */
(function (TA) {
  'use strict';

  var U = {};

  /* ---------- DOM ---------- */
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.el = function (html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  U.attr = U.esc;
  U.on = function (root, event, selector, fn) {
    root.addEventListener(event, function (e) {
      var target = e.target.closest(selector);
      if (target && root.contains(target)) fn(e, target);
    });
  };
  U.debounce = function (fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  };

  /* ---------- Numbers ---------- */
  U.clamp = function (n, lo, hi) { return Math.min(hi, Math.max(lo, n)); };
  U.round = function (n, d) {
    var f = Math.pow(10, d == null ? 2 : d);
    return Math.round(n * f) / f;
  };
  U.isNum = function (n) { return typeof n === 'number' && isFinite(n); };
  U.sum = function (arr) { return arr.reduce(function (a, b) { return a + b; }, 0); };
  U.mean = function (arr) {
    if (!arr.length) return NaN;
    return U.sum(arr) / arr.length;
  };
  U.stdev = function (arr) {
    if (arr.length < 2) return 0;
    var m = U.mean(arr);
    var v = U.sum(arr.map(function (x) { return (x - m) * (x - m); })) / (arr.length - 1);
    return Math.sqrt(v);
  };
  U.percentileRank = function (arr, v) {
    if (!arr.length) return 0.5;
    var below = 0;
    for (var i = 0; i < arr.length; i++) if (arr[i] <= v) below++;
    return below / arr.length;
  };
  U.median = function (arr) {
    if (!arr.length) return NaN;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };

  U.priceDecimals = function (p) {
    if (!U.isNum(p)) return 2;
    var a = Math.abs(p);
    if (a >= 1000) return 0;
    if (a >= 100) return 2;
    if (a >= 1) return 2;
    if (a >= 0.1) return 4;
    if (a >= 0.001) return 5;
    return 8;
  };

  U.fmtPrice = function (p, currency, lang) {
    if (!U.isNum(p)) return '—';
    var d = U.priceDecimals(p);
    var n = new Intl.NumberFormat(lang || 'en-US', {
      minimumFractionDigits: d, maximumFractionDigits: d
    }).format(p);
    return currency ? currency + ' ' + n : n;
  };

  U.fmtNum = function (n, lang, max) {
    if (!U.isNum(n)) return '—';
    return new Intl.NumberFormat(lang || 'en-US', {
      minimumFractionDigits: 0, maximumFractionDigits: max == null ? 2 : max
    }).format(n);
  };

  U.fmtPct = function (p, opts) {
    if (!U.isNum(p)) return '—';
    var o = opts || {};
    var d = o.decimals == null ? 2 : o.decimals;
    var sign = (o.sign !== false && p > 0) ? '+' : '';
    return sign + p.toFixed(d) + '%';
  };

  U.fmtCompact = function (n, lang) {
    if (!U.isNum(n)) return '—';
    return new Intl.NumberFormat(lang || 'en-US', {
      notation: 'compact', maximumFractionDigits: 2
    }).format(n);
  };

  U.toneClass = function (n) { return n > 0 ? 'up' : n < 0 ? 'down' : 'flat'; };
  U.dirClass = function (dir) { return dir === 'bull' || dir === 'up' ? 'up' : dir === 'bear' || dir === 'down' ? 'down' : 'flat'; };

  /* ---------- Dates ---------- */
  U.now = function () { return Date.now(); };
  U.fmtDate = function (ts, lang, opts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return new Intl.DateTimeFormat(lang || 'en-US', opts || {
      year: 'numeric', month: 'short', day: 'numeric'
    }).format(d);
  };
  U.fmtDateTime = function (ts, lang) {
    if (!ts) return '—';
    return new Intl.DateTimeFormat(lang || 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(ts));
  };
  U.fmtTime = function (ts, lang) {
    if (!ts) return '—';
    return new Intl.DateTimeFormat(lang || 'en-US', {
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(ts));
  };
  U.timeAgo = function (ts, lang) {
    if (!ts) return '—';
    var diff = Math.round((Date.now() - ts) / 1000);
    var rtf = new Intl.RelativeTimeFormat(lang || 'en-US', { numeric: 'auto' });
    if (Math.abs(diff) < 60) return rtf.format(-diff, 'second');
    if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
    if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    return rtf.format(-Math.round(diff / 86400), 'day');
  };
  U.dayKey = function (ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  };

  // New York wall-clock parts, used for equity session context.
  U.nyParts = function (date) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      weekday: 'short', hour: '2-digit', minute: '2-digit'
    });
    var out = {};
    fmt.formatToParts(date || new Date()).forEach(function (p) {
      if (p.type !== 'literal') out[p.type] = p.value;
    });
    return {
      weekday: out.weekday,
      minutes: (parseInt(out.hour, 10) % 24) * 60 + parseInt(out.minute, 10)
    };
  };

  U.usSession = function (date) {
    var p = U.nyParts(date);
    var weekend = p.weekday === 'Sat' || p.weekday === 'Sun';
    var open = 9 * 60 + 30, close = 16 * 60;
    if (weekend) return { state: 'closed', label: 'weekend', nyMinutes: p.minutes };
    if (p.minutes < open - 240) return { state: 'closed', label: 'overnight', nyMinutes: p.minutes };
    if (p.minutes < open) return { state: 'pre', label: 'premarket', nyMinutes: p.minutes };
    if (p.minutes < close) return { state: 'open', label: 'regular hours', nyMinutes: p.minutes };
    if (p.minutes < 20 * 60) return { state: 'post', label: 'after hours', nyMinutes: p.minutes };
    return { state: 'closed', label: 'overnight', nyMinutes: p.minutes };
  };

  /* ---------- Seeded randomness ---------- */
  U.hashStr = function (s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  U.mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.gauss = function (rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  /* ---------- Storage ---------- */
  U.loadJSON = function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      return val == null ? fallback : val;
    } catch (e) { return fallback; }
  };
  U.saveJSON = function (key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  };
  U.remove = function (key) { try { localStorage.removeItem(key); } catch (e) {} };
  U.clipboard = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error('clipboard unavailable'));
  };

  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  // "BTC", "btc/usd", "ETH-USD", "$SOL" -> "BTC" etc.
  U.normalizeSymbol = function (raw) {
    var s = String(raw || '').trim().toUpperCase();
    s = s.replace(/^\$/, '').replace(/[-/].*$/, '').replace(/[^A-Z0-9.]/g, '');
    return s.slice(0, 12);
  };

  // Turn plain analysis-bearing text into safe HTML with glossary hooks.
  U.withTerms = function (t, termKeys) {
    var out = U.esc(t);
    (termKeys || []).forEach(function (k) {
      var re = new RegExp('\\b(' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'gi');
      out = out.replace(re, function (m) {
        return '<span class="term" tabindex="0" data-term="' + U.attr(k.toLowerCase()) + '">' + m + '<i>?</i></span>';
      });
    });
    return out;
  };

  TA.util = U;
})(window.TA = window.TA || {});
