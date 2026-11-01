/* ui.js — shared primitives: icons, badges, toast, modal, glossary, search */
(function (TA) {
  'use strict';
  var U = TA.util;
  var T = function () { return TA.i18n.t.apply(null, arguments); };

  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.06.2.16.39.28.55"/>',
    star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9Z"/>',
    starFill: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9Z" fill="currentColor"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m13 5 7 7-7 7"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    collapse: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M16 3v3a2 2 0 0 0 2 2h3"/><path d="M8 21v-3a2 2 0 0 0-2-2H3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1a7 7 0 0 1 14 0v1Z"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    check: '<path d="m4 12.5 5 5L20 6.5"/>',
    up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    thumbUp: '<path d="M7 22V11l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.4l-1.5 8a2 2 0 0 1-2 1.6H7Z"/><path d="M7 11H3v11h4"/>',
    thumbDown: '<path d="M17 2v11l-4 8a2.5 2.5 0 0 1-2.5-2.5V15H5.3a2 2 0 0 1-2-2.4l1.5-8A2 2 0 0 1 6.8 3H17Z"/><path d="M17 13h4V2h-4"/>',
    flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
    pulse: '<path d="M2 12h4l2-7 4 14 2-7h8"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2Z"/><path d="M4 19V5"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    scale: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 7h6Z"/><path d="m19 7-3 7h6Z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 3.5 3.5L16 13l4 4"/>'
  };

  function icon(name, size) {
    var path = ICONS[name] || ICONS.info;
    return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 3400);
  }

  function clearToast() {
    var el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(toast._t);
    el.classList.remove('show');
  }

  function openModal(opts) {
    var root = document.getElementById('modal-root');
    root.innerHTML =
      '<div class="modal-backdrop" data-close="1">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="' + U.attr(opts.title) + '">' +
          '<div class="modal-head"><h2>' + U.esc(opts.title) + '</h2>' +
            '<button class="icon-btn" data-close="1" aria-label="' + U.attr(T('common.close_dialog')) + '">' + icon('close', 15) + '</button></div>' +
          '<div class="modal-body">' + opts.body + '</div>' +
          (opts.actions && opts.actions.length
            ? '<div class="modal-foot">' + opts.actions.map(function (a, i) {
                return '<button class="btn ' + (a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : '') +
                  '" data-action="' + i + '">' + U.esc(a.label) + '</button>';
              }).join('') + '</div>'
            : '') +
        '</div></div>';

    var backdrop = root.firstElementChild;
    var dialog = backdrop.querySelector('.modal');
    var prevFocus = document.activeElement;

    function close() {
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = dialog.querySelectorAll('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    backdrop.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') && !e.target.closest('.modal') || e.target.closest('button[data-close]')) close();
    });
    if (opts.actions) {
      root.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          var a = opts.actions[parseInt(b.getAttribute('data-action'), 10)];
          if (a.onClick) a.onClick(close);
          if (!a.keepOpen) close();
        });
      });
    }
    document.addEventListener('keydown', onKey);
    var focusable = dialog.querySelector('.modal-foot .btn') || dialog.querySelector('button');
    if (focusable) focusable.focus();
    return close;
  }

  function legalModal() {
    return openModal({
      title: T('legal.title'),
      body: '<p>' + U.esc(T('legal.p1')) + '</p><p>' + U.esc(T('legal.p2')) +
        '</p><p>' + U.esc(T('legal.p3')) + '</p><p>' + U.esc(T('legal.p4')) +
        '</p><p class="tiny muted">' + U.esc(T('legal.p5')) + '</p>',
      actions: [{ label: T('common.got_it'), kind: 'primary' }]
    });
  }

  var GLOSSARY = ['trend', 'support', 'resistance', 'volatility', 'liquidity', 'momentum',
    'rsi', 'sma', 'atr', 'realized_vol', 'drawdown', 'swing', 'intraday', 'invalidation',
    'gap', 'volume', 'market_cap', 'turnover', 'implied_vol', 'catalyst', 'percentile', 'rr'];

  var tipEl = null;

  function hideTip() {
    if (tipEl) { tipEl.remove(); tipEl = null; }
  }

  function showTip(target) {
    hideTip();
    var key = target.getAttribute('data-term');
    if (!key) return;
    var def = T('g.' + key + '.def');
    if (!def || def === 'g.' + key + '.def') return;
    tipEl = document.createElement('div');
    tipEl.className = 'term-pop';
    tipEl.innerHTML = '<b>' + U.esc(T('g.' + key)) + '</b>' + U.esc(def);
    document.body.appendChild(tipEl);
    var r = target.getBoundingClientRect();
    var tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var left = U.clamp(r.left + r.width / 2 - tw / 2, 10, window.innerWidth - tw - 10);
    var top = r.top - th - 8;
    if (top < 10) top = r.bottom + 8;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }

  function initGlossary() {
    document.addEventListener('pointerover', function (e) {
      var el = e.target.closest && e.target.closest('.term');
      if (el) showTip(el);
    });
    document.addEventListener('pointerout', function (e) {
      var el = e.target.closest && e.target.closest('.term');
      if (el && !el.contains(e.relatedTarget)) hideTip();
    });
    document.addEventListener('focusin', function (e) {
      var el = e.target.closest && e.target.closest('.term');
      if (el) showTip(el);
    });
    document.addEventListener('focusout', function (e) {
      if (e.target.closest && e.target.closest('.term')) hideTip();
    });
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('.term');
      if (!el) { hideTip(); return; }
      if (!tipEl) showTip(el);
      else hideTip();
    });
    window.addEventListener('scroll', hideTip, { passive: true });
    window.addEventListener('resize', hideTip);
  }

  function glossaryModal() {
    var body = '<div class="glossary-list">' + GLOSSARY.map(function (k) {
      return '<div class="glossary-item"><b>' + U.esc(T('g.' + k)) + '</b><span>' + U.esc(T('g.' + k + '.def')) + '</span></div>';
    }).join('') + '</div>';
    return openModal({ title: T('common.glossary'), body: body, actions: [{ label: T('common.got_it'), kind: 'primary' }] });
  }

  function modeBadge(meta) {
    var mode = meta.dataMode;
    if (mode === 'live') {
      return '<span class="badge badge-live"><i class="dot pulse"></i>' + U.esc(T('badge.live')) + '</span>';
    }
    return '<span class="badge badge-sample">' + U.esc(T('badge.sample')) + '</span>';
  }

  function assetBadge(asset) {
    return '<span class="badge badge-neutral">' + U.esc(asset.assetClass === 'crypto' ? T('badge.crypto') : T('badge.stock')) + '</span>';
  }

  function term(key, text) {
    return '<span class="term" tabindex="0" data-term="' + U.attr(key) + '">' + U.esc(text || T('g.' + key)) + '<i>?</i></span>';
  }

  // Attach typeahead + free-form crypto lookup to an input.
  function attachSearch(input, panel, opts) {
    opts = opts || {};
    var items = [];
    var active = -1;
    var destroyed = false;

    function hide() {
      panel.hidden = true;
      panel.innerHTML = '';
      items = [];
      active = -1;
      input.setAttribute('aria-expanded', 'false');
    }
    function show() {
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function renderHits(list, query) {
      items = list;
      active = list.length ? 0 : -1;
      if (!list.length) {
        panel.innerHTML = '<div class="search-empty">' + U.esc(T('nav.no_results')) + '</div>' +
          (query ? '<div class="search-note">' + U.esc(T('nav.search_note')) + '</div>' : '');
        show();
        return;
      }
      panel.innerHTML = list.map(function (a, i) {
        return '<button class="search-hit" role="option" aria-selected="' + (i === 0) + '" data-sym="' + U.attr(a.symbol) + '">' +
          '<span class="sym mono">' + U.esc(a.symbol) + '</span>' +
          '<span class="nm">' + U.esc(a.name) + '</span>' +
          '<span class="badge badge-neutral">' + U.esc(a.assetClass === 'crypto' ? T('badge.crypto') : T('badge.stock')) + '</span>' +
          '</button>';
      }).join('') +
        '<div class="search-note">' + U.esc(T('nav.search_note')) + '</div>';
      show();
    }
    function highlight(idx) {
      var hits = panel.querySelectorAll('.search-hit');
      hits.forEach(function (h, i) { h.setAttribute('aria-selected', i === idx ? 'true' : 'false'); });
    }
    function pick(asset) {
      hide();
      input.value = '';
      opts.onPick(asset);
    }

    var onInput = U.debounce(function () {
      var q = input.value.trim();
      if (!q) { hide(); return; }
      renderHits(TA.catalog.search(q), q);
    }, 90);

    input.addEventListener('input', onInput);
    input.addEventListener('focus', function () {
      if (input.value.trim() && TA.catalog.search(input.value).length) {
        renderHits(TA.catalog.search(input.value), input.value);
      }
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hide(); input.blur(); return; }
      if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault(); active = (active + 1) % items.length; highlight(active);
      } else if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault(); active = (active - 1 + items.length) % items.length; highlight(active);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items.length && active >= 0) { pick(items[active]); return; }
        var q = input.value.trim();
        if (q) {
          hide();
          opts.onFreeLookup(q);
          input.value = '';
        }
      }
    });
    panel.addEventListener('click', function (e) {
      var hit = e.target.closest('.search-hit');
      if (!hit) return;
      var a = TA.catalog.find(hit.getAttribute('data-sym'));
      if (a) pick(a);
    });
    input.addEventListener('blur', function () { setTimeout(function () { if (!destroyed) hide(); }, 140); });

    return { destroy: function () { destroyed = true; hide(); } };
  }

  TA.ui = {
    icon: icon,
    toast: toast,
    clearToast: clearToast,
    openModal: openModal,
    legalModal: legalModal,
    glossaryModal: glossaryModal,
    initGlossary: initGlossary,
    modeBadge: modeBadge,
    assetBadge: assetBadge,
    term: term,
    attachSearch: attachSearch,
    GLOSSARY: GLOSSARY
  };
})(window.TA = window.TA || {});
