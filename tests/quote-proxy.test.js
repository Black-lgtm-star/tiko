'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const handlerPath = path.resolve(__dirname, '../api/quote.js');

function loadHandler() {
  delete require.cache[require.resolve(handlerPath)];
  return require(handlerPath);
}

function chartBody(symbol, options) {
  const opts = options || {};
  const count = opts.count || 20;
  const last = opts.last == null ? 105 : opts.last;
  const timestamps = [];
  const opens = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const volumes = [];
  const start = Date.UTC(2026, 8, 1, 13, 30);
  for (let i = 0; i < count; i++) {
    const close = i === count - 1 ? last : 100;
    timestamps.push(Math.floor((start + i * 86400000 + (opts.step || 0)) / 1000));
    opens.push(close - 1);
    highs.push(close + 2);
    lows.push(close - 2);
    closes.push(close);
    volumes.push(1000000 + i);
  }
  return {
    chart: {
      result: [{
        meta: Object.assign({
          currency: 'USD',
          symbol,
          exchangeName: 'NMS',
          fullExchangeName: 'NasdaqGS',
          longName: symbol + ' Incorporated',
          regularMarketPrice: last,
          regularMarketDayHigh: last + 3,
          regularMarketDayLow: last - 3,
          regularMarketVolume: 5000000,
          regularMarketChangePercent: 5,
          regularMarketTime: 1793390400,
          previousClose: 100,
          exchangeTimezoneName: 'America/New_York',
          dataGranularity: '1d'
        }, opts.meta || {}),
        timestamp: timestamps,
        indicators: { quote: [{ open: opens, high: highs, low: lows, close: closes, volume: volumes }] }
      }]
    }
  };
}

function fakeResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body)
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

test('daily chart normalizes a Yahoo response and caches it', async () => {
  const handler = loadHandler();
  const urls = [];
  global.fetch = async url => {
    urls.push(url);
    return fakeResponse(200, chartBody('AAA'));
  };
  try {
    const first = await call(handler, { symbol: 'AAA', timeframe: 'daily' });
    assert.equal(first.status, 200);
    assert.equal(first.headers['cache-control'], 's-maxage=120, stale-while-revalidate=600');
    assert.equal(first.body.symbol, 'AAA');
    assert.equal(first.body.name, 'AAA Incorporated');
    assert.equal(first.body.exchange, 'NasdaqGS');
    assert.equal(first.body.currency, 'USD');
    assert.equal(first.body.price, 105);
    assert.equal(first.body.previousClose, 100);
    assert.equal(first.body.changePct, 5);
    assert.equal(first.body.candles.length, 20);
    assert.equal(first.body.candles[19].c, 105);
    assert.equal(first.body.interval, '1d');
    assert.equal(first.body.provider, 'Yahoo Finance');
    assert.match(first.body.sourceUrl, /finance\.yahoo\.com\/quote\/AAA/);
    assert.ok(first.body.sourceUrl.startsWith('https://'));

    const second = await call(handler, { symbol: 'AAA', timeframe: 'daily' });
    assert.equal(second.status, 200);
    assert.equal(urls.length, 1, 'second call should be served from the module cache');
  } finally {
    delete global.fetch;
  }
});

test('intraday request keeps only the latest session', async () => {
  const handler = loadHandler();
  global.fetch = async () => {
    const body = chartBody('BBB', { count: 1, meta: { previousClose: 99, regularMarketPrice: 105 } });
    const result = body.chart.result[0];
    result.meta.dataGranularity = '5m';
    result.meta.regularMarketChangePercent = 6.06;
    result.timestamp = [];
    const series = { open: [], high: [], low: [], close: [], volume: [] };
    [Date.UTC(2026, 9, 28, 13, 30), Date.UTC(2026, 9, 29, 13, 30)].forEach((start, day) => {
      for (let i = 0; i < 9; i++) {
        const close = day === 0 ? 98 + i : 104 + i * 0.125;
        result.timestamp.push(Math.floor((start + i * 5 * 60000) / 1000));
        series.open.push(close - 0.1);
        series.high.push(close + 0.2);
        series.low.push(close - 0.2);
        series.close.push(close);
        series.volume.push(1000 + i);
      }
    });
    result.indicators.quote[0] = series;
    return fakeResponse(200, body);
  };
  try {
    const response = await call(handler, { symbol: 'BBB', timeframe: 'intraday' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 's-maxage=30, stale-while-revalidate=120');
    assert.equal(response.body.interval, '5m');
    assert.ok(response.body.candles.length < 18);
    assert.equal(response.body.price, 105);
    assert.equal(response.body.previousClose, 99);
  } finally {
    delete global.fetch;
  }
});

test('batch request returns quotes with sparklines and skips unknown symbols', async () => {
  const handler = loadHandler();
  const requested = [];
  global.fetch = async url => {
    requested.push(url);
    const symbol = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);
    if (symbol === 'ZZZ') {
      return fakeResponse(200, { chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } });
    }
    return fakeResponse(200, chartBody(symbol, { count: 5, last: 120 }));
  };
  try {
    const response = await call(handler, { symbols: 'ccc,AAPL,ZZZ' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.quotes.map(q => q.symbol), ['CCC', 'AAPL']);
    assert.equal(response.body.quotes[0].price, 120);
    assert.equal(response.body.quotes[0].spark.length, 5);
    assert.ok(requested.some(url => url.includes('/chart/CCC?range=1mo&interval=1d')));
  } finally {
    delete global.fetch;
  }
});

test('invalid input is rejected without calling the provider', async () => {
  const handler = loadHandler();
  let calls = 0;
  global.fetch = async () => { calls++; return fakeResponse(200, chartBody('AAA')); };
  try {
    const bad = await call(handler, { symbol: 'AAPL<script>' });
    assert.equal(bad.status, 400);
    const missing = await call(handler, {});
    assert.equal(missing.status, 400);
    const tooMany = await call(handler, { symbols: 'AA,BB,CC,DD,EE,FF,GG,HH,II,JJ,KK' });
    assert.equal(tooMany.status, 400);
    const post = await call(handler, { symbol: 'AAPL' }, 'POST');
    assert.equal(post.status, 405);
    assert.equal(calls, 0);
  } finally {
    delete global.fetch;
  }
});

test('unknown symbols and provider failures use safe error codes', async () => {
  const handler = loadHandler();
  global.fetch = async url => {
    if (url.includes('/chart/DDD?')) {
      return fakeResponse(200, { chart: { result: null, error: { code: 'Not Found', description: 'delisted' } } });
    }
    return fakeResponse(500, {});
  };
  try {
    const unknown = await call(handler, { symbol: 'DDD' });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error, 'Unknown stock symbol.');
    const broken = await call(handler, { symbol: 'EEE' });
    assert.equal(broken.status, 503);
    assert.equal(broken.body.error, 'The stock data provider is unavailable.');
  } finally {
    delete global.fetch;
  }
});
