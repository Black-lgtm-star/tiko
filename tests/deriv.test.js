'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function makeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    key: (index) => Array.from(map.keys())[index] || null,
    get length() { return map.size; },
    dump: () => Object.fromEntries(map)
  };
}

const session = makeStorage();
const ctx = { console, setTimeout, clearTimeout, queueMicrotask, window: { TA: {}, sessionStorage: session } };
ctx.window.window = ctx.window;
vm.createContext(ctx);
['js/util.js', 'js/deriv.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const deriv = ctx.window.TA.deriv;

const sockets = [];
let server = null;

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closed = false;
    sockets.push(this);
    queueMicrotask(() => this._open());
  }

  _open() {
    if (this.readyState !== 0) return;
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }

  send(raw) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    let out;
    try {
      out = server ? server(msg) : { error: { code: 'unexpected', message: 'no server' } };
    } catch (err) {
      out = { error: { code: 'unexpected', message: String(err) } };
    }
    if (!out) return;
    queueMicrotask(() => {
      if (this.readyState !== 1 || !this.onmessage) return;
      this.onmessage({ data: JSON.stringify(Object.assign({ req_id: msg.req_id }, out)) });
    });
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closed = true;
    if (this.onclose) this.onclose({ code: 1000 });
  }

  last(type) {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(this.sent[i], type)) return this.sent[i];
    }
    return null;
  }
}

deriv._installTransport(FakeSocket);

function account(over) {
  return Object.assign({
    authorize: {
      loginid: 'CR12345',
      currency: 'USD',
      balance: 1000.5,
      is_virtual: 0,
      scopes: ['admin', 'trade']
    }
  }, over || {});
}

function defaultServer(msg) {
  if (msg.authorize != null) return account();
  if (msg.copytrading_list != null) {
    return {
      copytrading_list: {
        copiers: [{
          trader_loginid: 'CR777',
          app_id: 4321,
          created_at: 1700000000,
          max_trade_stake: 25,
          min_trade_stake: 1,
          assets: ['frxEURUSD'],
          trade_types: ['multi_barrier'],
          copier_token: 'copy-token-abcdefgh'
        }],
        traders: [{ trader_loginid: 'CR888', app_id: 4321, copier_token: 'trader-token-abcdefgh' }]
      }
    };
  }
  if (msg.copy_start != null) return { copy_start: 1 };
  if (msg.copy_stop != null) return { copy_stop: 1 };
  return {};
}

test.beforeEach(() => {
  deriv.disconnect();
  sockets.length = 0;
  server = defaultServer;
});

test('config and tokens are validated before any socket opens', async () => {
  assert.equal(deriv.normalizeAppId(' 12345 '), '12345');
  assert.equal(deriv.normalizeAppId('abc'), '');
  assert.equal(deriv.normalizeAppId('12345678901'), '');
  assert.equal(deriv.normalizeToken(' abc '), 'abc');
  assert.equal(deriv.normalizeToken('a b'), '');
  assert.equal(deriv.normalizeToken(''), '');
  assert.equal(deriv.normalizeToken('x'.repeat(126)), '');
  assert.equal(deriv.mask('short'), '•••••');
  assert.equal(deriv.mask('abcdefghijklmno'), 'abcd…lmno');

  await assert.rejects(deriv.connect({ appId: 'nope', token: 'tok' }), (err) => err.code === 'badConfig');
  await assert.rejects(deriv.connect({ appId: '123', token: '' }), (err) => err.code === 'badConfig');
  assert.equal(sockets.length, 0);
  assert.equal(session.getItem('gt.deriv.session.v1'), null);
});

