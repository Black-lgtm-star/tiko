/* views/sides.js — buy and sell cases for every supported stock. */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };
  var lang = function () { return TA.i18n.get(); };

  var BOUND = '__sidesBound';
  var state = { loading: false, error: null, result: null };

  function stillHere(root) {
    return !!(root && root.isConnected && root.querySelector('[data-sides-view]'));
  }

  function load(root) {
    if (state.loading) return;
    state.loading = true;
    state.error = null;
    paint(root);
    var assets = TA.recommend.universe();
    Promise.all(assets.map(function (asset) {
      return TA.data.getMarketData(asset, { timeframe: 'daily' }).then(function (payload) {
        var a = TA.analysis.build({
          asset: payload.asset, candles: payload.candles, quote: payload.quote,
          meta: payload.meta, lang: lang()
        });
        return TA.sides.build({
          asset: a.asset, a: a, quote: payload.quote, meta: payload.meta
        }, { lang: lang(), style: 'swing' });
      }).catch(function () { return null; });
    })).then(function (rows) {
      state.loading = false;
      if (!stillHere(root)) return;
      rows = rows.filter(Boolean);
      if (!rows.length) { state.error = 'error'; paint(root); return; }
      rows.sort(function (x, y) {
        var d = Math.abs(y.lean.ratio) - Math.abs(x.lean.ratio);
        return d || x.symbol.localeCompare(y.symbol);
      });
      state.result = {
        rows: rows,
        at: Date.now(),
        buyLeans: rows.filter(function (r) { return r.lean.dir === 'bull'; }).length,
        sellLeans: rows.filter(function (r) { return r.lean.dir === 'bear'; }).length,
        neutral: rows.filter(function (r) { return r.lean.dir !== 'bull' && r.lean.dir !== 'bear'; }).length,
        liveCount: rows.filter(function (r) { return r.dataMode === 'live'; }).length,
        sampleCount: rows.filter(function (r) { return r.dataMode === 'sample'; }).length
      };
      paint(root);
    }).catch(function () {
      state.loading = false;
      if (!stillHere(root)) return;
      state.error = 'error';
      paint(root);
    });
  }

  function heroHtml() {
    var result = state.result;
    return '<section class="hero sides-hero" aria-labelledby="sides-title">' +
      '<div class="hero-inner"><div class="hero-copy">' +
        '<span class="eyebrow hero-kicker"><i class="dot"></i>' + U.esc(T('sides.eyebrow')) + '</span>' +
        '<h1 id="sides-title">' + U.esc(T('sides.title')) + '</h1>' +
        '<p class="hero-sub">' + U.esc(T('sides.lede')) + '</p>' +
        '<div class="hero-actions">' +
          '<button class="btn btn-primary hero-cta" type="button" data-sides-refresh' + (state.loading ? ' disabled' : '') + '>' +
            ui.icon('refresh', 15) + ' ' + U.esc(T(state.loading ? 'sides.refreshing' : 'sides.refresh')) + '</button>' +
          '<a class="btn btn-cyan" href="#/ideas">' + U.esc(T('nav.ideas')) + '</a>' +
        '</div>' +
      '</div>' +
      '<div class="hero-hud" role="list">' +
        '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('sides.hud.stocks')) + '</span><b class="num">' + (result ? result.rows.length : '—') + '</b></div>' +
        '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('sides.hud.buy')) + '</span><b class="num">' + (result ? result.buyLeans : '—') + '</b></div>' +
        '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('sides.hud.sell')) + '</span><b class="num">' + (result ? result.sellLeans : '—') + '</b></div>' +
        '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('sides.hud.neutral')) + '</span><b class="num">' + (result ? result.neutral : '—') + '</b></div>' +
      '</div>' +
    '</div></section>';
  }

  function statusHtml() {
    var result = state.result;
    if (state.loading && !result) {
      return '<div class="sides-status"><span class="spinner"></span><span>' + U.esc(T('sides.loading')) + '</span></div>';
    }
    if (state.error === 'error') {
      return '<div class="sides-status sides-status-error">' + ui.icon('warning', 15) +
        '<span>' + U.esc(T('sides.error')) + '</span></div>';
    }
    if (!result) return '';
    return '<div class="sides-status">' +
      '<span>' + U.esc(T('sides.updated', {
        time: U.fmtDateTime(result.at, lang()),
        n: result.rows.length
      })) + '</span>' +
      ui.modeBadge({ dataMode: result.liveCount > 0 ? 'live' : 'sample' }) +
    '</div>';
  }

  function leanBadge(lean) {
    if (lean.dir === 'bull') return '<span class="badge badge-bull">' + U.esc(T('sides.lean.buy')) + '</span>';
    if (lean.dir === 'bear') return '<span class="badge badge-bear">' + U.esc(T('sides.lean.sell')) + '</span>';
    return '<span class="badge badge-neutral">' + U.esc(T('sides.lean.neutral')) + '</span>';
  }

  function levelCell(labelKey, value) {
    return '<div class="side-level"><span>' + U.esc(T(labelKey)) + '</span>' +
      '<b class="mono">' + U.esc(U.fmtPrice(value, '$', lang())) + '</b></div>';
  }

  function statCell(labelKey, value) {
    return '<div class="side-stat"><span>' + U.esc(T(labelKey)) + '</span>' +
      '<b class="mono">' + U.esc(value) + '</b></div>';
  }

  function caseHtml(row, c) {
    var isLean = (c.side === 'long' && row.lean.dir === 'bull') ||
      (c.side === 'short' && row.lean.dir === 'bear');
    var href = TA.app.analysisUrl(row.asset, 'swing');
    var move = c.gainPct != null && c.lossPct != null
      ? '<p class="side-move">' + U.esc(T('sides.move', {
        gain: c.gainPct.toFixed(1),
        loss: c.lossPct.toFixed(1)
      })) + '</p>'
      : '';
    return '<section class="side-case ' + U.attr(c.side) + (isLean ? ' is-lean' : '') + '" data-side="' + U.attr(c.side) + '">' +
      '<div class="side-head">' +
        '<span class="side-name">' + U.esc(T(c.side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell')) + '</span>' +
        '<span class="badge badge-neutral">' + U.esc(T('plan.state.' + c.state)) + '</span>' +
      '</div>' +
      '<div class="side-levels">' +
        levelCell('sides.entry', c.entry) +
        levelCell('sides.stop', c.stop) +
        levelCell('sides.target', c.target) +
      '</div>' +
      '<div class="side-stats">' +
        statCell('sides.rr', U.isNum(c.rr) ? c.rr.toFixed(1) + ' : 1' : '—') +
        statCell('sides.perShareRisk', U.fmtPrice(c.perShareRisk, '$', lang())) +
        statCell('sides.perShareReward', U.fmtPrice(c.perShareReward, '$', lang())) +
      '</div>' +
      move +
      (c.hypothetical ? '<p class="tiny muted side-note">' + U.esc(T('sides.hypothetical')) + '</p>' : '') +
      '<a class="side-open" href="' + U.attr(href) + '">' + U.esc(T('sides.open')) + ui.icon('arrowRight', 12) + '</a>' +
    '</section>';
  }

  function rowHtml(row) {
    var tone = U.toneClass(row.changePct);
    return '<article class="sides-row" data-sides-symbol="' + U.attr(row.symbol) + '">' +
      '<header class="sides-row-head">' +
        '<div class="sides-id">' +
          '<a class="sides-sym mono" href="' + U.attr(TA.app.analysisUrl(row.asset, 'swing')) + '">' + U.esc(row.symbol) + '</a>' +
          '<span class="sides-name">' + U.esc(row.name) + '</span>' +
          '<span class="sides-sector">' + U.esc(row.sector) + '</span>' +
        '</div>' +
        '<div class="sides-quote">' +
          '<b class="mono">' + U.esc(U.fmtPrice(row.price, '$', lang())) + '</b>' +
          '<span class="' + tone + '">' + U.esc(U.isNum(row.changePct) ? U.fmtPct(row.changePct) : '—') + '</span>' +
        '</div>' +
        leanBadge(row.lean) +
      '</header>' +
      '<div class="sides-cases">' + caseHtml(row, row.buy) + caseHtml(row, row.sell) + '</div>' +
    '</article>';
  }

  function listHtml() {
    var result = state.result;
    if (!result) return '';
    if (!result.rows.length) {
      return '<section class="card edge-violet sides-empty" aria-label="' + U.attr(T('sides.empty')) + '">' +
        '<div class="empty">' + ui.icon('info', 20) + '<span>' + U.esc(T('sides.empty')) + '</span>' +
        '<button class="btn btn-sm" type="button" data-sides-refresh>' + U.esc(T('sides.refresh')) + '</button></div>' +
      '</section>';
    }
    return '<section class="sides-list" aria-label="' + U.attr(T('sides.listLabel')) + '">' +
      result.rows.map(rowHtml).join('') +
    '</section>' +
    (result.sampleCount > 0
      ? '<p class="tiny muted sides-sample-note">' + U.esc(T('sides.sampleNote')) + '</p>'
      : '');
  }

  function howHtml() {
    var factors = ['1', '2', '3'];
    return '<section class="card edge-cyan sides-how" aria-labelledby="sides-how-title">' +
      '<div class="card-head"><div><h2 id="sides-how-title">' + ui.icon('scale', 14) + ' ' + U.esc(T('sides.how.title')) + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('sides.how.body')) + '</p></div>' +
      '<span class="badge badge-neutral">' + U.esc(T('sides.how.badge')) + '</span></div>' +
      '<div class="sides-how-grid">' +
        factors.map(function (n) {
          return '<div class="sides-factor"><b>' + U.esc(T('sides.how.f' + n)) + '</b>' +
            '<span>' + U.esc(T('sides.how.f' + n + '.d')) + '</span></div>';
        }).join('') +
      '</div>' +
      '<p class="tiny muted sides-how-note">' + U.esc(T('sides.how.note')) + '</p>' +
      '<div class="disclaimer">' + ui.icon('warning', 15) + '<div><b>' + U.esc(T('app.disclaimer_short')) + '.</b> ' +
        U.esc(T('sides.disclaimer')) + ' <a href="#" data-open-legal>' + U.esc(T('an.disclaimer_more')) + '</a></div></div>' +
    '</section>';
  }

  function html() {
    return '<div class="wrap page sides-page" data-sides-view>' +
      heroHtml() +
      '<div class="sides-body">' +
        statusHtml() +
        listHtml() +
        howHtml() +
      '</div>' +
    '</div>';
  }

  function paint(root) {
    root.innerHTML = html();
  }

  function bind(root) {
    if (root[BOUND]) return;
    root[BOUND] = true;
    root.addEventListener('click', function (e) {
      if (!stillHere(root)) return;
      if (e.target.closest('[data-sides-refresh]')) { load(root); return; }
      if (e.target.closest('[data-open-legal]')) { e.preventDefault(); ui.legalModal(); }
    });
  }

  function render(root) {
    paint(root);
    bind(root);
    if (!state.result && !state.loading) load(root);
  }

  TA.views = TA.views || {};
  TA.views.sides = { render: render };
})(window.TA = window.TA || {});
