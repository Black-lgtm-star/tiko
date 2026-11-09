/* views/settings.js — editable profile, data sources, local feedback and reset */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };

  var EXPERIENCE = ['beginner', 'intermediate', 'advanced'];
  var MARKETS = ['stocks', 'crypto', 'forex', 'options', 'futures'];
  var HORIZONS = ['intraday', 'swing', 'long'];
  var ANALYSIS = ['technical', 'fundamental', 'both'];
  var RISK = ['cautious', 'balanced', 'aggressive'];
  var STYLES = ['day', 'swing', 'long', 'options', 'fx', 'beginner'];

  function chipBtn(group, value, label, on, multi) {
    return '<button type="button" class="chip" data-group="' + U.attr(group) + '" data-value="' + U.attr(value) + '" ' +
      'aria-pressed="' + (on ? 'true' : 'false') + '"' + (multi ? ' data-multi="1"' : '') + '>' +
      U.esc(label) + '</button>';
  }

  function chipField(label, hint, group, values, current, labelFor, multi) {
    var on = function (v) {
      return multi ? (current || []).indexOf(v) >= 0 : current === v;
    };
    return '<div class="field">' +
      '<label>' + U.esc(label) + (hint ? ' <span style="font-weight:400;text-transform:none;letter-spacing:0">· ' + U.esc(hint) + '</span>' : '') + '</label>' +
      '<div class="chip-row">' + values.map(function (v) {
        return chipBtn(group, v, labelFor(v), on(v), multi);
      }).join('') + '</div>' +
      '</div>';
  }

  function profileCard(s) {
    return '<section class="card span-12" aria-labelledby="set-profile">' +
      '<div class="card-head"><h2 id="set-profile">' + U.esc(T('set.profile')) + '</h2>' +
        '<span class="hint">' + U.esc(T('set.profile.d')) + '</span></div>' +
      '<div class="card-body">' +
        '<div class="form-grid">' +
          chipField(T('ob.exp.label'), T('ob.exp.hint'), 'experience', EXPERIENCE, s.experience, function (v) { return T('ob.exp.' + v); }) +
          chipField(T('ob.horizon.label'), T('ob.horizon.hint'), 'horizon', HORIZONS, s.horizon, function (v) { return T('ob.horizon.' + v); }) +
          chipField(T('ob.analysis.label'), '', 'analysis', ANALYSIS, s.analysis, function (v) { return T('ob.analysis.' + v); }) +
          chipField(T('ob.risk.label'), T('ob.risk.hint'), 'risk', RISK, s.risk, function (v) { return T('ob.risk.' + v); }) +
        '</div>' +
        '<div style="margin-top:22px">' +
          chipField(T('ob.markets.label'), T('ob.markets.hint'), 'markets', MARKETS, s.markets, function (v) { return T('ob.market.' + v); }, true) +
        '</div>' +
        '<div class="form-grid" style="margin-top:22px">' +
          '<div class="field"><label for="set-style">' + U.esc(T('set.default_view')) + '</label>' +
            '<select id="set-style" class="input" data-set-style>' +
              STYLES.map(function (st) {
                return '<option value="' + U.attr(st) + '"' + (s.defaultStyle === st ? ' selected' : '') + '>' + U.esc(T('an.tab.' + st)) + '</option>';
              }).join('') +
            '</select></div>' +
          '<div class="field"><label for="set-lang">' + U.esc(T('set.language')) + '</label>' +
            '<select id="set-lang" class="input" data-set-lang>' +
              TA.i18n.langs.map(function (l) {
                return '<option value="' + U.attr(l.code) + '"' + (s.language === l.code ? ' selected' : '') + '>' + U.esc(l.label) + '</option>';
              }).join('') +
            '</select><div class="help">' + U.esc(T('set.language.note')) + '</div></div>' +
          chipField(T('set.theme'), T('set.theme.hint'), 'theme', ['dark', 'light', 'system'], s.theme || 'dark', function (v) { return T('set.theme.' + v); }) +
        '</div>' +
        '<div class="form-grid" style="margin-top:22px">' +
          '<div class="field"><label for="set-account-size">' + U.esc(T('profile.accountSize')) + '</label>' +
            '<input id="set-account-size" class="input" type="number" min="1" step="any" inputmode="decimal" data-set-account value="' + U.attr(s.accountSize || 10000) + '" />' +
          '</div>' +
          '<div class="field"><label for="set-risk-pct">' + U.esc(T('profile.riskTrade')) + '</label>' +
            '<input id="set-risk-pct" class="input" type="number" min="0.1" max="100" step="any" inputmode="decimal" data-set-risk value="' + U.attr(s.riskPct || 1) + '" />' +
            '<div class="help">' + U.esc(T('set.sizing.note')) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  function dataCard(s) {
    return '<section class="card span-7" aria-labelledby="set-data">' +
      '<div class="card-head"><h2 id="set-data">' + U.esc(T('set.data')) + '</h2>' +
        '<span class="hint">' + U.esc(T('set.data.d')) + '</span></div>' +
      '<div class="card-body">' +
        '<div class="field"><span class="tiny muted">' + U.esc(T('set.mode')) + '</span>' +
          '<div><span class="badge badge-live"><i class="dot pulse"></i>' + U.esc(T('set.mode.live')) + '</span></div>' +
          '<div class="help">' + U.esc(T('set.mode.note')) + '</div></div>' +
        '<div class="field" style="margin-top:20px">' +
          '<label for="set-av">' + U.esc(T('set.av')) + '</label>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
            '<input id="set-av" class="input" type="password" autocomplete="off" spellcheck="false" ' +
              'style="flex:1 1 220px" placeholder="' + U.attr(T('set.av.placeholder')) + '" value="' + U.attr(s.avKey || '') + '" />' +
            '<button class="btn btn-sm" data-av-save>' + U.esc(T('common.save')) + '</button>' +
            '<button class="btn btn-sm" data-av-test>' + U.esc(T('set.av.try')) + '</button>' +
            (s.avKey ? '<button class="btn btn-sm btn-danger" data-av-remove>' + U.esc(T('common.remove')) + '</button>' : '') +
          '</div>' +
          '<div class="help">' + U.esc(T('set.av.help')) + '</div>' +
          '<div class="help" data-av-status role="status" aria-live="polite"></div>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  function alertsCard(s) {
    var permission = TA.marketNotifications ? TA.marketNotifications.permission() : 'unsupported';
    var statusKey = !s.marketAlertsEnabled ? 'alerts.status.off'
      : permission === 'granted' ? 'alerts.status.granted'
      : permission === 'denied' ? 'alerts.status.blocked'
      : permission === 'unsupported' ? 'alerts.status.unsupported'
      : 'alerts.status.inApp';
    return '<section class="card span-12 market-alerts-card" aria-labelledby="set-market-alerts">' +
      '<div class="card-head"><h2 id="set-market-alerts">' + ui.icon('clock', 15) + U.esc(T('alerts.title')) + '</h2></div>' +
      '<div class="card-body">' +
        '<p class="small muted">' + U.esc(T('alerts.description')) + '</p>' +
        '<div class="market-alert-options">' +
          '<label class="market-alert-option"><input type="checkbox" data-market-alert="marketStockAlerts"' + (s.marketStockAlerts !== false ? ' checked' : '') + ' />' +
            '<span><b>' + U.esc(T('alerts.stocks')) + '</b><small>' + U.esc(T('alerts.stocks.hours')) + '</small></span></label>' +
          '<label class="market-alert-option"><input type="checkbox" data-market-alert="marketForexAlerts"' + (s.marketForexAlerts !== false ? ' checked' : '') + ' />' +
            '<span><b>' + U.esc(T('alerts.forex')) + '</b><small>' + U.esc(T('alerts.forex.hours')) + '</small></span></label>' +
        '</div>' +
        '<p class="help market-alert-note">' + U.esc(T('alerts.note')) + '</p>' +
        '<div class="market-alert-controls"><button type="button" class="btn btn-primary" data-market-alert-toggle>' +
          U.esc(T(s.marketAlertsEnabled ? 'alerts.pause' : 'alerts.enable')) + '</button>' +
          '<span class="help" data-market-alert-status role="status" aria-live="polite">' + U.esc(T(statusKey)) + '</span></div>' +
      '</div>' +
      '</section>';
  }

  function feedbackCard() {
    var n = TA.store.feedbackCount();
    return '<section class="card span-5" aria-labelledby="set-feedback">' +
      '<div class="card-head"><h2 id="set-feedback">' + U.esc(T('set.feedback')) + '</h2>' +
        '<span class="badge badge-neutral">' + U.esc(T(n === 1 ? 'set.feedback.count_one' : 'set.feedback.count', { n: n })) + '</span></div>' +
      '<div class="card-body">' +
        '<p class="small muted">' + U.esc(T('set.feedback.d')) + '</p>' +
        (n
          ? '<div style="display:flex;align-items:center;gap:12px;margin-top:12px">' +
              '<span class="num" style="font-size:30px;font-weight:620;letter-spacing:-0.02em">' + n + '</span>' +
              '<button class="btn btn-sm" data-fb-export>' + ui.icon('external', 13) + ' ' + U.esc(T('common.export')) + '</button></div>'
          : '<div class="empty" style="padding:16px 0 6px">' + ui.icon('info', 18) + '<span>' + U.esc(T('set.feedback.empty')) + '</span></div>') +
      '</div>' +
      '</section>';
  }

  function aboutCard() {
    return '<section class="card span-12" aria-labelledby="set-about">' +
      '<div class="card-head"><h2 id="set-about">' + U.esc(T('set.about')) + '</h2>' +
        '<span class="hint">' + U.esc(T('set.version')) + '</span></div>' +
      '<div class="card-body">' +
        '<p class="small muted">' + U.esc(T('set.about.d')) + '</p>' +
        '<div class="engine-note" style="margin-top:14px">' +
          '<div class="box"><b>' + U.esc(T('set.engine')) + '</b>' + U.esc(T('set.engine.d')) + '</div>' +
          '<div class="box"><b>' + U.esc(T('set.legal')) + '</b>' + U.esc(T('set.legal.d')) +
            '<div style="margin-top:8px"><button class="btn btn-sm" data-open-legal>' + U.esc(T('set.open_disclaimer')) + '</button></div></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">' +
          '<button class="btn btn-sm btn-ghost" data-open-glossary>' + ui.icon('book', 13) + ' ' + U.esc(T('common.glossary')) + '</button>' +
          '<a class="btn btn-sm btn-ghost" href="#/">' + ui.icon('back', 13) + ' ' + U.esc(T('nav.dashboard')) + '</a>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  function accessCard() {
    var role = TA.session ? TA.session.role() : null;
    var copy = role === 'owner' ? 'set.access.owner' : role === 'member' ? 'set.access.member' : 'set.access.d';
    return '<section class="card span-12" aria-labelledby="set-access" data-access-card>' +
      '<div class="card-head"><h2 id="set-access">' + ui.icon('shield', 15) + ' ' + U.esc(T('set.access')) +
        (role === 'owner' ? ' <span class="access-role-badge">' + U.esc(T('profile.ownerBadge')) + '</span>' : '') +
      '</h2></div>' +
      '<div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">' +
        '<p class="small muted" style="margin:0">' + U.esc(T(copy)) + '</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          (role === 'owner'
            ? '<a class="btn btn-sm" href="/admin">' + ui.icon('key', 13) + ' ' + U.esc(T('set.access.codes')) + '</a>'
            : '') +
          '<a class="btn btn-sm" href="/logout">' + ui.icon('external', 13) + ' ' + U.esc(T('set.access.signout')) + '</a>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  function clearCard() {
    return '<section class="card span-12 danger-zone" aria-labelledby="set-clear">' +
      '<div class="card-head"><h2 id="set-clear">' + U.esc(T('set.clear')) + '</h2></div>' +
      '<div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">' +
        '<p class="small muted" style="margin:0">' + U.esc(T('set.clear.d')) + '</p>' +
        '<button class="btn btn-danger btn-sm" data-reset>' + U.esc(T('set.clear.do')) + '</button>' +
      '</div>' +
      '</section>';
  }

  function paintGroup(root, group, value) {
    U.$$('.chip[data-group="' + group + '"]', root).forEach(function (b) {
      var v = b.getAttribute('data-value');
      var on = Array.isArray(value) ? value.indexOf(v) >= 0 : value === v;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function exportFeedback() {
    var data = TA.store.exportFeedback();
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tiko-feedback-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    ui.toast(T('set.exported'));
  }

  function bind(root) {
    U.$$('.chip[data-group]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var group = b.getAttribute('data-group');
        var value = b.getAttribute('data-value');
        var s = TA.store.settings();
        if (b.hasAttribute('data-multi')) {
          var list = (s[group] || []).slice();
          var i = list.indexOf(value);
          if (i >= 0) {
            if (list.length === 1) { ui.toast(T('ob.err.market')); return; }
            list.splice(i, 1);
          } else {
            list.push(value);
          }
          TA.store.updateSettings(makePatch(group, list));
          paintGroup(root, group, list);
        } else if (group === 'theme') {
          TA.app.setTheme(value);
          paintGroup(root, group, value);
        } else {
          TA.store.updateSettings(makePatch(group, value));
          paintGroup(root, group, value);
        }
      });
    });

    var styleSel = root.querySelector('[data-set-style]');
    if (styleSel) styleSel.addEventListener('change', function () {
      TA.store.updateSettings({ defaultStyle: styleSel.value });
      ui.toast(T('common.saved'));
    });

    var langSel = root.querySelector('[data-set-lang]');
    if (langSel) langSel.addEventListener('change', function () {
      TA.app.setLanguage(langSel.value);
    });

    var accountInput = root.querySelector('[data-set-account]');
    if (accountInput) accountInput.addEventListener('change', function () {
      var value = Number(accountInput.value);
      if (!isFinite(value) || value < 1) {
        ui.toast(T('plan.size.invalid'));
        accountInput.value = TA.store.settings().accountSize;
        return;
      }
      value = Math.min(Math.round(value), 1e9);
      TA.store.updateSettings({ accountSize: value });
      accountInput.value = value;
      ui.toast(T('common.saved'));
    });

    var riskInput = root.querySelector('[data-set-risk]');
    if (riskInput) riskInput.addEventListener('change', function () {
      var value = Number(riskInput.value);
      if (!isFinite(value) || value <= 0) {
        ui.toast(T('plan.size.invalid'));
        riskInput.value = TA.store.settings().riskPct;
        return;
      }
      value = Math.min(value, 100);
      TA.store.updateSettings({ riskPct: value });
      riskInput.value = value;
      ui.toast(T('common.saved'));
    });

    U.$$('.market-alert-option input[data-market-alert]', root).forEach(function (input) {
      input.addEventListener('change', function () {
        var patch = {};
        patch[input.getAttribute('data-market-alert')] = input.checked;
        TA.store.updateSettings(patch);
      });
    });

    var alertToggle = root.querySelector('[data-market-alert-toggle]');
    var alertStatus = root.querySelector('[data-market-alert-status]');
    if (alertToggle) alertToggle.addEventListener('click', function () {
      var active = TA.store.settings().marketAlertsEnabled;
      if (active) {
        TA.store.updateSettings({ marketAlertsEnabled: false });
        alertToggle.textContent = T('alerts.enable');
        if (alertStatus) alertStatus.textContent = T('alerts.status.off');
        return;
      }
      alertToggle.disabled = true;
      TA.marketNotifications.enable().then(function (permission) {
        alertToggle.disabled = false;
        alertToggle.textContent = T('alerts.pause');
        var status = permission === 'granted' ? 'alerts.status.granted'
          : permission === 'denied' ? 'alerts.status.blocked'
          : permission === 'unsupported' ? 'alerts.status.unsupported'
          : 'alerts.status.inApp';
        if (alertStatus) alertStatus.textContent = T(status);
        ui.toast(T('alerts.status.enabled'));
      });
    });

    var avInput = root.querySelector('#set-av');
    var avStatus = root.querySelector('[data-av-status]');
    var avSave = root.querySelector('[data-av-save]');
    var avTest = root.querySelector('[data-av-test]');
    var avRemove = root.querySelector('[data-av-remove]');

    if (avSave) avSave.addEventListener('click', function () {
      var key = (avInput.value || '').trim();
      if (!key) { ui.toast(T('set.av.fail')); return; }
      TA.store.updateSettings({ avKey: key });
      TA.data.clearCache();
      if (avStatus) avStatus.textContent = T('set.av.saved');
      ui.toast(T('set.av.saved'));
      TA.app.refresh({ keepScroll: true });
    });

    if (avRemove) avRemove.addEventListener('click', function () {
      TA.store.updateSettings({ avKey: '' });
      TA.data.clearCache();
      ui.toast(T('set.av.removed'));
      TA.app.refresh({ keepScroll: true });
    });

    if (avTest) avTest.addEventListener('click', function () {
      var key = ((avInput.value || '').trim()) || TA.store.settings().avKey;
      if (!key) { ui.toast(T('set.av.fail')); return; }
      avTest.disabled = true;
      var original = avTest.textContent;
      avTest.textContent = T('set.av.testing');
      TA.data.testAlphaVantage(key).then(function (ok) {
        avTest.disabled = false;
        avTest.textContent = original;
        var msg = ok ? T('set.av.ok') : T('set.av.fail');
        if (avStatus) avStatus.textContent = msg;
        ui.toast(msg);
      }).catch(function () {
        avTest.disabled = false;
        avTest.textContent = original;
        if (avStatus) avStatus.textContent = T('set.av.fail');
        ui.toast(T('set.av.fail'));
      });
    });

    var exportBtn = root.querySelector('[data-fb-export]');
    if (exportBtn) exportBtn.addEventListener('click', exportFeedback);

    var reset = root.querySelector('[data-reset]');
    if (reset) reset.addEventListener('click', function () {
      ui.openModal({
        title: T('set.clear'),
        body: '<p>' + U.esc(T('set.clear.confirm')) + '</p>',
        actions: [
          { label: T('common.cancel') },
          {
            label: T('set.clear.do'),
            kind: 'danger',
            onClick: function () {
              TA.store.resetAll();
              TA.i18n.set(TA.store.settings().language);
              ui.toast(T('set.cleared'));
              if (location.hash && location.hash !== '#/' && location.hash !== '#') location.hash = '#/';
              else TA.app.refresh();
            }
          }
        ]
      });
    });

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-open-legal]')) { e.preventDefault(); ui.legalModal(); }
      if (e.target.closest('[data-open-glossary]')) { e.preventDefault(); ui.glossaryModal(); }
    });
  }

  function makePatch(group, value) {
    var patch = {};
    patch[group] = value;
    return patch;
  }

  function render(root) {
    var s = TA.store.settings();
    root.innerHTML = '<div class="wrap page">' +
      '<div class="page-head">' +
        '<div>' +
          '<div class="eyebrow">' + U.esc(T('nav.settings')) + '</div>' +
          '<h1 style="margin-top:6px">' + U.esc(T('set.title')) + '</h1>' +
          '<p class="greeting-sub">' + U.esc(T('set.lede')) + '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<a class="btn btn-sm" href="#/">' + ui.icon('back', 14) + ' ' + U.esc(T('nav.dashboard')) + '</a>' +
        '</div>' +
      '</div>' +
      '<div class="dash-grid">' +
        profileCard(s) + alertsCard(s) + dataCard(s) + feedbackCard() + aboutCard() + accessCard() + clearCard() +
      '</div>' +
      '<div class="tiny muted" style="text-align:center;margin-top:26px">' + U.esc(T('dash.footer')) + '</div>' +
      '</div>';

    bind(root);

    if (TA.session) {
      TA.session.load().then(function () {
        var card = root.querySelector('[data-access-card]');
        if (card && TA.session.role()) card.outerHTML = accessCard();
      });
    }
  }

  TA.views = TA.views || {};
  TA.views.settings = { render: render };
})(window.TA = window.TA || {});
