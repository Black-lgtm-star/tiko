/* app.js — app shell, hash router and boot */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };

  var appRoot = document.getElementById('app');
  var shellMounted = false;
  var clockTimer = null;

  function brandMark() {
    return '<span class="brand-mark">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 2.4 21 7.4v9.2L12 21.6 3 16.6V7.4Z" stroke="#ff2fd0" stroke-width="1.5"/>' +
        '<path d="M3 7.4 12 12.4l9-5" stroke="#29e0ff" stroke-width="1.5"/>' +
        '<path d="M12 12.4v9.2" stroke="#29e0ff" stroke-width="1.5"/></svg></span>';
  }

  function profileTriggerHtml() {
    return '<summary class="profile-trigger" aria-label="' + U.attr(T('profile.menu')) + '">' +
        '<span class="profile-avatar" aria-hidden="true">' + ui.icon('user', 17) + '</span>' +
        '<span class="profile-trigger-label">' + U.esc(T('profile.menu')) + '</span>' +
      '</summary>';
  }

  function alertRelative(at, now, rtf) {
    var diff = at.getTime() - now.getTime();
    var abs = Math.abs(diff);
    if (abs < 3600000) return rtf.format(Math.max(1, Math.round(diff / 60000)), 'minute');
    if (abs < 86400000) return rtf.format(Math.max(1, Math.round(diff / 3600000)), 'hour');
    return rtf.format(Math.round(diff / 86400000), 'day');
  }

  function alertEventTime(at) {
    try {
      return new Intl.DateTimeFormat(TA.i18n.get(), {
        timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      }).format(at);
    } catch (e) {
      return at.toISOString();
    }
  }

  function alertsRowHtml(labelKey, state, enabled, now, rtf) {
    var statusKey = !enabled ? 'alerts.panel.off' : state.open ? 'alerts.panel.open' : 'alerts.panel.closed';
    var detail = enabled
      ? T(state.next.type === 'close' ? 'alerts.panel.closesIn' : 'alerts.panel.opensIn',
          { when: alertRelative(state.next.at, now, rtf) })
      : '';
    return '<li class="alerts-row' + (enabled && state.open ? ' is-open' : '') + '">' +
        '<span class="alerts-row-label">' + U.esc(T(labelKey)) + '</span>' +
        '<span class="alerts-row-status">' + U.esc(T(statusKey)) + '</span>' +
        (enabled ? '<span class="alerts-row-time">' + U.esc(alertEventTime(state.next.at)) + '</span>' : '') +
        (detail ? '<span class="alerts-row-detail">' + U.esc(detail) + '</span>' : '') +
      '</li>';
  }

  function alertsPopoverHtml() {
    if (!TA.marketNotifications || !TA.marketNotifications.status) return '';
    var s = TA.marketNotifications.status();
    var now = s.at instanceof Date ? s.at : new Date();
    var rtf;
    try { rtf = new Intl.RelativeTimeFormat(TA.i18n.get(), { numeric: 'auto', style: 'short' }); }
    catch (e) { rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }); }
    var note = !s.enabled ? 'alerts.panel.pausedNote'
      : s.permission === 'denied' || s.permission === 'unsupported' ? 'alerts.panel.blocked'
      : 'alerts.panel.note';
    var actions = s.enabled
      ? (s.permission === 'default'
          ? '<button class="btn btn-sm" type="button" data-alerts-permission>' + U.esc(T('alerts.panel.allow')) + '</button>'
          : '') +
        '<button class="btn btn-sm" type="button" data-alerts-toggle>' + U.esc(T('alerts.pause')) + '</button>'
      : '<button class="btn btn-sm btn-primary" type="button" data-alerts-toggle>' + U.esc(T('alerts.enable')) + '</button>';
    actions += '<a class="btn btn-sm" href="#/settings" data-alerts-settings>' + U.esc(T('alerts.panel.settings')) + '</a>';
    return '<div class="alerts-popover-head">' +
        '<b>' + U.esc(T('alerts.panel.title')) + '</b>' +
        '<span class="alerts-badge">' + U.esc(T(s.enabled ? 'alerts.panel.on' : 'alerts.panel.paused')) + '</span>' +
      '</div>' +
      '<ul class="alerts-rows">' +
        alertsRowHtml('alerts.panel.stocks', s.stocks, s.stocksEnabled, now, rtf) +
        alertsRowHtml('alerts.panel.forex', s.forex, s.forexEnabled, now, rtf) +
      '</ul>' +
      '<p class="alerts-note">' + U.esc(T(note)) + '</p>' +
      '<div class="alerts-actions">' + actions + '</div>';
  }

  function alertsTriggerHtml() {
    var label = T('alerts.panel.title');
    return '<summary class="alerts-trigger" aria-label="' + U.attr(label) + '" title="' + U.attr(label) + '">' +
        ui.icon('bell', 17) +
        '<span class="alerts-dot" aria-hidden="true"></span>' +
      '</summary>';
  }

  function setAlertsTriggerState() {
    var menu = appRoot.querySelector('[data-alerts-menu]');
    if (!menu) return;
    var enabled = TA.marketNotifications && TA.marketNotifications.status
      ? TA.marketNotifications.status().enabled
      : false;
    menu.setAttribute('data-active', enabled ? 'true' : 'false');
  }

  function shellHtml() {
    return '<header class="appbar">' +
        '<div class="wrap appbar-inner">' +
          '<a class="brand" href="#/" aria-label="' + U.attr(T('app.name') + ' — ' + T('nav.dashboard')) + '">' +
            brandMark() +
            '<span><span class="brand-name">' + U.esc(T('app.name')) + '</span><br>' +
            '<span class="brand-sub">' + U.esc(T('app.tagline')) + '</span></span>' +
          '</a>' +
          '<nav class="appnav">' +
            '<a href="#/" data-nav="dashboard">' + U.esc(T('nav.dashboard')) + '</a>' +
            '<a href="#/markets" data-nav="markets">' + U.esc(T('nav.markets')) + '</a>' +
            '<a href="#/bot" data-nav="bot">' + U.esc(T('nav.bot')) + '</a>' +
            '<a href="#/brokers" data-nav="brokers">' + U.esc(T('nav.brokers')) + '</a>' +
            '<a href="#/settings" data-nav="settings">' + U.esc(T('nav.settings')) + '</a>' +
          '</nav>' +
          '<div class="header-actions">' +
            '<time class="site-clock" data-site-clock aria-label="Current local date and time" aria-live="off">' +
              '<span class="site-clock-icon" aria-hidden="true">' + ui.icon('clock', 15) + '</span>' +
              '<span class="site-clock-copy"><span data-clock-date></span><span class="site-clock-time" data-clock-time></span></span>' +
            '</time>' +
            '<button class="btn btn-sm btn-ghost legal-pill" data-open-legal aria-label="' + U.attr(T('nav.info_full')) + '">' +
              ui.icon('info', 14) + '<span class="label">' + U.esc(T('nav.info')) + '</span></button>' +
            '<a class="icon-btn only-narrow" href="#/settings" aria-label="' + U.attr(T('nav.open_settings')) + '" title="' + U.attr(T('nav.open_settings')) + '">' +
              ui.icon('settings', 17) + '</a>' +
            '<details class="alerts-menu" data-alerts-menu>' +
              alertsTriggerHtml() +
              '<div class="alerts-popover" data-alerts-popover>' + alertsPopoverHtml() + '</div>' +
            '</details>' +
            '<details class="profile-menu" data-profile-menu>' +
              profileTriggerHtml() +
              '<div class="profile-popover" data-profile-popover>' + profilePopoverHtml() + '</div>' +
            '</details>' +
          '</div>' +
        '</div>' +
      '</header>' +
      '<main id="main" tabindex="-1"></main>';
  }

  function profilePopoverHtml() {
    var settings = TA.store.settings();
    var markets = (settings.markets || []).map(function (market) { return T('ob.market.' + market); }).join(', ') || T('common.none');
    var amount = Number(settings.accountSize);
    var accountSize = isFinite(amount)
      ? new Intl.NumberFormat(TA.i18n.get(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
      : '—';
    var head = '<div class="profile-popover-head">' +
        '<div class="profile-identity">' +
          '<span class="profile-avatar profile-avatar-lg" aria-hidden="true">' + ui.icon('user', 18) + '</span>' +
          '<div class="profile-identity-copy">' +
            '<span class="profile-head-kicker">' + U.esc(T('profile.menu')) + '</span>' +
            '<b>' + U.esc(T('profile.local')) + '</b>' +
          '</div>' +
        '</div>' +
        '<span class="profile-local-badge">' + U.esc(T('profile.deviceOnly')) + '</span>' +
      '</div>';
    return head +
      '<dl class="profile-details">' +
        '<div><dt>' + U.esc(T('profile.experience')) + '</dt><dd>' + U.esc(T('ob.exp.' + settings.experience)) + '</dd></div>' +
        '<div><dt>' + U.esc(T('profile.markets')) + '</dt><dd>' + U.esc(markets) + '</dd></div>' +
        '<div><dt>' + U.esc(T('profile.horizon')) + '</dt><dd>' + U.esc(T('ob.horizon.' + settings.horizon)) + '</dd></div>' +
        '<div><dt>' + U.esc(T('profile.accountSize')) + '</dt><dd>' + U.esc(accountSize) + '</dd></div>' +
        '<div><dt>' + U.esc(T('profile.riskTrade')) + '</dt><dd>' + U.esc(U.fmtPct(Number(settings.riskPct) || 0, { sign: false })) + '</dd></div>' +
      '</dl>' +
      '<p class="profile-local-note">' + U.esc(T('profile.localNote')) + '</p>' +
      '<div class="profile-actions">' +
        '<a class="btn btn-sm" href="#/settings">' + ui.icon('settings', 14) + ' ' + U.esc(T('profile.settings')) + '</a>' +
      '</div>';
  }

  function bindProfileMenu() {
    var menu = appRoot.querySelector('[data-profile-menu]');
    var popover = menu && menu.querySelector('[data-profile-popover]');
    if (!menu || !popover) return;
    menu.addEventListener('toggle', function () {
      if (menu.open) popover.innerHTML = profilePopoverHtml();
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('.profile-actions a')) menu.open = false;
    });
  }

  function bindAlertsMenu() {
    var menu = appRoot.querySelector('[data-alerts-menu]');
    var popover = menu && menu.querySelector('[data-alerts-popover]');
    if (!menu || !popover || !TA.marketNotifications) return;
    function refresh() {
      popover.innerHTML = alertsPopoverHtml();
      setAlertsTriggerState();
    }
    menu.addEventListener('toggle', function () {
      if (menu.open) refresh();
    });
    menu.addEventListener('click', function (e) {
      var toggle = e.target.closest('[data-alerts-toggle]');
      if (toggle) {
        e.preventDefault();
        var wasOn = TA.marketNotifications.status().enabled;
        toggle.disabled = true;
        Promise.resolve(wasOn ? TA.marketNotifications.disable() : TA.marketNotifications.enable())
          .then(function () {
            ui.toast(T(wasOn ? 'alerts.paused.toast' : 'alerts.status.enabled'));
            refresh();
          });
        return;
      }
      if (e.target.closest('[data-alerts-permission]')) {
        e.preventDefault();
        TA.marketNotifications.enable().then(function (permission) {
          ui.toast(T(permission === 'granted' ? 'alerts.status.enabled' : 'alerts.panel.blocked'));
          refresh();
        });
        return;
      }
      if (e.target.closest('[data-alerts-settings]')) menu.open = false;
    });
  }

  function mountShell() {
    appRoot.innerHTML = shellHtml();
    shellMounted = true;
    document.documentElement.lang = TA.i18n.get();
    mountClock();
    bindProfileMenu();
    bindAlertsMenu();
    setAlertsTriggerState();

    var legal = appRoot.querySelector('.appbar [data-open-legal]');
    if (legal) legal.addEventListener('click', function (e) { e.preventDefault(); ui.legalModal(); });
  }

  function mountClock() {
    if (clockTimer) window.clearInterval(clockTimer);
    var clock = appRoot.querySelector('[data-site-clock]');
    if (!clock) return;
    var dateNode = clock.querySelector('[data-clock-date]');
    var timeNode = clock.querySelector('[data-clock-time]');
    function update() {
      var now = new Date();
      var locale = TA.i18n.get();
      var date = new Intl.DateTimeFormat(locale, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      }).format(now);
      var time = new Intl.DateTimeFormat(locale, {
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      }).format(now);
      dateNode.textContent = date;
      timeNode.textContent = time;
      clock.dateTime = now.toISOString();
      clock.setAttribute('aria-label', date + ', ' + time);
    }
    update();
    clockTimer = window.setInterval(update, 15000);
  }

  function markNav(routeName) {
    var target = ['settings', 'markets', 'bot', 'brokers'].indexOf(routeName) >= 0 ? routeName : 'dashboard';
    U.$$('.appnav a[data-nav]', document).forEach(function (a) {
      if (a.getAttribute('data-nav') === target) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function parseRoute() {
    var raw = location.hash || '#/';
    var qi = raw.indexOf('?');
    var path = (qi >= 0 ? raw.slice(0, qi) : raw).replace(/^#/, '') || '/';
    var params = {};
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var i = kv.indexOf('=');
        var k = decodeURIComponent(i >= 0 ? kv.slice(0, i) : kv);
        var v = i >= 0 ? decodeURIComponent(kv.slice(i + 1)) : '';
        params[k] = v;
      });
    }
    if (path === '/settings') return { name: 'settings', params: params };
    if (path === '/markets') return { name: 'markets', params: params };
    if (path === '/brokers') return { name: 'brokers', params: params };
    if (path === '/bot') return { name: 'bot', params: params };
    var m = path.match(/^\/analysis\/(.+)$/);
    if (m) {
      params.symbol = decodeURIComponent(m[1]);
      return { name: 'analysis', params: params };
    }
    return { name: 'dashboard', params: params };
  }

  function titleFor(route) {
    if (route.name === 'analysis') return (route.params.symbol || T('an.crumb')) + ' · ' + T('app.name');
    if (route.name === 'settings') return T('set.title') + ' · ' + T('app.name');
    if (route.name === 'markets') return T('nav.markets') + ' · ' + T('app.name');
    if (route.name === 'brokers') return T('nav.brokers') + ' · ' + T('app.name');
    if (route.name === 'bot') return T('bot.title') + ' · ' + T('app.name');
    return T('app.name') + ' — ' + T('app.promise');
  }

  function showOnboarding() {
    if (clockTimer) { window.clearInterval(clockTimer); clockTimer = null; }
    shellMounted = false;
    appRoot.innerHTML = '';
    document.documentElement.lang = TA.i18n.get();
    document.title = T('app.name') + ' — ' + T('app.tagline');
    TA.views.onboarding.mount(appRoot, function () { renderRoute(false); });
  }

  function renderRoute(keepScroll) {
    if (TA.theme) TA.theme.apply(TA.store.settings().theme);
    if (!TA.store.settings().onboarded) { showOnboarding(); return; }
    if (!shellMounted || !document.getElementById('main')) mountShell();

    var route = parseRoute();
    var main = document.getElementById('main');
    main.innerHTML = '';
    markNav(route.name);

    if (route.name === 'analysis') TA.views.analysis.render(main, route.params);
    else if (route.name === 'settings') TA.views.settings.render(main);
    else if (route.name === 'markets') TA.views.dashboard.renderMarkets(main);
    else if (route.name === 'brokers') TA.views.brokers.render(main);
    else if (route.name === 'bot') TA.views.bot.render(main);
    else TA.views.dashboard.render(main);

    document.title = titleFor(route);
    if (!keepScroll) window.scrollTo(0, 0);
  }

  function analysisUrl(asset, style) {
    var st = style || TA.store.settings().defaultStyle || 'swing';
    var q = 'style=' + encodeURIComponent(st);
    if (!TA.catalog.find(asset.symbol)) {
      q += '&cls=' + encodeURIComponent(asset.assetClass || 'crypto');
      if (asset.coingeckoId) q += '&id=' + encodeURIComponent(asset.coingeckoId);
      q += '&name=' + encodeURIComponent(asset.name || asset.symbol);
      if (asset.assetClass === 'stock' && asset.exchange) q += '&exchange=' + encodeURIComponent(asset.exchange);
    }
    return '#/analysis/' + encodeURIComponent(asset.symbol) + '?' + q;
  }

  function openAnalysis(asset, opts) {
    if (!asset) return;
    var url = analysisUrl(asset, opts && opts.style);
    if (location.hash === url) { TA.app.refresh({ keepScroll: true }); return; }
    location.hash = url;
  }

  function refresh(opts) {
    var keep = opts && opts.keepScroll;
    var y = window.scrollY;
    shellMounted = false;
    renderRoute(keep);
    if (keep) window.scrollTo(0, y);
  }

  function setLanguage(code) {
    TA.store.updateSettings({ language: code });
    TA.i18n.set(code);
    ui.clearToast();
    TA.app.refresh({ keepScroll: true });
  }

  function setTheme(pref) {
    var next = TA.theme.normalize(pref);
    TA.store.updateSettings({ theme: next });
    TA.theme.apply(next);
    return next;
  }

  TA.app = {
    analysisUrl: analysisUrl,
    openAnalysis: openAnalysis,
    navigate: function (hash) {
      if (location.hash === hash) renderRoute(false);
      else location.hash = hash;
    },
    refresh: refresh,
    rerender: function () { refresh({ keepScroll: true }); },
    setLanguage: setLanguage,
    setTheme: setTheme
  };

  function boot() {
    if (TA.theme) TA.theme.start();
    TA.i18n.set(TA.store.settings().language);
    ui.initGlossary();
    if (TA.marketNotifications) TA.marketNotifications.start();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        ['[data-profile-menu]', '[data-alerts-menu]'].forEach(function (selector) {
          var menu = appRoot.querySelector(selector);
          if (menu && menu.open) {
            menu.open = false;
            var trigger = menu.querySelector('summary');
            if (trigger) trigger.focus();
          }
        });
      }
    });

    window.addEventListener('hashchange', function () { renderRoute(false); });
    document.addEventListener('click', function (e) {
      ['[data-profile-menu]', '[data-alerts-menu]'].forEach(function (selector) {
        var menu = appRoot.querySelector(selector);
        if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
      });
    });
    renderRoute(false);
  }

  boot();
})(window.TA = window.TA || {});
