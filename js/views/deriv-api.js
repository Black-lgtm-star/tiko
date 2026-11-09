/* views/deriv-api.js — read-only Deriv account card on the Deriv Copy page.
   Credentials live in sessionStorage via TA.derivApi; this view never prints them. */
(function (TA) {
  'use strict';
  var U = TA.util;
  function T() { return TA.i18n.t.apply(null, arguments); }
  function lang() { return (TA.store.settings() || {}).language || TA.i18n.get(); }

  var msg = null;
  var busy = false;

  function errText(err) {
    var code = err && err.code ? String(err.code) : 'api';
    if (code === 'badConfig') return T('derivapi.err.badConfig');
    var key = 'deriv.err.' + code;
    var text = T(key);
    return text === key ? T('deriv.err.api') : text;
  }

  function setMsg(kind, text) {
    msg = text ? { kind: kind, text: text } : null;
  }

  function money(value, currency) {
    if (value == null) return '—';
    return U.fmtNum(value, lang(), 2) + (currency ? ' ' + currency : '');
  }

  function typeLabel(account) {
    if (account.type === 'demo') return T('deriv.account.demo');
    if (account.type === 'real') return T('deriv.account.real');
    return account.type || '';
  }

  function accountStrip(s) {
    var a = s.account;
    var meta = [typeLabel(a), money(a.balance, a.currency), T('deriv.account.token', { token: s.tokenMasked })]
      .filter(Boolean).join(' · ');
    return '<div class="deriv-account">' +
        '<div class="deriv-account-main">' +
          '<span class="deriv-dot" aria-hidden="true"></span>' +
          '<div><b>' + U.esc(a.accountId) + '</b>' +
            '<div class="tiny muted">' + U.esc(meta) + '</div></div>' +
        '</div>' +
        '<div class="deriv-account-actions">' +
          (a.status && a.status.toLowerCase() !== 'active'
            ? '<span class="badge badge-neutral">' + U.esc(a.status) + '</span>'
            : '') +
          '<button class="btn btn-sm" type="button" data-derivapi-refresh>' +
            U.esc(T('derivapi.refresh')) + '</button>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-derivapi-disconnect>' +
            U.esc(T('deriv.disconnect')) + '</button>' +
        '</div>' +
      '</div>';
  }

  function positionsTable(s) {
    var rows = s.contracts || [];
    var body;
    if (!s.positionsOk) {
      body = '<tr><td colspan="5" class="deriv-empty">' +
        U.esc(T('derivapi.positions.unavailable')) + '</td></tr>';
    } else if (!rows.length) {
      body = '<tr><td colspan="5" class="deriv-empty">' +
        U.esc(T('derivapi.positions.empty')) + '</td></tr>';
    } else {
      body = rows.map(function (row) {
        var expiry = row.expiry
          ? U.fmtDate(row.expiry * 1000, lang(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '—';
        return '<tr>' +
            '<td><b>' + U.esc(row.symbol || '—') + '</b>' +
              (row.longcode ? '<div class="tiny muted">' + U.esc(row.longcode) + '</div>' : '') + '</td>' +
            '<td>' + U.esc(row.type || '—') + '</td>' +
            '<td>' + U.esc(money(row.buyPrice, row.currency)) + '</td>' +
            '<td>' + U.esc(money(row.payout, row.currency)) + '</td>' +
            '<td>' + U.esc(expiry) + '</td>' +
          '</tr>';
      }).join('');
    }

    return '<div class="deriv-section">' +
        '<div class="broker-subhead">' + U.esc(T('derivapi.positions.title')) + '</div>' +
        '<div class="broker-table-wrap"><table class="broker-table"><thead><tr>' +
          ['symbol', 'type', 'buy', 'payout', 'expires'].map(function (key) {
            return '<th>' + U.esc(T('derivapi.positions.' + key)) + '</th>';
          }).join('') +
        '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '</div>';
  }

  function connectForm() {
    var accountLabel = U.esc(T('derivapi.field.account')) +
      ' <em class="tiny muted">' + U.esc(T('deriv.start.optional')) + '</em>';
    return '<form class="deriv-connect derivapi-connect" data-derivapi-connect-form novalidate>' +
        '<label class="field"><span>' + U.esc(T('deriv.field.appid')) + '</span>' +
          '<input class="input" name="appId" inputmode="numeric" autocomplete="off" spellcheck="false" ' +
            'placeholder="' + U.attr(T('deriv.field.appidPh')) + '" required></label>' +
        '<label class="field"><span>' + U.esc(T('derivapi.field.token')) + '</span>' +
          '<input class="input" name="token" type="password" autocomplete="off" spellcheck="false" ' +
            'maxlength="512" required></label>' +
        '<label class="field"><span>' + accountLabel + '</span>' +
          '<input class="input" name="accountId" autocomplete="off" spellcheck="false" ' +
            'placeholder="' + U.attr(T('derivapi.field.accountPh')) + '"></label>' +
        '<div class="deriv-actions"><button class="btn btn-primary btn-sm" type="submit" data-derivapi-connect>' +
          U.esc(T(busy ? 'deriv.connecting' : 'deriv.connect')) + '</button></div>' +
        '<p class="tiny muted deriv-hint">' + U.esc(T('derivapi.token.hint')) + '</p>' +
        '<p class="tiny muted deriv-hint">' + U.esc(T('derivapi.accountId.hint')) + '</p>' +
        '<p class="tiny muted deriv-hint">' +
          '<a href="https://api.deriv.com/" target="_blank" rel="noopener noreferrer">' + U.esc(T('deriv.help.app')) + '</a> · ' +
          '<a href="https://app.deriv.com/account/api-token" target="_blank" rel="noopener noreferrer">' + U.esc(T('deriv.help.token')) + '</a>' +
        '</p>' +
      '</form>';
  }

  function card(s) {
    return '<section class="card span-12 edge-cyan deriv-card" id="deriv-account" aria-labelledby="deriv-account-title">' +
        '<div class="card-head"><div><h2 id="deriv-account-title">' + TA.ui.icon('user', 15) +
          ' ' + U.esc(T('derivapi.title')) + '</h2>' +
          '<p class="tiny muted">' + U.esc(T('derivapi.lede')) + '</p></div>' +
          '<span class="badge badge-neutral">' + U.esc(T('deriv.badge')) + '</span></div>' +
        '<div class="card-body">' +
          '<div class="deriv-msg" data-derivapi-msg role="status" aria-live="polite"></div>' +
          (s.connected ? accountStrip(s) + positionsTable(s) : connectForm()) +
          '<p class="tiny muted deriv-readonly">' + TA.ui.icon('shield', 13) + ' ' +
            U.esc(T('derivapi.readonly')) + '</p>' +
        '</div>' +
      '</section>';
  }

  function showMsg(container) {
    var el = container.querySelector('[data-derivapi-msg]');
    if (!el) return;
    el.className = msg ? 'deriv-msg is-' + msg.kind : 'deriv-msg';
    el.textContent = msg ? msg.text : '';
  }

  function paint(container) {
    if (!TA.derivApi) {
      container.innerHTML = '';
      return;
    }
    var s = TA.derivApi.state();
    container.innerHTML = card(s);
    showMsg(container);
  }

  function refresh(container) {
    TA.derivApi.refresh().then(function () {
      setMsg('ok', T('derivapi.toast.refreshed'));
      paint(container);
    }, function (err) {
      setMsg('error', errText(err));
      paint(container);
    });
  }

  function bind(container) {
    container.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-derivapi-connect-form]');
      if (!form) return;
      e.preventDefault();
      if (busy) return;
      var data = new FormData(form);
      var button = form.querySelector('[data-derivapi-connect]');
      busy = true;
      msg = null;
      showMsg(container);
      if (button) {
        button.disabled = true;
        button.textContent = T('deriv.connecting');
      }
      TA.derivApi.connect({
        appId: data.get('appId'),
        token: data.get('token'),
        accountId: data.get('accountId')
      }).then(function () {
        busy = false;
        setMsg('ok', T('derivapi.toast.connected'));
        paint(container);
      }, function (err) {
        busy = false;
        setMsg('error', errText(err));
        showMsg(container);
        if (button) {
          button.disabled = false;
          button.textContent = T('deriv.connect');
        }
      });
    });
    container.addEventListener('click', function (e) {
      var button = e.target.closest('button[data-derivapi-refresh], button[data-derivapi-disconnect]');
      if (!button) return;
      if (button.hasAttribute('data-derivapi-disconnect')) {
        TA.derivApi.disconnect();
        msg = null;
        paint(container);
        return;
      }
      refresh(container);
    });
  }

  function mount(container) {
    if (!container) return;
    paint(container);
    bind(container);
  }

  TA.views = TA.views || {};
  TA.views.derivApi = { mount: mount, card: card };
})(window.TA = window.TA || {});
