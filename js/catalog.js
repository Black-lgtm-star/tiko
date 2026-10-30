/* catalog.js — supported assets, search, and sample-series parameters */
(function (TA) {
  'use strict';
  var U = TA.util;

  // Sample stocks are synthetic. Base prices, drift and vol only shape the
  // demonstration series; they are not quotes and must never be read as such.
  var stocks = [
    { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', currency: 'USD', px: 232, drift: 0.10, vol: 0.24, vol24: 5.6e7, shares: 1.52e10 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', currency: 'USD', px: 438, drift: 0.12, vol: 0.22, vol24: 2.2e7, shares: 7.43e9 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Semiconductors', currency: 'USD', px: 168, drift: 0.24, vol: 0.43, vol24: 2.4e8, shares: 2.45e10 },
    { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', currency: 'USD', px: 256, drift: 0.08, vol: 0.55, vol24: 1.1e8, shares: 3.21e9 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer', currency: 'USD', px: 214, drift: 0.12, vol: 0.29, vol24: 4.5e7, shares: 1.05e10 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', currency: 'USD', px: 186, drift: 0.10, vol: 0.26, vol24: 2.8e7, shares: 1.23e10 },
    { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology', currency: 'USD', px: 604, drift: 0.14, vol: 0.33, vol24: 1.4e7, shares: 2.53e9 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Semiconductors', currency: 'USD', px: 152, drift: 0.13, vol: 0.46, vol24: 5.0e7, shares: 1.62e9 },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', currency: 'USD', px: 246, drift: 0.07, vol: 0.21, vol24: 1.0e7, shares: 2.84e9 },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', sector: 'Broad market ETF', currency: 'USD', px: 598, drift: 0.08, vol: 0.15, vol24: 7.0e7, shares: null, isEtf: true }
  ].map(function (s) {
    return Object.assign({
      assetClass: 'stock',
      exchange: 'Sample · US',
      barsPerYear: 252,
      intradayStartMinute: 9 * 60 + 30
    }, s);
  });

  var cryptos = [
    { symbol: 'BTC', name: 'Bitcoin', id: 'bitcoin', px: 96500, vol24: 3.2e10, shares: 1.98e7 },
    { symbol: 'ETH', name: 'Ethereum', id: 'ethereum', px: 3280, vol24: 1.6e10, shares: 1.2e8 },
    { symbol: 'SOL', name: 'Solana', id: 'solana', px: 186, vol24: 3.8e9, shares: 4.8e8 },
    { symbol: 'XRP', name: 'XRP', id: 'ripple', px: 2.45, vol24: 2.9e9, shares: 5.7e10 },
    { symbol: 'DOGE', name: 'Dogecoin', id: 'dogecoin', px: 0.23, vol24: 1.4e9, shares: 1.47e11 },
    { symbol: 'ADA', name: 'Cardano', id: 'cardano', px: 0.78, vol24: 6.2e8, shares: 3.6e10 },
    { symbol: 'LINK', name: 'Chainlink', id: 'chainlink', px: 18.5, vol24: 4.1e8, shares: 6.3e8 },
    { symbol: 'AVAX', name: 'Avalanche', id: 'avalanche-2', px: 34, vol24: 3.4e8, shares: 4.1e8 },
    { symbol: 'LTC', name: 'Litecoin', id: 'litecoin', px: 98, vol24: 3.1e8, shares: 7.6e7 },
    { symbol: 'DOT', name: 'Polkadot', id: 'polkadot', px: 5.8, vol24: 1.6e8, shares: 1.5e9 }
  ].map(function (c) {
    return Object.assign({
      assetClass: 'crypto',
      currency: 'USD',
      exchange: 'Crypto · 24/7',
      barsPerYear: 365,
      coingeckoId: c.id
    }, c);
  });

  var all = stocks.concat(cryptos);
  var bySymbol = {};
  all.forEach(function (a) { bySymbol[a.symbol] = a; });

  function search(q) {
    var query = String(q || '').trim().toLowerCase();
    if (!query) return [];
    var scored = [];
    all.forEach(function (a) {
      var sym = a.symbol.toLowerCase();
      var name = a.name.toLowerCase();
      var score = -1;
      if (sym === query) score = 0;
      else if (sym.indexOf(query) === 0) score = 1;
      else if (name.indexOf(query) === 0) score = 2;
      else if (name.indexOf(query) > 0 || sym.indexOf(query) > 0) score = 3;
      if (score >= 0) scored.push({ a: a, score: score });
    });
    scored.sort(function (x, y) {
      if (x.score !== y.score) return x.score - y.score;
      return x.a.symbol.localeCompare(y.a.symbol);
    });
    return scored.slice(0, 6).map(function (x) { return x.a; });
  }

  TA.catalog = {
    all: function () { return all.slice(); },
    stocks: function () { return stocks.slice(); },
    cryptos: function () { return cryptos.slice(); },
    find: function (symbol) { return bySymbol[U.normalizeSymbol(symbol)] || null; },
    isSupported: function (symbol) { return !!bySymbol[U.normalizeSymbol(symbol)]; },
    search: search,
    overviewCryptos: function () { return cryptos.slice(); },
    overviewStocks: function () { return stocks.slice(0, 6); }
  };
})(window.TA = window.TA || {});
