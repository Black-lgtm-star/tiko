/* data.js — live market data adapters. No synthetic prices are generated.
   live crypto: /api/crypto, a same-origin proxy for CoinGecko (no key)
   live stocks: /api/quote, a same-origin proxy for Yahoo Finance (no key)
                Alpha Vantage remains an optional keyed fallback
   live forex:  Alpha Vantage CURRENCY_EXCHANGE_RATE when a key is set,
                otherwise Frankfurter reference rates
   When a provider is offline the caller gets an error and the UI says so. */
(function (TA) {
  'use strict';
  var U = TA.util;
  var C = TA.catalog;
  var CG = '/api/crypto';
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
      var url = CG + '?kind=markets&ids=' + encodeURIComponent(ids.join(','));
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
      return fetchJSON(CG + '?kind=chart&id=' + encodeURIComponent(id) + '&days=' + days);
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
          apiUrl: CG + '?kind=chart&id=' + encodeURIComponent(id) + '&days=' + days,
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
      return fetchJSON(CG + '?kind=search&q=' + encodeURIComponent(q));
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

  function liveAvForexRate(from, to, key) {
    var apikey = String(key || '').trim();
    if (!apikey) return Promise.reject(DataError('auth', 'Missing Alpha Vantage key'));
    return cached('av:fx:' + from + ':' + to + ':' + apikey.slice(-4), 5 * 60 * 1000, function () {
      var url = AV + '?function=CURRENCY_EXCHANGE_RATE&from_currency=' + encodeURIComponent(from) +
        '&to_currency=' + encodeURIComponent(to) + '&apikey=' + encodeURIComponent(apikey);
      return fetchJSON(url).then(function (j) {
        var err = avError(j); if (err) throw err;
        var q = j['Realtime Currency Exchange Rate'];
        if (!q) throw DataError('empty', 'No FX quote');
        var rate = parseFloat(q['5. Exchange Rate']);
        if (!U.isNum(rate) || rate <= 0) throw DataError('empty', 'No FX quote');
        var bid = parseFloat(q['8. Bid Price']);
        var ask = parseFloat(q['9. Ask Price']);
        var refreshedAt = String(q['6. Last Refreshed'] || '');
        return {
          from: String(q['1. From_Currency Code'] || from).toUpperCase(),
          to: String(q['3. To_Currency Code'] || to).toUpperCase(),
          rate: rate,
          bid: U.isNum(bid) && bid > 0 ? bid : null,
          ask: U.isNum(ask) && ask > 0 ? ask : null,
          refreshedAt: refreshedAt,
          providers: [{ key: 'ALPHAVANTAGE', date: refreshedAt.slice(0, 10) || new Date().toISOString().slice(0, 10), rate: rate }],
          timezone: q['7. Time Zone'] || 'UTC',
          retrievedAt: Date.now(),
          provider: 'Alpha Vantage',
          providerUrl: 'https://www.alphavantage.co/'
        };
      });
    });
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
    // The Markets table stays on Frankfurter: Alpha Vantage quotes one pair per
    // call, which would exhaust a free key's daily cap.
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

  /* ================= public API ================= */
  function offlineError(message) {
    return DataError('offline', message || 'The live data provider is offline');
  }

  function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  var api = {
    getMarketData: function (asset, opts) {
      opts = opts || {};
      var timeframe = opts.timeframe === 'intraday' ? 'intraday' : 'daily';
      var settings = TA.store.settings();
      if (isOffline()) return Promise.reject(offlineError('The device is offline'));
      if (!asset || !asset.assetClass) return Promise.reject(DataError('unsupported', 'Unknown asset'));

      if (asset.assetClass === 'crypto') {
        if (!canUseProxy()) return Promise.reject(DataError('network', 'The live crypto provider is unreachable'));
        return liveCrypto(asset, timeframe);
      }
      if (asset.assetClass === 'stock') {
        if (canUseProxy()) {
          return proxyChart(asset, timeframe).catch(function (proxyErr) {
            if (!settings.avKey) throw proxyErr;
            return liveStock(asset, timeframe, settings.avKey).catch(function () { throw proxyErr; });
          });
        }
        if (settings.avKey) return liveStock(asset, timeframe, settings.avKey);
        return Promise.reject(DataError('network', 'The live stock provider is unreachable'));
      }
      return Promise.reject(DataError('unsupported', 'No live provider for this asset class'));
    },

    getForexRate: function (from, to, provider) {
      var base = String(from || '').trim().toUpperCase();
      var quote = String(to || '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote) || base === quote) {
        return Promise.reject(DataError('unsupported', 'Unsupported currency pair'));
      }
      if (isOffline()) return Promise.reject(offlineError('The device is offline'));
      function frankfurter() {
        return liveForexCurrencies().then(function (currencies) {
          var supported = currencies.some(function (c) { return c.code === base; }) && currencies.some(function (c) { return c.code === quote; });
          if (!supported) throw DataError('unsupported', 'Unsupported currency pair');
          return liveForexRate(base, quote, provider);
        });
      }
      var settings = TA.store.settings();
      if (settings.avKey && !String(provider || '').trim()) {
        return liveAvForexRate(base, quote, settings.avKey).catch(frankfurter);
      }
      return frankfurter();
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
      if (isOffline() || !canUseProxy()) return Promise.resolve(null);
      return searchCrypto(symbol).catch(function () { return null; });
    },

    getOverview: function () {
      if (isOffline()) return Promise.reject(offlineError('The device is offline'));
      var overviewAssets = C.overviewStocks();
      var cryptoP = canUseProxy() && C.cryptos().length
        ? cgMarkets(C.cryptos().map(function (a) { return a.coingeckoId; }), 90000)
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
          .catch(function () { return []; })
        : Promise.resolve([]);
      var stockP = canUseProxy()
        ? proxyQuotes(overviewAssets.map(function (a) { return a.symbol; })).catch(function () { return []; })
        : Promise.resolve([]);
      return Promise.all([cryptoP, stockP]).then(function (out) {
        var crypto = out[0];
        var stocks = (out[1] || []).filter(function (q) {
          return q && q.symbol && U.isNum(q.price);
        }).map(function (q) {
          return {
            symbol: q.symbol, name: q.name || q.symbol, assetClass: 'stock',
            price: q.price, changePct: q.changePct, spark: (q.spark || []).slice(-30),
            dataMode: 'live', asOf: q.asOf
          };
        });
        if (!crypto.length && !stocks.length) throw offlineError('The live market overview is offline');
        return { live: true, crypto: crypto, stocks: stocks, retrievedAt: Date.now() };
      });
    },

    getQuotes: function (entries) {
      entries = Array.isArray(entries) ? entries : [];
      if (isOffline()) return Promise.reject(offlineError('The device is offline'));
      var cryptoIds = entries.filter(function (e) { return e.assetClass === 'crypto'; })
        .map(function (e) {
          var a = C.find(e.symbol);
          return (a && a.coingeckoId) || e.coingeckoId || null;
        })
        .filter(Boolean);
      var stockSymbols = entries.filter(function (e) { return e.assetClass === 'stock'; })
        .map(function (e) { return e.symbol; });
      var result = {};
      var jobs = [];
      if (cryptoIds.length && canUseProxy()) {
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
      return Promise.all(jobs).then(function () {
        if (entries.length && !Object.keys(result).length) throw offlineError('Live quotes are offline');
        return result;
      });
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

  TA.data = api;
})(window.TA = window.TA || {});
