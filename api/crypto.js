/* Same-origin crypto data proxy for CoinGecko.
   CoinGecko does not send CORS headers reliably from every network, so the
   browser asks this function instead. Three shapes:
     /api/crypto?kind=chart&id=bitcoin&days=180  → price and volume series
     /api/crypto?kind=markets&ids=bitcoin,ethereum → current market rows
     /api/crypto?kind=search&q=solana            → matching coin identities
   Public data only; no cookies or user identifiers. An optional CoinGecko key
   is read from the environment and never sent to the browser. */
'use strict';

const BASE = 'https://api.coingecko.com/api/v3';
const ID_RE = /^[a-z0-9-]{1,64}$/i;
const MAX_IDS = 25;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const cache = new Map();
const CACHE_LIMIT = 120;

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

class UpstreamError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function headers() {
  const out = { accept: 'application/json', 'user-agent': UA };
  const key = process.env.COINGECKO_API_KEY;
  if (key) {
    if (String(process.env.COINGECKO_API_TIER || '').toLowerCase() === 'pro') {
      out['x-cg-pro-api-key'] = key;
    } else {
      out['x-cg-demo-api-key'] = key;
    }
  }
  return out;
}

async function getJSON(url) {
  let response;
  try {
    response = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(9000) });
  } catch (_) {
    throw new UpstreamError(503, 'The crypto data provider did not respond.');
  }
  if (response.status === 429) throw new UpstreamError(429, 'The crypto data provider is rate limiting requests.');
  if (response.status === 404) throw new UpstreamError(404, 'Unknown coin.');
  if (!response.ok) throw new UpstreamError(503, 'The crypto data provider is unavailable.');
  try {
    return await response.json();
  } catch (_) {
    throw new UpstreamError(503, 'The crypto data provider returned an unreadable response.');
  }
}

function cleanId(value) {
  const id = String(value || '').trim().toLowerCase();
  return ID_RE.test(id) ? id : '';
}

function cleanIds(raw) {
  const seen = new Set();
  const out = [];
  String(raw || '').split(',').forEach(value => {
    const id = cleanId(value);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  });
  return out;
}

function cleanQuery(raw) {
  const q = String(raw || '').trim();
  if (!q || q.length > 80 || /[\u0000-\u001f<>]/.test(q)) return '';
  return q;
}

function cleanDays(raw) {
  const days = Number(raw == null ? 180 : raw);
  if (!Number.isInteger(days) || days < 1 || days > 365) return 0;
  return days;
}

function chart(id, days) {
  const key = 'chart|' + id + '|' + days;
  const hit = recall(key);
  if (hit) return hit;
  const url = BASE + '/coins/' + encodeURIComponent(id) +
    '/market_chart?vs_currency=usd&days=' + days;
  return getJSON(url).then(body => {
    const prices = (body && body.prices) || [];
    const volumes = (body && body.total_volumes) || [];
    if (!prices.length) throw new UpstreamError(404, 'No price history for this coin.');
    return remember(key, { prices, total_volumes: volumes }, 45000);
  });
}

function markets(ids) {
  const key = 'markets|' + ids.join(',');
  const hit = recall(key);
  if (hit) return hit;
  const url = BASE + '/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(ids.join(',')) +
    '&price_change_percentage=24h,1h&sparkline=true&per_page=' + ids.length + '&page=1';
  return getJSON(url).then(body => {
    if (!Array.isArray(body)) throw new UpstreamError(503, 'The crypto data provider returned an unexpected response.');
    const rows = body.map(row => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      current_price: row.current_price,
      market_cap: row.market_cap,
      market_cap_rank: row.market_cap_rank,
      total_volume: row.total_volume,
      high_24h: row.high_24h,
      low_24h: row.low_24h,
      price_change_percentage_24h: row.price_change_percentage_24h,
      price_change_percentage_24h_in_currency: row.price_change_percentage_24h_in_currency,
      last_updated: row.last_updated,
      sparkline_in_7d: row.sparkline_in_7d
    }));
    return remember(key, rows, 45000);
  });
}

function search(q) {
  const key = 'search|' + q.toLowerCase();
  const hit = recall(key);
  if (hit) return hit;
  const url = BASE + '/search?query=' + encodeURIComponent(q);
  return getJSON(url).then(body => {
    const coins = ((body && body.coins) || []).slice(0, 20).map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      market_cap_rank: coin.market_cap_rank
    }));
    return remember(key, { coins }, 10 * 60 * 1000);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const query = req.query || {};
  const kind = String(query.kind || '').toLowerCase();
  try {
    if (kind === 'chart') {
      const id = cleanId(query.id);
      const days = cleanDays(query.days);
      if (!id) return res.status(400).json({ error: 'Provide a valid coin id.' });
      if (!days) return res.status(400).json({ error: 'Provide a day count between 1 and 365.' });
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return res.status(200).json(await chart(id, days));
    }
    if (kind === 'markets') {
      const ids = cleanIds(query.ids);
      if (!ids.length) return res.status(400).json({ error: 'Provide at least one valid coin id.' });
      if (ids.length > MAX_IDS) return res.status(400).json({ error: 'Too many coins in one request.' });
      res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=180');
      return res.status(200).json(await markets(ids));
    }
    if (kind === 'search') {
      const q = cleanQuery(query.q);
      if (!q) return res.status(400).json({ error: 'Provide a search query under 80 characters.' });
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
      return res.status(200).json(await search(q));
    }
    return res.status(400).json({ error: 'Provide a valid kind: chart, markets or search.' });
  } catch (error) {
    const status = error && error.status ? error.status : 503;
    return res.status(status).json({ error: (error && error.message) || 'Crypto data is temporarily unavailable.' });
  }
};
