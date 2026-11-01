/* chartread.js — deterministic on-device chart screenshot reader.
   Pure RGBA pixel analysis: no OCR, no network, no third-party code.
   It describes the visible shape (direction, range, position, crowding) and
   never invents prices, tickers or timeframes it cannot read. */
(function (TA) {
  'use strict';

  var MIN_SIDE = 40;
  var MAX_PIXELS = 2600000;
  var INK_DIST2 = 42 * 42;
  var INK_LUM = 34;
  var SAT_MIN = 46;
  var BUCKETS = 120;
  var BG_BINS = 4096;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function round(v, places) { var p = Math.pow(10, places || 0); return Math.round(v * p) / p; }

  function empty(reason, width, height) {
    return {
      ok: false, reason: reason, width: width || 0, height: height || 0,
      caveats: ['shape-only']
    };
  }

  function luminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

  function modalColor(data, W, x0, y0, x1, y1) {
    var counts = new Uint32Array(BG_BINS);
    var sr = new Float64Array(BG_BINS);
    var sg = new Float64Array(BG_BINS);
    var sb = new Float64Array(BG_BINS);
    var seen = 0;
    for (var y = y0; y <= y1; y++) {
      var row = y * W * 4;
      for (var x = x0; x <= x1; x++) {
        var i = row + x * 4;
        if (data[i + 3] < 24) continue;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        counts[key]++;
        sr[key] += r;
        sg[key] += g;
        sb[key] += b;
        seen++;
      }
    }
    if (!seen) return null;
    var best = 0, bestCount = 0;
    for (var k = 0; k < BG_BINS; k++) {
      if (counts[k] > bestCount) { bestCount = counts[k]; best = k; }
    }
    return {
      r: sr[best] / bestCount,
      g: sg[best] / bestCount,
      b: sb[best] / bestCount,
      share: bestCount / seen
    };
  }

  function classify(data, i, bg, bgLum) {
    var r = data[i], g = data[i + 1], b = data[i + 2];
    var dr = r - bg.r, dg = g - bg.g, db = b - bg.b;
    var dist2 = dr * dr + dg * dg + db * db;
    var lum = luminance(r, g, b);
    var ink = dist2 > INK_DIST2 || Math.abs(lum - bgLum) > INK_LUM;
    if (!ink) return { ink: false, colored: false };
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    return {
      ink: true,
      colored: max - min >= SAT_MIN && dist2 > INK_DIST2,
      r: r, g: g, b: b, lum: lum, max: max, min: min
    };
  }

  function collect(data, W, H, x0, y0, x1, y1, bg) {
    var inkX = new Uint32Array(W);
    var inkY = new Uint32Array(H);
    var colX = new Uint32Array(W);
    var colY = new Uint32Array(H);
    var bgLum = luminance(bg.r, bg.g, bg.b);
    var inkTotal = 0, colTotal = 0;
    for (var y = y0; y <= y1; y++) {
      var row = y * W * 4;
      for (var x = x0; x <= x1; x++) {
        var i = row + x * 4;
        if (data[i + 3] < 24) continue;
        var c = classify(data, i, bg, bgLum);
        if (!c.ink) continue;
        inkTotal++;
        inkX[x]++;
        inkY[y]++;
        if (c.colored) {
          colTotal++;
          colX[x]++;
          colY[y]++;
        }
      }
    }
    return {
      inkX: inkX, inkY: inkY, colX: colX, colY: colY,
      inkTotal: inkTotal, colTotal: colTotal, bgLum: bgLum
    };
  }

  function percentileSpan(counts, total, loP, hiP, limit) {
    if (!total) return null;
    var acc = 0, lo = -1, hi = -1;
    var loT = total * loP, hiT = total * hiP;
    for (var i = 0; i < limit; i++) {
      acc += counts[i];
      if (lo < 0 && acc >= loT) lo = i;
      if (acc >= hiT) { hi = i; break; }
    }
    if (lo < 0) lo = 0;
    if (hi < 0) hi = limit - 1;
    return [lo, hi];
  }

  function hueOf(r, g, b) {
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var delta = max - min;
    if (!delta) return -1;
    var h;
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
    return h;
  }

  function median(values) {
    if (!values.length) return null;
    return values[values.length >> 1];
  }

  function readColumns(data, W, x0, x1, y0, y1, bg) {
    var bgLum = luminance(bg.r, bg.g, bg.b);
    var cols = [];
    var bull = 0, bear = 0;
    for (var x = x0; x <= x1; x++) {
      var ys = [], cys = [];
      var cr = 0, cg = 0, cb = 0;
      var run = 0, maxRun = 0;
      for (var y = y0; y <= y1; y++) {
        var i = (y * W + x) * 4;
        if (data[i + 3] < 24) { run = 0; continue; }
        var c = classify(data, i, bg, bgLum);
        if (!c.ink) { run = 0; continue; }
        ys.push(y);
        run++;
        if (run > maxRun) maxRun = run;
        if (c.colored) {
          cys.push(y);
          cr += c.r; cg += c.g; cb += c.b;
        }
      }
      var tint = null;
      if (cys.length >= 2) {
        var hue = hueOf(cr / cys.length, cg / cys.length, cb / cys.length);
        if (hue >= 60 && hue <= 175) tint = 'up';
        else if (hue >= 300 || hue <= 40) tint = 'down';
        else tint = 'neutral';
        if (tint === 'up') bull++;
        else if (tint === 'down') bear++;
      }
      cols.push({
        x: x,
        inkY: ys.length ? median(ys) : null,
        colorY: cys.length ? median(cys) : null,
        hasInk: ys.length > 0,
        hasColor: cys.length > 0,
        colored: cys.length,
        maxRun: maxRun,
        tint: tint
      });
    }
    var colorCols = 0;
    for (var i = 0; i < cols.length; i++) if (cols[i].hasColor) colorCols++;
    var source = cols.length && colorCols / cols.length >= 0.2 ? 'color' : 'ink';
    for (var j = 0; j < cols.length; j++) {
      var col = cols[j];
      col.has = source === 'color' ? col.hasColor : col.hasInk;
      col.y = source === 'color' ? col.colorY : col.inkY;
    }
    return { cols: cols, bull: bull, bear: bear, source: source };
  }

  function resample(cols, buckets) {
    var start = -1, end = -1;
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].has) { if (start < 0) start = i; end = i; }
    }
    if (start < 0 || end <= start) return null;
    var width = end - start + 1;
    var dense = new Array(width);
    var gap = 0;
    for (var j = 0; j < width; j++) {
      var c = cols[start + j];
      dense[j] = c && c.has ? c.y : null;
      if (dense[j] == null) gap++;
    }
    var n = Math.min(buckets, width);
    var series = [];
    for (var b = 0; b < n; b++) {
      var a0 = Math.floor((b * width) / n);
      var a1 = Math.max(a0 + 1, Math.floor(((b + 1) * width) / n)) - 1;
      var sum = 0, count = 0;
      for (var k = a0; k <= a1 && k < width; k++) {
        if (dense[k] != null) { sum += dense[k]; count++; }
      }
      series.push(count ? sum / count : null);
    }
    for (var p = 0; p < series.length; p++) {
      if (series[p] != null) continue;
      var prev = -1, next = -1;
      for (var q = p - 1; q >= 0; q--) if (series[q] != null) { prev = q; break; }
      for (var r = p + 1; r < series.length; r++) if (series[r] != null) { next = r; break; }
      if (prev >= 0 && next >= 0 && next - prev <= 3) {
        series[p] = series[prev] + ((series[next] - series[prev]) * (p - prev)) / (next - prev);
      }
    }
    return { series: series.filter(function (v) { return v != null; }), gapRatio: gap / width };
  }

  function regression(values) {
    var n = values.length;
    if (n < 2) return { slope: 0, r2: 0 };
    var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (var i = 0; i < n; i++) {
      sx += i; sy += values[i];
      sxx += i * i; sxy += i * values[i]; syy += values[i] * values[i];
    }
    var denom = n * sxx - sx * sx;
    var slope = denom ? (n * sxy - sx * sy) / denom : 0;
    var intercept = (sy - slope * sx) / n;
    var ssRes = 0;
    for (var j = 0; j < n; j++) {
      var d = values[j] - (intercept + slope * j);
      ssRes += d * d;
    }
    var mean = sy / n;
    var ssTot = syy - n * mean * mean;
    return { slope: slope, r2: ssTot > 0 ? clamp(1 - ssRes / ssTot, 0, 1) : 0 };
  }

  function touches(values, level) {
    var n = 0;
    for (var i = 0; i < values.length; i++) {
      if (Math.abs(values[i] - level) <= 0.02) n++;
    }
    return n;
  }

  function metrics(values, plotH) {
    var n = values.length;
    if (n < 8 || plotH <= 0) return null;
    var min = values[0], max = values[0];
    for (var i = 0; i < n; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    var reg = regression(values);
    var span = max - min;
    var net = reg.slope * (n - 1);
    var direction = 'flat';
    if (span >= 0.08 && Math.abs(net) >= 0.05 && Math.abs(net) / span >= 0.25) {
      direction = net > 0 ? 'up' : 'down';
    }
    var diffs = 0, diffSq = 0;
    for (var j = 1; j < n; j++) {
      var d = values[j] - values[j - 1];
      diffs += d;
      diffSq += d * d;
    }
    var meanDiff = diffs / Math.max(1, n - 1);
    var variance = Math.max(0, diffSq / Math.max(1, n - 1) - meanDiff * meanDiff);
    var recentIdx = Math.max(0, Math.floor(n * 0.8));
    var last = values[n - 1];
    var support = min, resistance = max;
    return {
      direction: direction,
      netPct: round(net * 100, 1),
      spanPct: round(span * 100, 1),
      positionPct: round(clamp(last * 100, 0, 100), 1),
      recentPct: round((last - values[recentIdx]) * 100, 1),
      volatilityPct: round(Math.sqrt(variance) * 100, 2),
      trend: {
        slopePct: round(reg.slope * 100, 3),
        r2: round(reg.r2, 2),
        strength: Math.round(clamp(Math.abs(net) * 120 + reg.r2 * 40, 0, 100))
      },
      levels: {
        supportPct: round(clamp(support * 100, 0, 100), 1),
        resistancePct: round(clamp(resistance * 100, 0, 100), 1),
        supportTouches: touches(values, support),
        resistanceTouches: touches(values, resistance)
      }
    };
  }

  function scan(image, opts) {
    opts = opts || {};
    var W = image && Math.round(image.width);
    var H = image && Math.round(image.height);
    var data = image && image.data;
    if (!data || !W || !H) return empty('no-image');
    if (W < MIN_SIDE || H < MIN_SIDE) return empty('too-small', W, H);
    if (data.length < W * H * 4) return empty('invalid', W, H);
    if (W * H > MAX_PIXELS) return empty('too-large', W, H);

    var bg = modalColor(data, W, 0, 0, W - 1, H - 1);
    if (!bg) return empty('no-series', W, H);
    var stats = collect(data, W, H, 0, 0, W - 1, H - 1, bg);

    var useColored = stats.colTotal >= Math.max(80, Math.round(W * H * 0.0005));
    var xSpan = percentileSpan(useColored ? stats.colX : stats.inkX, useColored ? stats.colTotal : stats.inkTotal, 0.005, 0.995, W);
    var ySpan = percentileSpan(useColored ? stats.colY : stats.inkY, useColored ? stats.colTotal : stats.inkTotal, 0.005, 0.995, H);
    if (!xSpan || !ySpan) return empty('no-series', W, H);

    var pad = 2;
    var x0 = clamp(xSpan[0] - pad, 0, W - 1);
    var x1 = clamp(xSpan[1] + pad, 0, W - 1);
    var y0 = clamp(ySpan[0] - pad, 0, H - 1);
    var y1 = clamp(ySpan[1] + pad, 0, H - 1);
    if (x1 - x0 < 24 || y1 - y0 < 12) {
      var inkX = percentileSpan(stats.inkX, stats.inkTotal, 0.005, 0.995, W);
      var inkY = percentileSpan(stats.inkY, stats.inkTotal, 0.005, 0.995, H);
      if (!inkX || !inkY) return empty('no-series', W, H);
      x0 = clamp(inkX[0] - pad, 0, W - 1);
      x1 = clamp(inkX[1] + pad, 0, W - 1);
      y0 = clamp(inkY[0] - pad, 0, H - 1);
      y1 = clamp(inkY[1] + pad, 0, H - 1);
    }
    if (x1 - x0 < Math.max(24, W * 0.4) || y1 - y0 < 12) return empty('no-series', W, H);

    var localBg = modalColor(data, W, x0, y0, x1, y1) || bg;
    var read = readColumns(data, W, x0, x1, y0, y1, localBg);
    var plotH = y1 - y0;
    var valid = read.cols.filter(function (c) { return c.has; });
    var coverage = valid.length / read.cols.length;
    if (valid.length < 8 || coverage < 0.35) return empty('no-series', W, H);

    var sampled = resample(read.cols, opts.maxBuckets || BUCKETS);
    if (!sampled || sampled.series.length < 8) return empty('no-series', W, H);
    var values = sampled.series.map(function (y) { return clamp((y1 - y) / plotH, 0, 1); });
    var m = metrics(values, plotH);
    if (!m) return empty('no-series', W, H);

    var coloredCols = read.cols.filter(function (c) { return c.colored >= 3; });
    var widths = coloredCols.map(function (c) { return c.maxRun; }).sort(function (a, b) { return a - b; });
    var medRun = widths.length ? widths[widths.length >> 1] : 0;
    var upShare = coloredCols.length ? read.bull / coloredCols.length : 0;
    var downShare = coloredCols.length ? read.bear / coloredCols.length : 0;
    var chartType = 'line';
    if (medRun >= 5 && upShare >= 0.1 && downShare >= 0.1) chartType = 'candles';
    else if (medRun >= 8) chartType = 'bars';

    var inkShare = (stats.inkTotal / (W * H));
    var expected = chartType === 'line' ? 0.95 : 0.55;
    var coverageScore = Math.min(1, coverage / expected);
    var confidence = 0.3 + coverageScore * 0.35 + Math.min(0.2, inkShare / 0.06 * 0.2);
    confidence += medRun >= 2 ? 0.1 : 0.03;
    confidence -= Math.min(0.15, Math.max(0, sampled.gapRatio - 0.2) * 0.6);
    confidence = round(clamp(confidence, 0.05, 0.95), 2);

    var caveats = ['shape-only', 'no-price-scale', 'no-timeframe', 'no-ticker'];
    if (sampled.gapRatio > 0.15 || confidence < 0.5) caveats.push('partial-series');
    if (chartType === 'candles' || chartType === 'bars') caveats.push('no-volume');

    return {
      ok: true,
      width: W,
      height: H,
      plot: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
      theme: stats.bgLum > 140 ? 'light' : 'dark',
      chartType: chartType,
      direction: m.direction,
      netPct: m.netPct,
      spanPct: m.spanPct,
      positionPct: m.positionPct,
      recentPct: m.recentPct,
      volatilityPct: m.volatilityPct,
      trend: m.trend,
      levels: m.levels,
      candles: { bull: read.bull, bear: read.bear },
      coverage: round(coverage, 2),
      confidence: confidence,
      quality: confidence >= 0.7 ? 'good' : confidence >= 0.45 ? 'fair' : 'poor',
      caveats: caveats
    };
  }

  TA.chartread = { scan: scan, version: 1 };
})(window.TA = window.TA || {});
