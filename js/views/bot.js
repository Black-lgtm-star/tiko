/* views/bot.js — AI paper-trading dashboard with an optional, confirmation-gated Alpaca connection. */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };
  var lang = function () { return TA.i18n.get(); };

  var FALLBACK = ['BTC', 'ETH', 'AAPL', 'NVDA', 'SPY'];
  var MAX_UNIVERSE = 16;
  var AUTO_SCAN_MS = 15 * 60 * 1000;
  var LIVE_SCAN_MAX_MS = 60 * 60 * 1000;
  var BOUND = '__botBound';
  var scanning = false;
  var scanTimer = null;
  var broker = { loading: false, error: null, account: null, positions: [], orders: [], at: null };

  function brokerKeys() {
    return TA.broker ? TA.broker.read() : null;
  }

  function brokerErrorText(err) {
    var code = err && err.code;
    var known = ['badKeys', 'auth', 'timeout', 'network', 'blocked', 'order', 'symbol', 'assetClass', 'side', 'levels', 'size', 'confirm', 'sample', 'stale'];
    if (code && known.indexOf(code) >= 0) return T('bot.broker.err.' + code);
    return T('bot.broker.err.http');
  }

  function resetBroker() {
    broker.loading = false;
    broker.error = null;
    broker.account = null;
    broker.positions = [];
    broker.orders = [];
    broker.at = null;
  }

  function refreshBroker(root, quiet) {
    var keys = brokerKeys();
    if (!keys) {
      resetBroker();
      if (!quiet) paint(root);
      return;
    }
    if (broker.loading) return;
    broker.loading = true;
    if (!quiet) paint(root);
    TA.broker.summary(keys).then(function (out) {
      broker.loading = false;
      broker.error = null;
      broker.account = out.account;
      broker.positions = out.positions;
      broker.orders = out.orders;
      broker.at = Date.now();
      if (stillHere(root)) paint(root);
    }).catch(function (err) {
      broker.loading = false;
      broker.error = err && err.code ? err.code : 'http';
      broker.account = null;
      broker.positions = [];
      broker.orders = [];
      broker.at = Date.now();
      if (stillHere(root)) paint(root);
    });
  }

  function connectBroker(root, form) {
    var keyId = form.querySelector('[data-broker-key]');
    var secret = form.querySelector('[data-broker-secret]');
    var mode = form.querySelector('[data-broker-mode]');
    var input = {
      keyId: keyId ? keyId.value.trim() : '',
      secretKey: secret ? secret.value.trim() : '',
      mode: mode ? mode.value : 'live'
    };
    if (!input.keyId || !input.secretKey) {
      broker.error = 'badKeys';
      paint(root);
      return;
    }
    broker.loading = true;
    broker.error = null;
    paint(root);
    TA.broker.connect(input).then(function () {
      broker.loading = false;
      ui.toast(T('bot.broker.toast.connected', { mode: input.mode === 'paper' ? T('bot.broker.mode.paper') : T('bot.broker.mode.live') }));
      refreshBroker(root, { quiet: true });
    }).catch(function (err) {
      broker.loading = false;
      broker.error = err && err.code ? err.code : 'http';
      if (stillHere(root)) paint(root);
      ui.toast(brokerErrorText(err));
    });
  }

  function disconnectBroker(root) {
    TA.broker.clear();
    resetBroker();
    ui.toast(T('bot.broker.toast.disconnected'));
    paint(root);
  }

  function ticketRow(label, value, toneClass) {
    return '<div class="broker-ticket-row"><span>' + U.esc(label) + '</span>' +
      '<b class="' + (toneClass || '') + '">' + U.esc(value) + '</b></div>';
  }

  function openTicket(root, row, done) {
    if (!row || row.action !== 'open' || row.assetClass !== 'stock' || row.side !== 'long') return false;
    var keys = brokerKeys();
    if (!keys) { ui.toast(T('bot.broker.err.noKeys')); return false; }
    if (row.dataMode !== 'live') { ui.toast(T('bot.broker.err.sample')); return false; }
    var scan = readState().lastScan;
    if (!scan || !U.isNum(scan.at) || Date.now() - scan.at > LIVE_SCAN_MAX_MS) {
      ui.toast(T('bot.broker.err.stale')); return false;
    }
    if (!broker.account) { ui.toast(T('bot.broker.err.notReady')); return false; }
    var trade = TA.broker.canTrade(broker.account);
    if (!trade.ok) { ui.toast(T('bot.broker.err.blocked')); return false; }
    var settings = TA.store.settings();
    var entry = row.entry || row.price;
    var sized = TA.tradeplan.size({ entry: entry, stop: row.stop, target: row.target, sizeAllowed: true }, settings);
    var units = sized ? sized.units : 0;
    if (U.isNum(broker.account.buyingPower) && U.isNum(entry) && entry > 0) {
      units = Math.min(units, Math.floor(broker.account.buyingPower / entry));
    }
    var ticket = TA.broker.buildOrder({
      symbol: row.symbol,
      assetClass: row.assetClass,
      side: row.side,
      entry: entry,
      stop: row.stop,
      target: row.target,
      units: units
    });
    if (ticket.error) { ui.toast(T('bot.broker.err.' + ticket.error)); return false; }
    var live = keys.mode === 'live';
    var body = '<p class="broker-ticket-lede">' + U.esc(T(live ? 'bot.broker.confirm.ledeLive' : 'bot.broker.confirm.ledePaper')) + '</p>' +
      '<div class="broker-ticket-grid">' +
        ticketRow(T('bot.broker.ticket.symbol'), ticket.order.symbol) +
        ticketRow(T('bot.broker.ticket.side'), T('bot.broker.ticket.buy')) +
        ticketRow(T('bot.broker.ticket.qty'), ticket.qty + ' ' + T('bot.broker.ticket.shares')) +
        ticketRow(T('bot.broker.ticket.type'), T('bot.broker.ticket.market')) +
        ticketRow(T('bot.broker.ticket.stop'), U.fmtPrice(ticket.stop, '$', lang())) +
        ticketRow(T('bot.broker.ticket.target'), U.fmtPrice(ticket.target, '$', lang())) +
        ticketRow(T('bot.broker.ticket.risk'), money(ticket.risk), 'down') +
      '</div>' +
      '<div class="disclaimer broker-ticket-warn">' + ui.icon('warning', 15) + '<div>' +
        U.esc(T(live ? 'bot.broker.confirm.warnLive' : 'bot.broker.confirm.warnPaper')) + '</div></div>' +
      '<label class="broker-ack"><input type="checkbox" data-broker-ack> ' +
        U.esc(T(live ? 'bot.broker.confirm.ackLive' : 'bot.broker.confirm.ackPaper')) + '</label>' +
      '<p class="tiny broker-send-err" data-broker-send-err></p>' +
      '<button class="btn btn-danger broker-send" type="button" data-broker-send disabled>' +
        U.esc(T('bot.broker.confirm.send')) + '</button>';
    var close = ui.openModal({
      title: T(live ? 'bot.broker.confirm.titleLive' : 'bot.broker.confirm.titlePaper'),
      body: body,
      actions: [{ label: T('bot.broker.confirm.cancel') }]
    });
    var ack = document.querySelector('#modal-root [data-broker-ack]');
    var send = document.querySelector('#modal-root [data-broker-send]');
    var errEl = document.querySelector('#modal-root [data-broker-send-err]');
    if (!ack || !send) return true;
    ack.addEventListener('change', function () { send.disabled = !ack.checked; });
    send.addEventListener('click', function () {
      if (!ack.checked || send.disabled) return;
      send.disabled = true;
      errEl.textContent = '';
      TA.broker.submit(brokerKeys(), ticket.order, { confirm: true }).then(function (res) {
        close();
        if (done) done(res);
        ui.toast(T('bot.broker.toast.sent', { status: (res && res.status) || 'accepted' }));
        refreshBroker(root, { quiet: true });
      }).catch(function (err) {
        send.disabled = false;
        errEl.textContent = brokerErrorText(err);
      });
    });
    return true;
  }

  function readState() {
    return TA.bot.normalize(TA.store.botState ? TA.store.botState() : null);
  }

  function writeState(state) {
    if (TA.store.saveBot) TA.store.saveBot(state);
  }

  function money(v) {
    if (!U.isNum(v)) return '—';
    var n = new Intl.NumberFormat(lang() || 'en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(v);
    return '$ ' + n;
  }

  function signedMoney(v) {
    if (!U.isNum(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '-' : '') + money(Math.abs(v));
  }

  function signedR(v) {
    if (!U.isNum(v)) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(2) + 'R';
  }

  function sideText(side) {
    return T('bot.side.' + (side === 'short' ? 'short' : side === 'long' ? 'long' : 'none'));
  }

  function tone(v) {
    return v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  }

  function knownAsset(entry) {
    var known = TA.catalog.find(entry.symbol);
    if (known) return known;
    var cls = entry.assetClass || 'crypto';
    return {
      symbol: entry.symbol,
      name: entry.name || entry.symbol,
      assetClass: cls,
      coingeckoId: entry.coingeckoId || null,
      currency: 'USD',
      exchange: entry.exchange || (cls === 'stock' ? 'Sample · US' : 'Crypto · 24/7'),
      barsPerYear: cls === 'stock' ? 252 : 365
    };
  }

  function universe(state) {
    var seen = {};
    var assets = [];
    function add(asset) {
      if (!asset || !asset.symbol || seen[asset.symbol] || assets.length >= MAX_UNIVERSE) return;
      seen[asset.symbol] = true;
      assets.push(asset);
    }
    // Open positions first: the bot must always be able to mark and close them.
    state.positions.forEach(function (pos) {
      if (pos && pos.symbol) add(knownAsset(pos));
    });
    TA.store.watchlist().forEach(function (entry) {
      if (entry && entry.symbol) add(knownAsset(entry));
    });
    if (state.autoStocks !== false && TA.recommend) {
      TA.recommend.universe().forEach(add);
    }
    if (!assets.length) {
      FALLBACK.forEach(function (symbol) { add(TA.catalog.find(symbol)); });
    }
    return assets;
  }

  function autoStockCount(state) {
    if (state.autoStocks === false || !TA.recommend) return 0;
    return TA.recommend.universe().length;
  }

  function loadAsset(asset) {
    return TA.data.getMarketData(asset, { timeframe: 'daily' }).then(function (payload) {
      var a = TA.analysis.build({
        asset: payload.asset, candles: payload.candles, quote: payload.quote,
        meta: payload.meta, lang: lang()
      });
      var quote = payload.quote || {};
      var quotePrice = U.isNum(quote.price) && quote.price > 0 ? quote.price : null;
      var live = a.asset.assetClass === 'crypto' && payload.meta && payload.meta.dataMode === 'live' && quotePrice != null;
      var plan = TA.tradeplan.build(a, {
        lang: lang(), style: 'swing',
        price: live ? quotePrice : undefined,
        changePct: live ? quote.changePct : undefined,
        live: live,
        asOf: (payload.meta && (payload.meta.providerUpdatedAt || payload.meta.seriesEnd)) || Date.now()
      });
      return {
        asset: a.asset,
        a: a,
        plan: plan,
        price: quotePrice || a.facts.price,
        meta: payload.meta,
        live: live
      };
    });
  }

  function stillHere(root) {
    return !!(root && root.isConnected && root.querySelector('[data-bot-view]'));
  }

  function runScan(root) {
    var current = readState();
    if (scanning || !current.enabled) return;
    scanning = true;
    paint(root);
    var assets = universe(current);
    Promise.all(assets.map(function (asset) {
      return loadAsset(asset).catch(function () { return null; });
    })).then(function (results) {
      scanning = false;
      if (!stillHere(root)) return;
      var inputs = results.filter(function (r) { return r && r.plan && r.a; });
      if (!inputs.length) {
        ui.toast(T('bot.toast.noData'));
        paint(root);
        return;
      }
      var out = TA.bot.scan(readState(), inputs, {
        settings: TA.store.settings(),
        now: Date.now(),
        autoApprove: current.approval !== 'ask'
      });
      writeState(out.state);
      var opened = out.events.filter(function (e) { return e.type === 'open'; }).length;
      var closed = out.events.filter(function (e) { return e.type === 'close'; }).length;
      var proposed = out.events.filter(function (e) { return e.type === 'propose'; }).length;
      ui.toast(T('bot.toast.scan', { opened: opened, closed: closed, proposed: proposed }));
      paint(root);
      maybeAutoLive(root, out);
    }).catch(function () {
      scanning = false;
      if (!stillHere(root)) return;
      ui.toast(T('bot.toast.noData'));
      paint(root);
    });
  }

  function liveAutoReady() {
    var keys = brokerKeys();
    if (!keys || keys.mode !== 'live') return false;
    if (!TA.broker.readAutopilot()) return false;
    if (!broker.account) return false;
    return TA.broker.canTrade(broker.account).ok;
  }

  // Session-scoped live autopilot: at most one confirmed-at-grant order per
  // scan, long U.S. stocks only, live data only, sized by the saved settings.
  function maybeAutoLive(root, out) {
    if (!liveAutoReady()) return;
    var row = (out.decisions || []).filter(function (d) {
      return d.action === 'open' && d.assetClass === 'stock' && d.side === 'long' && d.dataMode === 'live';
    })[0];
    if (!row) return;
    var keys = brokerKeys();
    var entry = row.entry || row.price;
    var sized = TA.tradeplan.size({ entry: entry, stop: row.stop, target: row.target, sizeAllowed: true }, TA.store.settings());
    var units = sized ? sized.units : 0;
    if (U.isNum(broker.account.buyingPower) && U.isNum(entry) && entry > 0) {
      units = Math.min(units, Math.floor(broker.account.buyingPower / entry));
    }
    var ticket = TA.broker.buildOrder({
      symbol: row.symbol, assetClass: row.assetClass, side: row.side,
      entry: entry, stop: row.stop, target: row.target, units: units
    });
    if (ticket.error) {
      logLive(row.symbol, 'error', T('bot.broker.err.' + ticket.error));
      if (stillHere(root)) { ui.toast(T('bot.broker.err.' + ticket.error)); paint(root); }
      return;
    }
    TA.broker.submit(keys, ticket.order, { confirm: true }).then(function (res) {
      logLive(row.symbol, 'sent', (res && res.status) || 'accepted');
      if (!stillHere(root)) return;
      ui.toast(T('bot.broker.auto.sent', { symbol: row.symbol }));
      paint(root);
      refreshBroker(root, { quiet: true });
    }).catch(function (err) {
      logLive(row.symbol, 'error', brokerErrorText(err));
      if (!stillHere(root)) return;
      ui.toast(T('bot.broker.auto.failed', { symbol: row.symbol }));
      paint(root);
    });
  }

  function logLive(symbol, status, detail) {
    var state = readState();
    state.log.unshift({
      ts: Date.now(), type: 'live', symbol: symbol, side: 'long',
      status: detail, outcome: status
    });
    writeState(state);
  }

  function toggleBot(root) {
    var state = readState();
    if (state.enabled) {
      state = TA.bot.stop(state);
      state.log.unshift({ ts: Date.now(), type: 'stop' });
      writeState(state);
      // Kill switch: pausing also revokes any live autopilot grant.
      if (TA.broker && TA.broker.readAutopilot()) TA.broker.clearAutopilot();
      ui.toast(T('bot.toast.paused'));
      paint(root);
      return;
    }
    state = TA.bot.start(state, TA.store.settings());
    state.log.unshift({ ts: Date.now(), type: 'start', price: state.startEquity });
    writeState(state);
    ui.toast(T('bot.toast.started'));
    paint(root);
    runScan(root);
  }

  function confirmReset(root) {
    ui.openModal({
      title: T('bot.reset.title'),
      body: '<p>' + U.esc(T('bot.reset.body')) + '</p>',
      actions: [
        { label: T('bot.reset.cancel') },
        {
          label: T('bot.reset.confirm'),
          kind: 'danger',
          onClick: function () {
            if (TA.store.clearBot) TA.store.clearBot();
            ui.toast(T('bot.toast.reset'));
            paint(root);
          }
        }
      ]
    });
  }

  function statusText(state) {
    if (scanning) return T('bot.status.scanning');
    if (!state.enabled) return T('bot.status.off');
    if (!state.lastScanAt) return T('bot.status.never');
    return T('bot.status.ready', { time: U.fmtDateTime(state.lastScanAt, lang()) });
  }

  function headerHtml(state) {
    var keys = brokerKeys();
    var auto = TA.broker && TA.broker.readAutopilot();
    var badge = state.enabled
      ? '<span class="badge badge-live"><i class="dot pulse"></i>' + U.esc(T('bot.badge.on')) + '</span>'
      : '<span class="badge badge-neutral">' + U.esc(T('bot.badge.off')) + '</span>';
    var liveBadge = keys
      ? '<span class="bot-broker-badge ' + (keys.mode === 'live' ? 'live' : 'paper') + '">' +
          (keys.mode === 'live' ? ui.icon('pulse', 11) : ui.icon('shield', 11)) +
          U.esc(T(keys.mode === 'live' ? 'bot.broker.badge.live' : 'bot.broker.badge.paper')) + '</span>'
      : '';
    var autoBadge = auto
      ? '<span class="bot-broker-badge live"><i class="dot pulse"></i>' + U.esc(T('bot.auto.badge')) + '</span>'
      : '';
    var watchCount = TA.store.watchlist().length;
    var scopeCount = universe(state).length;
    var scope = T(scopeCount === 1 ? 'bot.rule.watchlistOne' : 'bot.rule.watchlist', { n: scopeCount });
    if (!watchCount) {
      scope += ' · ' + T(state.autoStocks !== false ? 'bot.status.noWatchAuto' : 'bot.status.noWatch', {
        list: universe(state).map(function (a) { return a.symbol; }).join(', ')
      });
    }
    scope += ' · ' + T(state.approval === 'ask' ? 'bot.rule.askFirst' : 'bot.rule.autoOpen');
    return '<header class="bot-head">' +
      '<div class="bot-head-copy">' +
        '<span class="eyebrow"><i class="dot"></i>' + U.esc(T('bot.eyebrow')) + '</span>' +
        '<div class="bot-title-row"><h1>' + U.esc(T('bot.title')) + '</h1>' +
          '<span class="bot-sim">' + ui.icon('sparkles', 12) + U.esc(T('bot.persona.name')) + '</span></div>' +
        '<p class="bot-lede">' + U.esc(T('bot.lede')) + '</p>' +
        '<div class="bot-meta">' + badge + liveBadge + autoBadge + '<span class="bot-meta-text">' + U.esc(statusText(state)) + '</span></div>' +
        '<p class="tiny muted bot-scope">' + U.esc(scope) + '</p>' +
      '</div>' +
      '<div class="bot-actions">' +
        (state.enabled
          ? '<button class="btn btn-ghost" type="button" data-bot-toggle>' + ui.icon('close', 14) + U.esc(T('bot.action.pause')) + '</button>'
          : '<button class="btn btn-primary" type="button" data-bot-toggle>' + ui.icon('pulse', 14) + U.esc(T('bot.action.start')) + '</button>') +
        '<button class="btn btn-cyan" type="button" data-bot-scan' + (!state.enabled || scanning ? ' disabled' : '') + '>' +
          ui.icon('refresh', 14) + U.esc(T(scanning ? 'bot.action.scanning' : 'bot.action.scan')) + '</button>' +
        '<button class="btn btn-sm btn-ghost bot-reset" type="button" data-bot-reset>' +
          U.esc(T('bot.action.reset')) + '</button>' +
      '</div>' +
    '</header>' +
    '<div class="disclaimer bot-disclaimer">' + ui.icon('warning', 15) +
      '<div><b>' + U.esc(T(keys ? 'bot.broker.discTitle' : 'bot.badge.sim')) + '.</b> ' +
      U.esc(T(keys ? (auto ? 'bot.disclaimer.autopilot' : 'bot.disclaimer.live') : 'bot.disclaimer')) + '</div></div>';
  }

  function tile(label, value, note, toneClass) {
    return '<div class="bot-stat' + (toneClass ? ' ' + toneClass : '') + '">' +
      '<span class="k">' + U.esc(label) + '</span>' +
      '<b>' + value + '</b>' +
      (note ? '<span class="n">' + U.esc(note) + '</span>' : '') +
    '</div>';
  }

  function statsCard(state, stats) {
    var settings = TA.store.settings();
    var curve = state.equity.map(function (e) { return e.v; });
    var accountLine = T('bot.rule.account', {
      size: money(stats.startEquity),
      risk: U.fmtPct(Number(settings.riskPct) || 0, { sign: false })
    });
    var closedNote = T('bot.stats.closed', { n: stats.closedCount });
    var rNote = U.isNum(stats.avgR) ? T('bot.stats.avgR', { r: signedR(stats.avgR) }) : '—';
    var openNote = money(stats.openRisk) + ' ' + T('bot.stats.atRisk');
    return '<section class="card span-12 edge-cyan bot-card" aria-labelledby="bot-stats-title">' +
      '<div class="card-head bot-stats-head">' +
        '<div><h2 id="bot-stats-title">' + ui.icon('pulse', 14) + U.esc(T('bot.stats.title')) + '</h2>' +
        '<p class="tiny muted">' + U.esc(accountLine) + '</p></div>' +
        '<div class="bot-stats-side">' +
          (curve.length > 1 ? TA.charts.spark(curve, 220, 48) : '') +
          '<label class="bot-max">' + U.esc(T('bot.rule.max')) +
            '<select class="input" data-bot-max>' +
              TA.bot.positionLimits.map(function (n) {
                return '<option value="' + n + '"' + (n === state.maxPositions ? ' selected' : '') + '>' + n + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
        '</div>' +
      '</div>' +
      '<div class="card-body bot-stats-grid">' +
        tile(T('bot.stats.equity'), money(stats.equity), signedMoney(stats.realized), tone(stats.returnPct)) +
        tile(T('bot.stats.return'), U.fmtPct(stats.returnPct, { sign: true }), T('bot.stats.unrealized') + ' ' + signedMoney(stats.unrealized), tone(stats.returnPct)) +
        tile(T('bot.stats.winRate'), U.isNum(stats.winRate) ? U.fmtPct(stats.winRate, { sign: false, decimals: 0 }) : '—', closedNote) +
        tile(T('bot.stats.totalR'), signedR(stats.totalR), rNote, tone(stats.totalR)) +
        tile(T('bot.stats.open'), String(stats.openCount), openNote) +
        tile(T('bot.stats.pf'), U.isNum(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '—', T('bot.stats.realized') + ' ' + signedMoney(stats.realized)) +
      '</div></section>';
  }

  function brokerCard() {
    var keys = brokerKeys();
    var connected = !!keys;
    var live = connected && keys.mode === 'live';
    var acct = broker.account;
    var trade = connected && acct ? TA.broker.canTrade(acct) : { ok: false, reason: 'missing' };
    var head = '<div class="card-head bot-broker-head">' +
      '<div><h2>' + ui.icon('layers', 14) + U.esc(T('bot.broker.title')) + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('bot.broker.subtitle')) + '</p></div>' +
      (connected
        ? '<span class="bot-broker-badge ' + (live ? 'live' : 'paper') + '">' +
            (live ? ui.icon('pulse', 11) : ui.icon('shield', 11)) +
            U.esc(T(live ? 'bot.broker.badge.live' : 'bot.broker.badge.paper')) + '</span>'
        : '<span class="badge badge-neutral">' + U.esc(T('bot.broker.off')) + '</span>') +
    '</div>';

    var body;
    if (!connected) {
      body = '<p class="bot-broker-lede">' + U.esc(T('bot.broker.disconnected')) + '</p>' +
        '<form class="bot-broker-form" data-broker-form>' +
          '<label class="bot-field"><span>' + U.esc(T('bot.broker.mode')) + '</span>' +
            '<select class="input" data-broker-mode>' +
              '<option value="live" selected>' + U.esc(T('bot.broker.mode.live')) + '</option>' +
              '<option value="paper">' + U.esc(T('bot.broker.mode.paper')) + '</option>' +
            '</select></label>' +
          '<label class="bot-field"><span>' + U.esc(T('bot.broker.keyId')) + '</span>' +
            '<input class="input" data-broker-key autocomplete="off" spellcheck="false" placeholder="PK…"></label>' +
          '<label class="bot-field"><span>' + U.esc(T('bot.broker.secret')) + '</span>' +
            '<input class="input" type="password" data-broker-secret autocomplete="new-password" spellcheck="false"></label>' +
          '<button class="btn btn-danger" type="submit" data-broker-connect' + (broker.loading ? ' disabled' : '') + '>' +
            U.esc(T(broker.loading ? 'bot.broker.connecting' : 'bot.broker.connect')) + '</button>' +
        '</form>' +
        (broker.error ? '<p class="bot-broker-error">' + U.esc(brokerErrorText({ code: broker.error })) + '</p>' : '') +
        '<p class="tiny muted bot-broker-note">' + U.esc(T('bot.broker.keysNote')) + '</p>';
    } else {
      var stats = acct
        ? '<div class="bot-broker-stats">' +
            '<div><span>' + U.esc(T('bot.broker.status')) + '</span><b>' + U.esc(acct.status || '—') + '</b></div>' +
            '<div><span>' + U.esc(T('bot.broker.equity')) + '</span><b>' + U.esc(money(acct.equity)) + '</b></div>' +
            '<div><span>' + U.esc(T('bot.broker.buyingPower')) + '</span><b>' + U.esc(money(acct.buyingPower)) + '</b></div>' +
            '<div><span>' + U.esc(T('bot.broker.cash')) + '</span><b>' + U.esc(money(acct.cash)) + '</b></div>' +
            '<div><span>' + U.esc(T('bot.broker.account')) + '</span><b>' + U.esc(acct.accountNumber ? '•••• ' + String(acct.accountNumber).slice(-4) : '—') + '</b></div>' +
          '</div>'
        : '<p class="tiny muted">' + U.esc(broker.loading ? T('bot.broker.loading') : T('bot.broker.noAccount')) + '</p>';

      var positions = broker.positions.length
        ? '<div class="bot-table-wrap"><table class="bot-table bot-broker-table"><thead><tr>' +
            '<th>' + U.esc(T('bot.broker.col.symbol')) + '</th><th>' + U.esc(T('bot.broker.col.side')) + '</th>' +
            '<th>' + U.esc(T('bot.broker.col.qty')) + '</th><th>' + U.esc(T('bot.broker.col.value')) + '</th>' +
            '<th>' + U.esc(T('bot.broker.col.pnl')) + '</th></tr></thead><tbody>' +
            broker.positions.map(function (p) {
              return '<tr><td><b>' + U.esc(p.symbol || '—') + '</b></td>' +
                '<td class="' + (p.side === 'short' ? 'down' : 'up') + '">' + U.esc(p.side === 'short' ? T('bot.side.short') : T('bot.side.long')) + '</td>' +
                '<td>' + U.esc(U.isNum(p.qty) ? String(p.qty) : '—') + '</td>' +
                '<td>' + U.esc(money(p.marketValue)) + '</td>' +
                '<td class="' + tone(p.unrealizedPl) + '">' + U.esc(signedMoney(p.unrealizedPl)) + '</td></tr>';
            }).join('') +
          '</tbody></table></div>'
        : '<div class="empty bot-broker-empty">' + U.esc(T('bot.broker.positionsEmpty')) + '</div>';

      var orders = broker.orders.length
        ? '<ul class="bot-broker-orders">' + broker.orders.slice(0, 8).map(function (o) {
            return '<li><b>' + U.esc(o.symbol || '—') + '</b>' +
              '<span class="bot-side ' + (o.side === 'sell' ? 'down' : 'up') + '">' + U.esc(o.side || '—') + '</span>' +
              '<span class="tiny muted">' + U.esc((o.qty == null ? '—' : o.qty) + ' · ' + (o.type || 'order') + ' · ' + (o.status || '')) + '</span></li>';
          }).join('') + '</ul>'
        : '<div class="empty bot-broker-empty">' + U.esc(T('bot.broker.ordersEmpty')) + '</div>';

      body = '<div class="disclaimer bot-broker-warn">' + ui.icon('warning', 15) + '<div>' +
          U.esc(T(live ? 'bot.broker.liveWarn' : 'bot.broker.paperWarn')) + '</div></div>' +
        stats +
        (broker.error ? '<p class="bot-broker-error">' + U.esc(brokerErrorText({ code: broker.error })) + '</p>' : '') +
        (acct && !trade.ok ? '<p class="bot-broker-error">' + U.esc(T('bot.broker.blockedNote')) + '</p>' : '') +
        '<div class="bot-broker-split">' +
          '<div><h3>' + U.esc(T('bot.broker.positions')) + '</h3>' + positions + '</div>' +
          '<div><h3>' + U.esc(T('bot.broker.orders')) + '</h3>' + orders + '</div>' +
        '</div>' +
        '<div class="bot-broker-actions">' +
          '<button class="btn btn-sm btn-ghost" type="button" data-broker-refresh' + (broker.loading ? ' disabled' : '') + '>' +
            ui.icon('refresh', 12) + U.esc(T(broker.loading ? 'bot.broker.loading' : 'bot.broker.refresh')) + '</button>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-broker-disconnect>' + U.esc(T('bot.broker.disconnect')) + '</button>' +
        '</div>' +
        '<p class="tiny muted bot-broker-note">' + U.esc(T('bot.broker.sessionNote')) + '</p>';
    }

    return '<section class="card span-12 edge-bear bot-card bot-broker-card" aria-labelledby="bot-broker-title">' +
      head.replace('<h2>', '<h2 id="bot-broker-title">') +
      '<div class="card-body">' + body + '</div></section>';
  }

  function canSendProposal(p) {
    if (!p || !brokerKeys() || !broker.account) return false;
    if (p.assetClass !== 'stock' || p.side !== 'long' || p.dataMode !== 'live') return false;
    var scan = readState().lastScan;
    if (!scan || !U.isNum(scan.at) || Date.now() - scan.at > LIVE_SCAN_MAX_MS) return false;
    return TA.broker.canTrade(broker.account).ok;
  }

  function proposalRow(p) {
    var mins = U.isNum(p.expiresAt) ? Math.max(0, Math.round((p.expiresAt - Date.now()) / 60000)) : null;
    var id = U.attr(p.id);
    return '<li class="bot-pending-row">' +
      '<div class="bot-pending-main"><b>' + U.esc(p.symbol) + '</b>' +
        '<span class="bot-side ' + (p.side === 'long' ? 'up' : 'down') + '">' + U.esc(sideText(p.side)) + '</span>' +
        '<p class="tiny muted">' + U.esc(T('bot.pending.levels', {
          entry: U.fmtPrice(p.entry, '', lang()),
          stop: U.fmtPrice(p.stop, '', lang()),
          target: U.fmtPrice(p.target, '', lang())
        })) + '</p>' +
        '<p class="tiny muted">' + U.esc(T('bot.pending.size', {
          units: p.units, risk: money(p.riskAmount), rr: U.isNum(p.rr) ? p.rr.toFixed(1) : '—'
        })) + '</p>' +
        (mins == null ? '' : '<p class="tiny muted">' + U.esc(T('bot.pending.expires', { n: mins })) + '</p>') +
      '</div>' +
      '<div class="bot-pending-actions">' +
        '<button class="btn btn-xs btn-primary" type="button" data-pending-approve="' + id + '">' +
          U.esc(T('bot.pending.approve')) + '</button>' +
        (canSendProposal(p)
          ? '<button class="btn btn-xs btn-danger" type="button" data-pending-live="' + id + '">' +
              ui.icon('warning', 11) + U.esc(T('bot.pending.live')) + '</button>'
          : '') +
        '<button class="btn btn-xs btn-ghost" type="button" data-pending-decline="' + id + '">' +
          U.esc(T('bot.pending.decline')) + '</button>' +
      '</div>' +
    '</li>';
  }

  function pendingCard(state) {
    var rows = state.pending.map(proposalRow).join('');
    var body = rows
      ? '<ul class="bot-pending-list">' + rows + '</ul>'
      : '<div class="empty">' + U.esc(T(state.approval === 'ask' ? 'bot.pending.emptyAsk' : 'bot.pending.emptyAuto')) + '</div>';
    return '<section class="card span-7 edge-amber bot-card" aria-labelledby="bot-pending-title">' +
      '<div class="card-head"><div><h2 id="bot-pending-title">' + ui.icon('flag', 14) + U.esc(T('bot.pending.title')) + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('bot.pending.subtitle')) + '</p></div>' +
      '<span class="badge badge-neutral">' + state.pending.length + ' / ' + TA.bot.maxPending + '</span></div>' +
      '<div class="card-body">' + body + '</div></section>';
  }

  function moodText(state, summary) {
    if (!state.enabled) return T('bot.persona.mood.paused');
    if (summary.openCount > 0) return T('bot.persona.mood.watching');
    if (summary.closedCount > 0 && summary.totalR > 0) return T('bot.persona.mood.up');
    if (summary.closedCount > 0 && summary.totalR < 0) return T('bot.persona.mood.down');
    return T('bot.persona.mood.ready');
  }

  function personaCard(state, summary) {
    var keys = brokerKeys();
    var auto = TA.broker && TA.broker.readAutopilot();
    var live = keys && keys.mode === 'live';
    var mood = moodText(state, summary);
    var moodTone = !state.enabled ? 'flat' : summary.totalR > 0 ? 'up' : summary.totalR < 0 ? 'down' : 'flat';
    var quip = T(TA.bot.voice('mood', state.scans + Math.floor(Date.now() / 86400000)));
    var options = [
      { id: 'ask', key: 'bot.auto.mode.ask' },
      { id: 'paper', key: 'bot.auto.mode.paper' },
      { id: 'auto', key: 'bot.auto.mode.auto' }
    ].map(function (o) {
      return '<option value="' + o.id + '"' + (state.approval === o.id ? ' selected' : '') + '>' +
        U.esc(T(o.key)) + '</option>';
    }).join('');
    var autoLive = live
      ? (auto
          ? '<div class="bot-auto-live on">' +
              '<div><b>' + ui.icon('pulse', 12) + ' ' + U.esc(T('bot.auto.liveOn')) + '</b>' +
              '<p class="tiny muted">' + U.esc(T('bot.auto.liveOnNote', {
                time: U.fmtDateTime(auto.at, lang())
              })) + '</p></div>' +
              '<button class="btn btn-sm btn-ghost" type="button" data-bot-revoke>' + U.esc(T('bot.auto.revoke')) + '</button>' +
            '</div>'
          : '<div class="bot-auto-live">' +
              '<div><b>' + U.esc(T('bot.auto.liveOff')) + '</b>' +
              '<p class="tiny muted">' + U.esc(T('bot.auto.liveOffNote')) + '</p></div>' +
              '<button class="btn btn-sm btn-danger" type="button" data-bot-authorize>' +
                ui.icon('warning', 11) + U.esc(T('bot.auto.authorize')) + '</button>' +
            '</div>')
      : '<p class="tiny muted bot-auto-note">' + U.esc(T('bot.auto.needLive')) + '</p>';
    var modeNote = T('bot.auto.note.' + state.approval);
    return '<section class="card span-5 edge-magenta bot-card bot-persona-card" aria-labelledby="bot-persona-title">' +
      '<div class="card-head bot-persona-head">' +
        '<div class="bot-persona-id">' +
          '<span class="bot-persona-avatar" aria-hidden="true">' + ui.icon('sparkles', 18) + '</span>' +
          '<div><h2 id="bot-persona-title">' + U.esc(T('bot.persona.name')) + '</h2>' +
          '<p class="tiny muted">' + U.esc(T('bot.persona.subtitle')) + '</p></div>' +
        '</div>' +
        '<span class="bot-mood ' + moodTone + '">' + U.esc(mood) + '</span>' +
      '</div>' +
      '<div class="card-body bot-persona-body">' +
        '<p class="bot-persona-quip">“' + U.esc(quip) + '”</p>' +
        '<label class="bot-field"><span>' + U.esc(T('bot.auto.mode')) + '</span>' +
          '<select class="input" data-bot-approval>' + options + '</select>' +
          '<small class="tiny muted">' + U.esc(modeNote) + '</small></label>' +
        '<label class="bot-check"><input type="checkbox" data-bot-stocks' + (state.autoStocks !== false ? ' checked' : '') + '> ' +
          '<span><b>' + U.esc(T('bot.auto.stocks')) + '</b>' +
          '<small class="tiny muted">' + U.esc(T('bot.auto.stocksNote')) + '</small></span></label>' +
        autoLive +
      '</div></section>';
  }

  function setApproval(root, value) {
    var state = readState();
    state.approval = TA.bot.approvals.indexOf(value) >= 0 ? value : 'ask';
    writeState(state);
    // Choosing a mode that promises to ask revokes any live autopilot grant.
    if (state.approval !== 'auto' && TA.broker && TA.broker.readAutopilot()) TA.broker.clearAutopilot();
    ui.toast(T('bot.auto.toast.' + state.approval));
    paint(root);
  }

  function confirmLiveAutopilot(root) {
    var keys = brokerKeys();
    if (!keys || keys.mode !== 'live') { ui.toast(T('bot.auto.err.liveOnly')); return; }
    var body = '<p class="broker-ticket-lede">' + U.esc(T('bot.auto.modal.lede')) + '</p>' +
      '<ul class="bot-auto-list">' +
        ['1', '2', '3', '4'].map(function (n) {
          return '<li>' + U.esc(T('bot.auto.modal.' + n)) + '</li>';
        }).join('') +
      '</ul>' +
      '<div class="disclaimer broker-ticket-warn">' + ui.icon('warning', 15) + '<div>' +
        U.esc(T('bot.auto.modal.warn')) + '</div></div>' +
      '<label class="broker-ack"><input type="checkbox" data-auto-ack> ' +
        U.esc(T('bot.auto.modal.ack')) + '</label>' +
      '<button class="btn btn-danger broker-send" type="button" data-auto-enable disabled>' +
        U.esc(T('bot.auto.modal.enable')) + '</button>';
    var close = ui.openModal({
      title: T('bot.auto.modal.title'),
      body: body,
      actions: [{ label: T('bot.auto.modal.cancel') }]
    });
    var ack = document.querySelector('#modal-root [data-auto-ack]');
    var enable = document.querySelector('#modal-root [data-auto-enable]');
    if (!ack || !enable) return;
    ack.addEventListener('change', function () { enable.disabled = !ack.checked; });
    enable.addEventListener('click', function () {
      if (!ack.checked || enable.disabled) return;
      if (!TA.broker.grantAutopilot(Date.now())) { ui.toast(T('bot.auto.err.liveOnly')); return; }
      var state = readState();
      state.approval = 'auto';
      writeState(state);
      close();
      ui.toast(T('bot.auto.toast.granted'));
      paint(root);
    });
  }

  function revokeAutopilot(root) {
    if (TA.broker) TA.broker.clearAutopilot();
    var state = readState();
    if (state.approval === 'auto') {
      state.approval = 'paper';
      writeState(state);
    }
    ui.toast(T('bot.auto.toast.revoked'));
    paint(root);
  }

  function approveProposal(root, id) {
    var out = TA.bot.approve(readState(), id, Date.now());
    writeState(out.state);
    if (out.error) ui.toast(T('bot.pending.err.' + out.error));
    else ui.toast(T('bot.pending.toast.approved', { symbol: out.position.symbol }));
    paint(root);
  }

  function declineProposal(root, id) {
    var out = TA.bot.decline(readState(), id, Date.now());
    writeState(out.state);
    ui.toast(T(out.error ? 'bot.pending.err.missing' : 'bot.pending.toast.declined'));
    paint(root);
  }

  function sendProposalLive(root, id) {
    var state = readState();
    var p = state.pending.filter(function (x) { return x.id === id; })[0];
    if (!p) { ui.toast(T('bot.pending.err.missing')); return; }
    var opened = openTicket(root, {
      action: 'open', symbol: p.symbol, assetClass: p.assetClass, side: p.side,
      dataMode: p.dataMode, entry: p.entry, stop: p.stop, target: p.target, rr: p.rr
    }, function (res) {
      var next = readState();
      next.pending = next.pending.filter(function (x) { return x.id !== id; });
      next.log.unshift({
        ts: Date.now(), type: 'live', symbol: p.symbol, side: p.side,
        status: (res && res.status) || 'accepted', outcome: 'sent'
      });
      writeState(next);
      paint(root);
    });
    if (!opened) ui.toast(T('bot.pending.err.live'));
  }

  function positionsCard(state) {
    var rows = state.positions.map(function (pos) {
      var pnl = (pos.last - pos.entry) * pos.units * (pos.side === 'long' ? 1 : -1);
      var r = pos.riskAmount > 0 ? pnl / pos.riskAmount : null;
      var href = TA.app.analysisUrl(knownAsset(pos), 'swing');
      return '<tr>' +
        '<td><a class="bot-sym" href="' + U.attr(href) + '">' + U.esc(pos.symbol) + '</a>' +
          '<span class="bot-side ' + (pos.side === 'long' ? 'up' : 'down') + '">' + U.esc(sideText(pos.side)) + '</span>' +
          '<span class="bot-row-date">' + U.esc(U.fmtDate(pos.openedAt, lang(), { month: 'short', day: 'numeric' })) + '</span></td>' +
        '<td>' + U.esc(U.fmtPrice(pos.entry, '', lang())) + '</td>' +
        '<td>' + U.esc(U.fmtPrice(pos.last, '', lang())) + '</td>' +
        '<td class="down">' + U.esc(U.fmtPrice(pos.stop, '', lang())) + '</td>' +
        '<td class="up">' + U.esc(U.fmtPrice(pos.target, '', lang())) + '</td>' +
        '<td class="' + tone(pnl) + '">' + U.esc(signedMoney(pnl)) + '</td>' +
        '<td class="' + tone(pnl) + '">' + U.esc(signedR(r)) + '</td>' +
      '</tr>';
    }).join('');
    var body = rows
      ? '<div class="bot-table-wrap"><table class="bot-table"><thead><tr>' +
          '<th>' + U.esc(T('bot.pos.col.symbol')) + '</th><th>' + U.esc(T('bot.pos.col.entry')) + '</th>' +
          '<th>' + U.esc(T('bot.pos.col.last')) + '</th><th>' + U.esc(T('bot.pos.col.stop')) + '</th>' +
          '<th>' + U.esc(T('bot.pos.col.target')) + '</th><th>' + U.esc(T('bot.pos.col.pnl')) + '</th>' +
          '<th>' + U.esc(T('bot.pos.col.r')) + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="tiny muted bot-card-note">' + U.esc(T('bot.pos.note')) + '</p>'
      : '<div class="empty">' + U.esc(T('bot.pos.empty')) + '</div>';
    return '<section class="card span-7 edge-magenta bot-card" aria-labelledby="bot-pos-title">' +
      '<div class="card-head"><h2 id="bot-pos-title">' + ui.icon('layers', 14) + U.esc(T('bot.pos.title')) + '</h2>' +
      '<span class="badge badge-neutral">' + state.positions.length + ' / ' + state.maxPositions + '</span></div>' +
      '<div class="card-body">' + body + '</div></section>';
  }

  function liveAction(d, index, state) {
    if (!brokerKeys() || d.action !== 'open') return '';
    if (d.assetClass !== 'stock' || d.side !== 'long') {
      return '<span class="bot-broker-inline">' + U.esc(T('bot.broker.unsupported')) + '</span>';
    }
    if (d.dataMode !== 'live') return '<span class="bot-broker-inline">' + U.esc(T('bot.broker.err.sample')) + '</span>';
    var scan = state && state.lastScan;
    if (!scan || !U.isNum(scan.at) || Date.now() - scan.at > LIVE_SCAN_MAX_MS) {
      return '<span class="bot-broker-inline">' + U.esc(T('bot.broker.err.stale')) + '</span>';
    }
    if (!broker.account) return '<span class="bot-broker-inline">' + U.esc(T('bot.broker.notReady')) + '</span>';
    if (!TA.broker.canTrade(broker.account).ok) {
      return '<span class="bot-broker-inline">' + U.esc(T('bot.broker.err.blocked')) + '</span>';
    }
    return '<button class="btn btn-sm btn-danger bot-broker-btn" type="button" data-broker-order="' + index + '">' +
      ui.icon('warning', 11) + U.esc(T('bot.broker.review')) + '</button>';
  }

  function scanCard(state) {
    var scan = state.lastScan;
    var rows = scan ? scan.decisions.slice(0, 10).map(function (d, i) {
      var actKey = d.action === 'open' ? 'open' : d.action === 'watch' ? 'watch' : 'skip';
      var reason = T('bot.scan.reason.' + d.reason);
      var price = U.isNum(d.entry) ? d.entry : d.price;
      var live = liveAction(d, i, state);
      var when = d.timing === 'now' || d.timing === 'armed'
        ? '<span class="bot-timing ' + d.timing + '">' + U.esc(T('bot.scan.timing.' + d.timing)) + '</span>'
        : '';
      return '<li class="bot-scan-row">' +
        '<span class="bot-pill bot-pill-' + actKey + '">' + U.esc(T('bot.scan.action.' + actKey)) + '</span>' +
        '<div class="bot-scan-main"><b>' + U.esc(d.symbol) + '</b>' +
          '<span class="bot-side ' + (d.side === 'short' ? 'down' : d.side === 'long' ? 'up' : 'flat') + '">' + U.esc(sideText(d.side)) + '</span>' +
          when +
          '<p class="tiny muted">' + U.esc(reason) + '</p></div>' +
        '<div class="bot-scan-num">' +
          '<b>' + U.esc(U.isNum(price) ? U.fmtPrice(price, '', lang()) : '—') + '</b>' +
          '<span class="tiny muted">' + U.esc(U.isNum(d.rr) ? T('bot.scan.rr', { rr: d.rr.toFixed(1) }) : '') + '</span>' +
          (d.dataMode === 'sample' ? '<span class="bot-sample-tag">' + U.esc(T('badge.sample')) + '</span>' : '') +
        '</div>' +
        (live ? '<div class="bot-scan-live">' + live + '</div>' : '') +
      '</li>';
    }).join('') : '';
    var body = rows
      ? '<ul class="bot-scan-list">' + rows + '</ul>' +
        '<p class="tiny muted bot-card-note">' + U.esc(T('bot.scan.time', {
          time: U.fmtDateTime(scan.at, lang()),
          n: scan.decisions.length
        })) + '</p>'
      : '<div class="empty">' + U.esc(T('bot.scan.empty')) + '</div>';
    return '<section class="card span-5 edge-violet bot-card" aria-labelledby="bot-scan-title">' +
      '<div class="card-head"><h2 id="bot-scan-title">' + ui.icon('search', 14) + U.esc(T('bot.scan.title')) + '</h2></div>' +
      '<div class="card-body">' + body + '</div></section>';
  }

  function closedCard(state) {
    var rows = state.closed.slice(0, 12).map(function (c) {
      return '<tr>' +
        '<td><b>' + U.esc(c.symbol) + '</b>' +
          '<span class="bot-side ' + (c.side === 'long' ? 'up' : 'down') + '">' + U.esc(sideText(c.side)) + '</span></td>' +
        '<td>' + U.esc(U.fmtPrice(c.entry, '', lang())) + '</td>' +
        '<td>' + U.esc(U.fmtPrice(c.exit, '', lang())) + '</td>' +
        '<td><span class="bot-reason bot-reason-' + U.attr(c.reason) + '">' + U.esc(T('bot.closed.reason.' + c.reason)) + '</span></td>' +
        '<td class="' + tone(c.pnl) + '">' + U.esc(signedMoney(c.pnl)) + '</td>' +
        '<td class="' + tone(c.r) + '">' + U.esc(signedR(c.r)) + '</td>' +
        '<td class="tiny muted">' + U.esc(U.fmtDate(c.closedAt, lang(), { month: 'short', day: 'numeric' })) + '</td>' +
      '</tr>';
    }).join('');
    var body = rows
      ? '<div class="bot-table-wrap"><table class="bot-table"><thead><tr>' +
          '<th>' + U.esc(T('bot.closed.col.symbol')) + '</th><th>' + U.esc(T('bot.closed.col.entry')) + '</th>' +
          '<th>' + U.esc(T('bot.closed.col.exit')) + '</th><th>' + U.esc(T('bot.closed.col.reason')) + '</th>' +
          '<th>' + U.esc(T('bot.closed.col.pnl')) + '</th><th>' + U.esc(T('bot.closed.col.r')) + '</th>' +
          '<th>' + U.esc(T('bot.closed.col.closed')) + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty">' + U.esc(T('bot.closed.empty')) + '</div>';
    return '<section class="card span-7 edge-amber bot-card" aria-labelledby="bot-closed-title">' +
      '<div class="card-head"><h2 id="bot-closed-title">' + ui.icon('check', 14) + U.esc(T('bot.closed.title')) + '</h2>' +
      '<span class="badge badge-neutral">' + state.closed.length + '</span></div>' +
      '<div class="card-body">' + body + '</div></section>';
  }

  function rulesCard() {
    var rules = ['1', '2', '3', '4', '5', '6'].map(function (n) {
      return '<li>' + U.esc(T('bot.rules.' + n)) + '</li>';
    }).join('');
    return '<section class="card span-5 bot-card" aria-labelledby="bot-rules-title">' +
      '<div class="card-head"><h2 id="bot-rules-title">' + ui.icon('book', 14) + U.esc(T('bot.rules.title')) + '</h2></div>' +
      '<div class="card-body"><ol class="bot-rule-list">' + rules + '</ol>' +
      '<a class="bot-settings-link" href="#/settings">' + ui.icon('settings', 12) + U.esc(T('bot.rules.link')) + '</a></div>' +
      '</section>';
  }

  function logCard(state) {
    var rows = state.log.slice(0, 14).map(function (e) {
      var side = sideText(e.side);
      var price = U.fmtPrice(e.price, '', lang());
      var text;
      if (e.type === 'start') text = T('bot.log.start', { size: money(e.price) });
      else if (e.type === 'stop') text = T('bot.log.stop');
      else if (e.type === 'open') text = T('bot.log.open', { side: side, symbol: e.symbol, price: price });
      else if (e.type === 'propose') text = T('bot.log.propose', { side: side, symbol: e.symbol, price: price });
      else if (e.type === 'expire') text = T('bot.log.expire', { symbol: e.symbol });
      else if (e.type === 'decline') text = T('bot.log.decline', { symbol: e.symbol });
      else if (e.type === 'manage') text = T('bot.log.manage', {
        kind: T('bot.log.manage.' + e.kind), symbol: e.symbol,
        stop: U.fmtPrice(e.stop, '', lang())
      });
      else if (e.type === 'live') text = T(e.outcome === 'sent' ? 'bot.log.live.sent' : 'bot.log.live.failed', {
        symbol: e.symbol || '—', detail: e.status || ''
      });
      else text = T('bot.log.close', {
        side: side, symbol: e.symbol, price: price,
        reason: T('bot.closed.reason.' + e.reason), pnl: signedMoney(e.pnl)
      });
      return '<li><span class="bot-log-time tiny muted">' + U.esc(U.fmtDateTime(e.ts, lang())) + '</span>' +
        '<span>' + U.esc(text) + '</span>' +
        (e.quip ? '<span class="bot-quip">' + U.esc(T(e.quip)) + '</span>' : '') + '</li>';
    }).join('');
    return '<section class="card span-12 bot-card" aria-labelledby="bot-log-title">' +
      '<div class="card-head"><h2 id="bot-log-title">' + ui.icon('clock', 14) + U.esc(T('bot.log.title')) + '</h2></div>' +
      '<div class="card-body">' +
        (rows ? '<ul class="bot-log">' + rows + '</ul>' : '<div class="empty">' + U.esc(T('bot.log.empty')) + '</div>') +
      '</div></section>';
  }

  function viewHtml(state) {
    var summary = TA.bot.stats(state, TA.store.settings());
    return '<div class="wrap page bot-page" data-bot-view>' + headerHtml(state) +
      '<div class="dash-grid">' +
        statsCard(state, summary) +
        brokerCard() +
        personaCard(state, summary) + pendingCard(state) +
        positionsCard(state) + scanCard(state) +
        closedCard(state) + rulesCard() +
        logCard(state) +
      '</div>' +
    '</div>';
  }

  function paint(root) {
    root.innerHTML = viewHtml(readState());
  }

  function bind(root) {
    if (root[BOUND]) return;
    root[BOUND] = true;
    root.addEventListener('click', function (e) {
      if (!root.querySelector('[data-bot-view]')) return;
      if (e.target.closest('[data-bot-toggle]')) { toggleBot(root); return; }
      if (e.target.closest('[data-bot-scan]')) { runScan(root); return; }
      if (e.target.closest('[data-bot-reset]')) { confirmReset(root); return; }
      if (e.target.closest('[data-bot-authorize]')) { confirmLiveAutopilot(root); return; }
      if (e.target.closest('[data-bot-revoke]')) { revokeAutopilot(root); return; }
      if (e.target.closest('[data-broker-refresh]')) { refreshBroker(root); return; }
      if (e.target.closest('[data-broker-disconnect]')) { disconnectBroker(root); return; }
      var approve = e.target.closest('[data-pending-approve]');
      if (approve) { approveProposal(root, approve.getAttribute('data-pending-approve')); return; }
      var decline = e.target.closest('[data-pending-decline]');
      if (decline) { declineProposal(root, decline.getAttribute('data-pending-decline')); return; }
      var live = e.target.closest('[data-pending-live]');
      if (live) { sendProposalLive(root, live.getAttribute('data-pending-live')); return; }
      var ticket = e.target.closest('[data-broker-order]');
      if (ticket) {
        var scan = readState().lastScan;
        var index = Number(ticket.getAttribute('data-broker-order'));
        var row = scan && scan.decisions ? scan.decisions[index] : null;
        openTicket(root, row);
      }
    });
    root.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-broker-form]');
      if (!form || !root.querySelector('[data-bot-view]')) return;
      e.preventDefault();
      connectBroker(root, form);
    });
    root.addEventListener('change', function (e) {
      if (!root.querySelector('[data-bot-view]')) return;
      var select = e.target.closest('[data-bot-max]');
      if (select) {
        var state = readState();
        state.maxPositions = Number(select.value);
        writeState(state);
        ui.toast(T('common.saved'));
        paint(root);
        return;
      }
      var approval = e.target.closest('[data-bot-approval]');
      if (approval) { setApproval(root, approval.value); return; }
      var stocks = e.target.closest('[data-bot-stocks]');
      if (stocks) {
        var next = readState();
        next.autoStocks = !!stocks.checked;
        writeState(next);
        ui.toast(T(stocks.checked ? 'bot.auto.toast.stocksOn' : 'bot.auto.toast.stocksOff'));
        paint(root);
        if (next.enabled) runScan(root);
      }
    });
  }

  function scheduleScans(root) {
    if (scanTimer) { window.clearInterval(scanTimer); scanTimer = null; }
    scanTimer = window.setInterval(function () {
      var hash = window.location.hash || '';
      if (!stillHere(root) || hash.indexOf('#/bot') !== 0) {
        window.clearInterval(scanTimer);
        scanTimer = null;
        return;
      }
      var state = readState();
      if (state.enabled) runScan(root);
    }, AUTO_SCAN_MS);
  }

  function render(root) {
    paint(root);
    bind(root);
    scheduleScans(root);
    var state = readState();
    if (state.enabled && (!state.lastScanAt || Date.now() - state.lastScanAt > AUTO_SCAN_MS)) runScan(root);
    if (brokerKeys() && !broker.loading && (!broker.at || Date.now() - broker.at > 60000)) refreshBroker(root, { quiet: true });
  }

  TA.views = TA.views || {};
  TA.views.bot = { render: render };
})(window.TA = window.TA || {});
