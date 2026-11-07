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
const ctx = { console, window: { TA: {}, sessionStorage: session } };
ctx.window.window = ctx.window;
vm.createContext(ctx);
['js/util.js', 'js/broker.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
});
const broker = ctx.window.TA.broker;

function fakeFetch(status, body) {
  const calls = [];
  const fn = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body == null ? '' : JSON.stringify(body))
    });
  };
  fn.calls = calls;
  return fn;
}

function accountBody(over) {
  return Object.assign({
    account_number: 'PA12345678',
    status: 'ACTIVE',
    currency: 'USD',
    equity: '10250.75',
    cash: '4000',
    buying_power: '8000',
    daytrade_count: 2,
    trading_blocked: false,
    account_blocked: false,
    shorting_enabled: true
  }, over || {});
}

const keys = { mode: 'live', keyId: 'PKTEST123', secretKey: 'secret456' };

test('normalizeKeys trims, validates and defaults unknown modes to paper', () => {
  const ok = broker.normalizeKeys({ mode: 'live', keyId: '  PKTEST  ', secretKey: ' secret ' });
  assert.equal(ok.mode, 'live');
  assert.equal(ok.keyId, 'PKTEST');
  assert.equal(ok.secretKey, 'secret');

  assert.equal(broker.normalizeKeys({ mode: 'nope', keyId: 'a', secretKey: 'b' }).mode, 'paper');
  assert.equal(broker.normalizeKeys({ mode: 'live', keyId: '', secretKey: 'b' }), null);
  assert.equal(broker.normalizeKeys({ mode: 'live', keyId: 'a', secretKey: '' }), null);
  assert.equal(broker.normalizeKeys({ keyId: 'a b', secretKey: 'c' }), null);
  assert.equal(broker.normalizeKeys(null), null);
});

test('keys are stored in session storage only and can be cleared', () => {
  broker.clear();
  assert.equal(broker.read(), null);
  assert.equal(broker.save({ mode: 'paper', keyId: ' sandbox ', secretKey: ' s3cret ' }).mode, 'paper');
  const stored = broker.read();
  assert.equal(stored.keyId, 'sandbox');
  assert.equal(stored.secretKey, 's3cret');
  assert.equal(session.getItem('gt.broker.v1') != null, true);
  broker.clear();
  assert.equal(broker.read(), null);
  assert.equal(session.getItem('gt.broker.v1'), null);

  session.setItem('gt.broker.v1', '{not json');
  assert.equal(broker.read(), null);
  session.removeItem('gt.broker.v1');
});

test('account requests use the right base URL and Alpaca headers', async () => {
  const f = fakeFetch(200, accountBody());
  const acct = await broker.account(keys, { fetch: f });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://api.alpaca.markets/v2/account');
  assert.equal(f.calls[0].init.method, 'GET');
  assert.equal(f.calls[0].init.headers['APCA-API-KEY-ID'], 'PKTEST123');
  assert.equal(f.calls[0].init.headers['APCA-API-SECRET-KEY'], 'secret456');
  assert.equal(f.calls[0].init.headers.Accept, 'application/json');
  assert.equal(acct.accountNumber, 'PA12345678');
  assert.equal(acct.status, 'ACTIVE');
  assert.equal(acct.equity, 10250.75);
  assert.equal(acct.buyingPower, 8000);
  assert.equal(acct.daytradeCount, 2);
  assert.equal(acct.currency, 'USD');
  assert.equal(acct.shortingEnabled, true);

  const paper = fakeFetch(200, accountBody());
  await broker.account({ mode: 'paper', keyId: 'k', secretKey: 's' }, { fetch: paper });
  assert.equal(paper.calls[0].url, 'https://paper-api.alpaca.markets/v2/account');
});

test('account, position and order responses are normalized', async () => {
  const f = fakeFetch(200, [
    {
      symbol: 'AAPL', asset_class: 'us_equity', qty: '3', side: 'long',
      avg_entry_price: '190.5', current_price: '195.25', market_value: '585.75',
      unrealized_pl: '14.25', unrealized_plpc: '0.0249'
    }
  ]);
  const positions = await broker.positions(keys, { fetch: f });
  assert.equal(positions.length, 1);
  assert.equal(positions[0].symbol, 'AAPL');
  assert.equal(positions[0].qty, 3);
  assert.equal(positions[0].avgEntry, 190.5);
  assert.equal(positions[0].currentPrice, 195.25);
  assert.equal(positions[0].unrealizedPl, 14.25);

  const ordersFetch = fakeFetch(200, [{
    id: 'o1', client_order_id: 'tiko-AAPL-x', symbol: 'AAPL', side: 'buy', qty: '3',
    filled_qty: '1', type: 'market', order_class: 'bracket', status: 'new',
    stop_price: '185', submitted_at: '2026-11-02T14:30:00Z'
  }]);
  const orders = await broker.openOrders(keys, { fetch: ordersFetch });
  assert.equal(ordersFetch.calls[0].url, 'https://api.alpaca.markets/v2/orders?status=open&limit=50&direction=desc');
  assert.equal(orders[0].clientOrderId, 'tiko-AAPL-x');
  assert.equal(orders[0].filledQty, 1);
  assert.equal(orders[0].orderClass, 'bracket');
  assert.equal(orders[0].stopPrice, 185);

  const empty = fakeFetch(200, null);
  assert.deepEqual(JSON.parse(JSON.stringify(await broker.positions(keys, { fetch: empty }))), []);
});

