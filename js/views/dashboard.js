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

  function quickCard() {
    return '<section class="card quick span-12" aria-labelledby="quick-title">' +
      '<div>' +
        '<span class="eyebrow">' + U.esc(T('dash.quick.title')) + '</span>' +
        '<h2 id="quick-title" style="margin-top:4px">' + U.esc(T('dash.quick.lede')) + '</h2>' +
      '</div>' +
      '<div class="quick-row">' +
        '<div class="quick-input">' +
          '<input id="quick-input" type="text" autocomplete="off" spellcheck="false" ' +
            'aria-label="' + U.attr(T('nav.search')) + '" placeholder="' + U.attr(T('dash.quick.placeholder')) + '" />' +
        '</div>' +
        '<button class="btn btn-primary" data-quick-go>' + ui.icon('chart', 15) + ' ' + U.esc(T('dash.quick.button')) + '</button>' +
      '</div>' +
      '<div class="quick-row">' +
        '<input id="quick-note" class="input" style="flex:1 1 260px;height:38px" type="text" maxlength="280" ' +
          'aria-label="' + U.attr(T('dash.quick.idea')) + '" placeholder="' + U.attr(T('dash.quick.idea')) + '" />' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<span class="tiny muted">' + U.esc(T('dash.quick.suggested')) + '</span>' +
        ['BTC', 'ETH', 'AAPL', 'NVDA', 'SPY'].map(function (s) {
          return '<button class="btn btn-sm" data-try="' + s + '">' + s + '</button>';
        }).join('') +
      '</div>' +
      '<div class="quick-note">' + ui.icon('info', 13) + '<span>' + U.esc(T('dash.quick.note')) + '</span></div>' +
      '</section>';
  }

  function watchCard() {
    return '<section class="card span-7" aria-labelledby="watch-title">' +
      '<div class="card-head"><h2 id="watch-title">' + U.esc(T('dash.watchlist.title')) + '</h2>' +
        '<span class="hint" data-watch-count></span></div>' +
      '<div class="list" data-watch-list>' + skeletonRows(3) + '</div>' +
      '<div class="card-foot tiny muted" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<span>' + U.esc(T('dash.watchlist.live')) + '</span>' +
        '<span>' + U.esc(T('dash.watchlist.sample')) + '</span>' +
      '</div></section>';
  }

  function overviewCard() {
    return '<section class="card span-5" aria-labelledby="ov-title">' +
      '<div class="card-head"><h2 id="ov-title">' + U.esc(T('dash.overview.title')) + '</h2>' +
        '<span class="hint">' + U.esc(T('dash.overview.hint')) + '</span></div>' +
      '<div data-overview>' +
        '<div class="empty"><span class="spinner"></span><span>' + U.esc(T('dash.overview.loading')) + '</span></div>' +
      '</div>' +
      '</section>';
  }

  function recentsCard() {
    var recents = TA.store.recents();
    return '<section class="card span-7" aria-labelledby="recent-title">' +
      '<div class="card-head"><h2 id="recent-title">' + U.esc(T('dash.recent.title')) + '</h2></div>' +
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
    return '<section class="card span-5" aria-labelledby="ev-title">' +
      '<div class="card-head"><h2 id="ev-title">' + U.esc(T('dash.events.title')) + '</h2>' +
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
    return '<section class="card span-12" aria-labelledby="how-title">' +
      '<div class="card-head"><h2 id="how-title">' + U.esc(T('dash.how.title')) + '</h2>' +
        '<button class="btn btn-sm btn-ghost" data-open-glossary>' + ui.icon('book', 13) + ' ' + U.esc(T('common.glossary')) + '</button></div>' +
      '<div class="card-body" style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">' +
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

  function bindQuick(root) {
    var input = root.querySelector('#quick-input');
    var note = root.querySelector('#quick-note');
    var btn = root.querySelector('[data-quick-go]');

    function go() {
      var raw = (input.value || '').trim();
      if (!raw) { input.focus(); return; }
      var idea = note && note.value ? note.value.trim() : '';
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> ' + U.esc(T('dash.quick.searching'));
      TA.data.resolveSymbol(raw).then(function (asset) {
        btn.disabled = false;
        btn.innerHTML = ui.icon('chart', 15) + ' ' + U.esc(T('dash.quick.button'));
        if (!asset) { ui.toast(T('dash.quick.notfound')); return; }
        openAsset(asset, idea);
      });
    }
    btn.addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    U.$$('[data-try]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = TA.catalog.find(b.getAttribute('data-try'));
        if (a) openAsset(a);
      });
    });
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
    var pool = overview.live ? overview.crypto : overview.stocks;
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
        '<span>' + U.esc(overview.live
          ? T('dash.overview.live_foot', { time: U.fmtTime(overview.retrievedAt, lang()) })
          : T('dash.overview.sample_foot')) + '</span>' +
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
    var s = TA.store.settings();
    var dateLabel = U.fmtDate(Date.now(), lang(), { weekday: 'long', month: 'long', day: 'numeric' });
    root.innerHTML = '<div class="wrap page">' +
      '<div class="page-head">' +
        '<div>' +
          '<div class="eyebrow">' + U.esc(greeting()) + ' · ' + U.esc(dateLabel) + '</div>' +
          '<h1 style="margin-top:6px">' + U.esc(T('dash.title')) + '</h1>' +
          '<p class="greeting-sub">' + U.esc(T('app.promise')) + '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-sm" data-open-legal>' + ui.icon('shield', 14) + ' ' + U.esc(T('app.disclaimer_short')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="dash-grid">' +
        quickCard() + watchCard() + overviewCard() + recentsCard() + eventsCard() + howCard() + disclaimerLine() +
      '</div>' +
      '<div class="tiny muted" style="text-align:center;margin-top:26px">' + U.esc(T('dash.footer')) + '</div>' +
      '</div>';

    bindQuick(root);
    bindWatchlist(root);

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-open-legal]')) { e.preventDefault(); ui.legalModal(); }
      if (e.target.closest('[data-open-glossary]')) { e.preventDefault(); ui.glossaryModal(); }
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

  TA.views = TA.views || {};
  TA.views.dashboard = { render: render };
})(window.TA = window.TA || {});
