/* theme.js — dark, light and system appearance preference */
(function (TA) {
  'use strict';

  var PREFS = ['dark', 'light', 'system'];
  var META = { dark: '#07040e', light: '#f4ede0' };
  var watching = false;

  function normalize(pref) {
    return PREFS.indexOf(pref) >= 0 ? pref : 'dark';
  }

  function resolve(pref, systemLight) {
    pref = normalize(pref);
    return pref === 'system' ? (systemLight ? 'light' : 'dark') : pref;
  }

  function lightMedia() {
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: light)')
      : null;
  }

  function apply(pref, doc) {
    doc = doc || document;
    var mq = lightMedia();
    var resolved = resolve(pref, !!(mq && mq.matches));
    doc.documentElement.setAttribute('data-theme', resolved);
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META[resolved]);
    return resolved;
  }

  function current() {
    return normalize(TA.store && TA.store.settings ? TA.store.settings().theme : 'dark');
  }

  function start() {
    apply(current());
    var mq = lightMedia();
    if (watching || !mq) return;
    watching = true;
    var onChange = function () {
      if (current() === 'system') apply('system');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  TA.theme = {
    prefs: PREFS,
    normalize: normalize,
    resolve: resolve,
    apply: apply,
    current: current,
    start: start
  };
})(window.TA = window.TA || {});
