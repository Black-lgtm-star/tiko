'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function makeStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    dump: () => Object.fromEntries(data)
  };
}

function makeContext(overrides, options) {
  const opts = options || {};
  const storage = makeStorage();
  const settings = Object.assign({
    marketAlertsEnabled: true,
    marketStockAlerts: true,
    marketForexAlerts: true
  }, overrides || {});
  const toasts = [];
  const notices = [];
  function FakeNotification(title, opts) {
    notices.push({ title, body: opts && opts.body, tag: opts && opts.tag });
  }
  FakeNotification.permission = 'default';
  FakeNotification.requestPermission = () => {
    FakeNotification.permission = 'granted';
    return Promise.resolve('granted');
  };

  const ctx = {
    console,
    localStorage: storage,
    document: { hidden: false, addEventListener: () => {} },
    window: {
      TA: {
        i18n: { t: (key) => key },
        ui: { toast: (message) => toasts.push(message) },
        auth: { session: () => (opts.signedIn === false ? null : { uid: 'test-user' }) },
        store: {
          settings: () => Object.assign({}, settings),
          updateSettings: (patch) => Object.assign(settings, patch)
        }
      },
      localStorage: storage,
      Notification: FakeNotification
    }
  };
  ctx.window.window = ctx.window;
  ctx.window.focus = () => {};
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(root, 'js/market-notifications.js'), 'utf8'),
    ctx,
    { filename: 'js/market-notifications.js' }
  );
  const ContextDate = vm.runInContext('Date', ctx);
  return { TA: ctx.window.TA, settings, storage, toasts, notices, Notification: FakeNotification, date: (iso) => new ContextDate(iso) };
}

test('stocks are closed before the 9:30 open and point to today’s open', () => {
  const { TA, date } = makeContext();
  const state = TA.marketNotifications.sessionState(date('2026-10-28T13:00:00Z'));
  assert.equal(state.stocks.open, false);
  assert.equal(state.stocks.next.type, 'open');
  assert.equal(state.stocks.next.at.toISOString(), '2026-10-28T13:30:00.000Z');
});

test('stocks are open during the regular session and point to the 4 p.m. close', () => {
  const { TA, date } = makeContext();
  const state = TA.marketNotifications.sessionState(date('2026-10-28T14:00:00Z'));
  assert.equal(state.stocks.open, true);
  assert.equal(state.stocks.next.type, 'close');
  assert.equal(state.stocks.next.at.toISOString(), '2026-10-28T20:00:00.000Z');
});

test('weekends point to the next Monday open across the DST change', () => {
  const { TA, date } = makeContext();
  const state = TA.marketNotifications.sessionState(date('2026-10-31T15:00:00Z'));
  assert.equal(state.stocks.open, false);
  assert.equal(state.stocks.next.at.toISOString(), '2026-11-02T14:30:00.000Z');
});

test('exchange holidays are skipped', () => {
  const { TA, date } = makeContext();
  const state = TA.marketNotifications.sessionState(date('2026-11-26T16:00:00Z'));
  assert.equal(state.stocks.open, false);
  assert.equal(state.stocks.next.at.toISOString(), '2026-11-27T14:30:00.000Z');
});

test('early closes end the session at 1 p.m. Eastern', () => {
  const { TA, date } = makeContext();
  const before = TA.marketNotifications.sessionState(date('2026-11-27T17:55:00Z'));
  assert.equal(before.stocks.open, true);
  assert.equal(before.stocks.next.at.toISOString(), '2026-11-27T18:00:00.000Z');

  const after = TA.marketNotifications.sessionState(date('2026-11-27T18:05:00Z'));
  assert.equal(after.stocks.open, false);
  assert.equal(after.stocks.next.at.toISOString(), '2026-11-30T14:30:00.000Z');
});

test('forex opens Sunday at 5 p.m. Eastern and closes Friday at 5 p.m.', () => {
  const { TA, date } = makeContext();
  const beforeOpen = TA.marketNotifications.sessionState(date('2026-11-01T21:05:00Z'));
  assert.equal(beforeOpen.forex.open, false);
  assert.equal(beforeOpen.forex.next.at.toISOString(), '2026-11-01T22:00:00.000Z');

  const opened = TA.marketNotifications.sessionState(date('2026-11-01T22:05:00Z'));
  assert.equal(opened.forex.open, true);
  assert.equal(opened.forex.next.at.toISOString(), '2026-11-06T22:00:00.000Z');
});

