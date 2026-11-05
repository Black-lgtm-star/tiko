/* views/dashboard.js */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };
  var lang = function () { return TA.i18n.get(); };
  var lastQuotes = {};

  function greeting() {
    var h = new Date().getHours();
    return T(h < 12 ? 'dash.good_morning' : h < 18 ? 'dash.good_afternoon' : 'dash.good_evening');
  }

  function heroBlock(dateLabel) {
    var watch = TA.store.watchlist().length;
    return '<section class="hero" aria-labelledby="hero-title">' +
      '<img class="hero-art" src="assets/img/hero-portal.jpg" alt="" aria-hidden="true" decoding="async" />' +
      '<div class="hero-scrim" aria-hidden="true"></div>' +
      '<div class="hero-inner">' +
        '<div class="hero-copy">' +
          '<span class="eyebrow hero-kicker"><i class="dot"></i>' + U.esc(greeting()) + ' · ' + U.esc(dateLabel) + '</span>' +
          '<h1 id="hero-title">' + U.esc(T('dash.hero.title')) + '</h1>' +
          '<p class="hero-sub">' + U.esc(T('app.promise')) + '</p>' +
          '<div class="hero-actions">' +
            '<button class="btn btn-primary hero-cta" data-focus-search>' + U.esc(T('nav.analyze')) + ui.icon('arrowRight', 15) + '</button>' +
            '<a class="btn btn-cyan" href="#/ideas">' + ui.icon('starFill', 14) + ' ' + U.esc(T('nav.ideas')) + '</a>' +
            '<a class="btn btn-cyan" href="#/markets">' + U.esc(T('nav.markets')) + '</a>' +
            '<button class="btn btn-cyan" data-scroll-how>' + U.esc(T('dash.hero.how')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="hero-hud" role="list">' +
          '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('dash.hero.watch')) + '</span><b class="num">' + watch + '</b></div>' +
          '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('dash.hero.lenses')) + '</span><b class="num">6</b></div>' +
          '<div class="hud-stat" role="listitem"><span class="k">' + U.esc(T('dash.hero.orders')) + '</span><b class="num">0</b><span class="n">' + U.esc(T('dash.hero.orders.note')) + '</span></div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function stockDirectoryCard() {
    var live = TA.store.settings().dataMode !== 'sample' && navigator.onLine !== false;
    return '<section class="card stock-directory span-12 edge-cyan" aria-labelledby="stock-directory-title">' +
      '<div class="card-head stock-directory-head"><div><h2 id="stock-directory-title">' + U.esc(T('dash.stocks.title')) + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('dash.stocks.lede')) + '</p></div>' +
      (live
        ? '<span class="badge badge-live"><i class="dot pulse"></i>' + U.esc(T('dash.stocks.badge')) + '</span>'
        : '<span class="badge badge-sample">' + U.esc(T('badge.sample')) + '</span>') + '</div>' +
      '<form class="stock-directory-form" data-stock-search role="search">' +
        '<input class="input" type="search" id="stock-directory-query" minlength="2" maxlength="80" autocomplete="off" ' +
          'placeholder="' + U.attr(T('dash.stocks.placeholder')) + '" aria-label="' + U.attr(T('dash.stocks.placeholder')) + '" required />' +
        '<button class="btn btn-cyan" type="submit" data-stock-submit>' + ui.icon('search', 15) + ' ' + U.esc(T('dash.stocks.search')) + '</button>' +
      '</form>' +
      '<div class="stock-directory-status tiny muted" data-stock-status aria-live="polite">' + U.esc(T('dash.stocks.hint')) + '</div>' +
      '<div class="stock-directory-results" data-stock-results></div>' +
      '<p class="tiny muted stock-directory-foot">' + U.esc(T(live ? 'dash.stocks.note' : 'dash.stocks.note_sample')) + '</p>' +
    '</section>';
  }

  function forexCard() {
    var currencies = ['USD', 'ZAR', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'INR', 'BRL', 'MXN', 'SGD', 'HKD', 'SEK', 'NOK', 'KRW'];
    function options(selected) {
      return currencies.map(function (code) {
        return '<option value="' + code + '"' + (code === selected ? ' selected' : '') + '>' + code + '</option>';
      }).join('');
    }
    return '<section class="card forex-card span-12 edge-violet" aria-labelledby="forex-title">' +
      '<div class="card-head forex-head"><div><h2 id="forex-title">' + U.esc(T('dash.fx.title')) + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('dash.fx.lede')) + '</p></div><span class="badge badge-neutral">' + U.esc(T('dash.fx.badge')) + '</span></div>' +
      '<form class="forex-controls" data-fx-form>' +
        '<label class="tiny muted" for="fx-provider">' + U.esc(T('dash.fx.source')) + '</label>' +
        '<select class="input" id="fx-provider" data-fx-provider><option value="">' + U.esc(T('dash.fx.blended')) + '</option></select>' +
        '<label class="tiny muted" for="fx-from">' + U.esc(T('dash.fx.from')) + '</label>' +
        '<select class="input" id="fx-from" data-fx-from>' + options('USD') + '</select>' +
        '<span class="forex-separator" aria-hidden="true">/</span>' +
        '<label class="tiny muted" for="fx-to">' + U.esc(T('dash.fx.to')) + '</label>' +
        '<select class="input" id="fx-to" data-fx-to>' + options('ZAR') + '</select>' +
        '<label class="tiny muted" for="fx-amount">' + U.esc(T('dash.fx.amount')) + '</label>' +
        '<input class="input" id="fx-amount" data-fx-amount type="number" min="0" step="any" inputmode="decimal" value="10" aria-label="' + U.attr(T('dash.fx.amount')) + '" />' +
        '<button class="btn btn-primary" type="submit" data-fx-submit>' + ui.icon('pulse', 15) + ' ' + U.esc(T('dash.fx.refresh')) + '</button>' +
      '</form>' +
      '<div class="forex-status tiny muted" data-fx-status role="status" aria-live="polite">' + U.esc(T('dash.fx.hint')) + '</div>' +
      '<div class="forex-reading" data-fx-reading aria-live="polite"></div>' +
      '<section class="pip-planner" aria-labelledby="pip-planner-title">' +
        '<div class="pip-planner-head"><div><h3 id="pip-planner-title">' + U.esc(T('dash.fx.pipTitle')) + '</h3>' +
          '<p class="tiny muted">' + U.esc(T('dash.fx.pipHelp')) + '</p></div>' +
          '<span class="badge badge-neutral" data-pip-size>—</span></div>' +
        '<label class="pip-side"><span>' + U.esc(T('dash.fx.pipDirection')) + '</span><select class="input" data-pip-side>' +
          '<option value="long">' + U.esc(T('dash.fx.pipLong')) + '</option><option value="short">' + U.esc(T('dash.fx.pipShort')) + '</option>' +
        '</select></label>' +
        '<div class="pip-inputs">' +
          '<label><span>' + U.esc(T('dash.fx.pipEntry')) + '</span><input class="input" type="number" min="0" step="any" inputmode="decimal" data-pip-entry /></label>' +
          '<label><span>' + U.esc(T('dash.fx.pipStop')) + '</span><input class="input" type="number" min="0" step="any" inputmode="decimal" data-pip-stop /></label>' +
          '<label><span>' + U.esc(T('dash.fx.pipTarget')) + '</span><input class="input" type="number" min="0" step="any" inputmode="decimal" data-pip-target /></label>' +
        '</div>' +
        '<div class="pip-results" aria-live="polite">' +
          '<span>' + U.esc(T('dash.fx.pipStopDist')) + ': <b data-pip-stop-result>—</b></span>' +
          '<span>' + U.esc(T('dash.fx.pipTargetDist')) + ': <b data-pip-target-result>—</b></span>' +
          '<span>' + U.esc(T('dash.fx.pipRR')) + ': <b data-pip-rr-result>—</b></span>' +
        '</div>' +
        '<div class="tiny muted pip-status" data-pip-status aria-live="polite"></div>' +
        '<p class="tiny muted pip-note">' + U.esc(T('dash.fx.pipUse')) + '</p>' +
      '</section>' +
      '<p class="tiny muted forex-foot">' + U.esc(T('dash.fx.foot')) + '</p>' +
    '</section>';
  }

  function watchCard() {
    return '<section class="card span-7 edge-cyan" aria-labelledby="watch-title">' +
      '<div class="card-head"><h2 id="watch-title">' + ui.icon('star', 14) + U.esc(T('dash.watchlist.title')) + '</h2>' +
        '<span class="hint" data-watch-count></span></div>' +
      '<div class="list" data-watch-list>' + skeletonRows(3) + '</div>' +
      '<div class="card-foot tiny muted" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<span>' + U.esc(T('dash.watchlist.live')) + '</span>' +
        '<span>' + U.esc(T('dash.watchlist.sample')) + '</span>' +
      '</div></section>';
  }

  function overviewCard() {
    return '<section class="card span-5 edge-violet" aria-labelledby="ov-title">' +
      '<div class="card-head"><h2 id="ov-title">' + ui.icon('pulse', 14) + U.esc(T('dash.overview.title')) + '</h2>' +
        '<span class="hint">' + U.esc(T('dash.overview.hint')) + '</span></div>' +
      '<div data-overview>' +
        '<div class="empty"><span class="spinner"></span><span>' + U.esc(T('dash.overview.loading')) + '</span></div>' +
      '</div>' +
      '</section>';
  }

  function recentsCard() {
    var recents = TA.store.recents();
    return '<section class="card span-7 edge-violet" aria-labelledby="recent-title">' +
      '<div class="card-head"><h2 id="recent-title">' + ui.icon('clock', 14) + U.esc(T('dash.recent.title')) + '</h2></div>' +
      (recents.length
        ? '<div class="list">' + recents.slice(0, 5).map(function (r) {
            var lean = r.lean && r.lean.dir ? r.lean.dir : 'neutral';
            var asset = assetFromEntry(r);
            return '<button class="list-row" data-recent="' + U.attr(r.symbol) + '" data-style="' + U.attr(r.style || 'swing') + '">' +
              '<span class="sym mono">' + U.esc(r.symbol) + '</span>' +
              '<span class="nm">' + U.esc(asset.name || '') + ' · ' + U.esc(T('an.tab.' + (r.style || 'swing'))) + '</span>' +
              '<span class="badge ' + (lean === 'bull' ? 'badge-bull' : lean === 'bear' ? 'badge-bear' : 'badge-neutral') + '">' +
                U.esc(T('an.lean.' + lean)) + '</span>' +
              '<span class="tiny muted nowrap" style="min-width:64px;text-align:right">' + U.esc(U.timeAgo(r.ts, lang())) + '</span>' +
            '</button>';
          }).join('') + '</div>'
        : '<div class="empty">' + ui.icon('clock', 20) + '<span>' + U.esc(T('dash.recent.empty')) + '</span></div>') +
      '</section>';
  }

  function eventsCard() {
    var items = [
      { t: 'cpi', when: T('dash.events.cpi.when'), head: 'CPI' },
      { t: 'fomc', when: T('dash.events.fomc.when'), head: 'FOMC' },
      { t: 'jobs', when: T('dash.events.jobs.when'), head: 'NFP' },
      { t: 'crypto', when: T('dash.events.crypto.when'), head: '24/7' }
    ];
    return '<section class="card span-5 edge-amber" aria-labelledby="ev-title">' +
      '<div class="card-head"><h2 id="ev-title">' + ui.icon('flag', 14) + U.esc(T('dash.events.title')) + '</h2>' +
        '<span class="badge badge-sample">' + U.esc(T('dash.events.badge')) + '</span></div>' +
      items.map(function (i) {
        return '<div class="event">' +
          '<div class="event-date"><small>' + U.esc(i.head) + '</small><b style="font-size:11px">' + U.esc(i.when) + '</b></div>' +
          '<div><div class="t">' + U.esc(T('dash.events.' + i.t + '.title')) + '</div>' +
          '<div class="d">' + U.esc(T('dash.events.' + i.t + '.desc')) + '</div></div>' +
        '</div>';
      }).join('') +
      '<div class="card-foot tiny muted">' + U.esc(T('dash.events.note')) + '</div>' +
      '</section>';
  }

  function howCard() {
    var steps = [1, 2, 3];
    var icons = ['layers', 'scale', 'shield'];
    return '<section class="card span-12 edge-cyan" id="how-section" aria-labelledby="how-title">' +
      '<div class="card-head"><h2 id="how-title">' + ui.icon('layers', 14) + U.esc(T('dash.how.title')) + '</h2>' +
        '<button class="btn btn-sm btn-ghost" data-open-glossary>' + ui.icon('book', 13) + ' ' + U.esc(T('common.glossary')) + '</button></div>' +
      '<div class="card-body how-grid">' +
        steps.map(function (n) {
          return '<div style="display:flex;gap:12px">' +
            '<span class="section-num" style="margin-top:2px">0' + n + '</span>' +
            '<div><h3 style="font-size:13.5px;display:flex;gap:7px;align-items:center">' + ui.icon(icons[n - 1], 14) + U.esc(T('dash.how.' + n + '.t')) + '</h3>' +
            '<p class="small muted" style="margin-top:3px">' + U.esc(T('dash.how.' + n + '.d')) + '</p></div>' +
          '</div>';
        }).join('') +
      '</div></section>';
  }

  function skeletonRows(n) {
    var row = '<div class="list-row"><span class="skeleton" style="width:44px;height:13px"></span>' +
      '<span class="skeleton" style="flex:1;height:11px;max-width:120px"></span>' +
      '<span class="skeleton" style="width:60px;height:22px"></span>' +
      '<span class="skeleton" style="width:64px;height:13px"></span></div>';
    return new Array(n + 1).join(row);
  }

  function disclaimerLine() {
    return '<div class="disclaimer" style="grid-column:span 12">' +
      ui.icon('warning', 15) +
      '<div><b>' + U.esc(T('app.disclaimer_short')) + '.</b> ' + U.esc(T('an.disclaimer')) +
      ' <a href="#" data-open-legal>' + U.esc(T('an.disclaimer_more')) + '</a></div></div>';
  }

  function assetFromEntry(e) {
    var known = TA.catalog.find(e.symbol);
    if (known) return known;
    var cls = e.assetClass || 'crypto';
    return {
      symbol: e.symbol,
      name: e.name || e.symbol,
      assetClass: cls,
      coingeckoId: e.coingeckoId || null,
      currency: 'USD',
      exchange: e.exchange || (cls === 'stock' ? 'Sample · US' : 'Crypto · 24/7'),
      barsPerYear: cls === 'stock' ? 252 : 365
    };
  }

  function openAsset(asset, note) {
    if (note) TA.store.setNote(asset.symbol, note);
    TA.app.openAnalysis(asset, { style: TA.store.settings().defaultStyle });
  }

  function bindStockDirectory(root) {
    var form = root.querySelector('[data-stock-search]');
    var input = root.querySelector('#stock-directory-query');
    var status = root.querySelector('[data-stock-status]');
    var results = root.querySelector('[data-stock-results]');
    if (!form || !input || !status || !results) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var query = input.value.trim();
      if (query.length < 2) { input.focus(); return; }
      var submit = form.querySelector('[data-stock-submit]');
      if (submit) submit.disabled = true;
      status.textContent = T('dash.stocks.loading');
      results.innerHTML = '';
      fetch('/api/stocks?q=' + encodeURIComponent(query), { headers: { accept: 'application/json' } })
        .then(function (response) {
          return response.json().then(function (body) {
            if (!response.ok) throw new Error(body.error || T('dash.stocks.error'));
            return body;
          });
        })
        .then(function (body) {
          if (!document.body.contains(root)) return;
          var stocks = body.stocks || [];
          status.textContent = stocks.length ? T('dash.stocks.count', { n: stocks.length, total: body.count }) : T('dash.stocks.empty');
          results.innerHTML = stocks.map(function (stock) {
            return '<button type="button" class="stock-directory-result" data-stock-symbol="' + U.attr(stock.symbol) + '" ' +
              'data-stock-name="' + U.attr(stock.name) + '" data-stock-exchange="' + U.attr(stock.exchange) + '">' +
              '<span class="mono stock-result-symbol">' + U.esc(stock.symbol) + '</span>' +
              '<span class="stock-result-name">' + U.esc(stock.name) + '</span>' +
              '<span class="tiny muted stock-result-exchange">' + U.esc(stock.exchange) + '</span>' +
            '</button>';
          }).join('');
        })
        .catch(function (error) {
          if (!document.body.contains(root)) return;
          status.textContent = error.message || T('dash.stocks.error');
        })
        .finally(function () { if (submit) submit.disabled = false; });
    });
    results.addEventListener('click', function (event) {
      var button = event.target.closest('[data-stock-symbol]');
      if (!button) return;
      TA.app.openAnalysis({
        symbol: button.getAttribute('data-stock-symbol'),
        name: button.getAttribute('data-stock-name'),
        exchange: button.getAttribute('data-stock-exchange'),
        assetClass: 'stock', currency: 'USD', barsPerYear: 252, px: 120, vol: 0.62, drift: 0.08, vol24: 1e8
      }, { style: TA.store.settings().defaultStyle });
    });
  }

  function bindForexRates(root) {
    var form = root.querySelector('[data-fx-form]');
    var from = root.querySelector('[data-fx-from]');
    var to = root.querySelector('[data-fx-to]');
    var provider = root.querySelector('[data-fx-provider]');
    var status = root.querySelector('[data-fx-status]');
    var reading = root.querySelector('[data-fx-reading]');
    var submit = root.querySelector('[data-fx-submit]');
    var amount = root.querySelector('[data-fx-amount]');
    var pipEntry = root.querySelector('[data-pip-entry]');
    var pipStop = root.querySelector('[data-pip-stop]');
    var pipTarget = root.querySelector('[data-pip-target]');
    var pipSide = root.querySelector('[data-pip-side]');
    var pipSizeEl = root.querySelector('[data-pip-size]');
    var pipStopEl = root.querySelector('[data-pip-stop-result]');
    var pipTargetEl = root.querySelector('[data-pip-target-result]');
    var pipRrEl = root.querySelector('[data-pip-rr-result]');
    var pipStatus = root.querySelector('[data-pip-status]');
    var lastQuote = null;
    if (!form || !from || !to || !status || !reading) return;
    function updateConvertedAmount() {
      var output = reading.querySelector('[data-fx-converted]');
      if (!output || !lastQuote) return;
      var rawAmount = amount ? amount.value.trim() : '';
      var amountValue = Number(rawAmount);
      output.textContent = rawAmount !== '' && Number.isFinite(amountValue) && amountValue >= 0
        ? U.fmtNum(amountValue * lastQuote.rate, lang(), 2) + ' ' + lastQuote.to
        : '—';
    }
    function updatePips() {
      var pip = to && to.value === 'JPY' ? 0.01 : 0.0001;
      if (pipSizeEl) pipSizeEl.textContent = T('dash.fx.pipSize', { size: pip.toFixed(pip === 0.01 ? 2 : 4), code: to ? to.value : '' });
      var entry = pipEntry && pipEntry.value !== '' ? Number(pipEntry.value) : NaN;
      var stop = pipStop && pipStop.value !== '' ? Number(pipStop.value) : NaN;
      var target = pipTarget && pipTarget.value !== '' ? Number(pipTarget.value) : NaN;
      var isLong = !pipSide || pipSide.value === 'long';
      var validStop = Number.isFinite(entry) && Number.isFinite(stop) && (isLong ? stop < entry : stop > entry);
      var validTarget = Number.isFinite(entry) && Number.isFinite(target) && (isLong ? target > entry : target < entry);
      var stopPips = validStop ? Math.abs(entry - stop) / pip : null;
      var targetPips = validTarget ? Math.abs(entry - target) / pip : null;
      if (pipStopEl) pipStopEl.textContent = stopPips == null ? '—' : U.fmtNum(stopPips, lang(), 1) + ' pips';
      if (pipTargetEl) pipTargetEl.textContent = targetPips == null ? '—' : U.fmtNum(targetPips, lang(), 1) + ' pips';
      if (pipRrEl) pipRrEl.textContent = stopPips > 0 && targetPips != null
        ? U.fmtNum(targetPips / stopPips, lang(), 2) + ' : 1'
        : '—';
      if (pipStatus) pipStatus.textContent =
        (Number.isFinite(stop) && Number.isFinite(entry) && !validStop) ||
        (Number.isFinite(target) && Number.isFinite(entry) && !validTarget)
          ? T('dash.fx.pipInvalid', { side: T(isLong ? 'dash.fx.pipLong' : 'dash.fx.pipShort') })
          : '';
      [pipEntry, pipStop, pipTarget].forEach(function (input) {
        if (input) input.step = pip === 0.01 ? '0.001' : '0.00001';
      });
    }
    if (amount) amount.addEventListener('input', updateConvertedAmount);
    [pipEntry, pipStop, pipTarget, pipSide].forEach(function (input) {
      if (input) input.addEventListener('input', updatePips);
    });
    if (from) from.addEventListener('change', function () {
      lastQuote = null;
      if (pipEntry) pipEntry.value = '';
      if (pipStop) pipStop.value = '';
      if (pipTarget) pipTarget.value = '';
      updatePips();
    });
    if (to) to.addEventListener('change', function () {
      lastQuote = null;
      if (pipEntry) pipEntry.value = '';
      if (pipStop) pipStop.value = '';
      if (pipTarget) pipTarget.value = '';
      updatePips();
    });
    updatePips();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (from.value === to.value) { status.textContent = T('dash.fx.same'); return; }
      if (navigator.onLine === false) { status.textContent = T('dash.fx.offline'); return; }
      if (submit) submit.disabled = true;
      status.textContent = T('dash.fx.loading');
      reading.innerHTML = '';
      TA.data.getForexRate(from.value, to.value, provider ? provider.value : '').then(function (quote) {
        if (!document.body.contains(root)) return;
        lastQuote = quote;
        if (pipEntry) pipEntry.value = Number(quote.rate).toFixed(quote.to === 'JPY' ? 3 : 5);
        updatePips();
        var decimals = quote.rate < 1 ? 6 : 4;
        var sourceKeys = (quote.providers || []).filter(function (p) { return !p.excluded; }).map(function (p) { return p.key; });
        status.textContent = T('dash.fx.updated', { time: quote.refreshedAt || U.fmtTime(quote.retrievedAt, lang()), zone: quote.timezone || 'UTC' });
        reading.innerHTML = '<div class="forex-rate-line"><span class="forex-pair mono">1 ' + U.esc(quote.from) + ' =</span>' +
          '<strong class="num">' + U.esc(U.fmtNum(quote.rate, lang(), decimals)) + '</strong>' +
          '<span class="forex-target mono">' + U.esc(quote.to) + '</span>' + ui.modeBadge({ dataMode: 'live' }) + '</div>' +
          '<div class="forex-converted"><span class="tiny muted">' + U.esc(T('dash.fx.conversion')) + '</span><strong class="mono" data-fx-converted></strong></div>' +
          '<div class="forex-bid-ask tiny muted">' + U.esc(T('dash.fx.sources', { sources: sourceKeys.length ? sourceKeys.join(', ') : T('dash.fx.sourceUnavailable') })) + '</div>' +
          (quote.bid && quote.ask ? '<div class="forex-bid-ask tiny muted">' + U.esc(T('dash.fx.bid')) + ' ' + U.esc(U.fmtNum(quote.bid, lang(), decimals)) +
            ' · ' + U.esc(T('dash.fx.ask')) + ' ' + U.esc(U.fmtNum(quote.ask, lang(), decimals)) + '</div>' : '');
        updateConvertedAmount();
      }).catch(function (error) {
        if (!document.body.contains(root)) return;
        status.textContent = error && error.code === 'rate' ? T('dash.fx.limit') : T('dash.fx.error');
      }).finally(function () { if (submit) submit.disabled = false; });
    });
    TA.data.getForexCurrencies().then(function (currencies) {
      if (!document.body.contains(root)) return;
      var options = currencies.map(function (c) {
        return '<option value="' + U.attr(c.code) + '">' + U.esc(c.code + ' — ' + c.name) + '</option>';
      }).join('');
      var previousFrom = from.value, previousTo = to.value;
      from.innerHTML = options;
      to.innerHTML = options;
      from.value = currencies.some(function (c) { return c.code === previousFrom; }) ? previousFrom : 'USD';
      to.value = currencies.some(function (c) { return c.code === previousTo; }) ? previousTo : 'ZAR';
    }).catch(function () {
      status.textContent = T('dash.fx.error');
    });
    if (provider) TA.data.getForexProviders().then(function (providers) {
      if (!document.body.contains(root)) return;
      provider.innerHTML = '<option value="">' + U.esc(T('dash.fx.blended')) + '</option>' + providers.map(function (p) {
        return '<option value="' + U.attr(p.key) + '">' + U.esc(p.name) + '</option>';
      }).join('');
    }).catch(function () {});
  }

  function bindWatchlist(root) {
    var list = root.querySelector('[data-watch-list]');
    if (!list) return;
    if (!TA.store.watchlist().length) {
      list.innerHTML = '<div class="empty">' + ui.icon('star', 20) +
        '<span>' + U.esc(T('dash.watchlist.empty')) + '</span>' +
        '<button class="btn btn-sm" data-watch-start>' + U.esc(T('dash.watchlist.empty_cta')) + '</button></div>';
      var start = list.querySelector('[data-watch-start]');
      if (start) start.addEventListener('click', function () {
        openAsset(TA.catalog.find('BTC'));
      });
      return;
    }
    list.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove]');
      if (rm) {
        TA.store.removeWatch(rm.getAttribute('data-remove'));
        paintWatchlist(root, lastQuotes);
        return;
      }
      var row = e.target.closest('[data-open]');
      if (row) {
        var sym = row.getAttribute('data-open');
        var entry = TA.store.watchlist().find(function (w) { return w.symbol === sym; });
        var a = entry ? assetFromEntry(entry) : TA.catalog.find(sym);
        if (a) openAsset(a);
      }
    });
  }

  function paintWatchlist(root, quotes) {
    var list = root.querySelector('[data-watch-list]');
    if (!list) return;
    lastQuotes = quotes || lastQuotes;
    var entries = TA.store.watchlist();
    var countEl = root.querySelector('[data-watch-count]');
    if (countEl) countEl.textContent = T('dash.watchlist.hint', { n: entries.length });
    if (!entries.length) {
      list.innerHTML = '<div class="empty">' + ui.icon('star', 20) +
        '<span>' + U.esc(T('dash.watchlist.empty')) + '</span>' +
        '<button class="btn btn-sm" data-watch-start>' + U.esc(T('dash.watchlist.empty_cta')) + '</button></div>';
      var start = list.querySelector('[data-watch-start]');
      if (start) start.addEventListener('click', function () { openAsset(TA.catalog.find('BTC')); });
      return;
    }
    list.innerHTML = entries.map(function (e) {
      var a = assetFromEntry(e);
      var q = quotes[e.symbol] || {};
      var chg = U.isNum(q.changePct) ? q.changePct : null;
      return '<div class="list-row item">' +
        '<button class="row-open" data-open="' + U.attr(e.symbol) + '" ' +
          'aria-label="' + U.attr(T('dash.watchlist.open') + ' ' + e.symbol) + '">' +
          '<span class="sym mono">' + U.esc(e.symbol) + '</span>' +
          '<span class="nm">' + U.esc(a.name) + '</span>' +
          '<span class="spark">' + TA.charts.spark(q.spark || [], 84, 26) + '</span>' +
          '<span class="price num">' + (U.isNum(q.price) ? U.esc(U.fmtPrice(q.price, '$', lang())) : '<span class="skeleton" style="width:52px;height:12px;display:inline-block"></span>') + '</span>' +
          '<span class="chg num ' + (chg == null ? 'flat' : U.toneClass(chg)) + '">' + (chg == null ? '—' : U.esc(U.fmtPct(chg, true))) + '</span>' +
        '</button>' +
        '<button class="remove" data-remove="' + U.attr(e.symbol) + '" aria-label="' + U.attr(T('nav.unstar', { sym: e.symbol })) + '">' +
          ui.icon('close', 13) + '</button>' +
      '</div>';
    }).join('');
  }

  function paintOverview(root, overview) {
    var box = root.querySelector('[data-overview]');
    if (!box) return;
    var liveStocks = overview.stocks.filter(function (s) { return s.dataMode === 'live'; });
    var pool = overview.live ? overview.crypto.concat(liveStocks) : overview.stocks;
    var footKey = overview.crypto.length && liveStocks.length ? 'dash.overview.live_foot'
      : overview.crypto.length ? 'dash.overview.crypto_foot'
      : liveStocks.length ? 'dash.overview.stocks_foot'
      : 'dash.overview.sample_foot';
    if (!pool.length) {
      box.innerHTML = '<div class="empty">' + ui.icon('info', 18) + '<span>' + U.esc(T('dash.overview.unavailable')) + '</span></div>';
      return;
    }
    var sorted = pool.slice().sort(function (a, b) { return b.changePct - a.changePct; });
    var leaders = sorted.slice(0, 3);
    var laggards = sorted.slice(-3).reverse();

    function row(item) {
      return '<button class="mover" data-ov="' + U.attr(item.symbol) + '">' +
        '<span class="sym mono">' + U.esc(item.symbol) + '</span>' +
        '<span class="px num">' + U.esc(U.fmtPrice(item.price, '$', lang())) + '</span>' +
        '<span class="chg num ' + U.toneClass(item.changePct) + '">' + U.esc(U.fmtPct(item.changePct, true)) + '</span>' +
      '</button>';
    }
    box.innerHTML =
      '<div class="movers">' +
        '<div class="mover-col"><div class="eyebrow" style="padding:10px 18px 2px">' + U.esc(T('dash.overview.gainers')) + '</div>' +
          leaders.map(row).join('') + '</div>' +
        '<div class="mover-col"><div class="eyebrow" style="padding:10px 18px 2px">' + U.esc(T('dash.overview.laggards')) + '</div>' +
          laggards.map(row).join('') + '</div>' +
      '</div>' +
      '<div class="card-foot tiny muted" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
        '<span>' + U.esc(T(footKey, { time: U.fmtTime(overview.retrievedAt, lang()) })) + '</span>' +
        (overview.live ? ui.modeBadge({ dataMode: 'live' }) : ui.modeBadge({ dataMode: 'sample' })) +
      '</div>';

    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ov]');
      if (!b) return;
      var a = TA.catalog.find(b.getAttribute('data-ov'));
      if (a) openAsset(a);
    });
  }

  function render(root) {
    var dateLabel = U.fmtDate(Date.now(), lang(), { weekday: 'long', month: 'long', day: 'numeric' });
    root.innerHTML = '<div class="wrap page">' +
      heroBlock(dateLabel) +
      '<div class="dash-grid">' +
        stockDirectoryCard() + forexCard() + watchCard() + overviewCard() + recentsCard() + eventsCard() + howCard() + disclaimerLine() +
      '</div>' +
      '<div class="tiny muted" style="text-align:center;margin-top:26px">' + U.esc(T('dash.footer')) + '</div>' +
      '</div>';

    bindStockDirectory(root);
    bindForexRates(root);
    bindWatchlist(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-open-legal]')) { e.preventDefault(); ui.legalModal(); }
      if (e.target.closest('[data-open-glossary]')) { e.preventDefault(); ui.glossaryModal(); }
      if (e.target.closest('[data-focus-search]')) {
        var directory = root.querySelector('#stock-directory-query');
        if (directory) {
          directory.scrollIntoView({ block: 'center', behavior: 'smooth' });
          directory.focus({ preventScroll: true });
        }
      }
      var how = e.target.closest('[data-scroll-how]');
      if (how) {
        var sec = root.querySelector('#how-section');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      var r = e.target.closest('[data-recent]');
      if (r) {
        var sym = r.getAttribute('data-recent');
        var recent = TA.store.recents().find(function (x) { return x.symbol === sym; });
        var a = recent ? assetFromEntry(recent) : TA.catalog.find(sym);
        if (a) TA.app.openAnalysis(a, { style: r.getAttribute('data-style') });
      }
    });

    var entries = TA.store.watchlist();
    var overviewP = TA.data.getOverview();
    var quotesP = entries.length ? TA.data.getQuotes(entries) : Promise.resolve({});
    var watchCount = root.querySelector('[data-watch-count]');
    if (watchCount) watchCount.textContent = T('dash.watchlist.hint', { n: entries.length });

    overviewP.then(function (ov) {
      if (!document.body.contains(root)) return;
      paintOverview(root, ov);
    });
    quotesP.then(function (quotes) {
      if (!document.body.contains(root)) return;
      paintWatchlist(root, quotes);
    });
  }

  function renderMarkets(root) {
    root.innerHTML = '<div class="wrap page"><section class="hero markets-hero"><div class="hero-inner"><div class="hero-copy">' +
      '<span class="eyebrow hero-kicker">' + U.esc(T('markets.eyebrow')) + '</span><h1>' + U.esc(T('markets.title')) + '</h1>' +
      '<p class="hero-sub">' + U.esc(T('markets.lede')) + '</p></div></div></section>' +
      '<div class="dash-grid">' +
      '<section class="card span-12 edge-violet"><div class="card-head"><h2>' + U.esc(T('markets.coverage')) + '</h2></div>' +
      '<div class="market-coverage-grid"><div><b>' + U.esc(T('markets.stocks')) + '</b><p class="tiny muted">NYSE · Nasdaq · NYSE Arca</p></div>' +
      '<div><b>' + U.esc(T('markets.crypto')) + '</b><p class="tiny muted">' + U.esc(T('markets.cryptoDesc')) + '</p></div>' +
      '<div><b>' + U.esc(T('markets.fx')) + '</b><p class="tiny muted">' + U.esc(T('markets.fxDesc')) + '</p></div></div></section>' +
      '<section class="card span-12 edge-cyan broker-entry"><div class="card-head">' +
        '<div><h2>' + ui.icon('scale', 14) + U.esc(T('markets.brokers.title')) + '</h2>' +
        '<p class="tiny muted">' + U.esc(T('markets.brokers.lede')) + '</p></div>' +
        '<a class="btn btn-sm btn-cyan" href="#/brokers">' + U.esc(T('markets.brokers.cta')) + ui.icon('arrowRight', 14) + '</a>' +
      '</div><p class="tiny muted broker-entry-note">' + U.esc(T('markets.brokers.note')) + '</p></section>' +
      stockDirectoryCard() + forexCard() +
      '<section class="card span-12 edge-violet"><div class="card-head"><h2>' + U.esc(T('markets.currencies')) + '</h2>' +
      '<div class="market-rate-tools"><label class="tiny muted">' + U.esc(T('dash.fx.source')) +
      '<select class="input" data-market-provider><option value="">' + U.esc(T('dash.fx.blended')) + '</option></select></label>' +
      '<span class="hint" data-currency-count></span></div></div><div class="market-currency-list" data-currency-list aria-live="polite">' +
      '<span class="spinner"></span> ' + U.esc(T('markets.loading')) + '</div>' +
      '<div class="tiny muted market-currency-detail" data-currency-detail aria-live="polite"></div></section>' +
      '<p class="tiny muted span-12">' + U.esc(T('markets.dataNote')) + '</p></div></div>';
    bindStockDirectory(root);
    bindForexRates(root);
    var marketCurrencies = [];
    var currenciesP = TA.data.getForexCurrencies();
    var providersP = TA.data.getForexProviders();
    var providerSelect = root.querySelector('[data-market-provider]');
    var currencyList = root.querySelector('[data-currency-list]');
    var currencyDetail = root.querySelector('[data-currency-detail]');
    if (currencyList) currencyList.addEventListener('click', function (event) {
      var item = event.target.closest('[data-fx-currency-code]');
      if (!item || !currencyDetail) return;
      var code = item.getAttribute('data-fx-currency-code');
      currencyDetail.textContent = T('markets.detailLoading', { code: code });
      TA.data.getForexCurrency(code).then(function (detail) {
        if (!document.body.contains(root)) return;
        currencyDetail.innerHTML = '<b>' + U.esc(detail.name || code) + ' (' + U.esc(detail.iso_code || code) + ')</b>' +
          (detail.symbol ? ' · ' + U.esc(detail.symbol) : '') +
          (detail.providers && detail.providers.length ? '<br>' + U.esc(T('markets.detailProviders', { providers: detail.providers.join(', ') })) : '') +
          (detail.start_date || detail.end_date ? '<br>' + U.esc(T('markets.detailDates', { from: detail.start_date || '—', to: detail.end_date || '—' })) : '');
      }).catch(function () {
        currencyDetail.textContent = T('markets.currencyError');
      });
    });
    function renderRates(provider) {
      return TA.data.getForexRates('USD', null, provider).then(function (rates) {
      if (!document.body.contains(root)) return;
      var currencies = marketCurrencies;
      var list = root.querySelector('[data-currency-list]');
      var count = root.querySelector('[data-currency-count]');
      if (count) count.textContent = T('markets.rateCount', { n: rates.length, total: currencies.length });
      var byQuote = {};
      rates.forEach(function (rate) { byQuote[rate.quote] = rate; });
      if (list) list.innerHTML = currencies.map(function (c) {
        var rate = byQuote[c.code];
        var value = rate ? '1 USD = ' + U.fmtNum(rate.rate, lang(), rate.rate < 1 ? 6 : 4) + ' ' + c.code : T('markets.rateUnavailable');
        var sources = rate && rate.providers ? rate.providers.filter(function (p) { return !p.excluded; }).map(function (p) { return p.key; }) : [];
        return '<button type="button" class="market-currency" data-fx-currency-code="' + U.attr(c.code) + '"><b class="mono">' + U.esc(c.code) + '</b><small>' + U.esc(c.name) + '</small>' +
          '<span class="market-currency-rate mono">' + U.esc(value) + '</span>' +
          '<small>' + U.esc(T('dash.fx.sources', { sources: sources.length ? sources.join(', ') : T('dash.fx.sourceUnavailable') })) + '</small>' +
          (rate ? '<small>' + U.esc(T('markets.rateDate', { date: rate.date })) + '</small>' : '') + '</button>';
      }).join('');
      }).catch(function () {
        var list = root.querySelector('[data-currency-list]');
        if (list) list.textContent = T('markets.currencyError');
      });
    }
    currenciesP.then(function (currencies) {
      if (!document.body.contains(root)) return;
      marketCurrencies = currencies;
      renderRates(providerSelect ? providerSelect.value : '');
    }).catch(function () {
      var list = root.querySelector('[data-currency-list]');
      if (list) list.textContent = T('markets.currencyError');
    });
    providersP.then(function (providers) {
      if (!providerSelect || !document.body.contains(root)) return;
      providerSelect.innerHTML = '<option value="">' + U.esc(T('dash.fx.blended')) + '</option>' + providers.map(function (p) {
        return '<option value="' + U.attr(p.key) + '">' + U.esc(p.name) + '</option>';
      }).join('');
    }).catch(function () {});
    if (providerSelect) providerSelect.addEventListener('change', function () { renderRates(providerSelect.value); });
  }

  TA.views = TA.views || {};
  TA.views.dashboard = { render: render, renderMarkets: renderMarkets };
})(window.TA = window.TA || {});
