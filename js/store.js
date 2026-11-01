/* store.js — local-first persistence for settings, watchlist, notes, feedback */
(function (TA) {
  'use strict';
  var U = TA.util;
  var prefix = 'gt.';
  var KEYS = {
    settings: prefix + 'settings.v1',
    watchlist: prefix + 'watchlist.v1',
    recents: prefix + 'recents.v1',
    notes: prefix + 'notes.v1',
    feedback: prefix + 'feedback.v1',
    planLevels: prefix + 'planlevels.v1',
    avKeySession: prefix + 'avkey.session.v1'
  };
  // The old sign-in build scoped data per account under gt.u.<uid>.*. Fold any
  // such profile into the shared local profile, then drop the stored accounts
  // so no credentials linger in the browser.
  var AUTH_KEYS = ['gt.auth.users.v1', 'gt.auth.session.v1', 'gt.auth.throttle.v1', 'gt.auth.lang.v1'];
  var legacyPrefixes = [];
  function addLegacyPrefix(value) {
    if (value && legacyPrefixes.indexOf(value) < 0) legacyPrefixes.push(value);
  }
  var priorSession = U.loadJSON('gt.auth.session.v1', null);
  if (priorSession && priorSession.uid) addLegacyPrefix('gt.u.' + priorSession.uid + '.');
  try {
    for (var keyIndex = 0; keyIndex < localStorage.length; keyIndex++) {
      var match = /^(gt\.u\.[^.]+\.)/.exec(localStorage.key(keyIndex) || '');
      if (match) addLegacyPrefix(match[1]);
    }
  } catch (e) {}

  function mergeUniqueBy(items, incoming, key) {
    var out = Array.isArray(items) ? items.slice() : [];
    (Array.isArray(incoming) ? incoming : []).forEach(function (item) {
      var value = item && item[key];
      var index = out.findIndex(function (existing) { return existing && existing[key] === value; });
      if (index < 0) out.push(item);
      else if ((item.ts || item.addedAt || 0) > (out[index].ts || out[index].addedAt || 0)) out[index] = item;
    });
    return out;
  }

  // Move device-account data to the shared local profile before the sign-in
  // gate is removed.
  var migrations = {
    'settings.v1': function (current, prior) { return Object.assign({}, current || {}, prior || {}); },
    'watchlist.v1': function (current, prior) { return mergeUniqueBy(current, prior, 'symbol'); },
    'recents.v1': function (current, prior) {
      return mergeUniqueBy(current, prior, 'symbol').sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 12);
    },
    'notes.v1': function (current, prior) { return Object.assign({}, current || {}, prior || {}); },
    'feedback.v1': function (current, prior) { return mergeUniqueBy(current, prior, 'id').slice(-300); },
    'planlevels.v1': function (current, prior) { return Object.assign({}, current || {}, prior || {}); }
  };
  legacyPrefixes.forEach(function (legacyPrefix) {
    Object.keys(migrations).forEach(function (suffix) {
      var oldKey = legacyPrefix + suffix;
      var oldValue = U.loadJSON(oldKey, null);
      if (oldValue == null) return;
      var newKey = prefix + suffix;
      var currentValue = U.loadJSON(newKey, null);
      if (U.saveJSON(newKey, migrations[suffix](currentValue, oldValue))) U.remove(oldKey);
    });
    try {
      var oldSecretKey = legacyPrefix + 'avkey.session.v1';
      var oldSecret = sessionStorage.getItem(oldSecretKey);
      if (oldSecret && !sessionStorage.getItem(KEYS.avKeySession)) {
        sessionStorage.setItem(KEYS.avKeySession, oldSecret);
        if (sessionStorage.getItem(KEYS.avKeySession) === oldSecret) sessionStorage.removeItem(oldSecretKey);
      } else {
        sessionStorage.removeItem(oldSecretKey);
      }
    } catch (e) {}
  });
  AUTH_KEYS.forEach(function (key) { U.remove(key); });

  var defaults = {
    onboarded: false,
    experience: 'intermediate',
    markets: ['crypto', 'stocks'],
    horizon: 'swing',
    analysis: 'both',
    risk: 'balanced',
    language: 'en',
    defaultStyle: 'swing',
    dataMode: 'auto',
    avKey: '',
    accountSize: 10000,
    riskPct: 1,
    marketAlertsEnabled: true,
    marketStockAlerts: true,
    marketForexAlerts: true
  };

  function readSessionSecret(key) {
    try { return sessionStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function writeSessionSecret(key, value) {
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
      return true;
    } catch (e) { return false; }
  }

  var savedSettings = U.loadJSON(KEYS.settings, {});
  if (!savedSettings || typeof savedSettings !== 'object' || Array.isArray(savedSettings)) savedSettings = {};
  var hadPersistedKey = Object.prototype.hasOwnProperty.call(savedSettings, 'avKey');
  var avKey = readSessionSecret(KEYS.avKeySession);
  if (!avKey && savedSettings.avKey) {
    avKey = String(savedSettings.avKey);
    writeSessionSecret(KEYS.avKeySession, avKey);
  }
  delete savedSettings.avKey;
  if (hadPersistedKey) U.saveJSON(KEYS.settings, savedSettings);
  var settings = Object.assign({}, defaults, savedSettings, { avKey: avKey });
  var watchlist = U.loadJSON(KEYS.watchlist, []);
  var recents = U.loadJSON(KEYS.recents, []);
  var notes = U.loadJSON(KEYS.notes, {});
  var feedback = U.loadJSON(KEYS.feedback, []);
  var planLevels = U.loadJSON(KEYS.planLevels, {});
  var listeners = [];

  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  function styleForHorizon(h) {
    return h === 'intraday' ? 'day' : h === 'long' ? 'long' : 'swing';
  }

  function persistSettings() {
    var safeSettings = Object.assign({}, settings);
    delete safeSettings.avKey;
    U.saveJSON(KEYS.settings, safeSettings);
  }

  var store = {
    defaults: defaults,
    onChange: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
    },

    /* ---------- settings ---------- */
    settings: function () { return Object.assign({}, settings); },
    updateSettings: function (patch) {
      patch = patch || {};
      if (Object.prototype.hasOwnProperty.call(patch, 'avKey')) {
        settings.avKey = String(patch.avKey || '').trim();
        writeSessionSecret(KEYS.avKeySession, settings.avKey);
      }
      var safePatch = Object.assign({}, patch);
      delete safePatch.avKey;
      settings = Object.assign({}, settings, safePatch);
      persistSettings();
      emit();
      return store.settings();
    },
    completeOnboarding: function (answers) {
      var style = answers.experience === 'beginner'
        ? 'beginner'
        : styleForHorizon(answers.horizon);
      return store.updateSettings(Object.assign({}, answers, {
        onboarded: true,
        defaultStyle: style
      }));
    },
    resetDefaults: function () {
      settings = Object.assign({}, defaults);
      writeSessionSecret(KEYS.avKeySession, '');
      persistSettings();
      emit();
    },

    /* ---------- watchlist ---------- */
    watchlist: function () { return watchlist.slice(); },
    isWatched: function (symbol) {
      return watchlist.some(function (w) { return w.symbol === symbol; });
    },
    toggleWatch: function (symbol, assetClass, coingeckoId, name, exchange) {
      var idx = watchlist.findIndex(function (w) { return w.symbol === symbol; });
      var added;
      if (idx >= 0) {
        watchlist.splice(idx, 1);
        added = false;
      } else {
        watchlist.push({
          symbol: symbol,
          assetClass: assetClass,
          coingeckoId: coingeckoId || null,
          name: name || symbol,
          exchange: exchange || null,
          addedAt: Date.now()
        });
        added = true;
      }
      U.saveJSON(KEYS.watchlist, watchlist);
      emit();
      return added;
    },
    removeWatch: function (symbol) {
      watchlist = watchlist.filter(function (w) { return w.symbol !== symbol; });
      U.saveJSON(KEYS.watchlist, watchlist);
      emit();
    },

    /* ---------- recents ---------- */
    recents: function () { return recents.slice(); },
    addRecent: function (entry) {
      recents = recents.filter(function (r) { return r.symbol !== entry.symbol; });
      recents.unshift(Object.assign({ ts: Date.now() }, entry));
      recents = recents.slice(0, 12);
      U.saveJSON(KEYS.recents, recents);
      emit();
    },

    /* ---------- notes ---------- */
    note: function (symbol) {
      return notes[symbol] || null;
    },
    setNote: function (symbol, text) {
      if (text && text.trim()) {
        notes[symbol] = { text: text.trim().slice(0, 2000), ts: Date.now() };
      } else {
        delete notes[symbol];
      }
      U.saveJSON(KEYS.notes, notes);
      emit();
    },

    /* ---------- feedback ---------- */
    feedback: function () { return feedback.slice().reverse(); },
    addFeedback: function (payload) {
      var id = U.uid();
      feedback.push(Object.assign({ id: id, ts: Date.now() }, payload));
      feedback = feedback.slice(-300);
      U.saveJSON(KEYS.feedback, feedback);
      emit();
      return id;
    },
    updateFeedback: function (id, patch) {
      var item = feedback.find(function (f) { return f.id === id; });
      if (!item) return;
      Object.assign(item, patch);
      U.saveJSON(KEYS.feedback, feedback);
      emit();
    },
    feedbackCount: function () { return feedback.length; },

    /* ---------- custom plan levels ---------- */
    getPlanLevels: function (key) {
      var v = planLevels[key];
      return v ? { stop: v.stop, target: v.target } : null;
    },
    setPlanLevels: function (key, levels) {
      var clean = {};
      if (U.isNum(levels.stop) && levels.stop > 0) clean.stop = levels.stop;
      if (U.isNum(levels.target) && levels.target > 0) clean.target = levels.target;
      if (clean.stop == null && clean.target == null) delete planLevels[key];
      else planLevels[key] = clean;
      U.saveJSON(KEYS.planLevels, planLevels);
      emit();
    },
    clearPlanLevels: function (key) {
      if (!planLevels[key]) return;
      delete planLevels[key];
      U.saveJSON(KEYS.planLevels, planLevels);
      emit();
    },

    /* ---------- maintenance ---------- */
    resetAll: function () {
      Object.keys(KEYS).forEach(function (k) { U.remove(KEYS[k]); });
      writeSessionSecret(KEYS.avKeySession, '');
      settings = Object.assign({}, defaults);
      watchlist = [];
      recents = [];
      notes = {};
      feedback = [];
      planLevels = {};
      emit();
    },
    exportFeedback: function () {
      return JSON.stringify({
        exportedAt: new Date().toISOString(),
        app: 'TIKO MVP',
        note: 'Locally collected feedback. No analytics backend is connected.',
        items: feedback.slice().reverse()
      }, null, 2);
    }
  };

  TA.store = store;
})(window.TA = window.TA || {});