test('connect authorizes, keeps the token in session storage and masks it', async () => {
  const state = await deriv.connect({ appId: ' 12345 ', token: ' token-1234567890 ' });
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'wss://ws.derivws.com/websockets/v3?app_id=12345');
  assert.equal(sockets[0].last('authorize').authorize, 'token-1234567890');

  assert.equal(state.connected, true);
  assert.equal(state.appId, '12345');
  assert.equal(state.tokenMasked, 'toke…7890');
  assert.equal(state.account.loginId, 'CR12345');
  assert.equal(state.account.balance, 1000.5);
  assert.equal(state.account.isVirtual, false);
  assert.equal(state.account.canList, true);
  assert.equal(state.account.canTrade, true);
  assert.deepEqual(JSON.parse(JSON.stringify(state.account.scopes)), ['admin', 'trade']);
  assert.equal(JSON.stringify(state).indexOf('token-1234567890'), -1);

  const stored = JSON.parse(session.getItem('gt.deriv.session.v1'));
  assert.equal(stored.appId, '12345');
  assert.equal(stored.token, 'token-1234567890');
  assert.equal(deriv.read().token, 'token-1234567890');
});

test('rejected authorization fails without saving credentials', async () => {
  server = () => ({ error: { code: 'AuthorizationFailed', message: 'Invalid token' } });
  await assert.rejects(deriv.connect({ appId: '123', token: 'bad' }), (err) => {
    assert.equal(err.code, 'auth');
    assert.equal(err.apiCode, 'AuthorizationFailed');
    return true;
  });
  assert.equal(session.getItem('gt.deriv.session.v1'), null);
  assert.equal(deriv.state().connected, false);
  assert.equal(sockets[0].closed, true);
});

test('a login response without a login id is treated as an auth failure', async () => {
  server = () => ({ authorize: { currency: 'USD' } });
  await assert.rejects(deriv.connect({ appId: '123', token: 'tok' }), (err) => err.code === 'auth');
  assert.equal(deriv.state().connected, false);
});

test('listing copies needs the admin scope and never exposes row tokens', async () => {
  server = () => account({ authorize: { loginid: 'CR1', scopes: ['trade'] } });
  await deriv.connect({ appId: '123', token: 'tok' });
  assert.equal(deriv.state().account.canList, false);
  await assert.rejects(deriv.list(), (err) => err.code === 'scope');
  assert.equal(sockets[0].last('copytrading_list'), null);

  server = defaultServer;
  await deriv.connect({ appId: '123', token: 'tok' });
  const state = await deriv.list();
  assert.equal(sockets[1].last('copytrading_list').copytrading_list, 1);
  assert.equal(state.copies.length, 2);
  assert.equal(state.copies[0].kind, 'copier');
  assert.equal(state.copies[0].loginId, 'CR777');
  assert.equal(state.copies[0].appId, '4321');
  assert.equal(state.copies[0].maxStake, 25);
  assert.equal(state.copies[0].assets, 'frxEURUSD');
  assert.equal(state.copies[0].canStop, true);
  assert.equal(state.copies[1].kind, 'trader');
  assert.equal(JSON.stringify(state).indexOf('copy-token'), -1);
  assert.equal(JSON.stringify(state).indexOf('trader-token'), -1);
});

test('startCopy requires confirmation, a trade scope, a token and a sane stake cap', async () => {
  server = () => account({ authorize: { loginid: 'CR1', scopes: ['admin'] } });
  await deriv.connect({ appId: '123', token: 'tok' });
  const noTrade = { token: 'trader-copy-token', maxStake: '10' };
  await assert.rejects(deriv.start(noTrade), (err) => err.code === 'confirm');
  await assert.rejects(deriv.start(noTrade, { confirm: true }), (err) => err.code === 'scope');
  assert.equal(sockets[0].last('copy_start'), null);

  server = defaultServer;
  await deriv.connect({ appId: '123', token: 'tok' });
  const base = { token: 'trader-copy-token', maxStake: '10' };
  await assert.rejects(deriv.start({ token: '', maxStake: '10' }, { confirm: true }), (err) => err.code === 'badToken');
  await assert.rejects(deriv.start({ token: 'tok', maxStake: '0' }, { confirm: true }), (err) => err.code === 'badStake');
  await assert.rejects(deriv.start({ token: 'tok', maxStake: '5' , minStake: '6' }, { confirm: true }), (err) => err.code === 'badStake');
  await assert.rejects(deriv.start(Object.assign({}, base, { minStake: '-1' }), { confirm: true }), (err) => err.code === 'badStake');
  assert.equal(sockets[1].last('copy_start'), null);

  await deriv.start(Object.assign({}, base, {
    minStake: '2',
    assets: 'frxEURUSD, R_100',
    tradeTypes: 'multi_barrier up_down'
  }), { confirm: true });
  const sent = sockets[1].last('copy_start');
  assert.equal(sent.copy_start, 'trader-copy-token');
  assert.equal(sent.max_trade_stake, 10);
  assert.equal(sent.min_trade_stake, 2);
  assert.deepEqual(sent.assets, ['frxEURUSD', 'R_100']);
  assert.deepEqual(sent.trade_types, ['multi_barrier', 'up_down']);
  assert.equal(sockets[1].last('copytrading_list') != null, true);
});

