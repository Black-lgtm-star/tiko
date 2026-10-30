/* analysis.js — deterministic, rule-based read of a price series.
   Produces structured facts + i18n keys. No LLM, no network. */
(function (TA) {
  'use strict';
  var U = TA.util;
  var I = TA.ind;

  var ENGINE = 'groundtruth-rules-1';

  function fmtP(price, lang) { return U.fmtPrice(price, '$', lang); }
  function fmtPct(v, sign, dp) { return U.fmtPct(v, { sign: sign !== false, decimals: dp == null ? 2 : dp }); }
  function fmtVol(v, lang) { return U.fmtCompact(v, lang); }

  function niceRound(value) {
    if (!U.isNum(value) || value <= 0) return null;
    var mag = Math.pow(10, Math.floor(Math.log10(value)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i] * mag;
      if (value < step * 1.5) return step;
    }
    return 10 * mag;
  }

  function clusterLevels(candidates, price, tolPct) {
    var out = [];
    candidates.slice().sort(function (a, b) { return Math.abs(a.price - price) - Math.abs(b.price - price); })
      .forEach(function (c) {
        var dup = out.some(function (o) { return Math.abs(o.price / c.price - 1) * 100 < tolPct * 0.55; });
        if (!dup) out.push(c);
      });
    return out;
  }

  function build(payload) {
    var asset = payload.asset;
    var candles = payload.candles || [];
    var quote = payload.quote || {};
    var meta = payload.meta || {};
    var lang = payload.lang || 'en';
    var intraday = meta.interval === 'intraday';
    var barsPerYear = intraday
      ? (asset.assetClass === 'crypto' ? 365 * 288 : 252 * 78)
      : (asset.barsPerYear || 252);
    var closes = candles.map(function (c) { return c.c; });
    var n = closes.length;
    var last = n ? closes[n - 1] : quote.price;
    var price = quote.price || last;
    var priceLabel = fmtP(price, lang);

    var sma20Arr = I.sma(closes, 20);
    var sma50Arr = I.sma(closes, 50);
    var longLen = n >= 200 ? 200 : 100;
    var longArr = I.sma(closes, longLen);
    var rsiArr = I.rsi(closes, 14);
    var atrObj = I.atr(candles, 14);
    var atrLast = I.lastValid(atrObj.values, null);
    var atrPct = U.isNum(atrObj.pct) ? atrObj.pct : null;

    var sma20 = I.lastValid(sma20Arr, null);
    var sma50 = I.lastValid(sma50Arr, null);
    var longSma = I.lastValid(longArr, null);
    var rsi = I.lastValid(rsiArr, 50);
    var slope20 = I.slopePct(closes, 10);
    var ret20 = I.returnsPct(closes, 20);
    var ret5 = I.returnsPct(closes, 5);
    var ret60 = I.returnsPct(closes, 60);
    var vol30 = I.realizedVol(closes, 30, barsPerYear);
    var volHist = I.rollingRealizedVol(closes, 20, barsPerYear).filter(U.isNum);
    var volPctRank = U.isNum(vol30) && volHist.length > 8 ? U.percentileRank(volHist, vol30) : null;

    var stats = I.windowStats(candles);
    var windowBars = n;
    var drawdown = stats.fromHighPct;
    var fromLow = stats.fromLowPct;

    var avgVol = n >= 20 ? U.mean(candles.slice(-20).map(function (c) { return c.v || 0; })) : null;
    var lastVol = n ? candles[n - 1].v : null;
    var relVol = avgVol && U.isNum(lastVol) ? lastVol / avgVol : null;
    var maxGap = I.maxGapPct(candles, 20);

    var pivots = I.pivots(candles.slice(Math.max(0, n - 140)), intraday ? 3 : 2);

    /* ---------------- trend ---------------- */
    var score = 0;
    if (U.isNum(sma20)) score += price > sma20 ? 1 : -1;
    if (U.isNum(sma20) && U.isNum(sma50)) score += sma20 > sma50 ? 1 : -1;
    if (U.isNum(slope20)) score += slope20 > 0.03 ? 1 : slope20 < -0.03 ? -1 : 0;
    if (U.isNum(longSma)) score += price > longSma ? 0.5 : -0.5;

    var trendKey = 'trend.mixed';
    if (score >= 2.4) trendKey = 'trend.strong_up';
    else if (score >= 1.2) trendKey = 'trend.up';
    else if (score <= -2.4) trendKey = 'trend.strong_down';
    else if (score <= -1.2) trendKey = 'trend.down';
    else if (Math.abs(score) <= 0.7) trendKey = 'trend.sideways';

    var trendStrength = U.clamp(Math.abs(score) / 3.5 * 100, 6, 100);
    var distSma50 = U.isNum(sma50) && sma50 ? (price / sma50 - 1) * 100 : null;

    /* ---------------- volatility regime ---------------- */
    var volKey = 'vol.normal';
    if (volPctRank != null) {
      if (volPctRank >= 0.85) volKey = 'vol.high';
      else if (volPctRank >= 0.62) volKey = 'vol.elevated';
      else if (volPctRank <= 0.22) volKey = 'vol.low';
    } else if (U.isNum(vol30)) {
      volKey = vol30 > 85 ? 'vol.high' : vol30 > 55 ? 'vol.elevated' : 'vol.normal';
    }

    /* ---------------- liquidity ---------------- */
    var dollarVolume = null;
    if (U.isNum(quote.volume)) {
      dollarVolume = asset.assetClass === 'crypto' ? quote.volume : quote.volume * price;
    }
    var liqKey = 'liq.unknown', liqMeter = 0;
    if (U.isNum(dollarVolume)) {
      var deep = asset.assetClass === 'crypto' ? 5e9 : 1e9;
      var mid = asset.assetClass === 'crypto' ? 4e8 : 8e7;
      if (dollarVolume >= deep) { liqKey = 'liq.deep'; liqMeter = 92; }
      else if (dollarVolume >= mid) { liqKey = 'liq.moderate'; liqMeter = 58; }
      else { liqKey = 'liq.thin'; liqMeter = 22; }
    }

    /* ---------------- momentum label ---------------- */
    var momKey = 'momentum.neutral';
    if (U.isNum(ret20) && U.isNum(rsi)) {
      if (ret20 > 1 && rsi >= 50) momKey = 'momentum.positive';
      else if (ret20 < -1 && rsi < 50) momKey = 'momentum.negative';
    }

    /* ---------------- key levels ---------------- */
    var tolPct = Math.max((atrPct || 1) * 0.9, 0.6);
    var candidates = [];

    pivots.highs.forEach(function (p) {
      candidates.push({
        price: p.price, kind: 'resistance', strength: 2,
        basisKey: 'level.basis.swing_high',
        basisParams: { n: Math.max(1, I.touches(pivots.highs, p.price, tolPct)) },
        t: p.t
      });
    });
    pivots.lows.forEach(function (p) {
      candidates.push({
        price: p.price, kind: 'support', strength: 2,
        basisKey: 'level.basis.swing_low',
        basisParams: { n: Math.max(1, I.touches(pivots.lows, p.price, tolPct)) },
        t: p.t
      });
    });
    if (U.isNum(longSma)) {
      candidates.push({
        price: longSma, kind: longSma < price ? 'support' : 'resistance', strength: 2,
        basisKey: 'level.basis.sma', basisParams: { n: longLen }
      });
    }
    if (U.isNum(sma50) && (!U.isNum(longSma) || Math.abs(sma50 / longSma - 1) > 0.01)) {
      candidates.push({
        price: sma50, kind: sma50 < price ? 'support' : 'resistance', strength: 1,
        basisKey: 'level.basis.sma', basisParams: { n: 50 }
      });
    }
    candidates.push({
      price: stats.high, kind: 'resistance', strength: 3,
      basisKey: 'level.basis.range_high', basisParams: { window: windowBars }
    });
    candidates.push({
      price: stats.low, kind: 'support', strength: 3,
      basisKey: 'level.basis.range_low', basisParams: { window: windowBars }
    });
    if (asset.assetClass === 'crypto') {
      var step = niceRound(price * 0.025) || 1;
      candidates.push({
        price: Math.ceil(price / step) * step, kind: 'resistance', strength: 1,
        basisKey: 'level.basis.round', basisParams: {}
      });
      candidates.push({
        price: Math.floor(price / step) * step, kind: 'support', strength: 1,
        basisKey: 'level.basis.round', basisParams: {}
      });
    }
    if (U.isNum(quote.dayHigh)) {
      candidates.push({
        price: quote.dayHigh, kind: 'resistance', strength: 1,
        basisKey: 'level.basis.session_high', basisParams: {}
      });
    }
    if (U.isNum(quote.dayLow)) {
      candidates.push({
        price: quote.dayLow, kind: 'support', strength: 1,
        basisKey: 'level.basis.session_low', basisParams: {}
      });
    }

    candidates = candidates.filter(function (c) { return U.isNum(c.price) && c.price > 0; });
    var resistances = clusterLevels(candidates.filter(function (c) {
      return c.kind === 'resistance' && c.price > price * 1.001;
    }), price, tolPct).slice(0, 3);
    var supports = clusterLevels(candidates.filter(function (c) {
      return c.kind === 'support' && c.price < price * 0.999;
    }), price, tolPct).slice(0, 3);

    // Guarantee at least one reference on each side, derived from the ATR band.
    var band = U.isNum(atrLast) && atrLast > 0 ? atrLast : price * 0.02;
    if (!resistances.length) {
      resistances.push({
        price: price + band * 1.5, kind: 'resistance', strength: 1,
        basisKey: 'level.basis.atr', basisParams: { n: 14 }, synthesized: true
      });
    }
    if (!supports.length) {
      supports.push({
        price: Math.max(price * 0.01, price - band * 1.5), kind: 'support', strength: 1,
        basisKey: 'level.basis.atr', basisParams: { n: 14 }, synthesized: true
      });
    }

    var levels = [];
    supports.slice(0, 2).forEach(function (c) { levels.push(c); });
    resistances.slice(0, 2).forEach(function (c) { levels.push(c); });

    function lvlOut(c) {
      var dist = Math.abs(c.price / price - 1) * 100;
      return {
        kind: c.kind,
        price: c.price,
        priceText: fmtP(c.price, lang),
        distPct: dist,
        distText: fmtPct(dist, false),
        strength: Math.min(3, c.strength),
        basisKey: c.basisKey,
        basisParams: c.basisParams
      };
    }
    var levelsOut = levels.map(lvlOut);
    var nearestSupport = supports[0] ? lvlOut(supports[0]) : null;
    var nextSupport = supports[1] ? lvlOut(supports[1]) : nearestSupport;
    var nearestResistance = resistances[0] ? lvlOut(resistances[0]) : null;
    var nextResistance = resistances[1] ? lvlOut(resistances[1]) : nearestResistance;

    /* ---------------- evidence ---------------- */
    var bull = [], bear = [];
    function add(list, key, weight, params) {
      list.push({ key: key, weight: weight || 1, params: params || {} });
    }

    if (U.isNum(sma50) && U.isNum(sma20)) {
      if (price > sma50 && sma20 > sma50) {
        add(bull, 'ev.aboveSma50', 3, { price: priceLabel, dist: fmtPct(distSma50, false), sma: fmtP(sma50, lang) });
      } else if (price < sma50 && sma20 < sma50) {
        add(bear, 'ev.belowSma50', 3, { price: priceLabel, dist: fmtPct(Math.abs(distSma50), false), sma: fmtP(sma50, lang) });
      }
    }
    if (U.isNum(slope20)) {
      if (slope20 > 0.03) add(bull, 'ev.slopeUp', 2, { chg: fmtPct(slope20 * 10, true) });
      else if (slope20 < -0.03) add(bear, 'ev.slopeDown', 2, { chg: fmtPct(Math.abs(slope20) * 10, false) });
    }
    if (U.isNum(ret20)) {
      if (ret20 > 0) add(bull, 'ev.momentumUp', Math.abs(ret20) > 4 ? 2 : 1, { ret: fmtPct(ret20, true), rsi: rsi.toFixed(0) });
      else if (ret20 < 0) add(bear, 'ev.momentumDown', Math.abs(ret20) > 4 ? 2 : 1, { ret: fmtPct(ret20, true), rsi: rsi.toFixed(0) });
    }
    if (U.isNum(rsi)) {
      if (rsi >= 72) add(bear, 'ev.rsiStretched', 2, { rsi: rsi.toFixed(0) });
      else if (rsi <= 28) add(bull, 'ev.rsiWashed', 2, { rsi: rsi.toFixed(0) });
    }
    if (U.isNum(relVol)) {
      var x = relVol.toFixed(2);
      if (relVol >= 1.4) {
        if ((ret5 || 0) >= 0) add(bull, 'ev.volumeUp', 2, { x: x });
        else add(bear, 'ev.volumeUp', 2, { x: x });
      } else if (relVol <= 0.65) {
        add(bear, 'ev.volumeDown', 1, { x: x });
      }
    }
    if (nearestResistance) {
      if (nearestResistance.distPct > 3) {
        add(bull, 'ev.roomToResistance', 1, { dist: nearestResistance.distText, lvl: nearestResistance.priceText });
      } else if (nearestResistance.distPct < 1.2) {
        add(bear, 'ev.intoResistance', 2, { dist: nearestResistance.distText, lvl: nearestResistance.priceText });
      }
    }
    if (nearestSupport) {
      if (nearestSupport.distPct > 2.5) {
        add(bull, 'ev.shelfBelow', 1, { dist: nearestSupport.distText, lvl: nearestSupport.priceText });
      }
      if (nearestSupport.distPct > 5) {
        add(bear, 'ev.airPocket', 1, { dist: nearestSupport.distText, lvl: nearestSupport.priceText });
      }
    }
    var lowPivots = pivots.lows.slice(-3);
    if (lowPivots.length >= 2) {
      var a = lowPivots[lowPivots.length - 2].price;
      var b = lowPivots[lowPivots.length - 1].price;
      if (b > a * 1.005) add(bull, 'ev.higherLows', 2, { a: fmtP(a, lang), b: fmtP(b, lang) });
    }
    var highPivots = pivots.highs.slice(-3);
    if (highPivots.length >= 2) {
      var ha = highPivots[highPivots.length - 2].price;
      var hb = highPivots[highPivots.length - 1].price;
      if (hb < ha * 0.995) add(bear, 'ev.lowerHighs', 2, { a: fmtP(ha, lang), b: fmtP(hb, lang) });
    }
    if (U.isNum(drawdown)) {
      if (drawdown < -18) add(bear, 'ev.deepDrawdown', 1, { dd: fmtPct(Math.abs(drawdown), false), window: windowBars, high: fmtP(stats.high, lang) });
      else if (drawdown > -3) add(bull, 'ev.nearHighs', 2, { dd: fmtPct(Math.abs(drawdown), false), window: windowBars, high: fmtP(stats.high, lang) });
    }

    function rank(list) {
      return list.slice().sort(function (x, y) {
        if (y.weight !== x.weight) return y.weight - x.weight;
        return x.key.localeCompare(y.key);
      });
    }
    bull = rank(bull).slice(0, 4);
    bear = rank(bear).slice(0, 4);
    if (!bull.length) add(bull, 'ev.noBull', 1, {});
    if (!bear.length) add(bear, 'ev.noBear', 1, {});

    var bullScore = U.sum(bull.map(function (e) { return e.weight; }));
    var bearScore = U.sum(bear.map(function (e) { return e.weight; }));
    var totalEvidence = bullScore + bearScore;
    var net = bullScore - bearScore;
    var ratio = totalEvidence ? net / totalEvidence : 0;

    var dir = ratio > 0.1 ? 'bull' : ratio < -0.1 ? 'bear' : 'neutral';
    var confidence = 'medium';
    if (totalEvidence < 7) confidence = 'low';
    else if (Math.abs(ratio) >= 0.38 || (dir === 'neutral' && totalEvidence >= 10)) confidence = 'high';
    else confidence = 'medium';

    /* ---------------- scenarios ---------------- */
    var sLevel = nearestSupport;
    var rLevel = nearestResistance;
    var scenarios = [
      {
        kind: 'base',
        titleKey: 'an.sc.base.title',
        descKey: 'an.sc.base.desc',
        params: { s: sLevel.priceText, r: rLevel.priceText, s2: nextSupport.priceText, r2: nextResistance.priceText },
        triggerKey: 'an.sc.base.trigger',
        strengthenKey: 'an.sc.base.strengthen',
        invalidKey: 'an.sc.base.invalidate',
        params2: { s: sLevel.priceText, r: rLevel.priceText }
      },
      {
        kind: 'bull',
        titleKey: 'an.sc.bull.title',
        descKey: 'an.sc.bull.desc',
        params: { r: rLevel.priceText, r2: nextResistance.priceText },
        triggerKey: 'an.sc.bull.trigger',
        strengthenKey: 'an.sc.bull.strengthen',
        invalidKey: 'an.sc.bull.invalidate',
        params2: { r: rLevel.priceText }
      },
      {
        kind: 'bear',
        titleKey: 'an.sc.bear.title',
        descKey: 'an.sc.bear.desc',
        params: { s: sLevel.priceText, s2: nextSupport.priceText },
        triggerKey: 'an.sc.bear.trigger',
        strengthenKey: 'an.sc.bear.strengthen',
        invalidKey: 'an.sc.bear.invalidate',
        params2: { s: sLevel.priceText }
      }
    ];

    /* ---------------- risks ---------------- */
    var risks = [];
    function risk(key, sev, tag, params) {
      risks.push({ key: key, sev: sev, tag: tag, params: params || {} });
    }
    if (volKey === 'vol.high') {
      risk('risk.vol_high', 'high', 'market', {
        vol: fmtPct(vol30, false, 0),
        pct: volPctRank != null ? Math.round(volPctRank * 100) : '—',
        n: n
      });
    } else if (volKey === 'vol.elevated') {
      risk('risk.vol_elevated', 'medium', 'market', { vol: fmtPct(vol30, false, 0) });
    } else if (volKey === 'vol.low') {
      risk('risk.vol_low', 'low', 'market', { vol: fmtPct(vol30, false, 0) });
    }
    risk('risk.event', 'medium', 'event', {});
    if (meta.dataMode === 'sample') risk('risk.data_sample', 'high', 'data', {});
    else risk('risk.data_delay', 'medium', 'data', {});
    if (asset.assetClass === 'stock') risk('risk.fundamentals', 'medium', 'data', {});
    risk('risk.news', 'medium', 'data', {});
    if (liqKey === 'liq.thin') risk('risk.thin_liquidity', 'medium', 'market', { dv: fmtVol(dollarVolume, lang) });
    if (U.isNum(maxGap) && maxGap > 2.2) risk('risk.gap', 'medium', 'market', { gap: fmtPct(maxGap, false) });
    if (n < 120) risk('risk.short_history', 'low', 'data', { n: n });
    if (U.isNum(rsi) && U.isNum(sma20) && atrLast) {
      var stretch = Math.abs(price - sma20) / atrLast;
      if ((rsi > 75 || rsi < 25) && stretch > 2) {
        risk('risk.stretched', 'medium', 'market', {
          rsi: rsi.toFixed(0),
          dist: fmtPct(Math.abs(price / sma20 - 1) * 100, false)
        });
      }
    }
    // Options are always unavailable in this MVP; surface it where it matters.
    risk('risk.options', 'low', 'data', {});
    risk('risk.model', 'low', 'model', {});

    var sevOrder = { high: 0, medium: 1, low: 2 };
    risks.sort(function (x, y) { return sevOrder[x.sev] - sevOrder[y.sev]; });
    risks = risks.slice(0, 6);

    /* ---------------- session + lens facts ---------------- */
    var session;
    if (asset.assetClass === 'crypto') {
      session = { key: 'session.crypto247', state: '247' };
    } else {
      var ses = U.usSession();
      session = {
        key: 'session.' + ses.state,
        state: ses.state,
        nyLabel: ses.label
      };
    }
    var dailySigmaPct = U.isNum(atrPct) ? atrPct : (U.isNum(vol30) ? vol30 / Math.sqrt(barsPerYear) : 2);
    var typicalRange = price * dailySigmaPct / 100;
    var move30 = U.isNum(vol30) ? price * (vol30 / 100) * Math.sqrt(30 / 365) : null;
    var nearestDist = Math.min(
      nearestSupport ? nearestSupport.distPct : 99,
      nearestResistance ? nearestResistance.distPct : 99
    );

    var facts = {
      price: price,
      priceText: priceLabel,
      changePct: quote.changePct,
      changeText: fmtPct(quote.changePct, true),
      changeWindow: quote.changeWindow || '1d',
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      dayHighText: U.isNum(quote.dayHigh) ? fmtP(quote.dayHigh, lang) : '—',
      dayLowText: U.isNum(quote.dayLow) ? fmtP(quote.dayLow, lang) : '—',
      prevCloseText: U.isNum(quote.prevClose) ? fmtP(quote.prevClose, lang) : '—',
      volumeText: U.isNum(quote.volume) ? fmtVol(quote.volume, lang) : '—',
      marketCapText: U.isNum(quote.marketCap) ? fmtVol(quote.marketCap, lang) : null,
      turnoverText: U.isNum(quote.turnover) ? fmtPct(quote.turnover, false, 2) : null,
      dollarVolumeText: U.isNum(dollarVolume) ? fmtVol(dollarVolume, lang) : null,
      sma20: sma20, sma50: sma50, longSma: longSma, longLen: longLen,
      sma20Text: U.isNum(sma20) ? fmtP(sma20, lang) : '—',
      sma50Text: U.isNum(sma50) ? fmtP(sma50, lang) : '—',
      longSmaText: U.isNum(longSma) ? fmtP(longSma, lang) : '—',
      rsi: rsi,
      rsiText: rsi.toFixed(0),
      slope20: slope20,
      ret20: ret20,
      ret20Text: U.isNum(ret20) ? fmtPct(ret20, true) : '—',
      ret60: ret60,
      vol30: vol30,
      vol30Text: U.isNum(vol30) ? fmtPct(vol30, false, 0) : '—',
      volPctRank: volPctRank,
      volPctText: volPctRank != null ? String(Math.round(volPctRank * 100)) : '—',
      atr: atrLast,
      atrPctNum: atrPct,
      atrText: U.isNum(atrLast) ? fmtP(atrLast, lang) : '—',
      atrPctText: U.isNum(atrPct) ? fmtPct(atrPct, false) : '—',
      relVol: relVol,
      relVolText: U.isNum(relVol) ? relVol.toFixed(2) + '×' : '—',
      drawdownText: U.isNum(drawdown) ? fmtPct(drawdown, false) : '—',
      fromLowText: U.isNum(fromLow) ? fmtPct(fromLow, true) : '—',
      rangeHighText: fmtP(stats.high, lang),
      rangeLowText: fmtP(stats.low, lang),
      windowBars: windowBars,
      posInRange: stats.high > stats.low ? (price - stats.low) / (stats.high - stats.low) * 100 : null,
      typicalRangeText: fmtP(typicalRange, lang),
      typicalRangePctText: fmtPct(dailySigmaPct, false),
      expectedMoveText: move30 ? fmtP(move30, lang) : '—',
      moveLoText: move30 ? fmtP(price - move30, lang) : '—',
      moveHiText: move30 ? fmtP(price + move30, lang) : '—',
      nearestDistText: fmtPct(nearestDist, false),
      barsPerYear: barsPerYear,
      intraday: intraday,
      grainText: meta.grainNote || ''
    };

    return {
      engine: ENGINE,
      asset: asset,
      meta: meta,
      lang: lang,
      facts: facts,
      trend: {
        key: trendKey, score: score, strengthPct: trendStrength,
        noteParams: { d: distSma50 != null ? fmtPct(distSma50, true) : '—' },
        aboveSma20: U.isNum(sma20) ? price > sma20 : null,
        aboveSma50: U.isNum(sma50) ? price > sma50 : null
      },
      momentum: { key: momKey, rsi: rsi, ret20: ret20, noteParams: { ret: facts.ret20Text, rsi: rsi.toFixed(0) } },
      volatility: {
        key: volKey, vol: vol30, pctRank: volPctRank, atrPct: atrPct,
        meter: volPctRank != null ? volPctRank * 100 : U.clamp((vol30 || 0) / 100 * 100, 0, 100),
        noteParams: { vol: facts.vol30Text, pct: facts.volPctText, n: n }
      },
      liquidity: {
        key: liqKey, meter: liqMeter, dollarVolume: dollarVolume,
        noteParams: { dv: facts.dollarVolumeText || '—' },
        sampleStock: asset.assetClass === 'stock' && meta.dataMode === 'sample'
      },
      session: session,
      evidence: { bull: bull, bear: bear, bullScore: bullScore, bearScore: bearScore },
      lean: { dir: dir, confidence: confidence, ratio: ratio, total: totalEvidence },
      levels: levelsOut,
      nearestSupport: nearestSupport,
      nextSupport: nextSupport,
      nearestResistance: nearestResistance,
      nextResistance: nextResistance,
      scenarios: scenarios,
      risks: risks,
      chart: {
        times: candles.map(function (c) { return c.t; }),
        closes: closes,
        sma20: sma20Arr,
        sma50: sma50Arr,
        levels: levels.slice(0, 3).map(function (c) { return { price: c.price, kind: c.kind }; }),
        sample: meta.dataMode === 'sample',
        interval: meta.interval
      },
      generatedAt: Date.now()
    };
  }

  TA.analysis = { build: build };
})(window.TA = window.TA || {});
