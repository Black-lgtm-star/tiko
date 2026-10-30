/* store.js — local-first persistence for settings, watchlist, notes, feedback */
(function (TA) {
  'use strict';
  var U = TA.util;
  var KEYS = {
    settings: 'gt.settings.v1',
    watchlist: 'gt.watchlist.v1',
    recents: 'gt.recents.v1',
    notes: 'gt.notes.v1',
    feedback: 'gt.feedback.v1'
  };

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
    riskPct: 1
  };

  var settings = Object.assign({}, defaults, U.loadJSON(KEYS.settings, {}));
  var watchlist = U.loadJSON(KEYS.watchlist, []);
  var recents = U.loadJSON(KEYS.recents, []);
  var notes = U.loadJSON(KEYS.notes, {});
  var feedback = U.loadJSON(KEYS.feedback, []);
  var listeners = [];

  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  function styleForHorizon(h) {
    return h === 'intraday' ? 'day' : h === 'long' ? 'long' : 'swing';
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
      settings = Object.assign({}, settings, patch);
      U.saveJSON(KEYS.settings, settings);
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
      U.saveJSON(KEYS.settings, settings);
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

    /* ---------- maintenance ---------- */
    resetAll: function () {
      Object.keys(KEYS).forEach(function (k) { U.remove(KEYS[k]); });
      settings = Object.assign({}, defaults);
      watchlist = [];
      recents = [];
      notes = {};
      feedback = [];
      emit();
    },
    exportFeedback: function () {
      return JSON.stringify({
        exportedAt: new Date().toISOString(),
        app: 'Tiko MVP',
        note: 'Locally collected feedback. No analytics backend is connected.',
        items: feedback.slice().reverse()
      }, null, 2);
    }
  };

  TA.store = store;
})(window.TA = window.TA || {});
