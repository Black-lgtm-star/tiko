'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const handlerPath = path.resolve(__dirname, '../api/crypto.js');

function loadHandler() {
  delete require.cache[require.resolve(handlerPath)];
  return require(handlerPath);
}

function fakeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body
  };
}

function call(handler, query, method) {
  return new Promise(resolve => {
    const headers = {};
    const res = {
      statusCode: 0,
      body: null,
      setHeader(key, value) { headers[key.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve({ status: this.statusCode, headers, body }); }
    };
    handler({ method: method || 'GET', query }, res);
  });
}

test('chart returns price and volume series and caches the upstream call', async () => {
  const handler = loadHandler();
  const urls = [];
  global.fetch = async url => {
    urls.push(url);
    return fakeResponse(200, {
      prices: [[1793000000000, 61000], [1793086400000, 62000]],
      total_volumes: [[1793000000000, 1000], [1793086400000, 1100]]
    });
  };
  try {
    const first = await call(handler, { kind: 'chart', id: 'bitcoin', days: '180' });
    assert.equal(first.status, 200);
    assert.equal(first.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(first.headers['cache-control'], 's-maxage=30, stale-while-revalidate=120');
    assert.deepEqual(first.body.prices, [[1793000000000, 61000], [1793086400000, 62000]]);
    assert.equal(first.body.total_volumes.length, 2);
    assert.match(urls[0], /api\.coingecko\.com\/api\/v3\/coins\/bitcoin\/market_chart\?vs_currency=usd&days=180/);

    const second = await call(handler, { kind: 'chart', id: 'bitcoin', days: '180' });
    assert.equal(second.status, 200);
    assert.equal(urls.length, 1, 'second call should be served from the module cache');
  } finally {
    delete global.fetch;
  }
});

test('chart with no price history reports an unknown coin', async () => {
  const handler = loadHandler();
  global.fetch = async () => fakeResponse(200, { prices: [], total_volumes: [] });
  try {
    const response = await call(handler, { kind: 'chart', id: 'ghostcoin', days: '30' });
    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'No price history for this coin.');
  } finally {
    delete global.fetch;
  }
});

test('markets keeps only public row fields and dedupes ids', async () => {
  const handler = loadHandler();
  const urls = [];
  global.fetch = async url => {
    urls.push(url);
    return fakeResponse(200, [{
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      current_price: 61000,
      market_cap: 1200000000000,
      market_cap_rank: 1,
      total_volume: 30000000000,
      high_24h: 62000,
      low_24h: 59000,
      price_change_percentage_24h: 2.4,
      price_change_percentage_24h_in_currency: 2.4,
      last_updated: '2026-11-07T10:00:00.000Z',
      sparkline_in_7d: { price: [59000, 60000, 61000] },
      ath: 73000,
      fully_diluted_valuation: 1300000000000
    }]);
  };
  try {
    const response = await call(handler, { kind: 'markets', ids: 'bitcoin,BITCOIN,ethereum' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 's-maxage=45, stale-while-revalidate=180');
    assert.equal(response.body.length, 1);
    assert.deepEqual(Object.keys(response.body[0]).sort(), [
      'current_price', 'high_24h', 'id', 'last_updated', 'low_24h', 'market_cap',
      'market_cap_rank', 'name', 'price_change_percentage_24h',
      'price_change_percentage_24h_in_currency', 'sparkline_in_7d', 'symbol',
      'total_volume'
    ]);
    assert.ok(urls[0].includes('ids=bitcoin%2Cethereum'), 'duplicate ids are removed before the request');
    assert.ok(urls[0].includes('per_page=2'));
  } finally {
    delete global.fetch;
  }
});

test('search returns a bounded list of coin identities', async () => {
  const handler = loadHandler();
  global.fetch = async () => fakeResponse(200, {
    coins: Array.from({ length: 40 }, (_, i) => ({
      id: 'coin-' + i,
      symbol: 'c' + i,
      name: 'Coin ' + i,
      market_cap_rank: i + 1,
      thumb: 'https://example.com/' + i + '.png',
      large: 'https://example.com/large-' + i + '.png'
    })),
    exchanges: [{ id: 'ignored' }]
  });
  try {
    const response = await call(handler, { kind: 'search', q: 'coin' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 's-maxage=600, stale-while-revalidate=3600');
    assert.equal(response.body.coins.length, 20);
    assert.deepEqual(Object.keys(response.body.coins[0]).sort(), ['id', 'market_cap_rank', 'name', 'symbol']);
    assert.equal(response.body.coins[0].id, 'coin-0');
  } finally {
    delete global.fetch;
  }
});

test('invalid input is rejected without calling the provider', async () => {
  const handler = loadHandler();
  let calls = 0;
  global.fetch = async () => { calls++; return fakeResponse(200, {}); };
  try {
    assert.equal((await call(handler, { kind: 'chart', id: 'bad id!' })).status, 400);
    assert.equal((await call(handler, { kind: 'chart', id: 'bitcoin', days: '0' })).status, 400);
    assert.equal((await call(handler, { kind: 'chart', id: 'bitcoin', days: '366' })).status, 400);
    assert.equal((await call(handler, { kind: 'markets' })).status, 400);
    const tooMany = Array.from({ length: 26 }, (_, i) => 'coin' + i).join(',');
    assert.equal((await call(handler, { kind: 'markets', ids: tooMany })).status, 400);
    assert.equal((await call(handler, { kind: 'search', q: '  ' })).status, 400);
    assert.equal((await call(handler, { kind: 'search', q: 'a<b' })).status, 400);
    assert.equal((await call(handler, { kind: 'nope' })).status, 400);
    const post = await call(handler, { kind: 'chart', id: 'bitcoin' }, 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET');
    assert.equal(calls, 0);
  } finally {
    delete global.fetch;
  }
});

test('provider failures map to safe status codes', async () => {
  const handler = loadHandler();
  try {
    global.fetch = async () => fakeResponse(429, {});
    const limited = await call(handler, { kind: 'chart', id: 'bitcoin' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'The crypto data provider is rate limiting requests.');

    global.fetch = async () => fakeResponse(500, {});
    const broken = await call(handler, { kind: 'chart', id: 'bitcoin' });
    assert.equal(broken.status, 503);
    assert.equal(broken.body.error, 'The crypto data provider is unavailable.');

    global.fetch = async () => { throw new Error('socket closed'); };
    const unreachable = await call(handler, { kind: 'chart', id: 'bitcoin' });
    assert.equal(unreachable.status, 503);
    assert.equal(unreachable.body.error, 'The crypto data provider did not respond.');
  } finally {
    delete global.fetch;
  }
});

test('an environment key is forwarded only as a CoinGecko header', async () => {
  const handler = loadHandler();
  const seen = [];
  global.fetch = async (url, init) => {
    seen.push(init && init.headers ? init.headers : {});
    return fakeResponse(200, { prices: [[1, 2]], total_volumes: [] });
  };
  const previous = process.env.COINGECKO_API_KEY;
  const previousTier = process.env.COINGECKO_API_TIER;
  process.env.COINGECKO_API_KEY = 'demo-key';
  delete process.env.COINGECKO_API_TIER;
  try {
    const response = await call(handler, { kind: 'chart', id: 'bitcoin' });
    assert.equal(response.status, 200);
    assert.equal(seen[0]['x-cg-demo-api-key'], 'demo-key');
    assert.equal(seen[0]['x-cg-pro-api-key'], undefined);
    assert.equal(JSON.stringify(response.body).includes('demo-key'), false);
  } finally {
    global.fetch = undefined;
    delete global.fetch;
    if (previous === undefined) delete process.env.COINGECKO_API_KEY;
    else process.env.COINGECKO_API_KEY = previous;
    if (previousTier === undefined) delete process.env.COINGECKO_API_TIER;
    else process.env.COINGECKO_API_TIER = previousTier;
  }
});
