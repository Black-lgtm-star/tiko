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
    get length() { return map.size; }
  };
}

const session = makeStorage();
const ctx = { console, setTimeout, clearTimeout, queueMicrotask, window: { TA: {}, sessionStorage: session } };
ctx.window.window = ctx.window;
vm.createContext(ctx);
['js/util.js', 'js/deriv-api.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const api = ctx.window.TA.derivApi;

const calls = [];
let handler = null;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  };
}

function installFetch(fn) {
  api._installFetch((url, init) => {
    calls.push({ url, init });
    return Promise.resolve(fn(url, init));
  });
}

const sockets = [];
let wsServer = null;

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
      out = wsServer ? wsServer(msg) : {};
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

api._installTransport(FakeSocket);

const ACCOUNTS = {
  data: [
    { account_id: 'VRTC111', balance: 0, currency: 'USD', status: 'active', account_type: 'demo' },
    { account_id: 'CR9001', balance: 0, currency: 'USD', status: 'active', account_type: 'real' }
  ],
  meta: { endpoint: '/accounts', method: 'GET', timing: 12 }
};

const CONTRACTS = {
  portfolio: {
    contracts: [{
      contract_id: 42,
      contract_type: 'CALL',
      underlying_symbol: 'R_100',
      buy_price: 51.02,
      payout: 100,
      currency: 'USD',
      date_start: 1234567890,
      expiry_time: 1234567950,
      longcode: 'Win payout if Volatility 100 Index is strictly higher.'
    }]
  }
};

function defaultHandler(url) {
  if (url.endsWith('/trading/v1/options/accounts')) return jsonResponse(200, ACCOUNTS);
  if (url.endsWith('/otp')) {
    return jsonResponse(200, { data: { url: 'wss://api.derivws.com/trading/v1/options/ws/real?otp=abc123' } });
  }
  return jsonResponse(404, { errors: [{ status: 404, code: 'NotFound', message: 'missing' }] });
}

function defaultServer(msg) {
  if (msg.balance != null) {
    return { balance: { balance: 10092.59, currency: 'USD', loginid: 'CR9001' }, msg_type: 'balance' };
  }
  if (msg.portfolio != null) return Object.assign({ msg_type: 'portfolio' }, CONTRACTS);
  return {};
}

test.beforeEach(() => {
  api.disconnect();
  calls.length = 0;
  sockets.length = 0;
  session.removeItem('gt.deriv.api.session.v1');
  handler = defaultHandler;
  wsServer = defaultServer;
  installFetch((url, init) => handler(url, init));
});

test('config, token and account id are validated before any request', async () => {
  assert.equal(api.normalizeAppId(' 12345 '), '12345');
  assert.equal(api.normalizeAppId('abc'), '');
  assert.equal(api.normalizeToken(' pat '), 'pat');
  assert.equal(api.normalizeToken('a b'), '');
  assert.equal(api.normalizeToken(''), '');
  assert.equal(api.normalizeToken('x'.repeat(513)), '');
  assert.equal(api.normalizeAccountId(' DOT90004580 '), 'DOT90004580');
  assert.equal(api.normalizeAccountId('bad id'), '');
  assert.equal(api.normalizeAccountId('x'), '');
  assert.equal(api.mask('short'), '•••••');
  assert.equal(api.mask('pat-1234567890'), 'pat-…7890');

  await assert.rejects(api.connect({ appId: 'nope', token: 'pat' }), (err) => err.code === 'badConfig');
  await assert.rejects(api.connect({ appId: '123', token: '' }), (err) => err.code === 'badConfig');
  await assert.rejects(api.connect({ appId: '123', token: 'pat', accountId: 'bad id' }), (err) => err.code === 'badConfig');
  assert.equal(calls.length, 0);
  assert.equal(sockets.length, 0);
  assert.equal(session.getItem('gt.deriv.api.session.v1'), null);
});

test('connect lists accounts, exchanges the OTP and reads balance and positions', async () => {
  const state = await api.connect({ appId: ' 12345 ', token: ' pat-1234567890 ', accountId: '' });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.derivws.com/trading/v1/options/accounts');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer pat-1234567890');
  assert.equal(calls[0].init.headers['Deriv-App-ID'], '12345');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[1].url, 'https://api.derivws.com/trading/v1/options/accounts/CR9001/otp');
  assert.equal(calls[1].init.method, 'POST');

  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'wss://api.derivws.com/trading/v1/options/ws/real?otp=abc123');
  assert.equal(sockets[0].last('balance').balance, 1);
  assert.equal(sockets[0].last('portfolio').portfolio, 1);

  assert.equal(state.connected, true);
  assert.equal(state.appId, '12345');
  assert.equal(state.accountId, 'CR9001');
  assert.equal(state.account.accountId, 'CR9001');
  assert.equal(state.account.type, 'real');
  assert.equal(state.account.balance, 10092.59);
  assert.equal(state.tokenMasked, 'pat-…7890');
  assert.equal(state.positionsOk, true);
  assert.equal(state.contracts.length, 1);
  assert.equal(state.contracts[0].id, '42');
  assert.equal(state.contracts[0].symbol, 'R_100');
  assert.equal(state.contracts[0].buyPrice, 51.02);
  assert.equal(state.contracts[0].expiry, 1234567950);
  assert.equal(JSON.stringify(state).indexOf('pat-1234567890'), -1);

  const stored = JSON.parse(session.getItem('gt.deriv.api.session.v1'));
  assert.deepEqual(stored, { appId: '12345', token: 'pat-1234567890', accountId: 'CR9001' });
  assert.equal(api.read().accountId, 'CR9001');
});

