/* views/onboarding.js — two-step intake, editable later in Settings */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };

  var EXPERIENCE = ['beginner', 'intermediate', 'advanced'];
  var MARKETS = ['stocks', 'crypto', 'forex', 'options', 'futures'];
  var HORIZONS = ['intraday', 'swing', 'long'];
  var ANALYSIS = ['technical', 'fundamental', 'both'];
  var RISK = ['cautious', 'balanced', 'aggressive'];

  function chip(group, value, label, multi) {
    return '<button type="button" class="chip" data-group="' + group + '" data-value="' + value + '" ' +
      'aria-pressed="false"' + (multi ? ' data-multi="1"' : '') + '>' + U.esc(label) + '</button>';
  }

  function mount(root, onDone) {
    var settings = TA.store.settings();
    var answers = {
      experience: settings.experience || 'intermediate',
      markets: (settings.markets || []).slice(),
      horizon: settings.horizon || 'swing',
      analysis: settings.analysis || 'both',
      risk: settings.risk || 'balanced',
      language: settings.language || 'en'
    };
    var step = 1;
    var error = '';

    if (!answers.markets.length) answers.markets = ['crypto', 'stocks'];

    function paintChips() {
      U.$$('.chip[data-group]', root).forEach(function (b) {
        var g = b.getAttribute('data-group');
        var v = b.getAttribute('data-value');
        var on = g === 'markets' ? answers.markets.indexOf(v) >= 0 : answers[g] === v;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function stepOne() {
      return '<div class="onboard-body">' +
        '<div class="onboard-progress"><i class="on"></i><i></i></div>' +
        '<div style="margin-top:18px"><span class="eyebrow">' + U.esc(T('ob.step', { n: 1, m: 2 })) + '</span></div>' +
        '<h1 id="ob-title" tabindex="-1">' + U.esc(T('ob.title')) + '</h1>' +
        '<p class="onboard-lede">' + U.esc(T('ob.lede')) + '</p>' +
        '<div class="form-grid" style="margin-top:24px">' +
          '<div class="onboard-section" style="margin:0"><div class="lbl"><span>' + U.esc(T('ob.exp.label')) + '</span><small>' + U.esc(T('ob.exp.hint')) + '</small></div>' +
            '<div class="chip-row">' + EXPERIENCE.map(function (v) { return chip('experience', v, T('ob.exp.' + v)); }).join('') + '</div></div>' +
          '<div class="onboard-section" style="margin:0"><div class="lbl"><span>' + U.esc(T('ob.horizon.label')) + '</span><small>' + U.esc(T('ob.horizon.hint')) + '</small></div>' +
            '<div class="chip-row">' + HORIZONS.map(function (v) { return chip('horizon', v, T('ob.horizon.' + v)); }).join('') + '</div></div>' +
          '<div class="onboard-section" style="margin:0"><div class="lbl"><span>' + U.esc(T('ob.analysis.label')) + '</span></div>' +
            '<div class="chip-row">' + ANALYSIS.map(function (v) { return chip('analysis', v, T('ob.analysis.' + v)); }).join('') + '</div></div>' +
          '<div class="onboard-section" style="margin:0"><div class="lbl"><span>' + U.esc(T('ob.risk.label')) + '</span><small>' + U.esc(T('ob.risk.hint')) + '</small></div>' +
            '<div class="chip-row">' + RISK.map(function (v) { return chip('risk', v, T('ob.risk.' + v)); }).join('') + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="onboard-foot">' +
        '<div class="onboard-fine">' + U.esc(T('ob.fine')) + '</div>' +
        '<button class="btn btn-primary" data-next="1">' + U.esc(T('ob.continue')) + ' →</button>' +
      '</div>';
    }

    function stepTwo() {
      return '<div class="onboard-body">' +
        '<div class="onboard-progress"><i class="on"></i><i class="on"></i></div>' +
        '<div style="margin-top:18px"><span class="eyebrow">' + U.esc(T('ob.step', { n: 2, m: 2 })) + '</span></div>' +
        '<h1 id="ob-title" tabindex="-1">' + U.esc(T('ob.markets.label')) + '</h1>' +
        '<p class="onboard-lede">' + U.esc(T('ob.markets.note')) + '</p>' +
        '<div class="onboard-section"><div class="lbl"><span>' + U.esc(T('ob.markets.label')) + '</span><small>' + U.esc(T('ob.markets.hint')) + '</small></div>' +
          '<div class="chip-row">' + MARKETS.map(function (v) { return chip('markets', v, T('ob.market.' + v), true); }).join('') + '</div></div>' +
        '<div class="onboard-section"><div class="lbl"><span>' + U.esc(T('ob.lang.label')) + '</span></div>' +
          '<div class="chip-row">' + TA.i18n.langs.map(function (l) {
            return '<button type="button" class="chip" data-lang="' + l.code + '" aria-pressed="' + (answers.language === l.code) + '">' + U.esc(l.label) + '</button>';
          }).join('') + '</div>' +
          '<div class="help" style="margin-top:8px">' + U.esc(T('ob.lang.note')) + '</div></div>' +
        (error ? '<p class="small" style="color:var(--bear);margin-top:14px">' + U.esc(error) + '</p>' : '') +
      '</div>' +
      '<div class="onboard-foot">' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-ghost" data-back="1">← ' + U.esc(T('ob.back')) + '</button>' +
        '</div>' +
        '<button class="btn btn-primary" data-finish="1">' + U.esc(T('ob.finish')) + '</button>' +
      '</div>';
    }

    function draw() {
      root.innerHTML = '<div class="overlay"><div class="onboard" role="dialog" aria-modal="true" aria-labelledby="ob-title">' +
        '<div class="onboard-head">' +
          '<div class="brand" style="pointer-events:none">' +
            '<span class="brand-mark"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.4 21 7.4v9.2L12 21.6 3 16.6V7.4Z" stroke="#ff2fd0" stroke-width="1.5"/><path d="M3 7.4 12 12.4l9-5" stroke="#29e0ff" stroke-width="1.5"/><path d="M12 12.4v9.2" stroke="#29e0ff" stroke-width="1.5"/></svg></span>' +
            '<span><span class="brand-name">' + U.esc(T('app.name')) + '</span><br><span class="brand-sub">' + U.esc(T('app.tagline')) + '</span></span>' +
          '</div>' +
          '<span class="badge badge-sample">' + U.esc(T('badge.sample')) + ' · MVP</span>' +
        '</div>' +
        (step === 1 ? stepOne() : stepTwo()) +
        '</div></div>';

      paintChips();
      var h = root.querySelector('#ob-title');
      if (h) h.focus({ preventScroll: true });

      U.$$('.chip[data-group]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          var g = b.getAttribute('data-group');
          var v = b.getAttribute('data-value');
          if (g === 'markets') {
            var i = answers.markets.indexOf(v);
            if (i >= 0) answers.markets.splice(i, 1);
            else answers.markets.push(v);
            error = '';
          } else {
            answers[g] = v;
          }
          paintChips();
        });
      });

      U.$$('.chip[data-lang]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          answers.language = b.getAttribute('data-lang');
          TA.i18n.set(answers.language);
          draw();
        });
      });

      var next = root.querySelector('[data-next]');
      if (next) next.addEventListener('click', function () { step = 2; error = ''; draw(); });
      var back = root.querySelector('[data-back]');
      if (back) back.addEventListener('click', function () { step = 1; draw(); });
      var finish = root.querySelector('[data-finish]');
      if (finish) finish.addEventListener('click', function () {
        if (!answers.markets.length) { error = T('ob.err.market'); draw(); return; }
        var defaultStyle = answers.experience === 'beginner'
          ? 'beginner'
          : answers.horizon === 'intraday' ? 'day'
            : answers.horizon === 'long' ? 'long' : 'swing';
        TA.store.updateSettings({
          experience: answers.experience,
          markets: answers.markets.slice(),
          horizon: answers.horizon,
          analysis: answers.analysis,
          risk: answers.risk,
          language: answers.language,
          defaultStyle: defaultStyle,
          onboarded: true
        });
        TA.i18n.set(answers.language);
        root.innerHTML = '';
        onDone && onDone();
      });
    }

    draw();
  }

  TA.views = TA.views || {};
  TA.views.onboarding = { mount: mount };
})(window.TA = window.TA || {});
