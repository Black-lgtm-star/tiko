/* views/ideas.js — ranked, rules-based stock setups. */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };
  var lang = function () { return TA.i18n.get(); };

  var BOUND = '__ideasBound';
  var state = { loading: false, error: null, result: null };

  function stillHere(root) {
    return !!(root && root.isConnected && root.querySelector('[data-ideas-view]'));
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
        var quote = payload.quote || {};
        var price = U.isNum(quote.price) && quote.price > 0 ? quote.price : null;
        var plan = TA.tradeplan.build(a, {
          lang: lang(), style: 'swing',
          price: price || undefined,
          changePct: quote.changePct,
          asOf: (payload.meta && (payload.meta.providerUpdatedAt || payload.meta.seriesEnd)) || Date.now()
        });
        return {
          asset: a.asset,
          a: a,
          plan: plan,
          price: price || a.facts.price,
          meta: payload.meta
        };
      }).catch(function () { return null; });
    })).then(function (results) {
      state.loading = false;
      if (!stillHere(root)) return;
      var inputs = results.filter(function (r) { return r && r.a && r.plan; });
      if (!inputs.length) { state.error = 'error'; paint(root); return; }
      state.result = TA.recommend.rank(inputs, { max: 6 });
      state.error = state.result.ideas.length ? null : 'empty';
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
    var scored = result ? result.scoredCount : TA.recommend.universe().length;
    var shown = result ? result.ideas.length : '—';
    return '<section class="hero ideas-hero" aria-labelledby="ideas-title">' +
      '<div class="hero-inner"><div class="hero-copy">' +
        '<span class="eyebrow hero-kicker"><i class="dot"></i>' + U.esc(T('ideas.eyebrow')) + '</span>' +
        '<h1 id="ideas-title">' + U.esc(T('ideas.title')) + '</h1>' +
        '<p class="hero-sub">' + U.esc(T('ideas.lede')) + '</p>' +
        '<div class="hero-actions">' +
          '<button class="btn btn-primary hero-cta" type="button" data-ideas-refresh' + (state.loading ? ' disabled' : '') + '>' +
            ui.icon('refresh', 15) + ' ' + U.esc(T(state.loading ? 'ideas.refreshing' : 'ideas.refresh')) + '</button>' +
          '<a class="btn btn-cyan" href="#/sides">' + U.esc(T('nav.sides')) + '</a>' +
          '<a class="btn btn-cyan" href="#/markets">' + U.esc(T('nav.markets')) + '</a>' +
        '</div>' +
      '</div>' +
      '<div class="hero-hud" role="list">' +
        '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('ideas.hud.stocks')) + '</span><b class="num">' + scored + '</b></div>' +
        '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('ideas.hud.shown')) + '</span><b class="num">' + shown + '</b></div>' +
        '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('ideas.hud.rule')) + '</span><b class="num">' + TA.recommend.minScore + '</b>' +
          '<span class="n">' + U.esc(T('ideas.hud.ruleNote')) + '</span></div>' +
      '</div>' +
    '</div></section>';
  }

  function statusHtml() {
    var result = state.result;
    if (state.loading && !result) {
      return '<div class="ideas-status"><span class="spinner"></span><span>' + U.esc(T('ideas.loading')) + '</span></div>';
    }
    if (state.error === 'error') {
      return '<div class="ideas-status ideas-status-error">' + ui.icon('warning', 15) +
        '<span>' + U.esc(T('ideas.error')) + '</span></div>';
    }
    if (!result) return '';
    return '<div class="ideas-status">' +
      '<span>' + U.esc(T('ideas.updated', {
        time: U.fmtDateTime(result.at, lang()),
        n: result.scoredCount,
        shown: result.ideas.length
      })) + '</span>' +
      ui.modeBadge({ dataMode: result.liveCount > 0 ? 'live' : 'sample' }) +
    '</div>';
  }

  function levelCell(labelKey, value) {
    return '<div class="idea-level"><span>' + U.esc(T(labelKey)) + '</span>' +
      '<b class="mono">' + U.esc(U.fmtPrice(value, '$', lang())) + '</b></div>';
  }

  function ideaCard(idea) {
    var sideClass = idea.side === 'short' ? 'badge-bear' : 'badge-bull';
    var href = TA.app.analysisUrl(idea.asset, 'swing');
    var reasons = idea.reasons.length
      ? idea.reasons.map(function (r) {
          return '<li>' + U.esc(T(r.key, r.params)) + '</li>';
        }).join('')
      : '<li>' + U.esc(T('ideas.reason.rules')) + '</li>';
    return '<article class="idea-card tier-' + U.attr(idea.tier) + '" data-idea-symbol="' + U.attr(idea.symbol) + '">' +
      '<div class="idea-rank" aria-hidden="true">' + String(idea.rank).padStart(2, '0') + '</div>' +
      '<div class="idea-main">' +
        '<div class="idea-head">' +
          '<a class="idea-sym mono" href="' + U.attr(href) + '">' + U.esc(idea.symbol) + '</a>' +
          '<span class="idea-name">' + U.esc(idea.name) + '</span>' +
          '<span class="badge ' + sideClass + '">' + U.esc(T('ideas.side.' + idea.side)) + '</span>' +
          '<span class="idea-sector">' + U.esc(idea.sector) + '</span>' +
        '</div>' +
        '<div class="idea-score-row">' +
          '<span class="idea-tier">' + U.esc(T('ideas.tier.' + idea.tier)) + '</span>' +
          '<div class="idea-meter" role="img" aria-label="' + U.attr(T('ideas.scoreAria', { score: idea.score, max: 100 })) + '">' +
            '<span style="width:' + U.clamp(idea.score, 0, 100) + '%"></span></div>' +
          '<b class="idea-score num">' + idea.score + '</b>' +
        '</div>' +
        '<ul class="idea-why">' + reasons + '</ul>' +
        '<p class="tiny muted idea-checks">' +
          U.esc(T('ideas.checks', { passed: idea.checks.passed, total: idea.checks.total })) +
          (idea.state ? ' · ' + U.esc(T('ideas.state.' + idea.state)) : '') +
        '</p>' +
      '</div>' +
      '<div class="idea-levels">' +
        levelCell('ideas.entry', idea.entry) +
        levelCell('ideas.stop', idea.stop) +
        levelCell('ideas.target', idea.target) +
        '<div class="idea-level"><span>' + U.esc(T('ideas.rr')) + '</span>' +
          '<b class="mono">' + U.esc(U.isNum(idea.rr) ? idea.rr.toFixed(1) + ' : 1' : '—') + '</b></div>' +
      '</div>' +
      '<div class="idea-foot">' +
        '<p class="idea-risk">' + ui.icon('warning', 12) + '<span>' + U.esc(T('ideas.riskLabel')) + ' ' +
          U.esc(T(idea.riskKey)) + '</span></p>' +
        '<a class="btn btn-sm btn-cyan" href="' + U.attr(href) + '">' + U.esc(T('ideas.open')) + ui.icon('arrowRight', 12) + '</a>' +
      '</div>' +
    '</article>';
  }

  function listHtml() {
    var result = state.result;
    if (!result) return '';
    if (!result.ideas.length) {
      return '<section class="card edge-violet ideas-empty" aria-label="' + U.attr(T('ideas.empty')) + '">' +
        '<div class="empty">' + ui.icon('info', 20) + '<span>' + U.esc(T('ideas.empty')) + '</span>' +
        '<button class="btn btn-sm" type="button" data-ideas-refresh>' + U.esc(T('ideas.refresh')) + '</button></div>' +
      '</section>';
    }
    return '<section class="ideas-list" aria-label="' + U.attr(T('ideas.listLabel')) + '">' +
      result.ideas.map(ideaCard).join('') +
    '</section>' +
    (result.sampleCount > 0
      ? '<p class="tiny muted ideas-sample-note">' + U.esc(T('ideas.sampleNote')) + '</p>'
      : '');
  }

  function methodHtml() {
    var factors = ['1', '2', '3', '4', '5'];
    return '<section class="card edge-cyan ideas-method" aria-labelledby="ideas-method-title">' +
      '<div class="card-head"><div><h2 id="ideas-method-title">' + ui.icon('scale', 14) + ' ' + U.esc(T('ideas.method.title')) + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('ideas.method.body')) + '</p></div>' +
      '<span class="badge badge-neutral">' + U.esc(T('ideas.method.badge')) + '</span></div>' +
      '<div class="idea-method-grid">' +
        factors.map(function (n) {
          return '<div class="idea-factor"><b>' + U.esc(T('ideas.method.f' + n)) + '</b>' +
            '<span>' + U.esc(T('ideas.method.f' + n + '.d')) + '</span></div>';
        }).join('') +
      '</div>' +
      '<p class="tiny muted ideas-method-note">' + U.esc(T('ideas.method.note')) + '</p>' +
      '<div class="disclaimer">' + ui.icon('warning', 15) + '<div><b>' + U.esc(T('app.disclaimer_short')) + '.</b> ' +
        U.esc(T('ideas.disclaimer')) + ' <a href="#" data-open-legal>' + U.esc(T('an.disclaimer_more')) + '</a></div></div>' +
    '</section>';
  }

  function html() {
    return '<div class="wrap page ideas-page" data-ideas-view>' +
      heroHtml() +
      '<div class="ideas-body">' +
        statusHtml() +
        listHtml() +
        methodHtml() +
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
      if (e.target.closest('[data-ideas-refresh]')) { load(root); return; }
      if (e.target.closest('[data-open-legal]')) { e.preventDefault(); ui.legalModal(); }
    });
  }

  function render(root) {
    paint(root);
    bind(root);
    if (!state.result && !state.loading) load(root);
  }

  TA.views = TA.views || {};
  TA.views.ideas = { render: render };
})(window.TA = window.TA || {});
