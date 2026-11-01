/* Same-origin stock data proxy for Yahoo Finance.
   Yahoo omits CORS headers on its chart endpoint, so the browser asks this
   function instead. Two shapes:
     /api/quote?symbol=AAPL[&timeframe=daily|intraday]  → candles + quote
     /api/quote?symbols=AAPL,MSFT,…                     → batch quotes + spark
   Public, delayed data only; no key, no cookies, no user identifiers. */
'use strict';

const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const CHART = '/v8/finance/chart/';
const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,16}$/;
const MAX_BATCH = 10;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const cache = new Map();
const CACHE_LIMIT = 240;

function remember(key, value, ttl) {
  if (cache.size > CACHE_LIMIT) cache.clear();
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}

function recall(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function num(value) {
  return typeof value === 'number' && isFinite(value) ? value : null;
}

class UpstreamError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function fetchChart(symbol, range, interval, ttl) {
  const key = symbol + '|' + range + '|' + interval;
  const hit = recall(key);
  if (hit) return hit;
  const path = CHART + encodeURIComponent(symbol) + '?range=' + range + '&interval=' + interval +
    '&includePrePost=false&events=div%2Csplit';
  let response = null;
  let reached = false;
  for (const host of HOSTS) {
    try {
      response = await fetch('https://' + host + path, {
        headers: {
          accept: 'application/json,text/plain,*/*',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': UA
        },
        signal: AbortSignal.timeout(9000)
      });
      reached = true;
    } catch (_) {
      continue;
    }
    if (response.ok || response.status === 404) break;
  }
  if (!response || !reached) throw new UpstreamError(503, 'The stock data provider did not respond.');
  if (response.status === 404) throw new UpstreamError(404, 'Unknown stock symbol.');
  if (response.status === 429) throw new UpstreamError(429, 'The stock data provider is rate limiting requests.');
  if (!response.ok) throw new UpstreamError(503, 'The stock data provider is unavailable.');
  let body;
  try {
    body = await response.json();
  } catch (_) {
    throw new UpstreamError(503, 'The stock data provider returned an unreadable response.');
  }
  const chart = body && body.chart;
  const error = chart && chart.error;
  if (error) {
    const code = String(error.code || '');
    if (/not found|delisted/i.test(code + ' ' + (error.description || ''))) {
      throw new UpstreamError(404, 'Unknown stock symbol.');
    }
    throw new UpstreamError(503, 'The stock data provider could not return this symbol.');
  }
  const result = chart && chart.result && chart.result[0];
  if (!result || !result.meta) throw new UpstreamError(404, 'Unknown stock symbol.');
  return remember(key, result, ttl);
}

function dayKey(timestamp, zone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone || 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(timestamp * 1000));
  } catch (_) {
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
  }
}

function candlesOf(result) {
  const stamps = result.timestamp || [];
  const series = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const candles = [];
  for (let i = 0; i < stamps.length; i++) {
    const close = num(series.close && series.close[i]);
    if (close == null || close <= 0) continue;
    candles.push({
      t: stamps[i] * 1000,
      o: num(series.open && series.open[i]),
      h: num(series.high && series.high[i]),
      l: num(series.low && series.low[i]),
      c: close,
      v: num(series.volume && series.volume[i])
    });
  }
  return candles;
}

function sessionCandles(result, candles) {
  if (!candles.length) return candles;
  const meta = result.meta || {};
  const zone = meta.exchangeTimezoneName;
  const lastDay = dayKey(candles[candles.length - 1].t / 1000, zone);
  let start = candles.length - 1;
  while (start > 0 && dayKey(candles[start - 1].t / 1000, zone) === lastDay) start--;
  const session = candles.slice(start);
  return session.length >= 2 ? session : candles.slice(-78);
}

function quoteOf(result, candles) {
  const meta = result.meta || {};
  const last = candles[candles.length - 1];
  const previous = candles.length > 1 ? candles[candles.length - 2].c : null;
  const previousClose = num(meta.previousClose) || previous || last.c;
  const price = num(meta.regularMarketPrice) || last.c;
  const changePct = num(meta.regularMarketChangePercent);
  return {
    price,
    previousClose,
    changePct: changePct != null ? changePct : previousClose ? (price / previousClose - 1) * 100 : 0,
    asOf: num(meta.regularMarketTime) ? meta.regularMarketTime * 1000 : last.t
  };
}