test('summary combines account, positions and open orders', async () => {
  const bodies = [accountBody(), [], []];
  let i = 0;
  const f = (url, init) => fakeFetch(200, bodies[i++])(url, init);
  const out = await broker.summary(keys, { fetch: f });
  assert.equal(out.account.status, 'ACTIVE');
  assert.deepEqual(JSON.parse(JSON.stringify(out.positions)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(out.orders)), []);
});

test('connect saves keys only after the account call succeeds', async () => {
  broker.clear();
  const ok = fakeFetch(200, accountBody());
  const res = await broker.connect({ mode: 'paper', keyId: ' PK ', secretKey: ' SK ' }, { fetch: ok });
  assert.equal(res.mode, 'paper');
  assert.equal(res.account.status, 'ACTIVE');
  assert.equal(broker.read().keyId, 'PK');
  assert.equal(ok.calls[0].url, 'https://paper-api.alpaca.markets/v2/account');

  broker.clear();
  const bad = fakeFetch(401, { message: 'unauthorized' });
  await assert.rejects(broker.connect(keys, { fetch: bad }), (err) => err.code === 'auth');
  assert.equal(broker.read(), null);

  await assert.rejects(broker.connect({ keyId: '', secretKey: '' }, { fetch: fakeFetch(200, {}) }), (err) => err.code === 'badKeys');
});

test('canTrade requires an active, unblocked account', () => {
  assert.equal(broker.canTrade(null).ok, false);
  assert.equal(broker.canTrade({ status: 'ACTIVE', tradingBlocked: false, accountBlocked: false }).ok, true);
  assert.equal(broker.canTrade({ status: 'ACTIVE', tradingBlocked: true, accountBlocked: false }).reason, 'blocked');
  assert.equal(broker.canTrade({ status: 'ACTIVE', tradingBlocked: false, accountBlocked: true }).reason, 'blocked');
  assert.equal(broker.canTrade({ status: 'SUSPENDED', tradingBlocked: false, accountBlocked: false }).reason, 'blocked');
});

test('buildOrder creates a long stock bracket with rounded levels', () => {
  const built = broker.buildOrder({
    symbol: ' aapl ', assetClass: 'stock', side: 'long',
    entry: 190.506, stop: 185.004, target: 201.999, units: 3.9
  }, 1700000000000);
  assert.equal(built.error, undefined);
  assert.equal(built.qty, 3);
  assert.equal(built.entry, 190.51);
  assert.equal(built.stop, 185);
  assert.equal(built.target, 202);
  assert.equal(built.risk, 16.53);
  assert.equal(built.order.symbol, 'AAPL');
  assert.equal(built.order.qty, '3');
  assert.equal(built.order.side, 'buy');
  assert.equal(built.order.type, 'market');
  assert.equal(built.order.time_in_force, 'day');
  assert.equal(built.order.order_class, 'bracket');
  assert.equal(built.order.take_profit.limit_price, '202');
  assert.equal(built.order.stop_loss.stop_price, '185');
  assert.match(built.order.client_order_id, /^tiko-AAPL-[0-9a-z]+$/);
  assert.ok(built.order.client_order_id.length <= 48);
});

test('buildOrder rejects crypto, shorts, bad levels and fractional sizes', () => {
  const base = { symbol: 'BTC', assetClass: 'stock', side: 'long', entry: 100, stop: 98, target: 104, units: 2 };
  assert.equal(broker.buildOrder(Object.assign({}, base, { assetClass: 'crypto' })).error, 'assetClass');
  assert.equal(broker.buildOrder(Object.assign({}, base, { side: 'short' })).error, 'side');
  assert.equal(broker.buildOrder(Object.assign({}, base, { units: 0 })).error, 'size');
  assert.equal(broker.buildOrder(Object.assign({}, base, { units: 0.9 })).error, 'size');
  assert.equal(broker.buildOrder(Object.assign({}, base, { units: Infinity })).error, 'size');
  assert.equal(broker.buildOrder(Object.assign({}, base, { stop: 101 })).error, 'levels');
  assert.equal(broker.buildOrder(Object.assign({}, base, { target: 99 })).error, 'levels');
  assert.equal(broker.buildOrder(Object.assign({}, base, { stop: null })).error, 'levels');
  assert.equal(broker.buildOrder(Object.assign({}, base, { symbol: ' ' })).error, 'symbol');
});