test('an explicit account id is honoured and an unknown one is rejected', async () => {
  const demo = await api.connect({ appId: '123', token: 'pat', accountId: 'vrtc111' });
  assert.equal(demo.account.accountId, 'VRTC111');
  assert.equal(demo.account.type, 'demo');

  calls.length = 0;
  sockets.length = 0;
  await assert.rejects(api.connect({ appId: '123', token: 'pat', accountId: 'CR000' }), (err) => err.code === 'account');
  assert.equal(calls.length, 1);
  assert.equal(sockets.length, 0);
  assert.equal(api.state().connected, false);
});

test('the first active real account is picked when no id is given', async () => {
  handler = (url) => {
    if (url.endsWith('/accounts')) {
      return jsonResponse(200, {
        data: [
          { account_id: 'OLD1', status: 'inactive', account_type: 'real' },
          { account_id: 'VRTC9', status: 'active', account_type: 'demo' },
          { account_id: 'CR77', status: 'active', account_type: 'real' }
        ]
      });
    }
    return defaultHandler(url);
  };
  const state = await api.connect({ appId: '123', token: 'pat' });
  assert.equal(state.account.accountId, 'CR77');
});

test('http errors map to auth, rate and account codes without saving credentials', async () => {
  handler = () => jsonResponse(401, { errors: [{ status: 401, code: 'Unauthorized', message: 'bad token' }] });
  await assert.rejects(api.connect({ appId: '123', token: 'pat' }), (err) => err.code === 'auth');
  assert.equal(session.getItem('gt.deriv.api.session.v1'), null);

  handler = () => jsonResponse(429, { errors: [{ status: 429, code: 'RateLimit', message: 'slow down' }] });
  await assert.rejects(api.connect({ appId: '123', token: 'pat' }), (err) => err.code === 'rate');

  handler = () => jsonResponse(400, { errors: [{ status: 400, code: 'ValidationError', message: 'bad account' }] });
  await assert.rejects(api.connect({ appId: '123', token: 'pat', accountId: 'CR1' }), (err) => err.code === 'account');

  assert.equal(api.state().connected, false);
  assert.equal(sockets.length, 0);
});

test('a connection address outside api.derivws.com is refused', async () => {
  handler = (url) => {
    if (url.endsWith('/otp')) {
      return jsonResponse(200, { data: { url: 'wss://evil.example/ws?otp=1' } });
    }
    return defaultHandler(url);
  };
  await assert.rejects(api.connect({ appId: '123', token: 'pat' }), (err) => err.code === 'url');
  assert.equal(sockets.length, 0);
  assert.equal(api.state().connected, false);
});

test('a failing portfolio keeps the account but marks positions unavailable', async () => {
  wsServer = (msg) => {
    if (msg.balance != null) return { balance: { balance: 10, currency: 'USD', loginid: 'CR9001' } };
    if (msg.portfolio != null) return { error: { code: 'InternalError', message: 'no portfolio' } };
    return {};
  };
  const state = await api.connect({ appId: '123', token: 'pat' });
  assert.equal(state.connected, true);
  assert.equal(state.account.balance, 10);
  assert.equal(state.positionsOk, false);
  assert.deepEqual(JSON.parse(JSON.stringify(state.contracts)), []);
});

test('refresh reloads balance and positions and reports a dropped socket', async () => {
  await api.connect({ appId: '123', token: 'pat' });
  wsServer = (msg) => {
    if (msg.balance != null) return { balance: { balance: 222.5, currency: 'USD', loginid: 'CR9001' } };
    return Object.assign({ msg_type: 'portfolio' }, CONTRACTS);
  };
  const state = await api.refresh();
  assert.equal(state.account.balance, 222.5);
  assert.equal(state.contracts.length, 1);

  sockets[0].close();
  assert.equal(api.state().connected, false);
  await assert.rejects(api.refresh(), (err) => err.code === 'offline');
});

test('disconnect closes the socket and forgets the session credentials', async () => {
  await api.connect({ appId: '123', token: 'pat' });
  const state = api.disconnect();
  assert.equal(state.connected, false);
  assert.equal(state.account, null);
  assert.equal(sockets[0].closed, true);
  assert.equal(session.getItem('gt.deriv.api.session.v1'), null);
  await assert.rejects(api.refresh(), (err) => err.code === 'offline');
});

test('network failures and aborted requests map to network and timeout', async () => {
  api._installFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  await assert.rejects(api.connect({ appId: '123', token: 'pat' }), (err) => err.code === 'network');

  api._installFetch(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  await assert.rejects(api.connect({ appId: '123', token: 'pat' }), (err) => err.code === 'timeout');
});
