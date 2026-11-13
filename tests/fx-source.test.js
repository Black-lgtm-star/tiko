'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

let settings = {};
const calls = [];
let avBody;

function jsonRes(body, status) {
  const code = status || 200;
  return {
    ok: code >= 200 && code < 300,
    status: code,
    json: async () => body
  };
}

function respond(url) {
  if (url.indexOf('alphavantage.co') >= 0) return jsonRes(avBody);
  if (url.indexOf('/currencies') >= 0) {
    return jsonRes([
      { iso_code: 'USD', name: 'United States Dollar' },
      { iso_code: 'JPY', name: 'Japanese Yen' }
    ]);
  }
  if (url.indexOf('/providers/') >= 0) {
    return jsonRes({ base: 'USD', quote: 'JPY', rate: 151.2, date: '2026-11-07' });
  }
  if (url.indexOf('/rates') >= 0) {
    return jsonRes([{
      base: 'USD', quote: 'JPY', rate: 150.5, date: '2026-11-07',
      providers: [{ key: 'ECB', date: '2026-11-07', rate: 150.5 }]
    }]);
  }
  throw new Error('Unexpected URL: ' + url);
}

const ctx = {
  console,
  setTimeout,
  clearTimeout,
  AbortController,
  JSON,
  Date,
  Map,
  location: { protocol: 'https:', href: 'https://app.test/' },
  navigator: { onLine: true },
  window: {
    TA: {
      util: { isNum: (n) => typeof n === 'number' && isFinite(n), normalizeSymbol: (s) => String(s || '').toUpperCase() },
      catalog: { find: () => null, cryptos: () => [], overviewStocks: () => [] },
      store: { settings: () => settings }
    }
  }
};
ctx.fetch = (url) => {
  calls.push(String(url));
  return Promise.resolve(respond(String(url)));
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), ctx, { filename: 'js/data.js' });
const TA = ctx.window.TA;

test.beforeEach(() => {
  TA.data.clearCache();
  calls.length = 0;
  settings = {};
  avBody = {
    'Realtime Currency Exchange Rate': {
      '1. From_Currency Code': 'USD',
      '2. From_Currency Name': 'United States Dollar',
      '3. To_Currency Code': 'JPY',
      '4. To_Currency Name': 'Japanese Yen',
      '5. Exchange Rate': '158.03263176',
      '6. Last Refreshed': '2026-11-09 17:58:19',
      '7. Time Zone': 'UTC',
      '8. Bid Price': '158.02657911',
      '9. Ask Price': '158.03790215'
    }
  };
});

test('an Alpha Vantage key makes it the preferred FX source', async () => {
  settings = { avKey: 'demo-key-1234' };
  const quote = await TA.data.getForexRate('USD', 'JPY');
  assert.equal(quote.provider, 'Alpha Vantage');
  assert.equal(quote.rate, 158.03263176);
  assert.equal(quote.bid, 158.02657911);
  assert.equal(quote.ask, 158.03790215);
  assert.equal(quote.refreshedAt, '2026-11-09 17:58:19');
  assert.equal(quote.timezone, 'UTC');
  assert.equal(quote.providers.length, 1);
  assert.equal(quote.providers[0].key, 'ALPHAVANTAGE');
  assert.equal(quote.providers[0].date, '2026-11-09');
  assert.equal(quote.providers[0].rate, 158.03263176);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /function=CURRENCY_EXCHANGE_RATE/);
  assert.match(calls[0], /from_currency=USD/);
  assert.match(calls[0], /to_currency=JPY/);
  assert.match(calls[0], /apikey=demo-key-1234/);
});

test('without a key the rate comes from Frankfurter', async () => {
  settings = {};
  const quote = await TA.data.getForexRate('USD', 'JPY');
  assert.equal(quote.provider, 'Frankfurter');
  assert.equal(quote.rate, 150.5);
  assert.equal(quote.providers[0].key, 'ECB');
  assert.equal(calls.some((url) => url.indexOf('alphavantage.co') >= 0), false);
});

test('an Alpha Vantage limit or error falls back to Frankfurter', async () => {
  settings = { avKey: 'limited-key' };
  avBody = { Note: 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.' };
  const quote = await TA.data.getForexRate('USD', 'JPY');
  assert.equal(quote.provider, 'Frankfurter');
  assert.equal(quote.rate, 150.5);
  assert.equal(calls[0].indexOf('alphavantage.co') >= 0, true);
  assert.equal(calls.some((url) => url.indexOf('/rates') >= 0), true);
});

test('an explicit provider keeps the Frankfurter provider path', async () => {
  settings = { avKey: 'demo-key-1234' };
  const quote = await TA.data.getForexRate('USD', 'JPY', 'ecb');
  assert.equal(quote.provider, 'Frankfurter');
  assert.equal(quote.rate, 151.2);
  assert.equal(calls.some((url) => url.indexOf('alphavantage.co') >= 0), false);
  assert.equal(calls.some((url) => /\/providers\/ecb\/rate\/usd\/jpy/.test(url)), true);
});
