/* data.js — market data adapters.
   live crypto: CoinGecko public API (no key)
   live stocks: /api/quote, a same-origin proxy for Yahoo Finance (no key)
                Alpha Vantage remains an optional keyed fallback
   otherwise:  deterministic synthetic series, always labeled "sample"   */
(function (TA) {
  'use strict';
  var U = TA.util;
  var C = TA.catalog;
  var CG = 'https://api.coingecko.com/api/v3';
  var AV = 'https://www.alphavantage.co/query';
  var FX = 'https://api.frankfurter.dev/v2';
  var QP = '/api/quote';

  var cache = new Map();
  var chain = Promise.resolve();
  var lastCall = 0;

  function DataError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function cached(key, ttl, fn) {
    var hit = cache.get(key);
    if (hit && Date.now() - hit.ts < ttl) return hit.promise;
    var p = Promise.resolve().then(fn);
    cache.set(key, { ts: Date.now(), promise: p });
    p.catch(function () { cache.delete(key); });
    return p;
  }

  function doFetch(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 14000) : null;
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 429) throw DataError('rate', 'Rate limited');
        if (!res.ok) throw DataError('http', 'HTTP ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        if (err && err.code) throw err;
        if (err && err.name === 'AbortError') throw DataError('timeout', 'Timed out');
        throw DataError('network', err && err.message);
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // Serialize public API calls with a small gap so a page load cannot burn
  // through the free tier's per-minute allowance.
  function fetchJSON(url) {
    var run = chain.then(function () {
      var wait = Math.max(0, 400 - (Date.now() - lastCall));
      return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
        lastCall = Date.now();
        return doFetch(url);
      });
    });
    chain = run.catch(function () {});
    return run;
  }

  var cgMarkets = function (ids, ttl) {
    var key = 'cg:mkts:' + ids.slice().sort().join(',');
    return cached(key, ttl || 60000, function () {
      var url = CG + '/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(ids.join(',')) +
        '&price_change_percentage=24h,1h&sparkline=true';
      return fetchJSON(url);
    });
  };

  /* ================= CoinGecko ================= */
  function liveCrypto(asset, timeframe) {
    var id = asset.coingeckoId;
    if (!id) return Promise.reject(DataError('unsupported', 'Unknown asset'));
    var days = timeframe === 'intraday' ? 1 : 180;
    var ttl = timeframe === 'intraday' ? 45000 : 90000;
    var chartP = cached('cg:chart:' + id + ':' + days, ttl, function () {
      return fetchJSON(CG + '/coins/' + encodeURIComponent(id) +
        '/market_chart?vs_currency=usd&days=' + days);
    });
    var mktsP = cgMarkets([id], ttl);

    return Promise.all([chartP, mktsP]).then(function (out) {
      var chart = out[0] || {};
      var mkt = (out[1] && out[1][0]) || null;
      var prices = chart.prices || [];
      var vols = chart.total_volumes || [];
      if (prices.length < 8) throw DataError('empty', 'Not enough data');
      var candles = prices.map(function (p, i) {
        var v = vols[i] ? vols[i][1] : null;
        return { t: p[0], c: p[1], v: v };
      }).filter(function (c) { return U.isNum(c.c) && c.c > 0; });

      var last = candles[candles.length - 1];
      var prev = candles.length > 1 ? candles[candles.length - 2] : last;
      var price = mkt ? mkt.current_price : last.c;
      var changePct = mkt && U.isNum(mkt.price_change_percentage_24h_in_currency)
        ? mkt.price_change_percentage_24h_in_currency
        : (last.c / prev.c - 1) * 100;
      var quote = {
        price: price,
        prevClose: U.isNum(changePct) && changePct > -100 ? price / (1 + changePct / 100) : prev.c,
        changePct: changePct,
        changeWindow: '24h',
        dayHigh: mkt ? mkt.high_24h : null,
        dayLow: mkt ? mkt.low_24h : null,
        volume: mkt ? mkt.total_volume : null,
        marketCap: mkt ? mkt.market_cap : null,
        turnover: mkt && mkt.market_cap ? (mkt.total_volume / mkt.market_cap) * 100 : null,
        rank: mkt ? mkt.market_cap_rank : null
      };
      var retrievedAt = Date.now();
      var updated = mkt && mkt.last_updated ? Date.parse(mkt.last_updated) : NaN;

      var resolved = Object.assign({}, asset, {
        name: mkt ? mkt.name : asset.name,
        symbol: (mkt ? mkt.symbol : asset.symbol || '').toUpperCase()
      });

      return {
        asset: resolved,
        candles: candles,
        quote: quote,
        meta: {
          dataMode: 'live',
          provider: 'coingecko',
          providerUrl: 'https://www.coingecko.com/en/coins/' + encodeURIComponent(id),
          apiUrl: CG + '/coins/' + encodeURIComponent(id) + '/market_chart?vs_currency=usd&days=' + days,
          retrievedAt: retrievedAt,
          seriesEnd: candles[candles.length - 1].t,
          providerUpdatedAt: isFinite(updated) ? updated : null,
          interval: timeframe,
          timeframe: timeframe,
          barCount: candles.length,
          fallback: false,
          grainNote: timeframe === 'intraday'
            ? 'Public 5-minute data points'
            : 'Public daily data points',
          delayNote: true
        }
      };
    });
  }

  function searchCrypto(query) {
    var q = String(query || '').trim();
    return cached('cg:search:' + q.toLowerCase(), 10 * 60 * 1000, function () {
      return fetchJSON(CG + '/search?query=' + encodeURIComponent(q));
    }).then(function (res) {
      var coins = (res && res.coins) || [];
      var sym = U.normalizeSymbol(q);
      var lower = q.toLowerCase();
      var pick = coins.find(function (c) { return c.symbol && c.symbol.toUpperCase() === sym; });
      if (!pick) {
        pick = coins.find(function (c) { return c.name && c.name.toLowerCase().indexOf(lower) >= 0; });
      }
      if (!pick) return null;
      return {
        assetClass: 'crypto',
        symbol: (pick.symbol || sym).toUpperCase(),
        name: pick.name,
        coingeckoId: pick.id,
        currency: 'USD',
        exchange: 'Crypto · 24/7',
        barsPerYear: 365,
        px: 1,
        vol24: 0,
        shares: null,
        resolvedFromSearch: true,
        marketCapRank: pick.market_cap_rank
      };
    });
  }

  /* ================= Alpha Vantage ================= */
  function avError(j) {
    if (j && j['Error Message']) return DataError('auth', j['Error Message']);
    if (j && (j['Note'] || j['Information'])) return DataError('rate', j['Note'] || j['Information']);
    return null;
  }

  function liveForexCurrencies() {
    return cached('frankfurter:currencies:all', 24 * 60 * 60 * 1000, function () {
      return fetchJSON(FX + '/currencies?scope=all').then(function (rows) {
        if (!Array.isArray(rows)) throw DataError('empty', 'No currency directory');
        return rows.map(function (row) {
          return { code: row.iso_code, name: row.name };
        }).filter(function (row) { return /^[A-Z]{3}$/.test(row.code || '') && row.name; })
          .sort(function (a, b) { return a.code.localeCompare(b.code); });
      });
    });
  }

  function liveForexCurrency(code) {
    var currency = String(code || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return Promise.reject(DataError('unsupported', 'Unsupported currency'));
    return cached('frankfurter:currency:' + currency, 24 * 60 * 60 * 1000, function () {
      return fetchJSON(FX + '/currency/' + encodeURIComponent(currency.toLowerCase()));
    });
  }

  function liveForexProviders() {
    return cached('frankfurter:providers', 24 * 60 * 60 * 1000, function () {
      return fetchJSON(FX + '/providers').then(function (rows) {
        if (!Array.isArray(rows)) throw DataError('empty', 'No provider directory');
        return rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      });
    });
  }

  function liveForexRate(from, to, provider) {
    var source = String(provider || '').trim().toLowerCase();
    if (source) {
      return cached('frankfurter:provider-rate:' + source + ':' + from + ':' + to, 5 * 60 * 1000, function () {
        return fetchJSON(FX + '/providers/' + encodeURIComponent(source) + '/rate/' +
          encodeURIComponent(from.toLowerCase()) + '/' + encodeURIComponent(to.toLowerCase()));
      }).then(function (q) {
        if (!q || !U.isNum(q.rate) || q.rate <= 0) throw DataError('empty', 'No provider FX rate');
        return {
          from: q.base, to: q.quote, rate: q.rate, refreshedAt: q.date,
          providers: [{ key: source.toUpperCase(), date: q.date, rate: q.rate }],
          timezone: 'UTC', retrievedAt: Date.now(), provider: 'Frankfurter',
          providerUrl: 'https://frankfurter.dev/'
        };
      });
    }
    return liveForexRates(from, [to]).then(function (rates) {
      var q = rates.find(function (row) { return row.quote === to; });
      if (!q || !U.isNum(q.rate) || q.rate <= 0) throw DataError('unsupported', 'No rate for this currency pair');
      return {
        from: q.base, to: q.quote, rate: q.rate, refreshedAt: q.date,
        providers: q.providers || [],
        timezone: 'UTC', retrievedAt: Date.now(), provider: 'Frankfurter',
        providerUrl: 'https://frankfurter.dev/'
      };
    });
  }

  function liveForexRates(base, quotes, provider) {
    var currency = String(base || 'USD').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return Promise.reject(DataError('unsupported', 'Unsupported base currency'));
    var targets = Array.isArray(quotes) ? quotes.map(function (code) { return String(code).trim().toUpperCase(); }) : [];
    var source = String(provider || '').trim().toLowerCase();
    if (source && !/^[a-z0-9_-]+$/.test(source)) return Promise.reject(DataError('unsupported', 'Unsupported FX provider'));
    if (targets.some(function (code) { return !/^[A-Z]{3}$/.test(code); })) {
      return Promise.reject(DataError('unsupported', 'Unsupported quote currency'));
    }
    var cacheKey = 'frankfurter:rates:providers:' + currency + ':' + targets.slice().sort().join(',') + ':' + source;
    return cached(cacheKey, 5 * 60 * 1000, function () {
      var query = '?base=' + encodeURIComponent(currency.toLowerCase()) + '&expand=providers';
      if (targets.length) query += '&quotes=' + encodeURIComponent(targets.join(',').toLowerCase());
      if (source) query += '&providers=' + encodeURIComponent(source);
      return fetchJSON(FX + '/rates' + query).then(function (rows) {
        if (!Array.isArray(rows)) throw DataError('empty', 'No FX rates');
        return rows.filter(function (row) {
          return row && row.base === currency && /^[A-Z]{3}$/.test(row.quote || '') && U.isNum(row.rate) && row.rate > 0;
        });
      });
    });
  }

  function liveStock(asset, timeframe, key) {
    var symbol = asset.symbol;
    var dailyP = cached('av:daily:' + symbol + ':' + key.slice(-4), 5 * 60 * 1000, function () {
      var url = AV + '?function=TIME_SERIES_DAILY&symbol=' + encodeURIComponent(symbol) +
        '&outputsize=compact&apikey=' + encodeURIComponent(key);
      return fetchJSON(url).then(function (j) {
        var err = avError(j); if (err) throw err;
        var series = j['Time Series (Daily)'];
        if (!series) throw DataError('empty', 'No series');
        var rows = Object.keys(series).sort().map(function (day) {
          var d = series[day];
          return {
            t: Date.parse(day + 'T20:00:00Z'),
            o: parseFloat(d['1. open']),
            h: parseFloat(d['2. high']),
            l: parseFloat(d['3. low']),
            c: parseFloat(d['4. close']),
            v: parseFloat(d['5. volume'])
          };
        }).filter(function (c) { return U.isNum(c.c) && c.c > 0; });
        if (rows.length < 20) throw DataError('empty', 'Short series');
        return rows;
      });
    });
    var quoteP = cached('av:quote:' + symbol + ':' + key.slice(-4), 5 * 60 * 1000, function () {
      var url = AV + '?function=GLOBAL_QUOTE&symbol=' + encodeURIComponent(symbol) +
        '&apikey=' + encodeURIComponent(key);
      return fetchJSON(url).then(function (j) {
        var err = avError(j); if (err) throw err;
        var q = j['Global Quote'];
        if (!q || !q['05. price']) throw DataError('empty', 'No quote');
        return {
          price: parseFloat(q['05. price']),
          prevClose: parseFloat(q['08. previous close']),
          open: parseFloat(q['02. open']),
          high: parseFloat(q['03. high']),
          low: parseFloat(q['04. low']),
          volume: parseFloat(q['06. volume']),
          latestDay: q['07. latest trading day'],
          changePct: parseFloat(String(q['10. change percent'] || '').replace('%', ''))
        };
      });
    });

    return Promise.all([dailyP, quoteP]).then(function (out) {
      var candles = out[0];
      var q = out[1];
      var last = candles[candles.length - 1];
      var quote = {
        price: q.price || last.c,
        prevClose: q.prevClose || (candles[candles.length - 2] || last).c,
        changePct: U.isNum(q.changePct) ? q.changePct : ((q.price / q.prevClose - 1) * 100),
        changeWindow: '1d',
        dayHigh: q.high || last.h,
        dayLow: q.low || last.l,
        volume: q.volume || last.v,
        marketCap: null,
        turnover: null,
        rank: null
      };
      return {
        asset: asset,
        candles: candles,
        quote: quote,
        meta: {
          dataMode: 'live',
          provider: 'alphavantage',
          providerUrl: 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=' + encodeURIComponent(asset.symbol),
          apiUrl: 'https://www.alphavantage.co/',
          retrievedAt: Date.now(),
          seriesEnd: candles[candles.length - 1].t,
          interval: 'daily',
          timeframe: 'daily',
          requestedIntraday: timeframe === 'intraday',
          barCount: candles.length,
          fallback: false,
          grainNote: 'End-of-day bars from Alpha Vantage',
          delayNote: true
        }
      };
    });
  }

  /* ================= Yahoo Finance via /api/quote ================= */
  function canUseProxy() {
    return typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  }

  function proxyChart(asset, timeframe) {
    var symbol = String(asset.symbol || '').trim().toUpperCase();
    var mode = timeframe === 'intraday' ? 'intraday' : 'daily';
    var minBars = mode === 'intraday' ? 8 : 20;
    var ttl = mode === 'intraday' ? 45000 : 3 * 60 * 1000;
    return cached('proxy:chart:' + symbol + ':' + mode, ttl, function () {
      return doFetch(QP + '?symbol=' + encodeURIComponent(symbol) + '&timeframe=' + mode);
    }).then(function (payload) {
      var candles = ((payload && payload.candles) || []).filter(function (c) {
        return c && U.isNum(c.c) && c.c > 0;
      }).map(function (c) {
        return {
          t: c.t,
          o: U.isNum(c.o) ? c.o : c.c,
          h: U.isNum(c.h) ? c.h : c.c,
          l: U.isNum(c.l) ? c.l : c.c,
          c: c.c,
          v: U.isNum(c.v) ? c.v : null
        };
      });
      if (candles.length < minBars) throw DataError('empty', 'Short series');
      var last = candles[candles.length - 1];
      var previous = candles.length > 1 ? candles[candles.length - 2].c : last.c;
      var price = U.isNum(payload.price) ? payload.price : last.c;
      var previousClose = U.isNum(payload.previousClose) ? payload.previousClose : previous;
      return {
        asset: Object.assign({}, asset, {
          name: payload.name || asset.name,
          exchange: payload.exchange || asset.exchange,
          currency: payload.currency || asset.currency || 'USD'
        }),
        candles: candles,
        quote: {
          price: price,
          prevClose: previousClose,
          changePct: U.isNum(payload.changePct)
            ? payload.changePct
            : previousClose > 0 ? (price / previousClose - 1) * 100 : 0,
          changeWindow: '1d',
          dayHigh: U.isNum(payload.dayHigh) ? payload.dayHigh : last.h,
          dayLow: U.isNum(payload.dayLow) ? payload.dayLow : last.l,
          volume: U.isNum(payload.volume) ? payload.volume : last.v,
          marketCap: null,
          turnover: null,
          rank: null
        },
        meta: {
          dataMode: 'live',
          provider: 'yahoo',
          providerUrl: payload.sourceUrl || 'https://finance.yahoo.com/quote/' + encodeURIComponent(symbol),
          apiUrl: QP + '?symbol=' + encodeURIComponent(symbol),
          retrievedAt: Date.now(),
          seriesEnd: last.t,
          providerUpdatedAt: U.isNum(payload.asOf) ? payload.asOf : null,
          interval: mode,
          timeframe: mode,
          barCount: candles.length,
          fallback: false,
          grainNote: mode === 'intraday'
            ? '5-minute bars via Yahoo Finance'
            : 'Daily bars via Yahoo Finance',
          delayNote: true
        }
      };
    });
  }

  function proxyQuotes(symbols) {
    var list = [];
    (symbols || []).forEach(function (raw) {
      var symbol = String(raw || '').trim().toUpperCase();
      if (/^[A-Z0-9.^=-]{1,16}$/.test(symbol) && list.indexOf(symbol) < 0) list.push(symbol);
    });
    list = list.slice(0, 10);
    if (!list.length) return Promise.resolve([]);
    var key = 'proxy:quotes:' + list.slice().sort().join(',');
    return cached(key, 45000, function () {
      return doFetch(QP + '?symbols=' + encodeURIComponent(list.join(',')));
    }).then(function (payload) {
      return (payload && payload.quotes) || [];
    });
  }

  function quoteEntry(quote, fallbackName) {
    return {
      price: quote.price,
      changePct: quote.changePct,
      spark: (quote.spark || []).slice(-30),
      dataMode: 'live',
      asOf: U.isNum(quote.asOf) ? quote.asOf : Date.now(),
      name: quote.name || fallbackName || null
    };
  }

  /* ================= Sample generator ================= */
  function lastSessionEnd() {
    var d = new Date();
    // Walk back to the most recent weekday close (16:00 New York ≈ 20:00 UTC).
    for (var guard = 0; guard < 10; guard++) {
      var day = d.getUTCDay();
      var candidate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20, 0, 0);
      if (day !== 0 && day !== 6 && candidate < Date.now() - 60 * 60 * 1000) return candidate;
      d = new Date(d.getTime() - 86400000);
    }
    return Date.now() - 86400000;
  }

  function sampleParams(asset) {
    var known = C.find(asset.symbol);
    var src = known || asset;
    return {
      px: src.px || 120,
      drift: src.drift == null ? 0.22 : src.drift,
      vol: src.vol == null ? 0.62 : src.vol,
      vol24: src.vol24 || 1e8,
      shares: src.shares || null
    };
  }

  function sampleDaily(asset, n) {
    n = n || 420;
    var p = sampleParams(asset);
    var seed = U.hashStr(asset.symbol + '|' + n + '|' + new Date(lastSessionEnd()).toISOString().slice(0, 10));
    var rng = U.mulberry32(seed);
    var sigma = p.vol / Math.sqrt(252);
    var mu = Math.log(1 + p.drift) / 252;
    var end = lastSessionEnd();
    var total = n;
    var closes = [];
    var price = p.px * Math.exp(-mu * total);
    for (var i = 0; i < total; i++) {
      var regime = 0.7 + 0.55 * Math.sin((i / total) * Math.PI * 2.4 + 0.7);
      var shock = U.gauss(rng) * sigma * regime;
      if (rng() < 0.02) shock += (rng() < 0.5 ? -1 : 1) * sigma * (2 + rng() * 3);
      price = Math.max(0.0001, price * Math.exp(mu + shock));
      closes.push(price);
    }
    // Anchor the final price reasonably close to the catalog's base price.
    var scale = p.px / closes[closes.length - 1];
    scale = 1 + (scale - 1) * 0.65;
    var candles = [];
    for (i = 0; i < total; i++) {
      var close = closes[i] * (scale + (1 - scale) * (i / total));
      var prevC = i ? candles[i - 1].c : close * 0.995;
      var gap = U.gauss(rng) * sigma * 0.35;
      var open = prevC * (1 + gap);
      var bodyPct = Math.abs(close / open - 1);
      var wick = (sigma * 0.7 + bodyPct * 0.5) * close;
      var high = Math.max(open, close) + wick * rng() * 1.6;
      var low = Math.min(open, close) - wick * rng() * 1.6;
      var vol = p.vol24 * (0.55 + rng() * 0.8) * (1 + Math.abs(close / prevC - 1) * 22);
      candles.push({
        t: end - (total - 1 - i) * 86400000,
        o: open, h: high, l: Math.max(0.0001, low), c: close, v: vol
      });
    }
    return candles;
  }

  function sampleIntraday(asset) {
    var p = sampleParams(asset);
    var rng = U.mulberry32(U.hashStr(asset.symbol + '|intraday|' + new Date(lastSessionEnd()).toISOString().slice(0, 10)));
    var end = lastSessionEnd();
    var n = 78;
    var start = end - (n - 1) * 5 * 60000;
    var sigma = (p.vol / Math.sqrt(252)) / Math.sqrt(78);
    // Anchor to the same daily series the other views use, so the snapshot
    // price does not jump when you switch lenses.
    var daily = sampleDaily(asset, asset.assetClass === 'crypto' ? 240 : 420);
    var anchor = daily[daily.length - 1].c;
    var price = anchor * (0.995 + rng() * 0.01);
    var candles = [];
    for (var i = 0; i < n; i++) {
      var open = i ? candles[i - 1].c : price;
      var drift = Math.sin((i / n) * Math.PI * 1.5) * sigma * 0.6;
      var close = Math.max(0.0001, open * Math.exp(drift + U.gauss(rng) * sigma));
      var wick = sigma * open * 0.8;
      candles.push({
        t: start + i * 5 * 60000,
        o: open,
        h: Math.max(open, close) + wick * rng(),
        l: Math.max(0.0001, Math.min(open, close) - wick * rng()),
        c: close,
        v: p.vol24 / 78 * (0.5 + rng() * 1.2) * (1 + Math.abs(close / open - 1) * 30)
      });
    }
    return candles;
  }

  function sampleData(asset, timeframe, info) {
    var intraday = timeframe === 'intraday' && asset.assetClass === 'stock';
    var candles = intraday ? sampleIntraday(asset) : sampleDaily(asset, asset.assetClass === 'crypto' ? 240 : 420);
    var p = sampleParams(asset);
    var last = candles[candles.length - 1];
    var first = candles[0];
    var dayCandles = intraday ? candles : candles.slice(-1);
    var high = Math.max.apply(null, dayCandles.map(function (c) { return c.h; }));
    var low = Math.min.apply(null, dayCandles.map(function (c) { return c.l; }));
    var volume = U.sum(dayCandles.map(function (c) { return c.v; }));
    var prevClose = intraday ? first.o : (candles.length > 1 ? candles[candles.length - 2].c : first.c);
    var shares = p.shares;
    var marketCap = shares ? last.c * shares : null;
    var turnover = null;
    if (marketCap) {
      turnover = asset.assetClass === 'crypto'
        ? (p.vol24 / marketCap) * 100
        : shares ? (volume / shares) * 100 : null;
    }

    return Promise.resolve({
      asset: Object.assign({}, asset, {
        name: (C.find(asset.symbol) || asset).name || asset.name
      }),
      candles: candles,
      quote: {
        price: last.c,
        prevClose: prevClose,
        changePct: (last.c / prevClose - 1) * 100,
        changeWindow: intraday ? '1d' : '1d',
        dayHigh: high,
        dayLow: low,
        volume: volume,
        marketCap: marketCap,
        turnover: turnover,
        rank: null
      },
      meta: {
        dataMode: 'sample',
        provider: 'sample',
        providerUrl: null,
        apiUrl: null,
        retrievedAt: Date.now(),
        seriesEnd: last.t,
        interval: intraday ? 'intraday' : 'daily',
        timeframe: timeframe,
        barCount: candles.length,
        fallback: !!(info && info.fallback),
        fallbackReason: (info && info.reason) || null,
        grainNote: intraday ? 'Synthetic 5-minute bars' : 'Synthetic daily bars',
        delayNote: false,
        sample: true
      }
    });
  }

  /* ================= public API ================= */
  var api = {
    getMarketData: function (asset, opts) {
      opts = opts || {};
      var timeframe = opts.timeframe === 'intraday' ? 'intraday' : 'daily';
      var settings = TA.store.settings();
      var canLive = settings.dataMode !== 'sample' && navigator.onLine !== false;
      var fail = function (err) {
        return sampleData(asset, timeframe, {
          fallback: true,
          reason: (err && err.code) || 'network'
        });
      };

      if (asset.assetClass === 'crypto' && canLive) {
        return liveCrypto(asset, timeframe).catch(fail);
      }
      if (asset.assetClass === 'stock' && canLive) {
        if (canUseProxy()) {
          return proxyChart(asset, timeframe)
            .catch(function (proxyErr) {
              if (!settings.avKey) throw proxyErr;
              return liveStock(asset, timeframe, settings.avKey).catch(function () { throw proxyErr; });
            })
            .catch(fail);
        }
        if (settings.avKey) return liveStock(asset, timeframe, settings.avKey).catch(fail);
      }
      return sampleData(asset, timeframe, {});
    },

    getForexRate: function (from, to, provider) {
      var base = String(from || '').trim().toUpperCase();
      var quote = String(to || '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote) || base === quote) {
        return Promise.reject(DataError('unsupported', 'Unsupported currency pair'));
      }
      if (navigator.onLine === false) return Promise.reject(DataError('offline', 'The device is offline'));
      return liveForexCurrencies().then(function (currencies) {
        var supported = currencies.some(function (c) { return c.code === base; }) && currencies.some(function (c) { return c.code === quote; });
        if (!supported) throw DataError('unsupported', 'Unsupported currency pair');
        return liveForexRate(base, quote, provider);
      });
    },

    getForexCurrencies: liveForexCurrencies,
    getForexCurrency: liveForexCurrency,
    getForexProviders: liveForexProviders,
    getForexRates: liveForexRates,

    resolveSymbol: function (raw) {
      var symbol = U.normalizeSymbol(raw);
      if (!symbol) return Promise.resolve(null);
      var known = C.find(symbol);
      if (known) return Promise.resolve(known);
      if (navigator.onLine === false) return Promise.resolve(null);
      return searchCrypto(symbol).catch(function () { return null; });
    },

    getOverview: function () {
      var settings = TA.store.settings();
      var liveAllowed = settings.dataMode !== 'sample' && navigator.onLine !== false;
      var overviewAssets = C.overviewStocks();
      var stocks = overviewAssets.map(function (a) {
        var d = sampleQuick(a);
        return {
          symbol: a.symbol, name: a.name, assetClass: 'stock',
          price: d.price, changePct: d.changePct, spark: d.spark, dataMode: 'sample'
        };
      });
      if (!liveAllowed) {
        return Promise.resolve({ live: false, crypto: [], stocks: stocks, retrievedAt: Date.now() });
      }
      var cryptoP = cgMarkets(C.cryptos().map(function (a) { return a.coingeckoId; }), 90000)
        .then(function (markets) {
          return (markets || []).filter(function (m) { return m && U.isNum(m.current_price); })
            .map(function (m) {
              var spark = m.sparkline_in_7d && m.sparkline_in_7d.price ? m.sparkline_in_7d.price : [];
              return {
                symbol: (m.symbol || '').toUpperCase(), name: m.name, assetClass: 'crypto',
                price: m.current_price,
                changePct: U.isNum(m.price_change_percentage_24h_in_currency)
                  ? m.price_change_percentage_24h_in_currency
                  : m.price_change_percentage_24h,
                spark: spark.slice(-48),
                dataMode: 'live',
                id: m.id
              };
            });
        })
        .catch(function () { return []; });
      var stockP = canUseProxy()
        ? proxyQuotes(overviewAssets.map(function (a) { return a.symbol; })).catch(function () { return []; })
        : Promise.resolve([]);
      return Promise.all([cryptoP, stockP]).then(function (out) {
        var crypto = out[0];
        var liveBySymbol = {};
        out[1].forEach(function (q) {
          if (q && q.symbol && U.isNum(q.price)) liveBySymbol[q.symbol] = q;
        });
        stocks = stocks.map(function (stock) {
          var q = liveBySymbol[stock.symbol];
          if (!q) return stock;
          return {
            symbol: stock.symbol, name: q.name || stock.name, assetClass: 'stock',
            price: q.price, changePct: q.changePct, spark: (q.spark || []).slice(-30),
            dataMode: 'live', asOf: q.asOf
          };
        });
        var anyLive = crypto.length > 0 || stocks.some(function (s) { return s.dataMode === 'live'; });
        return { live: anyLive, crypto: crypto, stocks: stocks, retrievedAt: Date.now() };
      });
    },

    getQuotes: function (entries) {
      var settings = TA.store.settings();
      var liveAllowed = settings.dataMode !== 'sample' && navigator.onLine !== false;
      var cryptoIds = entries.filter(function (e) { return e.assetClass === 'crypto'; })
        .map(function (e) {
          var a = C.find(e.symbol);
          return (a && a.coingeckoId) || e.coingeckoId || null;
        })
        .filter(Boolean);
      var stockSymbols = entries.filter(function (e) { return e.assetClass === 'stock'; })
        .map(function (e) { return e.symbol; });
      var result = {};
      entries.forEach(function (e) {
        if (e.assetClass === 'stock') {
          var a = C.find(e.symbol);
          if (a) {
            var d = sampleQuick(a);
            result[e.symbol] = {
              price: d.price, changePct: d.changePct, spark: d.spark,
              dataMode: 'sample', asOf: d.asOf
            };
          }
        }
      });
      if (!liveAllowed) return Promise.resolve(result);
      var jobs = [];
      if (cryptoIds.length) {
        jobs.push(cgMarkets(cryptoIds, 60000).then(function (markets) {
          (markets || []).forEach(function (m) {
            if (!m) return;
            var sym = (m.symbol || '').toUpperCase();
            result[sym] = {
              price: m.current_price,
              changePct: U.isNum(m.price_change_percentage_24h_in_currency)
                ? m.price_change_percentage_24h_in_currency
                : m.price_change_percentage_24h,
              spark: (m.sparkline_in_7d && m.sparkline_in_7d.price ? m.sparkline_in_7d.price : []).slice(-48),
              dataMode: 'live',
              asOf: m.last_updated ? Date.parse(m.last_updated) : Date.now()
            };
          });
        }).catch(function () {}));
      }
      if (stockSymbols.length && canUseProxy()) {
        jobs.push(proxyQuotes(stockSymbols).then(function (quotes) {
          quotes.forEach(function (q) {
            if (!q || !q.symbol || !U.isNum(q.price)) return;
            result[q.symbol] = quoteEntry(q, (C.find(q.symbol) || {}).name);
          });
        }).catch(function () {}));
      }
      if (!jobs.length) return Promise.resolve(result);
      return Promise.all(jobs).then(function () { return result; });
    },

    testAlphaVantage: function (key) {
      var url = AV + '?function=GLOBAL_QUOTE&symbol=AAPL&apikey=' + encodeURIComponent(key);
      return fetchJSON(url).then(function (j) {
        var err = avError(j);
        if (err) throw err;
        return !!(j['Global Quote'] && j['Global Quote']['05. price']);
      });
    },

    clearCache: function () { cache.clear(); }
  };

  function sampleQuick(asset) {
    var candles = sampleDaily(asset, asset.assetClass === 'crypto' ? 240 : 420);
    var last = candles[candles.length - 1];
    var prev = candles[candles.length - 2] || last;
    return {
      price: last.c,
      changePct: (last.c / prev.c - 1) * 100,
      spark: candles.slice(-30).map(function (c) { return c.c; }),
      asOf: last.t
    };
  }

  TA.data = api;
})(window.TA = window.TA || {});