test('open alerts fire once per event and close alerts follow later', () => {
  const { TA, toasts, date } = makeContext();
  TA.marketNotifications.checkAt(date('2026-10-28T13:31:00Z'));
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].includes('alerts.stocks.open.title'));

  TA.marketNotifications.checkAt(date('2026-10-28T13:32:00Z'));
  assert.equal(toasts.length, 1, 'duplicate open alert suppressed');

  TA.marketNotifications.checkAt(date('2026-10-28T20:01:00Z'));
  assert.equal(toasts.length, 2);
  assert.ok(toasts[1].includes('alerts.stocks.close.title'));
});

test('pre-close reminders fire before the closing bell, including early closes', () => {
  const { TA, toasts, date } = makeContext();
  TA.marketNotifications.checkAt(date('2026-10-28T19:50:00Z'));
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].includes('alerts.stocks.soon.title'));
  assert.ok(toasts[0].includes('alerts.stocks.soon.body'));

  const early = makeContext();
  early.TA.marketNotifications.checkAt(early.date('2026-11-27T17:50:00Z'));
  assert.equal(early.toasts.length, 1);
  assert.ok(early.toasts[0].includes('alerts.stocks.soonEarly.body'));

  early.TA.marketNotifications.checkAt(early.date('2026-11-27T18:01:00Z'));
  assert.equal(early.toasts.length, 2);
  assert.ok(early.toasts[1].includes('alerts.stocks.closeEarly.body'));
});

test('disabled alerts and disabled groups stay silent', () => {
  const off = makeContext({ marketAlertsEnabled: false });
  off.TA.marketNotifications.checkAt(off.date('2026-10-28T13:31:00Z'));
  assert.equal(off.toasts.length, 0);

  const stocksOff = makeContext({ marketStockAlerts: false });
  stocksOff.TA.marketNotifications.checkAt(stocksOff.date('2026-10-28T13:31:00Z'));
  assert.equal(stocksOff.toasts.length, 0);

  stocksOff.TA.marketNotifications.checkAt(stocksOff.date('2026-11-01T22:01:00Z'));
  assert.equal(stocksOff.toasts.length, 1);
  assert.ok(stocksOff.toasts[0].includes('alerts.forex.open.title'));
});

test('alerts stay silent for signed-out visitors', () => {
  const signedOut = makeContext({}, { signedIn: false });
  signedOut.TA.marketNotifications.checkAt(signedOut.date('2026-10-28T13:31:00Z'));
  assert.equal(signedOut.toasts.length, 0);
});

test('system notifications require granted permission', () => {
  const { TA, toasts, notices, Notification, date } = makeContext();
  TA.marketNotifications.checkAt(date('2026-10-28T13:31:00Z'));
  assert.equal(toasts.length, 1);
  assert.equal(notices.length, 0, 'no system notification without permission');

  Notification.permission = 'granted';
  TA.marketNotifications.checkAt(date('2026-10-28T20:01:00Z'));
  assert.equal(notices.length, 1);
  assert.equal(notices[0].tag, '2026-10-28:stocks-close');
});

test('status reports session flags and enable switches alerts on', async () => {
  const { TA, settings, Notification } = makeContext({ marketAlertsEnabled: false });
  const before = TA.marketNotifications.status();
  assert.equal(before.enabled, false);
  assert.equal(before.permission, 'default');
  assert.equal(before.stocksEnabled, true);

  const permission = await TA.marketNotifications.enable();
  assert.equal(permission, 'granted');
  assert.equal(settings.marketAlertsEnabled, true);
  assert.equal(Notification.permission, 'granted');
  assert.equal(TA.marketNotifications.status().enabled, true);
  assert.equal(TA.marketNotifications.disable(), false);
  assert.equal(TA.marketNotifications.status().enabled, false);
});

test('new alert copy exists in both English and Spanish', () => {
  const source = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
  const en = source.slice(source.indexOf('var en = {'), source.indexOf('var es = {'));
  const es = source.slice(source.indexOf('var es = {'), source.indexOf('function t('));
  const keys = [
    'alerts.panel.title', 'alerts.panel.on', 'alerts.panel.paused', 'alerts.panel.stocks',
    'alerts.panel.forex', 'alerts.panel.open', 'alerts.panel.closed', 'alerts.panel.off',
    'alerts.panel.opensIn', 'alerts.panel.closesIn', 'alerts.panel.allow',
    'alerts.panel.settings', 'alerts.panel.note', 'alerts.panel.pausedNote',
    'alerts.panel.blocked', 'alerts.paused.toast', 'alerts.stocks.soon.title',
    'alerts.stocks.soon.body', 'alerts.stocks.soonEarly.body', 'alerts.forex.soon.title',
    'alerts.forex.soon.body'
  ];
  keys.forEach((key) => {
    assert.ok(en.includes("'" + key + "'"), 'missing EN key: ' + key);
    assert.ok(es.includes("'" + key + "'"), 'missing ES key: ' + key);
  });
});