test('stopCopyAt uses the stored row token and rejects unknown rows', async () => {
  let stopped = false;
  const rows = {
    copiers: [{
      trader_loginid: 'CR777',
      app_id: 4321,
      max_trade_stake: 25,
      copier_token: 'copy-token-abcdefgh'
    }],
    traders: [{ trader_loginid: 'CR900', app_id: 4321, copier_token: '' }]
  };
  server = (msg) => {
    if (msg.authorize != null) return account();
    if (msg.copytrading_list != null) {
      return { copytrading_list: { copiers: stopped ? [] : rows.copiers, traders: rows.traders } };
    }
    if (msg.copy_stop != null) { stopped = true; return { copy_stop: 1 }; }
    return {};
  };

  await deriv.connect({ appId: '123', token: 'tok' });
  await deriv.list();
  assert.equal(deriv.state().copies.length, 2);

  await assert.rejects(deriv.stopAt(9), (err) => err.code === 'badRow');
  await deriv.stopAt(0);
  const stoppedMsg = sockets[0].last('copy_stop');
  assert.equal(stoppedMsg.copy_stop, 'copy-token-abcdefgh');
  assert.equal(deriv.state().copies.length, 1);
  assert.equal(deriv.state().copies[0].loginId, 'CR900');

  await assert.rejects(deriv.stopAt(0), (err) => err.code === 'noToken');
});

test('disconnect closes the socket and forgets the session credentials', async () => {
  await deriv.connect({ appId: '123', token: 'tok' });
  const state = deriv.disconnect();
  assert.equal(state.connected, false);
  assert.equal(state.account, null);
  assert.equal(sockets[0].closed, true);
  assert.equal(session.getItem('gt.deriv.session.v1'), null);
  await assert.rejects(deriv.list(), (err) => err.code === 'offline');
  await assert.rejects(deriv.start({ token: 'tok', maxStake: '1' }, { confirm: true }), (err) => err.code === 'offline');
});

test('unknown API errors map to the generic code', async () => {
  server = () => ({ error: { code: 'RateLimit', message: 'slow down' } });
  await assert.rejects(deriv.connect({ appId: '123', token: 'tok' }), (err) => err.code === 'api');
});

test('probe reports the legacy endpoint as up and caches the answer', async () => {
  const status = await deriv.probe({ force: true });
  assert.equal(status, 'up');
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'wss://ws.derivws.com/websockets/v3?app_id=1');
  assert.equal(deriv.probeState().status, 'up');

  assert.equal(await deriv.probe(), 'up');
  assert.equal(sockets.length, 1, 'cached result must not open another socket');
});

test('probe reports down when the endpoint closes the connection', async () => {
  class DownSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      sockets.push(this);
      queueMicrotask(() => {
        this.readyState = 3;
        if (this.onerror) this.onerror({});
        if (this.onclose) this.onclose({ code: 520 });
      });
    }
    close() { this.readyState = 3; }
  }
  deriv._installTransport(DownSocket);
  try {
    const status = await deriv.probe({ force: true });
    assert.equal(status, 'down');
    assert.equal(deriv.probeState().status, 'down');
    assert.equal(await deriv.probe(), 'down');
    assert.equal(sockets.length, 1, 'cached failure must not open another socket');
  } finally {
    deriv._installTransport(FakeSocket);
  }
});
