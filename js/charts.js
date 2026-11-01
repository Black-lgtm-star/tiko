/* charts.js — dependency-free SVG price chart + sparkline */
(function (TA) {
  'use strict';
  var U = TA.util;

  function axisPrice(v) {
    var a = Math.abs(v);
    if (a >= 100000) return (v / 1000).toFixed(0) + 'k';
    if (a >= 10000) return (v / 1000).toFixed(1) + 'k';
    if (a >= 1000) return (v / 1000).toFixed(2) + 'k';
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(4);
  }

  function linePath(points) {
    var d = '';
    for (var i = 0; i < points.length; i++) {
      d += (i ? 'L' : 'M') + points[i][0].toFixed(1) + ',' + points[i][1].toFixed(1);
    }
    return d;
  }

  TA.charts = {
    price: function (model) {
      var W = model.width || 760, H = model.height || 300;
      var pad = { l: 8, r: 76, t: 18, b: 30 };
      var closes = model.closes || [];
      if (closes.length < 2) {
        return '<div class="empty" style="height:100%">' + U.esc(model.emptyText || 'Not enough data') + '</div>';
      }
      var times = model.times || [];
      var vals = closes.slice();
      [model.sma20, model.sma50].forEach(function (arr) {
        if (arr) arr.forEach(function (v) { if (U.isNum(v)) vals.push(v); });
      });
      if (U.isNum(model.quotePrice) && model.quotePrice > 0) vals.push(model.quotePrice);
      (model.levels || []).forEach(function (l) { if (U.isNum(l.price)) vals.push(l.price); });

      var min = Math.min.apply(null, vals);
      var max = Math.max.apply(null, vals);
      if (!isFinite(min) || !isFinite(max) || min === max) { min = min * 0.98; max = max * 1.02; }
      var span = max - min;
      min -= span * 0.06;
      max += span * 0.06;

      function x(i) {
        return pad.l + (i / (closes.length - 1)) * (W - pad.l - pad.r);
      }
      function y(v) {
        return pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
      }

      var pts = closes.map(function (v, i) { return [x(i), y(v)]; });
      var d = linePath(pts);
      var area = d + 'L' + x(closes.length - 1).toFixed(1) + ',' + (H - pad.b) +
        'L' + x(0).toFixed(1) + ',' + (H - pad.b) + 'Z';

      var grid = '';
      for (var g = 0; g <= 3; g++) {
        var gv = min + (max - min) * (g / 3);
        var gy = y(gv);
        grid += '<line x1="' + pad.l + '" y1="' + gy.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + gy.toFixed(1) +
          '" stroke="rgba(160,150,220,0.12)" stroke-width="1"/>' +
          '<text x="' + (W - pad.r + 8) + '" y="' + (gy + 3.5).toFixed(1) +
          '" fill="#776c9c" font-size="10.5" font-family="ui-monospace,monospace">' + axisPrice(gv) + '</text>';
      }

      var smaPaths = '';
      if (model.sma20) {
        var p20 = [];
        model.sma20.forEach(function (v, i) { if (U.isNum(v)) p20.push([x(i), y(v)]); });
        if (p20.length > 1) {
          smaPaths += '<path d="' + linePath(p20) + '" fill="none" stroke="#29e0ff" stroke-width="1.4" stroke-opacity="0.8"/>';
        }
      }
      if (model.sma50) {
        var p50 = [];
        model.sma50.forEach(function (v, i) { if (U.isNum(v)) p50.push([x(i), y(v)]); });
        if (p50.length > 1) {
          smaPaths += '<path d="' + linePath(p50) + '" fill="none" stroke="#c084fc" stroke-width="1.3" stroke-opacity="0.75" stroke-dasharray="4 4"/>';
        }
      }

      var levels = '';
      (model.levels || []).slice(0, 4).forEach(function (l) {
        if (!U.isNum(l.price) || l.price < min || l.price > max) return;
        var ly = y(l.price);
        var color = l.kind === 'support' ? '#3ddc97' : l.kind === 'resistance' ? '#ff5c8a' : '#9b8dbd';
        levels += '<line x1="' + pad.l + '" y1="' + ly.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + ly.toFixed(1) +
          '" stroke="' + color + '" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="2 5"/>' +
          '<rect x="' + (W - pad.r + 4) + '" y="' + (ly - 7).toFixed(1) + '" width="66" height="14" rx="3" fill="' +
          color + '" fill-opacity="0.12" stroke="' + color + '" stroke-opacity="0.24"/>' +
          '<text x="' + (W - pad.r + 8) + '" y="' + (ly + 3.3).toFixed(1) + '" fill="' + color +
          '" font-size="9.5" font-family="ui-monospace,monospace">' + U.esc(U.fmtPrice(l.price, '', model.lang)) + '</text>';
      });

      var xlabels = '';
      var count = 4;
      for (var k = 0; k < count; k++) {
        var idx = Math.round((closes.length - 1) * (k / (count - 1)));
        var t = times[idx];
        if (!t) continue;
        var label = model.interval === 'intraday'
          ? U.fmtTime(t, model.lang)
          : U.fmtDate(t, model.lang, { month: 'short', day: 'numeric' });
        var anchor = k === 0 ? 'start' : k === count - 1 ? 'end' : 'middle';
        var tx = k === 0 ? pad.l : k === count - 1 ? W - pad.r : x(idx);
        xlabels += '<text x="' + tx.toFixed(1) + '" y="' + (H - 8) + '" fill="#776c9c" font-size="10" text-anchor="' +
          anchor + '" font-family="ui-monospace,monospace">' + U.esc(label) + '</text>';
      }

      var last = pts[pts.length - 1];
      var lastVal = closes[closes.length - 1];
      var quoteDiffers = U.isNum(model.quotePrice) && model.quotePrice > 0 &&
        Math.abs(model.quotePrice - lastVal) > Math.max(Math.abs(lastVal) * 0.000001, 1e-10);
      var quoteY = quoteDiffers ? y(model.quotePrice) : null;
      var up = closes[closes.length - 1] >= closes[0];
      var stroke = up ? '#3ddc97' : '#ff5c8a';
      var watermark = model.sample
        ? '<text x="' + (W / 2) + '" y="' + (H / 2 + 10) + '" fill="#ffc857" fill-opacity="0.10" font-size="46" font-weight="700" letter-spacing="6" text-anchor="middle" transform="rotate(-14 ' + (W / 2) + ' ' + (H / 2) + ')">SAMPLE DATA</text>'
        : '';
      var quoteMark = quoteDiffers
        ? '<line x1="' + pad.l + '" y1="' + quoteY.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + quoteY.toFixed(1) + '" stroke="#f5f0ff" stroke-opacity="0.34" stroke-width="1" stroke-dasharray="5 4"/>' +
          '<circle cx="' + last[0].toFixed(1) + '" cy="' + quoteY.toFixed(1) + '" r="3.8" fill="#f5f0ff" stroke="#07040e" stroke-width="1.5"/>' +
          '<text x="' + (W - pad.r - 5) + '" y="' + (quoteY - 6).toFixed(1) + '" fill="#f5f0ff" font-size="9.5" text-anchor="end" font-family="ui-monospace,monospace">' +
          U.esc(model.quoteLabel || 'Current') + ': ' + U.esc(model.quoteText || axisPrice(model.quotePrice)) + '</text>'
        : '';

      return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Price chart">' +
        '<title>' + U.esc(model.quoteLabel || 'Current price') + ': ' + U.esc(model.quoteText || axisPrice(U.isNum(model.quotePrice) ? model.quotePrice : lastVal)) + '</title>' +
        '<desc>' + U.esc(model.closeLabel || 'Last plotted close') + ': ' + U.esc(U.fmtPrice(lastVal, '', model.lang)) +
          (quoteDiffers ? '. ' + U.esc(model.quoteLabel || 'Current price') + ': ' + U.esc(model.quoteText || axisPrice(model.quotePrice)) : '') + '</desc>' +
        '<defs><linearGradient id="fill-' + (model.uid || 'x') + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + stroke + '" stop-opacity="0.18"/>' +
        '<stop offset="100%" stop-color="' + stroke + '" stop-opacity="0"/>' +
        '</linearGradient></defs>' +
        grid + watermark +
        '<path d="' + area + '" fill="url(#fill-' + (model.uid || 'x') + ')"/>' +
        smaPaths + levels + quoteMark +
        '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.2" fill="' + stroke + '"/>' +
        '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="7" fill="' + stroke + '" fill-opacity="0.16"/>' +
        '<text x="' + (last[0] - 6).toFixed(1) + '" y="' + (last[1] - 10).toFixed(1) +
        '" fill="#f5f0ff" font-size="10.5" text-anchor="end" font-family="ui-monospace,monospace" font-weight="600">' +
        U.esc(model.lastLabel || axisPrice(lastVal)) + '</text>' +
        xlabels + '</svg>';
    },

    spark: function (values, w, h) {
      w = w || 84; h = h || 26;
      var vals = (values || []).filter(U.isNum);
      if (vals.length < 2) return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"></svg>';
      var min = Math.min.apply(null, vals);
      var max = Math.max.apply(null, vals);
      if (min === max) { min -= 1; max += 1; }
      var pts = vals.map(function (v, i) {
        return [
          (i / (vals.length - 1)) * (w - 2) + 1,
          h - 2 - ((v - min) / (max - min)) * (h - 4)
        ];
      });
      var up = vals[vals.length - 1] >= vals[0];
      var color = up ? '#3ddc97' : '#ff5c8a';
      var d = linePath(pts);
      var area = d + 'L' + (w - 1) + ',' + h + 'L1,' + h + 'Z';
      return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
        '<path d="' + area + '" fill="' + color + '" fill-opacity="0.08"/>' +
        '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    }
  };
})(window.TA = window.TA || {});
