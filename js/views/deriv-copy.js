/* views/deriv-copy.js — Deriv Copy card on the Brokers page.
   Tokens stay in sessionStorage via TA.deriv; this view never prints them. */
(function (TA) {
  'use strict';
  var U = TA.util;
  function T() { return TA.i18n.t.apply(null, arguments); }
  function lang() { return (TA.store.settings() || {}).language || TA.i18n.get(); }

  var msg = null;
  var busy = false;

  function errText(err) {
    var code = err && err.code ? String(err.code) : 'api';
    var key = 'deriv.err.' + code;
    var text = T(key);
    return text === key ? T('deriv.err.api') : text;
  }

  function setMsg(kind, text) {
    msg = text ? { kind: kind, text: text } : null;
  }

  function scopeBadges(scopes) {
    if (!scopes || !scopes.length) {
      return '<span class="badge badge-neutral">' + U.esc(T('deriv.scopes.none')) + '</span>';
    }
    return scopes.map(function (scope) {
      return '<span class="badge badge-neutral">' + U.esc(scope) + '</span>';
    }).join('');
  }

  function accountStrip(s) {
    var a = s.account;
    var balance = a.balance == null
      ? '—'
      : U.fmtNum(a.balance, lang(), 2) + (a.currency ? ' ' + a.currency : '');
    return '<div class="deriv-account">' +
        '<div class="deriv-account-main">' +
          '<span class="deriv-dot" aria-hidden="true"></span>' +
          '<div><b>' + U.esc(a.loginId) + '</b>' +
            '<div class="tiny muted">' + U.esc(T(a.isVirtual ? 'deriv.account.demo' : 'deriv.account.real')) +
              ' · ' + U.esc(balance) + ' · ' +
              U.esc(T('deriv.account.token', { token: s.tokenMasked })) + '</div></div>' +
        '</div>' +
        '<div class="deriv-account-actions">' +
          '<div class="deriv-scopes">' + scopeBadges(a.scopes) + '</div>' +
          '<button class="btn btn-sm" type="button" data-deriv-refresh' + (a.canList ? '' : ' disabled') + '>' +
            U.esc(T('deriv.refresh')) + '</button>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-deriv-disconnect>' +
            U.esc(T('deriv.disconnect')) + '</button>' +
        '</div>' +
      '</div>' +
      (!a.canList ? '<p class="tiny muted deriv-hint">' + U.esc(T('deriv.scope.adminHint')) + '</p>' : '') +
      (!a.canTrade ? '<p class="tiny muted deriv-hint">' + U.esc(T('deriv.scope.tradeHint')) + '</p>' : '');
  }

  function copiesTable(s) {
    if (!s.account.canList) return '';
    var rows = s.copies || [];
    var body = rows.length ? rows.map(function (row, index) {
      var stakes = [row.minStake, row.maxStake].filter(function (v) { return v != null; });
      var since = row.since
        ? U.fmtDate(row.since * 1000, lang(), { year: 'numeric', month: 'short', day: 'numeric' })
        : '—';
      var extra = [row.assets, row.tradeTypes].filter(Boolean).join(' · ');
      var action = row.canStop
        ? '<button class="btn btn-sm btn-ghost" type="button" data-deriv-stop="' + index + '"' +
            (s.account.canTrade ? '' : ' disabled') + '>' + U.esc(T('deriv.copy.stop')) + '</button>'
        : '<a class="btn btn-sm btn-ghost" href="https://app.deriv.com/" target="_blank" rel="noopener noreferrer">' +
            U.esc(T('deriv.copy.stopDeriv')) + '</a>';
      return '<tr>' +
          '<td><b>' + U.esc(T('deriv.copy.' + row.kind)) + '</b>' +
            (extra ? '<div class="tiny muted">' + U.esc(extra) + '</div>' : '') + '</td>' +
          '<td>' + U.esc(row.loginId || '—') + '</td>' +
          '<td>' + U.esc(row.appId || '—') + '</td>' +
          '<td>' + U.esc(since) + '</td>' +
          '<td>' + U.esc(stakes.length ? stakes.join(' – ') : '—') + '</td>' +
          '<td class="deriv-row-actions">' + action + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="6" class="deriv-empty">' + U.esc(T('deriv.copy.empty')) + '</td></tr>';

    return '<div class="deriv-section">' +
        '<div class="broker-subhead">' + U.esc(T('deriv.copy.title')) + '</div>' +
        '<div class="broker-table-wrap"><table class="broker-table"><thead><tr>' +
          ['type', 'login', 'app', 'since', 'stakes'].map(function (key) {
            return '<th>' + U.esc(T('deriv.copy.' + key)) + '</th>';
          }).join('') + '<th></th>' +
        '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '</div>';
  }

  function startForm(s) {
    var minLabel = U.esc(T('deriv.start.min')) + ' <em class="tiny muted">' + U.esc(T('deriv.start.optional')) + '</em>';
    var assetsLabel = U.esc(T('deriv.start.assets')) + ' <em class="tiny muted">' + U.esc(T('deriv.start.optional')) + '</em>';
    var typesLabel = U.esc(T('deriv.start.types')) + ' <em class="tiny muted">' + U.esc(T('deriv.start.optional')) + '</em>';
    return '<div class="deriv-section">' +
        '<div class="broker-subhead">' + U.esc(T('deriv.start.title')) + '</div>' +
        '<p class="tiny muted">' + U.esc(T('deriv.start.lede')) + '</p>' +
        '<div class="deriv-start-grid">' +
          '<label class="field"><span>' + U.esc(T('deriv.start.trader')) + '</span>' +
            '<input class="input" type="password" data-deriv-trader autocomplete="off" spellcheck="false" ' +
              'placeholder="' + U.attr(T('deriv.start.traderPh')) + '"></label>' +
          '<label class="field"><span>' + U.esc(T('deriv.start.max')) + '</span>' +
            '<input class="input" type="number" min="1" step="1" inputmode="decimal" data-deriv-max ' +
              'placeholder="' + U.attr(T('deriv.start.maxPh')) + '"></label>' +
          '<label class="field"><span>' + minLabel + '</span>' +
            '<input class="input" type="number" min="1" step="1" inputmode="decimal" data-deriv-min></label>' +
          '<label class="field"><span>' + assetsLabel + '</span>' +
            '<input class="input" data-deriv-assets placeholder="' + U.attr(T('deriv.start.assetsPh')) + '"></label>' +
          '<label class="field"><span>' + typesLabel + '</span>' +
            '<input class="input" data-deriv-types placeholder="' + U.attr(T('deriv.start.typesPh')) + '"></label>' +
        '</div>' +
        '<div class="deriv-actions">' +
          '<button class="btn btn-primary btn-sm" type="button" data-deriv-start' +
            (s.account.canTrade ? '' : ' disabled') + '>' + U.esc(T('deriv.start.submit')) + '</button>' +
          '<a class="btn btn-sm btn-ghost" href="https://app.deriv.com/" target="_blank" rel="noopener noreferrer">' +
            U.esc(T('deriv.start.manage')) + '</a>' +
        '</div>' +
      '</div>';
  }

  function offlineNotice() {
    return '<div class="deriv-offline" role="status">' +
        '<div class="deriv-offline-head">' + TA.ui.icon('warning', 15) +
          '<b>' + U.esc(T('deriv.legacy.title')) + '</b></div>' +
        '<p class="tiny muted deriv-hint">' + U.esc(T('deriv.legacy.body')) + '</p>' +
        '<p class="tiny deriv-offline-state">' + U.esc(T('deriv.legacy.disabled')) + '</p>' +
        '<div class="deriv-actions">' +
          '<button class="btn btn-sm" type="button" data-deriv-probe' +
            (TA.deriv.probeState().status === 'checking' ? ' disabled' : '') + '>' +
            U.esc(T('deriv.legacy.check')) + '</button>' +
          '<a class="btn btn-sm btn-ghost" href="#/deriv-copy">' + U.esc(T('deriv.legacy.openAccount')) + '</a>' +
        '</div>' +
      '</div>';
  }

  function connectForm(probeStatus) {
    return '<form class="deriv-connect" data-deriv-connect-form novalidate>' +
        '<label class="field"><span>' + U.esc(T('deriv.field.appid')) + '</span>' +
          '<input class="input" name="appId" inputmode="numeric" autocomplete="off" spellcheck="false" ' +
            'placeholder="' + U.attr(T('deriv.field.appidPh')) + '" required></label>' +
        '<label class="field"><span>' + U.esc(T('deriv.field.token')) + '</span>' +
          '<input class="input" name="token" type="password" autocomplete="off" spellcheck="false" maxlength="125" required></label>' +
        '<div class="deriv-actions"><button class="btn btn-primary btn-sm" type="submit" data-deriv-connect>' +
          U.esc(T(busy ? 'deriv.connecting' : 'deriv.connect')) + '</button></div>' +
        '<p class="tiny muted deriv-hint">' + U.esc(T('deriv.connect.hint')) + '</p>' +
        '<p class="tiny muted deriv-hint">' + U.esc(T('deriv.connect.scopes')) + '</p>' +
        (probeStatus === 'checking'
          ? '<p class="tiny muted deriv-hint">' + U.esc(T('deriv.legacy.checking')) + '</p>'
          : '') +
        '<p class="tiny muted deriv-hint">' +
          '<a href="https://api.deriv.com/" target="_blank" rel="noopener noreferrer">' + U.esc(T('deriv.help.app')) + '</a> · ' +
          '<a href="https://app.deriv.com/account/api-token" target="_blank" rel="noopener noreferrer">' + U.esc(T('deriv.help.token')) + '</a>' +
        '</p>' +
      '</form>';
  }

  function card(s) {
    var probeStatus = s.connected || !TA.deriv.probeState ? 'unknown' : TA.deriv.probeState().status;
    var blocked = !s.connected && probeStatus === 'down';
    return '<section class="card span-12 edge-cyan deriv-card" id="deriv-copy" aria-labelledby="deriv-copy-title">' +
        '<div class="card-head"><div><h2 id="deriv-copy-title">' + TA.ui.icon('pulse', 15) +
          ' ' + U.esc(T('deriv.title')) + '</h2>' +
          '<p class="tiny muted">' + U.esc(T('deriv.lede')) + '</p></div>' +
          '<span class="badge badge-neutral">' + U.esc(T('deriv.badge')) + '</span></div>' +
        '<div class="card-body">' +
          '<div class="deriv-msg" data-deriv-msg role="status" aria-live="polite"></div>' +
          (s.connected
            ? accountStrip(s) + copiesTable(s) + startForm(s)
            : (blocked ? offlineNotice() : connectForm(probeStatus))) +
          '<div class="disclaimer deriv-warn">' + TA.ui.icon('warning', 15) +
            '<div>' + U.esc(T('deriv.disclaimer')) + '</div></div>' +
        '</div>' +
      '</section>';
  }

  function paint(container) {
    if (!TA.deriv) {
      container.innerHTML = '';
      return;
    }
    var s = TA.deriv.state();
    container.innerHTML = card(s);
    var el = container.querySelector('[data-deriv-msg]');
    if (el && msg) {
      el.className = 'deriv-msg is-' + msg.kind;
      el.textContent = msg.text;
    }
  }

  function refresh(container) {
    var s = TA.deriv.state();
    if (!s.connected || !s.account.canList) return;
    TA.deriv.list().then(function () {
      msg = null;
      paint(container);
    }, function (err) {
      setMsg('error', errText(err));
      paint(container);
    });
  }

  function stopAt(container, button) {
    var index = Number(button.getAttribute('data-deriv-stop'));
    button.disabled = true;
    TA.deriv.stopAt(index).then(function () {
      setMsg('ok', T('deriv.toast.stopped'));
      paint(container);
    }, function (err) {
      setMsg('error', errText(err));
      paint(container);
    });
  }

  function start(container) {
    var read = function (selector) {
      var el = container.querySelector(selector);
      return el ? String(el.value || '').trim() : '';
    };
    var payload = {
      token: read('[data-deriv-trader]'),
      maxStake: read('[data-deriv-max]'),
      minStake: read('[data-deriv-min]'),
      assets: read('[data-deriv-assets]'),
      tradeTypes: read('[data-deriv-types]')
    };
    if (!payload.token) { setMsg('error', T('deriv.err.badToken')); paint(container); return; }
    if (!(Number(payload.maxStake) > 0)) { setMsg('error', T('deriv.err.badStake')); paint(container); return; }
    if (payload.minStake && Number(payload.minStake) > Number(payload.maxStake)) {
      setMsg('error', T('deriv.err.badStake'));
      paint(container);
      return;
    }

    var body = '<p class="broker-ticket-lede">' + U.esc(T('deriv.confirm.lede')) + '</p>' +
      '<div class="broker-ticket-grid">' +
        '<div class="broker-ticket-row"><span>' + U.esc(T('deriv.confirm.token')) + '</span><b>' +
          U.esc(TA.deriv.mask(payload.token)) + '</b></div>' +
        '<div class="broker-ticket-row"><span>' + U.esc(T('deriv.confirm.max')) + '</span><b>' +
          U.esc(payload.maxStake) + '</b></div>' +
        (payload.minStake ? '<div class="broker-ticket-row"><span>' + U.esc(T('deriv.confirm.min')) +
          '</span><b>' + U.esc(payload.minStake) + '</b></div>' : '') +
      '</div>' +
      '<div class="disclaimer broker-ticket-warn">' + TA.ui.icon('warning', 15) + '<div>' +
        U.esc(T('deriv.confirm.warn')) + '</div></div>' +
      '<label class="broker-ack"><input type="checkbox" data-deriv-ack> ' +
        U.esc(T('deriv.confirm.ack')) + '</label>' +
      '<p class="tiny broker-send-err" data-deriv-send-err></p>' +
      '<button class="btn btn-danger broker-send" type="button" data-deriv-send disabled>' +
        U.esc(T('deriv.confirm.send')) + '</button>';

    var close = TA.ui.openModal({
      title: T('deriv.confirm.title'),
      body: body,
      actions: [{ label: T('deriv.confirm.cancel') }]
    });
    var ack = document.querySelector('#modal-root [data-deriv-ack]');
    var send = document.querySelector('#modal-root [data-deriv-send]');
    var errEl = document.querySelector('#modal-root [data-deriv-send-err]');
    if (!ack || !send) return;
    ack.addEventListener('change', function () { send.disabled = !ack.checked; });
    send.addEventListener('click', function () {
      if (send.disabled) return;
      send.disabled = true;
      errEl.textContent = '';
      TA.deriv.start(payload, { confirm: true }).then(function () {
        close();
        setMsg('ok', T('deriv.toast.started'));
        paint(container);
      }, function (err) {
        send.disabled = false;
        errEl.textContent = errText(err);
      });
    });
  }

  function recheck(container) {
    var result = TA.deriv.probe({ force: true });
    paint(container);
    result.then(function () { paint(container); });
  }

  function bind(container) {
    container.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-deriv-connect-form]');
      if (!form) return;
      e.preventDefault();
      if (busy) return;
      busy = true;
      msg = null;
      paint(container);
      var data = new FormData(form);
      TA.deriv.connect({ appId: data.get('appId'), token: data.get('token') }).then(function () {
        busy = false;
        setMsg('ok', T('deriv.toast.connected'));
        paint(container);
        refresh(container);
      }, function (err) {
        busy = false;
        setMsg('error', errText(err));
        paint(container);
        if (/^(offline|network|timeout)$/.test(String(err && err.code))) {
          recheck(container);
        }
      });
    });
    container.addEventListener('click', function (e) {
      var button = e.target.closest('button[data-deriv-refresh], button[data-deriv-disconnect], ' +
        'button[data-deriv-stop], button[data-deriv-start], button[data-deriv-probe]');
      if (!button) return;
      if (button.hasAttribute('data-deriv-disconnect')) {
        TA.deriv.disconnect();
        msg = null;
        paint(container);
        return;
      }
      if (button.hasAttribute('data-deriv-probe')) { recheck(container); return; }
      if (button.hasAttribute('data-deriv-refresh')) { refresh(container); return; }
      if (button.hasAttribute('data-deriv-stop')) { stopAt(container, button); return; }
      if (button.hasAttribute('data-deriv-start')) start(container);
    });
  }

  function mount(container) {
    if (!container) return;
    bind(container);
    if (!TA.deriv.state().connected && TA.deriv.probe) {
      TA.deriv.probe().then(function () { paint(container); });
    }
    paint(container);
  }

  function render(root) {
    root.innerHTML = '<div class="wrap page"><div class="dash-grid">' +
      '<div class="span-12" data-deriv-api-slot></div>' +
      '<div class="span-12" data-deriv-slot></div></div></div>';
    if (TA.views.derivApi) TA.views.derivApi.mount(root.querySelector('[data-deriv-api-slot]'));
    mount(root.querySelector('[data-deriv-slot]'));
  }

  TA.views = TA.views || {};
  TA.views.derivCopy = { mount: mount, render: render, card: card };
})(window.TA = window.TA || {});