test('submit refuses every order without an explicit confirmation', async () => {
  const order = broker.buildOrder({ symbol: 'AAPL', assetClass: 'stock', side: 'long', entry: 100, stop: 98, target: 104, units: 2 }).order;
  const f = fakeFetch(200, { id: 'o1', status: 'accepted' });
  await assert.rejects(broker.submit(keys, order, { fetch: f }), (err) => err.code === 'confirm');
  await assert.rejects(broker.submit(keys, order, { fetch: f, confirm: 'yes' }), (err) => err.code === 'confirm');
  await assert.rejects(broker.submit(null, order, { fetch: f, confirm: true }), (err) => err.code === 'noKeys');
  await assert.rejects(broker.submit(keys, {}, { fetch: f, confirm: true }), (err) => err.code === 'order');
  assert.equal(f.calls.length, 0);
});

test('submit posts the bracket order to Alpaca once confirmed', async () => {
  const built = broker.buildOrder({ symbol: 'MSFT', assetClass: 'stock', side: 'long', entry: 100, stop: 98, target: 104, units: 2 }, 1700000000000);
  const f = fakeFetch(200, { id: 'order-1', client_order_id: built.order.client_order_id, symbol: 'MSFT', side: 'buy', qty: '2', status: 'accepted', type: 'market', order_class: 'bracket' });
  const res = await broker.submit(keys, built.order, { fetch: f, confirm: true });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://api.alpaca.markets/v2/orders');
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.headers['Content-Type'], 'application/json');
  const payload = JSON.parse(f.calls[0].init.body);
  assert.equal(payload.symbol, 'MSFT');
  assert.equal(payload.order_class, 'bracket');
  assert.equal(payload.take_profit.limit_price, '104');
  assert.equal(payload.stop_loss.stop_price, '98');
  assert.equal(res.status, 'accepted');
  assert.equal(res.id, 'order-1');
});

test('live autopilot is session-only, needs live keys and is cleared with the connection', () => {
  broker.clear();
  assert.equal(broker.readAutopilot(), null);
  broker.save({ mode: 'paper', keyId: 'PKTEST', secretKey: 'secret' });
  assert.equal(broker.grantAutopilot(1000), null);
  assert.equal(broker.readAutopilot(), null);

  broker.save({ mode: 'live', keyId: 'PKTEST', secretKey: 'secret' });
  const grant = broker.grantAutopilot(1000);
  assert.equal(grant.mode, 'live');
  assert.equal(grant.at, 1000);
  assert.equal(broker.readAutopilot().at, 1000);
  assert.equal(session.getItem('gt.broker.autopilot.session.v1') != null, true);

  broker.save({ mode: 'paper', keyId: 'PKTEST', secretKey: 'secret' });
  assert.equal(broker.readAutopilot(), null);
  assert.equal(session.getItem('gt.broker.autopilot.session.v1'), null);

  broker.save({ mode: 'live', keyId: 'PKTEST', secretKey: 'secret' });
  broker.grantAutopilot(2000);
  assert.equal(broker.readAutopilot().at, 2000);
  broker.clear();
  assert.equal(broker.readAutopilot(), null);
  assert.equal(session.getItem('gt.broker.autopilot.session.v1'), null);

  broker.save({ mode: 'live', keyId: 'PKTEST', secretKey: 'secret' });
  session.setItem('gt.broker.autopilot.session.v1', '{broken');
  assert.equal(broker.readAutopilot(), null);
  session.setItem('gt.broker.autopilot.session.v1', JSON.stringify({ mode: 'paper', at: 5 }));
  assert.equal(broker.readAutopilot(), null);
  broker.clear();
});

test('Alpaca failures map to stable error codes', async () => {
  await assert.rejects(broker.account(keys, { fetch: fakeFetch(401, { message: 'unauthorized' }) }), (err) => {
    assert.equal(err.code, 'auth');
    assert.equal(err.status, 401);
    assert.equal(err.message, 'unauthorized');
    return true;
  });
  await assert.rejects(broker.account(keys, { fetch: fakeFetch(403, { message: 'forbidden' }) }), (err) => {
    assert.equal(err.code, 'http');
    assert.equal(err.status, 403);
    return true;
  });
  await assert.rejects(broker.account(keys, { fetch: fakeFetch(422, { message: 'invalid order' }) }), (err) => {
    assert.equal(err.code, 'http');
    assert.equal(err.status, 422);
    return true;
  });
  await assert.rejects(broker.account(keys, { fetch: () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) }), (err) => err.code === 'timeout');
  await assert.rejects(broker.account(keys, { fetch: () => Promise.reject(new Error('boom')) }), (err) => err.code === 'network');
  await assert.rejects(broker.account(keys, { fetch: null }), (err) => err.code === 'network');
});
