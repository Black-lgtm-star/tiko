/* views/overlay.js — share another app's chart, read it on-device and float the read over your work. */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };
  var lang = function () { return TA.i18n.get(); };

  var BOUND = '__overlayBound';
  var SYMBOL_KEY = 'gt.overlay.symbol.v1';
  var FALLBACK = ['BTC', 'ETH', 'AAPL', 'NVDA', 'SPY'];

  var session = { stream: null, read: null, error: null, since: null, status: 'overlay.status.idle' };
  var planState = { loading: false, error: null, plan: null };
  var planToken = 0;
  var timer = null;
  var reading = false;
  var lastReadAt = 0;
  var activeRoot = null;
  var pip = { win: null, video: null, canvas: null, state: null };
  var symbol = readSymbol();

  function readSymbol() {
    try {
      var saved = window.sessionStorage.getItem(SYMBOL_KEY);
      return saved ? String(saved).toUpperCase() : '';
    } catch (e) {
      return '';
    }
  }

  function writeSymbol(value) {
    try { window.sessionStorage.setItem(SYMBOL_KEY, value); } catch (e) {}
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

  function candidates() {
    var seen = {};
    var list = [];
    function add(asset) {
      if (!asset || !asset.symbol || seen[asset.symbol] || list.length >= 16) return;
      seen[asset.symbol] = true;
      list.push(asset);
    }
    var state = TA.store.botState ? TA.bot.normalize(TA.store.botState()) : null;
    if (state) state.positions.forEach(function (p) { add(knownAsset(p)); });
    TA.store.watchlist().forEach(function (entry) { add(knownAsset(entry)); });
    if (TA.recommend) TA.recommend.universe().forEach(add);
    if (!list.length) FALLBACK.forEach(function (sym) { add(TA.catalog.find(sym)); });
    return list;
  }

  function currentAsset() {
    var list = candidates();
    var hit = list.filter(function (a) { return a.symbol === symbol; })[0];
    if (hit) return hit;
    symbol = list[0] ? list[0].symbol : 'AAPL';
    return list[0] || { symbol: symbol, name: symbol, assetClass: 'stock', currency: 'USD', exchange: 'US', barsPerYear: 252 };
  }

  function stillHere(root) {
    return !!(root && root.isConnected && root.querySelector('[data-overlay-view]'));
  }

  function dirKey(direction) {
    return 'overlay.read.dir.' + (direction === 'up' || direction === 'down' ? direction : 'flat');
  }

  function money(v) {
    if (!U.isNum(v)) return '—';
    return '$ ' + new Intl.NumberFormat(lang() || 'en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(v);
  }

  function signedMoney(v) {
    if (!U.isNum(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '-' : '') + money(Math.abs(v));
  }

  function row(label, value) {
    return '<div><dt>' + U.esc(label) + '</dt><dd>' + U.esc(value) + '</dd></div>';
  }

  function readHtml() {
    var read = session.read;
    if (!read || !read.ok) {
      return '<div class="empty ov-read-empty">' + U.esc(T('overlay.read.empty')) + '</div>';
    }
    var m = TA.overlay.model(read.scan);
    var arrow = m.direction === 'up' ? ui.icon('up', 18) : m.direction === 'down' ? ui.icon('down', 18) : '';
    return '<div class="ov-read-head">' +
        '<span class="ov-dir ' + U.attr(m.direction) + '">' + arrow + U.esc(T(dirKey(m.direction))) + '</span>' +
        '<span class="ov-conf">' + U.esc(T('overlay.read.confidence')) + ' <b>' + m.confidence + '%</b></span>' +
        '<span class="badge badge-neutral">' + U.esc(T('overlay.read.quality.' + m.quality)) + '</span>' +
      '</div>' +
      '<dl class="ov-read-grid">' +
        row(T('overlay.read.position'), m.position + '%') +
        row(T('overlay.read.range'), m.support + '% / ' + m.resistance + '%') +
        row(T('overlay.read.shape'), T('overlay.read.shape.' + m.chartType)) +
        row(T('overlay.read.at'), U.fmtDateTime(read.at, lang())) +
      '</dl>' +
      '<p class="tiny muted ov-read-note">' + U.esc(T('overlay.read.caveat')) + '</p>';
  }

  function planHtml() {
    if (planState.loading) return '<p class="tiny muted ov-plan-line">' + U.esc(T('overlay.plan.loading')) + '</p>';
    if (planState.error) return '<p class="tiny muted ov-plan-line">' + U.esc(T(planState.error)) + '</p>';
    var plan = planState.plan;
    if (!plan) return '<div class="empty">' + U.esc(T('overlay.plan.empty', { symbol: symbol })) + '</div>';
    var side = plan.side === 'short' ? T('bot.side.short') : plan.side === 'long' ? T('bot.side.long') : T('bot.side.none');
    return '<dl class="ov-plan-grid">' +
        row(T('overlay.plan.side'), side) +
        row(T('overlay.plan.state'), plan.state ? T('plan.state.' + plan.state) : '—') +
        row(T('overlay.plan.entry'), U.fmtPrice(plan.entry, '', lang())) +
        row(T('overlay.plan.stop'), U.fmtPrice(plan.stop, '', lang())) +
        row(T('overlay.plan.target'), U.fmtPrice(plan.target, '', lang())) +
        row(T('overlay.plan.rr'), U.isNum(plan.rr) ? plan.rr.toFixed(1) + 'R' : '—') +
      '</dl>' +
      '<p class="tiny muted ov-plan-note">' + U.esc(T('overlay.plan.note')) + '</p>';
  }

  function botHtml() {
    var state = TA.bot.normalize(TA.store.botState ? TA.store.botState() : null);
    var position = state.positions.filter(function (p) { return p.symbol === symbol; })[0];
    var decision = state.lastScan && state.lastScan.decisions
      ? state.lastScan.decisions.filter(function (d) { return d.symbol === symbol; })[0]
      : null;
    var lines = [];
    if (!state.enabled) lines.push('<p class="tiny muted ov-bot-line">' + U.esc(T('overlay.bot.off')) + '</p>');
    if (position) {
      lines.push('<p class="ov-bot-line"><b>' + U.esc(T('overlay.bot.position', {
        side: position.side === 'short' ? T('bot.side.short') : T('bot.side.long'),
        entry: U.fmtPrice(position.entry, '', lang()),
        stop: U.fmtPrice(position.stop, '', lang()),
        target: U.fmtPrice(position.target, '', lang())
      })) + '</b></p>');
      if (U.isNum(position.last)) {
        var pnl = (position.last - position.entry) * position.units * (position.side === 'long' ? 1 : -1);
        lines.push('<p class="tiny muted ov-bot-line">' + U.esc(T('overlay.bot.pnl', { pnl: signedMoney(pnl) })) + '</p>');
      }
    }
    if (decision) {
      lines.push('<p class="tiny muted ov-bot-line">' + U.esc(T('overlay.bot.decision', {
        action: T('bot.scan.action.' + decision.action),
        reason: T('bot.scan.reason.' + decision.reason)
      })) + '</p>');
    }
    if (!position && !decision) {
      lines.push('<div class="empty">' + U.esc(T('overlay.bot.idle', { symbol: symbol })) + '</div>');
    }
    return lines.join('');
  }

  function statusHtml() {
    var live = !!session.stream;
    return '<span class="badge ' + (live ? 'badge-live' : 'badge-neutral') + '" data-overlay-state>' +
      (live ? '<i class="dot pulse"></i>' : '') + U.esc(T(live ? 'overlay.state.live' : 'overlay.state.idle')) + '</span>';
  }

  function headerHtml() {
    var live = !!session.stream;
    var pipReady = live && TA.overlay.pipSupported();
    var pipLabel = T(pip.win ? 'overlay.action.closeFloat' : 'overlay.action.float');
    return '<header class="ov-head">' +
        '<div class="ov-head-copy">' +
          '<span class="eyebrow"><i class="dot"></i>' + U.esc(T('overlay.eyebrow')) + '</span>' +
          '<div class="ov-title-row"><h1>' + U.esc(T('overlay.title')) + '</h1>' + statusHtml() + '</div>' +
          '<p class="ov-lede">' + U.esc(T('overlay.lede')) + '</p>' +
        '</div>' +
        '<div class="ov-actions">' +
          '<button class="btn btn-primary" type="button" data-overlay-share' + (live ? ' disabled' : '') + '>' +
            ui.icon('image', 14) + U.esc(T('overlay.action.share')) + '</button>' +
          '<button class="btn btn-ghost" type="button" data-overlay-stop' + (live ? '' : ' disabled') + '>' +
            ui.icon('close', 14) + U.esc(T('overlay.action.stop')) + '</button>' +
          '<button class="btn btn-cyan" type="button" data-overlay-pip' + (pipReady ? '' : ' disabled') + '>' +
            ui.icon('expand', 14) + '<span data-overlay-pip-label>' + U.esc(pipLabel) + '</span></button>' +
        '</div>' +
      '</header>';
  }

  function captureCard() {
    return '<section class="card span-8 edge-cyan ov-card" aria-labelledby="ov-capture-title">' +
        '<div class="card-head"><div><h2 id="ov-capture-title">' + ui.icon('image', 14) + U.esc(T('overlay.action.share')) + '</h2>' +
          '<p class="tiny muted">' + U.esc(TA.overlay.supported() ? T('overlay.idle.body') : T('overlay.unsupported')) + '</p></div>' +
          statusHtml() + '</div>' +
        '<div class="card-body">' +
          '<div class="ov-stage" data-overlay-stage>' +
            '<video class="ov-video" data-overlay-video muted playsinline autoplay></video>' +
            '<canvas class="ov-canvas" data-overlay-canvas width="16" height="9"></canvas>' +
            '<div class="ov-stage-empty" data-overlay-empty' + (session.stream ? ' hidden' : '') + '>' +
              '<b>' + U.esc(T('overlay.idle.title')) + '</b>' +
              '<span>' + U.esc(T('overlay.idle.body')) + '</span>' +
            '</div>' +
          '</div>' +
          '<p class="ov-status tiny muted" data-overlay-status>' + U.esc(T(session.status)) + '</p>' +
          '<div class="ov-read" data-overlay-read>' + readHtml() + '</div>' +
        '</div>' +
      '</section>';
  }

  function planCard() {
    var options = candidates().map(function (a) {
      return '<option value="' + U.attr(a.symbol) + '"' + (a.symbol === symbol ? ' selected' : '') + '>' +
        U.esc(a.symbol + ' · ' + (a.name || a.symbol)) + '</option>';
    }).join('');
    return '<section class="card span-4 edge-violet ov-card" aria-labelledby="ov-plan-title">' +
        '<div class="card-head"><h2 id="ov-plan-title">' + ui.icon('target', 14) + U.esc(T('overlay.plan.title')) + '</h2></div>' +
        '<div class="card-body">' +
          '<label class="ov-symbol"><span>' + U.esc(T('overlay.plan.symbol')) + '</span>' +
            '<select class="input" data-overlay-symbol>' + options + '</select></label>' +
          '<div class="ov-plan" data-overlay-plan>' + planHtml() + '</div>' +
        '</div>' +
      '</section>';
  }

  function botCard() {
    return '<section class="card span-7 edge-magenta ov-card" aria-labelledby="ov-bot-title">' +
        '<div class="card-head"><h2 id="ov-bot-title">' + ui.icon('pulse', 14) + U.esc(T('overlay.bot.title')) + '</h2></div>' +
        '<div class="card-body" data-overlay-bot>' + botHtml() + '</div>' +
      '</section>';
  }

  function pipCard() {
    var ready = TA.overlay.pipSupported();
    var label = T(pip.win ? 'overlay.action.closeFloat' : 'overlay.action.float');
    return '<section class="card span-5 edge-amber ov-card" aria-labelledby="ov-pip-title">' +
        '<div class="card-head"><h2 id="ov-pip-title">' + ui.icon('expand', 14) + U.esc(T('overlay.pip.title')) + '</h2></div>' +
        '<div class="card-body">' +
          '<p class="ov-lede">' + U.esc(T('overlay.pip.body')) + '</p>' +
          (ready ? '' : '<p class="tiny muted ov-pip-note">' + U.esc(T('overlay.pip.unsupported')) + '</p>') +
          '<button class="btn btn-sm btn-cyan" type="button" data-overlay-pip' +
            (session.stream && ready ? '' : ' disabled') + '>' +
            ui.icon('expand', 12) + '<span data-overlay-pip-label>' + U.esc(label) + '</span></button>' +
        '</div>' +
      '</section>';
  }

  function viewHtml() {
    return '<div class="wrap page ov-page" data-overlay-view>' + headerHtml() +
      '<div class="disclaimer ov-privacy">' + ui.icon('shield', 15) +
        '<div><b>' + U.esc(T('overlay.privacy.title')) + '</b> ' + U.esc(T('overlay.privacy.body')) + '</div></div>' +
      '<div class="dash-grid">' +
        captureCard() + planCard() + botCard() + pipCard() +
      '</div>' +
      '<p class="tiny muted ov-foot">' + U.esc(T('overlay.foot')) + '</p>' +
    '</div>';
  }

  function paint(root) {
    activeRoot = root;
    root.innerHTML = viewHtml();
    reattach(root);
    updateControls(root);
  }

  function reattach(root) {
    if (!session.stream) return;
    var video = root.querySelector('[data-overlay-video]');
    if (!video) return;
    TA.overlay.attach(video, session.stream);
    video.addEventListener('loadedmetadata', function () { sizeStage(root); });
    sizeStage(root);
  }

  function sizeStage(root) {
    var video = root.querySelector('[data-overlay-video]');
    var stage = root.querySelector('[data-overlay-stage]');
    if (!video || !stage) return;
    if (video.videoWidth && video.videoHeight) {
      stage.style.aspectRatio = video.videoWidth + ' / ' + video.videoHeight;
    }
  }

  function updateControls(root) {
    if (!root) return;
    var live = !!session.stream;
    var share = root.querySelector('[data-overlay-share]');
    var stop = root.querySelector('[data-overlay-stop]');
    if (share) share.disabled = live;
    if (stop) stop.disabled = !live;
    var pipReady = live && TA.overlay.pipSupported();
    Array.prototype.forEach.call(root.querySelectorAll('[data-overlay-pip]'), function (btn) {
      btn.disabled = !pipReady;
      var label = btn.querySelector('[data-overlay-pip-label]');
      if (label) label.textContent = T(pip.win ? 'overlay.action.closeFloat' : 'overlay.action.float');
    });
  }

  function setStatus(key) {
    session.status = key;
    var node = document.querySelector('[data-overlay-status]');
    if (node) node.textContent = T(key);
    Array.prototype.forEach.call(document.querySelectorAll('[data-overlay-state]'), function (badge) {
      var live = !!session.stream;
      badge.className = 'badge ' + (live ? 'badge-live' : 'badge-neutral');
      badge.innerHTML = (live ? '<i class="dot pulse"></i>' : '') + U.esc(T(live ? 'overlay.state.live' : 'overlay.state.idle'));
    });
    var empty = document.querySelector('[data-overlay-empty]');
    if (empty) empty.hidden = !!session.stream;
  }

  function renderRead() {
    var node = document.querySelector('[data-overlay-read]');
    if (node) node.innerHTML = readHtml();
  }

  function renderPlan() {
    var node = document.querySelector('[data-overlay-plan]');
    if (node) node.innerHTML = planHtml();
  }

  function renderBot() {
    var node = document.querySelector('[data-overlay-bot]');
    if (node) node.innerHTML = botHtml();
  }

  function drawPreview() {
    var canvas = document.querySelector('[data-overlay-canvas]');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!session.read || !session.read.ok) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    var scan = session.read.scan;
    if (canvas.width !== scan.width) canvas.width = scan.width;
    if (canvas.height !== scan.height) canvas.height = scan.height;
    TA.overlay.draw(ctx, scan, canvas.width, canvas.height);
  }

  function drawPip() {
    if (!pip.win || !pip.canvas) return;
    var ctx = pip.canvas.getContext('2d');
    if (!ctx) return;
    if (!session.read || !session.read.ok) {
      ctx.clearRect(0, 0, pip.canvas.width, pip.canvas.height);
      if (pip.state) pip.state.textContent = T('overlay.state.reading');
      return;
    }
    var scan = session.read.scan;
    if (pip.canvas.width !== scan.width) pip.canvas.width = scan.width;
    if (pip.canvas.height !== scan.height) pip.canvas.height = scan.height;
    TA.overlay.draw(ctx, scan, pip.canvas.width, pip.canvas.height);
    if (pip.state) {
      pip.state.textContent = symbol + ' · ' + T(dirKey(scan.direction)) + ' · ' + Math.round(scan.confidence * 100) + '%';
    }
  }

  function tick(root) {
    if (!session.stream) return;
    var hash = window.location.hash || '';
    if (hash.indexOf('#/overlay') !== 0 || !stillHere(root)) {
      stopSharing(root, { silent: true, leave: true });
      return;
    }
    if (reading) return;
    if (Date.now() - lastReadAt < TA.overlay.intervalMs * 0.8) return;
    var video = root.querySelector('[data-overlay-video]');
    if (!video || video.readyState < 2 || !video.videoWidth) { setStatus('overlay.status.waiting'); return; }
    reading = true;
    var read;
    try {
      read = TA.overlay.read(video);
    } catch (e) {
      read = { ok: false, reason: 'failed' };
    } finally {
      reading = false;
      lastReadAt = Date.now();
    }
    if (!read.ok) {
      session.error = read.reason;
      session.read = null;
      setStatus('overlay.status.unreadable');
      drawPreview();
      renderRead();
      drawPip();
      return;
    }
    session.error = null;
    session.read = read;
    setStatus('overlay.status.ok');
    drawPreview();
    renderRead();
    renderBot();
    drawPip();
  }

  function startLoop(root) {
    stopLoop();
    timer = window.setInterval(function () { tick(root); }, TA.overlay.intervalMs);
    var video = root.querySelector('[data-overlay-video]');
    if (!video || typeof video.requestVideoFrameCallback !== 'function') return;
    var step = function (now) {
      if (!session.stream || video.srcObject !== session.stream) return;
      if (video.videoWidth && now - lastReadAt >= TA.overlay.intervalMs) tick(root);
      video.requestVideoFrameCallback(step);
    };
    video.requestVideoFrameCallback(step);
  }

  function stopLoop() {
    if (timer) { window.clearInterval(timer); timer = null; }
  }

  function share(root) {
    if (!TA.overlay.supported()) {
      setStatus('overlay.status.unsupported');
      ui.toast(T('overlay.status.unsupported'));
      return;
    }
    var btn = root.querySelector('[data-overlay-share]');
    if (btn) btn.disabled = true;
    TA.overlay.start().then(function (stream) {
      if (!stillHere(root)) {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        return;
      }
      session.stream = stream;
      session.read = null;
      session.error = null;
      session.since = Date.now();
      session.status = 'overlay.status.waiting';
      var video = root.querySelector('[data-overlay-video]');
      TA.overlay.attach(video, stream);
      if (video) {
        video.addEventListener('loadedmetadata', function () { sizeStage(root); });
        sizeStage(root);
      }
      stream.getVideoTracks().forEach(function (track) {
        track.addEventListener('ended', function () {
          if (session.stream === stream) stopSharing(root, { silent: true });
        });
      });
      lastReadAt = 0;
      startLoop(root);
      setStatus('overlay.status.waiting');
      updateControls(root);
      ui.toast(T('overlay.toast.started'));
      window.setTimeout(function () { if (session.stream === stream) tick(root); }, 400);
    }).catch(function (err) {
      var code = err && err.code;
      var key = code === 'NotAllowedError' ? 'overlay.status.denied'
        : code === 'unsupported' || code === 'NotSupportedError' ? 'overlay.status.unsupported'
        : 'overlay.status.failed';
      session.error = key;
      updateControls(root);
      setStatus(key);
      ui.toast(T(key));
    });
  }

  function closePip() {
    var win = pip.win;
    pip = { win: null, video: null, canvas: null, state: null };
    if (win) {
      try { win.close(); } catch (e) {}
    }
  }

  function stopSharing(root, opts) {
    opts = opts || {};
    stopLoop();
    if (session.stream) TA.overlay.stop();
    closePip();
    session = { stream: null, read: null, error: null, since: null, status: 'overlay.status.stopped' };
    lastReadAt = 0;
    if (!opts.silent) ui.toast(T('overlay.toast.stopped'));
    if (!opts.leave && stillHere(root)) paint(root);
  }

  function openPip(root) {
    if (pip.win) { closePip(); updateControls(root); return; }
    if (!TA.overlay.pipSupported()) { ui.toast(T('overlay.pip.unsupported')); return; }
    if (!session.stream) { ui.toast(T('overlay.status.idle')); return; }
    documentPictureInPicture.requestWindow({ width: 480, height: 320 }).then(function (win) {
      pip.win = win;
      win.document.title = T('overlay.pip.window');
      var link = win.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('styles.css', window.location.href).href;
      win.document.head.appendChild(link);
      win.document.body.className = 'ov-pip-body';
      win.document.body.innerHTML =
        '<div class="ov-pip">' +
          '<div class="ov-pip-head"><b>' + U.esc(T('bot.persona.name')) + '</b>' +
            '<span class="ov-pip-state" data-pip-state>' + U.esc(T('overlay.state.reading')) + '</span></div>' +
          '<div class="ov-pip-stage"><video data-pip-video muted playsinline autoplay></video><canvas data-pip-canvas width="16" height="9"></canvas></div>' +
          '<p class="ov-pip-foot">' + U.esc(T('overlay.pip.foot')) + '</p>' +
        '</div>';
      pip.video = win.document.querySelector('[data-pip-video]');
      pip.canvas = win.document.querySelector('[data-pip-canvas]');
      pip.state = win.document.querySelector('[data-pip-state]');
      var stage = win.document.querySelector('.ov-pip-stage');
      function size() {
        if (pip.video && pip.video.videoWidth) stage.style.aspectRatio = pip.video.videoWidth + ' / ' + pip.video.videoHeight;
      }
      pip.video.addEventListener('loadedmetadata', size);
      pip.video.srcObject = session.stream;
      var played = pip.video.play();
      if (played && played.catch) played.catch(function () {});
      size();
      win.addEventListener('pagehide', function () {
        pip = { win: null, video: null, canvas: null, state: null };
        updateControls(activeRoot);
      });
      drawPip();
      updateControls(root);
      ui.toast(T('overlay.toast.pip'));
    }).catch(function () {
      ui.toast(T('overlay.pip.failed'));
    });
  }

  function loadPlan(root) {
    var asset = currentAsset();
    var token = ++planToken;
    planState = { loading: true, error: null, plan: null };
    renderPlan();
    TA.data.getMarketData(asset, { timeframe: 'daily' }).then(function (payload) {
      if (token !== planToken) return;
      var analysis = TA.analysis.build({
        asset: payload.asset, candles: payload.candles, quote: payload.quote,
        meta: payload.meta, lang: lang()
      });
      var plan = TA.tradeplan.build(analysis, { lang: lang(), style: 'swing' });
      planState = { loading: false, error: null, plan: plan };
      renderPlan();
    }).catch(function () {
      if (token !== planToken) return;
      planState = { loading: false, error: 'overlay.plan.error', plan: null };
      renderPlan();
    });
  }

  function bind(root) {
    if (root[BOUND]) return;
    root[BOUND] = true;
    root.addEventListener('click', function (e) {
      if (!root.querySelector('[data-overlay-view]')) return;
      if (e.target.closest('[data-overlay-share]')) { share(root); return; }
      if (e.target.closest('[data-overlay-stop]')) { stopSharing(root); return; }
      if (e.target.closest('[data-overlay-pip]')) { openPip(root); return; }
    });
    root.addEventListener('change', function (e) {
      var select = e.target.closest('[data-overlay-symbol]');
      if (!select || !root.querySelector('[data-overlay-view]')) return;
      symbol = String(select.value || '').toUpperCase();
      writeSymbol(symbol);
      loadPlan(root);
      renderBot();
    });
    window.addEventListener('hashchange', function () {
      var hash = window.location.hash || '';
      if (session.stream && hash.indexOf('#/overlay') !== 0) stopSharing(root, { silent: true, leave: false });
    });
    window.addEventListener('pagehide', function () {
      stopSharing(root, { silent: true, leave: true });
    });
  }

  function render(root) {
    currentAsset();
    if (!session.stream) session.status = 'overlay.status.idle';
    paint(root);
    bind(root);
    loadPlan(root);
  }

  TA.views = TA.views || {};
  TA.views.overlay = { render: render };
})(window.TA = window.TA || {});
