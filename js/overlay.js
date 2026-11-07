/* overlay.js — screen-share chart reads, on-device. Capture, crop and scan only; nothing is uploaded. */
(function (TA) {
  'use strict';
  var U = TA.util;

  var MAX_W = 900;
  var MAX_PIXELS = 1200000;
  var INTERVAL_MS = 4000;

  var capture = { stream: null, video: null, since: null };
  var canvas = null;

  var SUPPORT = '#3ddc97';
  var RESIST = '#ff5c8a';
  var MARK = '#ff2fd0';
  var FRAME = 'rgba(41,224,255,0.8)';

  function supported() {
    return !!(typeof navigator !== 'undefined' && navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function');
  }

  function pipSupported() {
    return typeof documentPictureInPicture !== 'undefined' &&
      typeof documentPictureInPicture.requestWindow === 'function';
  }

  function active() {
    return !!capture.stream;
  }

  function fail(code) {
    var err = new Error(code);
    err.code = code;
    return err;
  }

  function start() {
    if (!supported()) return Promise.reject(fail('unsupported'));
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10 },
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include'
    }).then(function (stream) {
      capture.stream = stream;
      capture.since = Date.now();
      return stream;
    });
  }

  function attach(video, stream) {
    capture.video = video || null;
    if (!video || !stream) return;
    video.srcObject = stream;
    var played = video.play();
    if (played && played.catch) played.catch(function () {});
  }

  function stop() {
    if (capture.stream) {
      capture.stream.getTracks().forEach(function (track) {
        try { track.stop(); } catch (e) {}
      });
    }
    if (capture.video) {
      try { capture.video.srcObject = null; } catch (e) {}
    }
    capture.stream = null;
    capture.video = null;
    capture.since = null;
    canvas = null;
  }

  function frame(video) {
    var w = video && video.videoWidth;
    var h = video && video.videoHeight;
    if (!w || !h) return null;
    var scale = Math.min(1, MAX_W / w);
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));
    if (tw * th > MAX_PIXELS) {
      var shrink = Math.sqrt(MAX_PIXELS / (tw * th));
      tw = Math.max(1, Math.round(tw * shrink));
      th = Math.max(1, Math.round(th * shrink));
    }
    canvas = canvas || document.createElement('canvas');
    if (canvas.width !== tw) canvas.width = tw;
    if (canvas.height !== th) canvas.height = th;
    var g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(video, 0, 0, tw, th);
    return g.getImageData(0, 0, tw, th);
  }

  function read(video) {
    if (!TA.chartread) return { ok: false, reason: 'unavailable' };
    var image = frame(video);
    if (!image) return { ok: false, reason: 'no-frame' };
    var scan = TA.chartread.scan(image);
    if (!scan.ok) return { ok: false, reason: scan.reason };
    return { ok: true, scan: scan, at: Date.now() };
  }

  function model(scan) {
    if (!scan || !scan.ok) return null;
    return {
      direction: scan.direction,
      quality: scan.quality,
      confidence: Math.round(scan.confidence * 100),
      position: Math.round(scan.positionPct),
      support: Math.round(scan.levels.supportPct),
      resistance: Math.round(scan.levels.resistancePct),
      chartType: scan.chartType,
      width: scan.width,
      height: scan.height,
      plot: scan.plot,
      caveats: (scan.caveats || []).slice()
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // Draws the read over a captured frame; coordinates scale from the scanned frame to the target canvas.
  function draw(ctx, scan, w, h) {
    if (!ctx) return;
    w = w || (scan && scan.width) || 0;
    h = h || (scan && scan.height) || 0;
    ctx.clearRect(0, 0, w, h);
    if (!scan || !scan.ok || !w || !h) return;

    var sx = w / scan.width;
    var sy = h / scan.height;
    var plot = scan.plot;
    var left = plot.x * sx;
    var top = plot.y * sy;
    var pw = plot.w * sx;
    var ph = plot.h * sy;
    var line = Math.max(1, Math.round(w / 640));
    var font = '700 ' + Math.round(Math.max(10, w / 58)) + 'px "Segoe UI", system-ui, sans-serif';

    ctx.save();
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = line;
    if (ctx.setLineDash) ctx.setLineDash([6, 4]);
    ctx.strokeRect(left, top, pw, ph);
    if (ctx.setLineDash) ctx.setLineDash([]);

    function level(pct, color, label) {
      if (!U.isNum(pct)) return;
      var y = top + (1 - clamp(pct / 100, 0, 1)) * ph;
      ctx.strokeStyle = color;
      ctx.lineWidth = line;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + pw, y);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, left + line * 2, y - line);
    }
    level(scan.levels.supportPct, SUPPORT, 'S');
    level(scan.levels.resistancePct, RESIST, 'R');

    var markerY = top + (1 - clamp(scan.positionPct / 100, 0, 1)) * ph;
    ctx.fillStyle = MARK;
    ctx.beginPath();
    ctx.arc(left + pw - line * 3, markerY, Math.max(3, w / 150), 0, Math.PI * 2);
    ctx.fill();

    var up = scan.direction === 'up';
    var flat = scan.direction === 'flat';
    var tone = flat ? '#ffc857' : up ? SUPPORT : RESIST;
    var label = (flat ? '\u2192 ' : up ? '\u2191 ' : '\u2193 ') + Math.round(scan.confidence * 100) + '%';
    var size = Math.round(Math.max(11, w / 52));
    ctx.font = '700 ' + size + 'px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    var tw = ctx.measureText(label).width;
    var bw = tw + size * 1.4;
    var bh = size * 1.8;
    ctx.fillStyle = 'rgba(7,4,14,0.72)';
    ctx.fillRect(left + line * 2, top + line * 2, bw, bh);
    ctx.strokeStyle = tone;
    ctx.lineWidth = line;
    ctx.strokeRect(left + line * 2, top + line * 2, bw, bh);
    ctx.fillStyle = tone;
    ctx.fillText(label, left + line * 2 + size * 0.7, top + line * 2 + size * 0.35);
    ctx.restore();
  }

  TA.overlay = {
    intervalMs: INTERVAL_MS,
    maxWidth: MAX_W,
    supported: supported,
    pipSupported: pipSupported,
    active: active,
    start: start,
    attach: attach,
    stop: stop,
    frame: frame,
    read: read,
    model: model,
    draw: draw
  };
})(window.TA = window.TA || {});
