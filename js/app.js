/* app.js — app shell, hash router and boot */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };

  var appRoot = document.getElementById('app');
  var shellMounted = false;

  function brandMark() {
    return '<span class="brand-mark">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 2.4 21 7.4v9.2L12 21.6 3 16.6V7.4Z" stroke="#ff2fd0" stroke-width="1.5"/>' +
        '<path d="M3 7.4 12 12.4l9-5" stroke="#29e0ff" stroke-width="1.5"/>' +
        '<path d="M12 12.4v9.2" stroke="#29e0ff" stroke-width="1.5"/></svg></span>';
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
            '<a href="#/settings" data-nav="settings">' + U.esc(T('nav.settings')) + '</a>' +
          '</nav>' +
          '<div class="header-search">' +
            '<span class="search-ico">' + ui.icon('search', 16) + '</span>' +
            '<input id="global-search" type="text" role="combobox" aria-expanded="false" ' +
              'aria-controls="search-panel" aria-autocomplete="list" autocomplete="off" spellcheck="false" ' +
              'placeholder="' + U.attr(T('nav.search')) + '" aria-label="' + U.attr(T('nav.search')) + '" />' +
            '<span class="kbd" aria-hidden="true">/</span>' +
            '<div class="search-results" id="search-panel" role="listbox" aria-label="' + U.attr(T('nav.search_short')) + '" hidden></div>' +
          '</div>' +
          '<div class="header-actions">' +
            '<button class="btn btn-sm btn-ghost legal-pill" data-open-legal aria-label="' + U.attr(T('nav.info_full')) + '">' +
              ui.icon('info', 14) + '<span class="label">' + U.esc(T('nav.info')) + '</span></button>' +
            '<a class="icon-btn only-narrow" href="#/settings" aria-label="' + U.attr(T('nav.open_settings')) + '" title="' + U.attr(T('nav.open_settings')) + '">' +
              ui.icon('settings', 17) + '</a>' +
            '<button class="btn btn-sm btn-primary nav-cta" data-focus-search aria-label="' + U.attr(T('nav.analyze')) + '">' +
              ui.icon('search', 14) + '<span>' + U.esc(T('nav.analyze')) + '</span></button>' +
          '</div>' +
        '</div>' +
      '</header>' +
      '<main id="main" tabindex="-1"></main>';
  }

  function freeLookup(raw) {
    ui.toast(T('dash.quick.searching'));
    TA.data.resolveSymbol(raw).then(function (asset) {
      if (asset) openAnalysis(asset);
      else ui.toast(T('dash.quick.notfound'));
    }).catch(function () {
      ui.toast(T('dash.quick.notfound'));
    });
  }

  function mountShell() {
    appRoot.innerHTML = shellHtml();
    shellMounted = true;
    document.documentElement.lang = TA.i18n.get();

    var input = document.getElementById('global-search');
    var panel = document.getElementById('search-panel');
    if (input && panel) {
      ui.attachSearch(input, panel, {
        onPick: function (asset) { openAnalysis(asset); },
        onFreeLookup: freeLookup
      });
    }
    var legal = appRoot.querySelector('.appbar [data-open-legal]');
    if (legal) legal.addEventListener('click', function (e) { e.preventDefault(); ui.legalModal(); });
    var cta = appRoot.querySelector('[data-focus-search]');
    if (cta) cta.addEventListener('click', function () {
      var quick = document.getElementById('quick-input');
      if (quick) {
        quick.scrollIntoView({ block: 'center', behavior: 'smooth' });
        quick.focus({ preventScroll: true });
        return;
      }
      var search = document.getElementById('global-search');
      if (search) search.focus();
    });
  }

  function markNav(routeName) {
    var target = routeName === 'settings' ? 'settings' : 'dashboard';
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
    return T('app.name') + ' — ' + T('app.promise');
  }

  function showOnboarding() {
    shellMounted = false;
    appRoot.innerHTML = '';
    document.documentElement.lang = TA.i18n.get();
    document.title = T('app.name') + ' — ' + T('app.tagline');
    TA.views.onboarding.mount(appRoot, function () { renderRoute(false); });
  }

  function renderRoute(keepScroll) {
    if (!TA.store.settings().onboarded) { showOnboarding(); return; }
    if (!shellMounted || !document.getElementById('main')) mountShell();

    var route = parseRoute();
    var main = document.getElementById('main');
    main.innerHTML = '';
    markNav(route.name);

    if (route.name === 'analysis') TA.views.analysis.render(main, route.params);
    else if (route.name === 'settings') TA.views.settings.render(main);
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

  TA.app = {
    analysisUrl: analysisUrl,
    openAnalysis: openAnalysis,
    navigate: function (hash) {
      if (location.hash === hash) renderRoute(false);
      else location.hash = hash;
    },
    refresh: refresh,
    rerender: function () { refresh({ keepScroll: true }); },
    setLanguage: setLanguage
  };

  function boot() {
    TA.i18n.set(TA.store.settings().language);
    ui.initGlossary();

    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      var input = document.getElementById('global-search');
      if (input) { e.preventDefault(); input.focus(); }
    });

    window.addEventListener('hashchange', function () { renderRoute(false); });
    renderRoute(false);
  }

  boot();
})(window.TA = window.TA || {});
