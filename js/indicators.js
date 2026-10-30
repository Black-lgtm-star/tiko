/* indicators.js — close-based technical primitives (deterministic, no deps) */
(function (TA) {
  'use strict';
  var U = TA.util;
  var I = {};

  I.sma = function (values, n) {
    var out = new Array(values.length).fill(null);
    if (!n || values.length < n) return out;
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= n) sum -= values[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  };

  I.ema = function (values, n) {
    var out = new Array(values.length).fill(null);
    if (!n || values.length < n) return out;
    var sum = 0, i;
    for (i = 0; i < n; i++) sum += values[i];
    out[n - 1] = sum / n;
    var k = 2 / (n + 1);
    for (i = n; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
    return out;
  };

  I.rsi = function (values, n) {
    n = n || 14;
    var out = new Array(values.length).fill(null);
    if (values.length <= n) return out;
    var gain = 0, loss = 0, i, d;
    for (i = 1; i <= n; i++) {
      d = values[i] - values[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    var ag = gain / n, al = loss / n;
    out[n] = (ag === 0 && al === 0) ? 50 : (al === 0 ? 100 : 100 - 100 / (1 + ag / al));
    for (i = n + 1; i < values.length; i++) {
      d = values[i] - values[i - 1];
      ag = (ag * (n - 1) + Math.max(d, 0)) / n;
      al = (al * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = (al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al));
    }
    return out;
  };

  // ATR when highs/lows exist; otherwise an average absolute close-to-close
  // range, which is a coarser but honest proxy. `mode` says which was used.
  I.atr = function (candles, n) {
    n = n || 14;
    var values = new Array(candles.length).fill(null);
    if (!candles.length) return { values: values, mode: 'close', pct: null };
    var hasOhlc = candles.every(function (c) {
      return U.isNum(c.h) && U.isNum(c.l);
    });
    var tr = [];
    for (var i = 0; i < candles.length; i++) {
      if (i === 0) {
        tr.push(hasOhlc ? Math.abs(candles[0].h - candles[0].l) : null);
        continue;
      }
      var prevC = candles[i - 1].c;
      if (hasOhlc) {
        tr.push(Math.max(
          Math.abs(candles[i].h - candles[i].l),
          Math.abs(candles[i].h - prevC),
          Math.abs(candles[i].l - prevC)
        ));
      } else {
        tr.push(Math.abs(candles[i].c - prevC));
      }
    }
    if (candles.length <= n) return { values: values, mode: hasOhlc ? 'ohlc' : 'close', pct: null };
    var sum = 0;
    for (i = 1; i <= n; i++) sum += tr[i];
    var a = sum / n;
    values[n] = a;
    for (i = n + 1; i < candles.length; i++) {
      a = (a * (n - 1) + tr[i]) / n;
      values[i] = a;
    }
    var last = values[candles.length - 1];
    var lastClose = candles[candles.length - 1].c;
    return {
      values: values,
      mode: hasOhlc ? 'ohlc' : 'close',
      pct: last && lastClose ? (last / lastClose) * 100 : null
    };
  };

  I.logReturns = function (values) {
    var out = [];
    for (var i = 1; i < values.length; i++) {
      if (values[i - 1] > 0 && values[i] > 0) out.push(Math.log(values[i] / values[i - 1]));
    }
    return out;
  };

  I.realizedVol = function (values, lookback, barsPerYear) {
    lookback = lookback || 30;
    if (values.length < lookback + 1) lookback = Math.max(5, values.length - 1);
    if (values.length < 3) return null;
    var rets = I.logReturns(values.slice(Math.max(0, values.length - lookback - 1)));
    if (rets.length < 2) return null;
    return U.stdev(rets) * Math.sqrt(barsPerYear || 365) * 100;
  };

  I.rollingRealizedVol = function (values, lookback, barsPerYear) {
    var out = new Array(values.length).fill(null);
    for (var i = lookback + 1; i < values.length; i++) {
      out[i] = I.realizedVol(values.slice(0, i + 1), lookback, barsPerYear);
    }
    return out;
  };

  I.returnsPct = function (values, n) {
    if (!values.length || values.length <= n) return null;
    var prev = values[values.length - 1 - n];
    var last = values[values.length - 1];
    if (!prev) return null;
    return (last / prev - 1) * 100;
  };

  // Slope of a least-squares line through the last n values, as % of mean per bar.
  I.slopePct = function (values, n) {
    if (!values.length) return null;
    var arr = values.slice(Math.max(0, values.length - n));
    if (arr.length < 3) return null;
    var meanX = (arr.length - 1) / 2;
    var meanY = U.mean(arr);
    var num = 0, den = 0;
    for (var i = 0; i < arr.length; i++) {
      num += (i - meanX) * (arr[i] - meanY);
      den += (i - meanX) * (i - meanX);
    }
    if (!den || !meanY) return null;
    return (num / den) / meanY * 100;
  };

  // Pivot highs/lows using a k-bar window on each side.
  I.pivots = function (candles, k) {
    k = k || 2;
    var highs = [], lows = [];
    for (var i = k; i < candles.length - k; i++) {
      var isHigh = true, isLow = true;
      for (var j = i - k; j <= i + k; j++) {
        if (j === i) continue;
        if (candles[j].c >= candles[i].c) isHigh = false;
        if (candles[j].c <= candles[i].c) isLow = false;
      }
      if (isHigh) highs.push({ i: i, price: candles[i].c, t: candles[i].t });
      if (isLow) lows.push({ i: i, price: candles[i].c, t: candles[i].t });
    }
    return { highs: highs, lows: lows };
  };

  I.windowStats = function (candles) {
    var closes = candles.map(function (c) { return c.c; });
    var last = closes[closes.length - 1];
    var hi = Math.max.apply(null, closes);
    var lo = Math.min.apply(null, closes);
    return {
      closes: closes,
      last: last,
      high: hi,
      low: lo,
      highIdx: closes.indexOf(hi),
      lowIdx: closes.indexOf(lo),
      fromHighPct: last ? (last / hi - 1) * 100 : null,
      fromLowPct: last ? (last / lo - 1) * 100 : null
    };
  };

  I.maxGapPct = function (candles, n) {
    var hasOhlc = candles.every(function (c) { return U.isNum(c.o); });
    if (!hasOhlc) return null;
    var start = Math.max(1, candles.length - (n || 20));
    var worst = 0;
    for (var i = start; i < candles.length; i++) {
      var g = Math.abs(candles[i].o / candles[i - 1].c - 1) * 100;
      if (g > worst) worst = g;
    }
    return worst;
  };

  I.touches = function (pivots, price, tolPct) {
    var n = 0;
    pivots.forEach(function (p) {
      if (Math.abs(p.price / price - 1) * 100 <= tolPct) n++;
    });
    return n;
  };

  I.lastValid = function (arr, fallback) {
    for (var i = arr.length - 1; i >= 0; i--) {
      if (U.isNum(arr[i])) return arr[i];
    }
    return fallback == null ? null : fallback;
  };

  TA.ind = I;
})(window.TA = window.TA || {});