function identityOf(result, fallbackSymbol) {
  const meta = result.meta || {};
  return {
    symbol: String(meta.symbol || fallbackSymbol).toUpperCase(),
    name: meta.longName || meta.shortName || fallbackSymbol,
    exchange: meta.fullExchangeName || meta.exchangeName || '',
    currency: meta.currency || 'USD'
  };
}

function chartPayload(symbol, timeframe) {
  const intraday = timeframe === 'intraday';
  const ttl = intraday ? 45000 : 5 * 60 * 1000;
  return fetchChart(symbol, intraday ? '1d' : '2y', intraday ? '5m' : '1d', ttl).then(async result => {
    let source = result;
    let candles = candlesOf(result);
    if (intraday) {
      candles = sessionCandles(result, candles);
      if (candles.length < 8) {
        const fallback = await fetchChart(symbol, '5d', '5m', ttl);
        const fallbackCandles = sessionCandles(fallback, candlesOf(fallback));
        if (fallbackCandles.length > candles.length) {
          source = fallback;
          candles = fallbackCandles;
        }
      }
    }
    if (candles.length < 8) throw new UpstreamError(404, 'No recent trades for this symbol.');
    const identity = identityOf(source, symbol);
    const quote = quoteOf(source, candles);
    const meta = source.meta || {};
    const session = intraday ? candles : candles.slice(-1);
    return {
      symbol: identity.symbol,
      name: identity.name,
      exchange: identity.exchange,
      currency: identity.currency,
      price: quote.price,
      previousClose: quote.previousClose,
      changePct: quote.changePct,
      asOf: quote.asOf,
      open: session[0] ? session[0].o : null,
      dayHigh: num(meta.regularMarketDayHigh),
      dayLow: num(meta.regularMarketDayLow),
      volume: num(meta.regularMarketVolume),
      interval: intraday ? '5m' : '1d',
      range: intraday ? '1d' : '2y',
      candles,
      provider: 'Yahoo Finance',
      sourceUrl: 'https://finance.yahoo.com/quote/' + encodeURIComponent(identity.symbol),
      delayed: true,
      retrievedAt: Date.now()
    };
  });
}

function batchQuote(symbol) {
  const ttl = 45000;
  return fetchChart(symbol, '1mo', '1d', ttl).then(result => {
    const candles = candlesOf(result);
    if (!candles.length) throw new UpstreamError(404, 'No recent trades for this symbol.');
    const identity = identityOf(result, symbol);
    const quote = quoteOf(result, candles);
    return {
      symbol: identity.symbol,
      name: identity.name,
      exchange: identity.exchange,
      currency: identity.currency,
      price: quote.price,
      previousClose: quote.previousClose,
      changePct: quote.changePct,
      asOf: quote.asOf,
      spark: candles.slice(-30).map(candle => candle.c)
    };
  });
}

function cleanSymbols(raw) {
  const seen = new Set();
  return String(raw || '').split(',').map(value => value.trim().toUpperCase())
    .filter(value => SYMBOL_RE.test(value))
    .filter(value => (seen.has(value) ? false : (seen.add(value), true)));
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=180');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const query = req.query || {};
  const batch = typeof query.symbols === 'string' ? query.symbols : '';
  try {
    if (batch) {
      const symbols = cleanSymbols(batch);
      if (!symbols.length) return res.status(400).json({ error: 'Provide at least one valid stock symbol.' });
      if (symbols.length > MAX_BATCH) return res.status(400).json({ error: 'Too many symbols in one request.' });
      const settled = await Promise.allSettled(symbols.map(batchQuote));
      const quotes = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
      if (!quotes.length) {
        const failure = settled.find(item => item.status === 'rejected');
        throw failure ? failure.reason : new UpstreamError(404, 'Unknown stock symbols.');
      }
      return res.status(200).json({ quotes, retrievedAt: Date.now() });
    }

    const symbol = String(query.symbol || '').trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return res.status(400).json({ error: 'Provide a valid stock symbol.' });
    const timeframe = query.timeframe === 'intraday' ? 'intraday' : 'daily';
    res.setHeader('Cache-Control', timeframe === 'intraday'
      ? 's-maxage=30, stale-while-revalidate=120'
      : 's-maxage=120, stale-while-revalidate=600');
    const payload = await chartPayload(symbol, timeframe);
    return res.status(200).json(payload);
  } catch (error) {
    const status = error && error.status ? error.status : 503;
    return res.status(status).json({ error: (error && error.message) || 'Stock data is temporarily unavailable.' });
  }
};
