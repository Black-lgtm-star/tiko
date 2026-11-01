/* Search the current Nasdaq Trader directories for NYSE, Nasdaq and NYSE Arca listings. */
'use strict';

const SOURCES = [
  { url: 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt', exchange: 'Nasdaq', symbol: 0, name: 1, etf: 6, test: 3 },
  { url: 'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt', symbol: 7, name: 1, market: 2, etf: 4, test: 6 }
];
const NON_STOCK = /\b(warrants?|rights?|units?|notes?|debentures?|bonds?|etn)\b|\bpreferred\s+(?:stock|shares?)\b/i;
let directoryCache = null;
let cachedAt = 0;
let directoryLoading = null;

async function loadDirectory() {
  if (directoryCache && Date.now() - cachedAt < 60 * 60 * 1000) return directoryCache;
  if (!directoryLoading) {
    directoryLoading = Promise.all(SOURCES.map(async source => {
      const response = await fetch(source.url, {
        headers: { accept: 'text/plain' },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error('Nasdaq Trader directory unavailable');
      const body = await response.text();
      const lines = body.replace(/^\uFEFF/, '').split(/\r?\n/);
      return lines.slice(1).filter(line => line && !line.startsWith('File Creation Time')).map(line => {
        const fields = line.split('|');
        const symbol = String(fields[source.symbol] || '').trim();
        const name = String(fields[source.name] || '').trim();
        if (!symbol || !name || fields[source.test] === 'Y' || fields[source.etf] === 'Y' || NON_STOCK.test(name)) return null;
        let exchange = source.exchange || '';
        if (source.market) {
          const market = fields[source.market];
          if (market !== 'N' && market !== 'P') return null;
          exchange = market === 'N' ? 'NYSE' : 'NYSE Arca';
        }
        return { symbol, name, exchange, assetClass: 'stock' };
      }).filter(Boolean);
    })).then(requests => {
      directoryCache = requests.flat().filter((stock, index, all) =>
        all.findIndex(candidate => candidate.symbol === stock.symbol) === index
      );
      cachedAt = Date.now();
      return directoryCache;
    }).finally(() => { directoryLoading = null; });
  }
  return directoryLoading;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const query = String(req.query && req.query.q || '').trim().slice(0, 80);
  if (query.length < 2) return res.status(400).json({ error: 'Enter at least two characters.' });
  try {
    const directory = await loadDirectory();
    const normalized = query.toLowerCase();
    const matches = directory.map(stock => {
      const symbol = stock.symbol.toLowerCase();
      const name = stock.name.toLowerCase();
      const score = symbol === normalized ? 0 : symbol.startsWith(normalized) ? 1 : name.startsWith(normalized) ? 2 :
        symbol.includes(normalized) || name.includes(normalized) ? 3 : 99;
      return { stock, score };
    }).filter(item => item.score < 99).sort((a, b) => a.score - b.score || a.stock.symbol.localeCompare(b.stock.symbol));
    return res.status(200).json({ stocks: matches.slice(0, 30).map(item => item.stock), count: directory.length });
  } catch (_) {
    directoryCache = null;
    return res.status(503).json({ error: 'The official U.S. stock directory is temporarily unavailable.' });
  }
};
