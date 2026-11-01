/* views/analysis.js — the seven-section read with style lenses */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };
  var lang = function () { return TA.i18n.get(); };

  var STYLES = ['day', 'swing', 'long', 'options', 'fx', 'beginner'];
  var cache = {};
  var seq = 0;

  function esc(s) { return U.esc(s); }
  function tone(dir) { return dir === 'bull' ? 'up' : dir === 'bear' ? 'down' : 'flat'; }

  function cacheKey(asset, style) {
    var s = TA.store.settings();
    var tf = style === 'day' ? 'intraday' : 'daily';
    return [asset.symbol, asset.coingeckoId || '', tf, s.dataMode,
      s.avKey ? s.avKey.slice(-6) : 'nokey', lang()].join('|');
  }

  function assetFromParams(params) {
    var found = TA.catalog.find(params.symbol);
    if (found) return found;
    if (params.cls === 'crypto' && params.id) {
      return {
        assetClass: 'crypto', symbol: U.normalizeSymbol(params.symbol),
        name: params.name || params.symbol, coingeckoId: params.id,
        currency: 'USD', exchange: 'Crypto · 24/7', barsPerYear: 365,
        px: 1, vol24: 0, shares: null
      };
    }
    if (params.cls === 'stock') {
      return {
        assetClass: 'stock', symbol: U.normalizeSymbol(params.symbol),
        name: params.name || params.symbol, currency: 'USD',
        exchange: params.exchange || 'U.S. listed', barsPerYear: 252,
        intradayStartMinute: 9 * 60 + 30, px: 120, vol: 0.62, drift: 0.08, vol24: 1e8, shares: null
      };
    }
    return null;
  }

  /* ---------------- section 01 ---------------- */
  function chartModel(a, uid, w, h) {
    var lastClose = a.chart.closes[a.chart.closes.length - 1];
    return {
      uid: uid, width: w, height: h,
      times: a.chart.times, closes: a.chart.closes,
      sma20: a.chart.sma20, sma50: a.chart.sma50,
      levels: a.chart.levels, sample: a.chart.sample,
      interval: a.chart.interval, lang: lang(),
      quotePrice: a.facts.price,
      quoteText: U.fmtPrice(a.facts.price, '$', lang()),
      quoteLabel: T('an.chart.current'),
      closeLabel: T('an.chart.last_close'),
      lastLabel: U.fmtPrice(lastClose, '$', lang()),
      emptyText: T('an.chart.empty')
    };
  }

  function snapshotSection(a) {
    var f = a.facts, m = a.meta;
    var change = f.changePct;
    var chgCls = U.isNum(change) ? (change > 0 ? 'badge-bull' : change < 0 ? 'badge-bear' : 'badge-neutral') : 'badge-neutral';
    var arrow = U.isNum(change) ? ui.icon(change >= 0 ? 'up' : 'down', 13) : '';
    var stamp = m.providerUpdatedAt || m.seriesEnd;
    var chart = TA.charts.price(chartModel(a, 'g' + Math.random().toString(36).slice(2, 8)));

    var kv = [
      [T('an.day_range'), f.dayLowText + ' – ' + f.dayHighText],
      [T('an.volume'), f.volumeText + (m.dataMode === 'sample' && a.asset.assetClass === 'stock' ? ' · sample' : '')],
      [T('an.prev_close'), f.prevCloseText],
      [T('an.snapshot.pct_from_high'), f.drawdownText]
    ];
    if (f.marketCapText) kv.push([T('an.mcap'), f.marketCapText]);
    if (f.turnoverText) kv.push([T('an.turnover'), f.turnoverText]);

    return '<section class="card section" style="margin-top:0" aria-labelledby="sec1">' +
      '<div class="section-head">' +
        '<span class="section-num">01</span>' +
        '<div class="titles"><h2 id="sec1">' + esc(T('an.snapshot')) + '</h2><p>' + esc(T('an.sec.snapshot.sub')) + '</p></div>' +
        '<span class="badge badge-neutral" style="margin-left:auto">' + esc(T('an.interval.' + (m.interval === 'intraday' ? 'intraday' : 'daily'))) +
          ' · ' + esc(T('an.bars', { n: m.barCount })) + '</span>' +
      '</div>' +
      '<div class="section-body no-indent" style="padding:14px 0 0">' +
        '<div class="snapshot">' +
          '<div class="snapshot-left">' +
            '<div>' +
              '<div class="eyebrow">' + esc(T('an.as_of')) + ' ' + esc(U.fmtDateTime(stamp, lang())) + '</div>' +
              '<div class="price" style="margin-top:6px">' + esc(U.fmtPrice(f.price, '$', lang())) + '<small>' + esc(a.asset.currency || 'USD') + '</small></div>' +
              '<div class="price-delta"><span class="badge ' + chgCls + '">' + arrow + ' ' + esc(f.changeText) + '</span>' +
                '<span class="tiny muted">' + esc(f.changeWindow) + '</span>' +
                '<span class="tiny muted">·</span><span class="tiny muted">' + esc(T(a.session.key)) + '</span></div>' +
            '</div>' +
            '<div class="kv">' + kv.map(function (item) {
              return '<div><div class="k">' + esc(item[0]) + '</div><div class="v">' + esc(item[1]) + '</div></div>';
            }).join('') + '</div>' +
            '<div class="data-stamp">' + ui.icon('clock', 12) + ' ' +
              esc(T('an.generated', { time: U.fmtDateTime(a.generatedAt, lang()) })) + '</div>' +
          '</div>' +
          '<div class="snapshot-right">' +
            '<div class="chart-panel" data-chart-panel>' +
              '<div class="chart-wrap">' + chart + '</div>' +
              '<div class="chart-legend">' +
                '<span class="lg"><i style="background:var(--bull)"></i>' + esc(T('an.chart.legend.price')) + '</span>' +
                '<span class="lg"><i style="background:#f5f0ff;width:7px;height:7px;border-radius:50%"></i>' + esc(T('an.chart.legend.quote')) + '</span>' +
                '<span class="lg"><i style="background:#29e0ff"></i>' + esc(T('an.chart.legend.sma20')) + '</span>' +
                '<span class="lg"><i style="background:#c084fc"></i>' + esc(T('an.chart.legend.sma50')) + '</span>' +
                '<span class="lg"><i style="background:var(--muted-2)"></i>' + esc(T('an.chart.legend.level')) + '</span>' +
              '</div>' +
              '<div class="chart-foot">' +
                '<div class="chart-foot-notes">' +
                  '<span class="data-stamp">' + esc(m.grainNote || '') + '</span>' +
                  '<span class="data-stamp">' + esc(T('an.chart.foot')) + '</span>' +
                '</div>' +
                '<button type="button" class="btn btn-sm chart-fs-btn" data-chart-fs aria-pressed="false" ' +
                  'aria-label="' + U.attr(T('an.chart.fs.enter')) + '" title="' + U.attr(T('an.chart.fs.enter')) + '">' +
                  ui.icon('expand', 13) + ' <span class="label" data-chart-fs-label>' + esc(T('an.chart.fs.enter')) + '</span>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- action plan ---------------- */
  var planLiveStop = null;

  function stopPlanLive() {
    if (planLiveStop) { planLiveStop(); planLiveStop = null; }
  }

  function planBadges(plan) {
    var stateCls = {
      wait: 'badge-neutral',
      triggered: 'badge-sample',
      in_play: plan.side === 'long' ? 'badge-bull' : plan.side === 'short' ? 'badge-bear' : 'badge-neutral',
      extended: 'badge-sample',
      invalidated: 'badge-bear',
      no_edge: 'badge-neutral',
      practice: 'badge-sample'
    };
    var sideCls = plan.side === 'long' ? 'badge-bull' : plan.side === 'short' ? 'badge-bear' : 'badge-neutral';
    var dataCls = plan.dataKey === 'plan.data.live' ? 'badge-live' : plan.sample ? 'badge-sample' : 'badge-neutral';
    var html = '<span class="badge ' + (stateCls[plan.state] || 'badge-neutral') + '">' +
      esc(T('plan.state.' + plan.state)) + '</span>';
    if (plan.side !== 'none') html += '<span class="badge ' + sideCls + '">' + esc(T('plan.side.' + plan.side)) + '</span>';
    if (plan.setup && plan.setup !== 'none') {
      html += '<span class="badge badge-neutral">' + esc(T('plan.setup.' + plan.setup)) + '</span>';
    }
    html += '<span class="badge ' + dataCls + '"><i class="plan-dot"></i>' + esc(T(plan.dataKey)) + '</span>';
    return html;
  }

  function planCell(label, value, note, cls) {
    return '<div class="plan-level ' + (cls || '') + '">' +
      '<span class="k">' + esc(label) + '</span>' +
      '<span class="v mono">' + esc(value) + '</span>' +
      (note ? '<span class="n">' + esc(note) + '</span>' : '') +
    '</div>';
  }

  function planLevelsGridHtml(plan) {
    if (plan.state === 'no_edge') {
      var ds = U.isNum(plan.s1) ? Math.abs(plan.price - plan.s1) / plan.atr : null;
      var dr = U.isNum(plan.r1) ? Math.abs(plan.r1 - plan.price) / plan.atr : null;
      return '<div class="plan-levels">' +
        planCell(T('plan.levels.support'), plan.s1Text, ds != null ? T('plan.atrDist', { d: ds.toFixed(1) }) : '', 'sup') +
        planCell(T('plan.levels.resistance'), plan.r1Text, dr != null ? T('plan.atrDist', { d: dr.toFixed(1) }) : '', 'res') +
      '</div>';
    }
    var entryLabel, entryNote;
    if (plan.state === 'invalidated') {
      entryLabel = T('plan.levels.reclaim');
      entryNote = T('plan.levels.ifReclaimed');
    } else if (plan.state === 'extended') {
      entryLabel = T('plan.levels.last');
      entryNote = T('plan.levels.noEntry');
    } else if (plan.entryBasis === 'last') {
      entryLabel = T('plan.levels.entry');
      entryNote = T('plan.levels.liveNote');
    } else {
      entryLabel = T('plan.levels.triggerEntry');
      entryNote = T('plan.levels.ifTriggered');
    }
    var stopPct = plan.entry && plan.stop ? (plan.stop / plan.entry - 1) * 100 : null;
    var targetPct = plan.entry && plan.target ? (plan.target / plan.entry - 1) * 100 : null;
    return '<div class="plan-levels">' +
      planCell(entryLabel, plan.entryText, entryNote, 'entry') +
      planCell(T('plan.levels.invalidation'), plan.stopText,
        stopPct != null ? U.fmtPct(stopPct, { sign: true }) : '', 'stop') +
      planCell(T('plan.levels.target'), plan.targetText,
        targetPct != null ? U.fmtPct(targetPct, { sign: true }) : '', 'target') +
      planCell(T('plan.levels.rr'), plan.rrText, '', 'rr') +
    '</div>';
  }

  function levelInputValue(v) {
    if (!U.isNum(v)) return '';
    return String(Number(v.toFixed(U.priceDecimals(v))));
  }

  function planLevelsEditHtml(plan) {
    if (!plan.sizeAllowed || !U.isNum(plan.entry) || (plan.side !== 'long' && plan.side !== 'short')) return '';
    var custom = plan.customStop || plan.customTarget;
    var stopVal = plan.customStop && U.isNum(plan.stop) ? String(plan.stop) : '';
    var targetVal = plan.customTarget && U.isNum(plan.target) ? String(plan.target) : '';
    return '<div class="plan-levels-edit" data-level-edit>' +
      '<div class="plan-levels-edit-head">' +
        '<span class="eyebrow">' + esc(T('plan.levels.editTitle')) + '</span>' +
        '<span class="plan-levels-custom" data-level-custom' + (custom ? '' : ' hidden') + '>' +
          esc(T('plan.levels.custom')) + '</span>' +
      '</div>' +
      '<div class="plan-levels-edit-row">' +
        '<label><span>' + esc(T('plan.levels.stopInput')) + '</span>' +
          '<input class="input" type="number" inputmode="decimal" min="0" step="any" data-level-stop placeholder="' +
            U.attr(levelInputValue(plan.suggestedStop)) + '" value="' + U.attr(stopVal) + '"></label>' +
        '<label><span>' + esc(T('plan.levels.targetInput')) + '</span>' +
          '<input class="input" type="number" inputmode="decimal" min="0" step="any" data-level-target placeholder="' +
            U.attr(levelInputValue(plan.suggestedTarget)) + '" value="' + U.attr(targetVal) + '"></label>' +
        '<button type="button" class="btn btn-sm plan-levels-reset" data-level-reset' +
          (custom ? '' : ' hidden') + '>' + esc(T('plan.levels.reset')) + '</button>' +
      '</div>' +
      '<p class="tiny muted plan-levels-hint">' + esc(T('plan.levels.editHint')) + ' ' +
        esc(T('plan.levels.suggested', { s: plan.suggestedStopText, t: plan.suggestedTargetText })) + '</p>' +
      '<div class="plan-levels-errors" data-level-errors aria-live="polite"></div>' +
    '</div>';
  }

  function planLevelsHtml(plan) {
    return '<div data-levels-grid>' + planLevelsGridHtml(plan) + '</div>' + planLevelsEditHtml(plan);
  }

  function planSizeCell(label, value) {
    return '<div class="plan-size-cell"><span class="k">' + esc(label) + '</span>' +
      '<span class="v mono">' + esc(value) + '</span></div>';
  }

  function planSizeOutHtml(plan, settings) {
    var sz = TA.tradeplan.size(plan, settings);
    if (!sz) return '<div class="tiny muted">' + esc(T('plan.size.invalid')) + '</div>';
    var money = function (v) { return U.fmtPrice(v, '$', lang()); };
    var units = U.fmtNum(sz.units, lang(), sz.units >= 1 ? 2 : 6);
    return '<div class="plan-size-cells">' +
      planSizeCell(T('plan.size.maxLoss'), money(sz.maxLoss)) +
      planSizeCell(T('plan.size.units'), units) +
      planSizeCell(T('plan.size.notional'), money(sz.notional)) +
    '</div>' +
    '<div class="tiny muted plan-per-unit">' + esc(T('plan.size.perUnit', { v: money(sz.perUnit) })) + '</div>' +
    (sz.capped ? '<div class="plan-cap">' + ui.icon('warning', 11) + ' ' + esc(T('plan.size.capped')) + '</div>' : '');
  }

  function planSizingHtml(plan) {
    if (!plan.sizeAllowed) {
      return '<div class="plan-size off">' + ui.icon('info', 14) + '<span>' +
        esc(T(plan.sizeHiddenKey || 'plan.size.hidden.noEdge')) + '</span></div>';
    }
    var s = TA.store.settings();
    var acc = s.accountSize != null ? s.accountSize : 10000;
    var risk = s.riskPct != null ? s.riskPct : 1;
    return '<div class="plan-size">' +
      '<div class="plan-size-top">' +
        '<div><span class="eyebrow">' + esc(T('plan.size.title')) + '</span>' +
          '<div class="tiny muted">' + esc(T('plan.size.sub')) + '</div></div>' +
        '<div class="plan-size-inputs">' +
          '<label><span>' + esc(T('plan.size.account')) + '</span>' +
            '<input class="input" type="number" inputmode="decimal" min="0" step="100" data-size-account value="' + U.attr(String(acc)) + '"></label>' +
          '<label><span>' + esc(T('plan.size.risk')) + '</span>' +
            '<input class="input" type="number" inputmode="decimal" min="0.1" max="100" step="0.1" data-size-risk value="' + U.attr(String(risk)) + '"></label>' +
        '</div>' +
      '</div>' +
      '<div class="plan-size-out" data-size-out>' + planSizeOutHtml(plan, s) + '</div>' +
      '<p class="tiny muted plan-size-note">' +
        esc(T(plan.state === 'wait' ? 'plan.size.noteWait' : 'plan.size.note')) + '</p>' +
    '</div>';
  }

  function planScenarioHtml(plan) {
    var s = plan && plan.scenario;
    if (!s) return '';
    return '<section class="plan-scenario" aria-label="' + U.attr(T('plan.scenario.title')) + '">' +
      '<div class="plan-scenario-head"><div><span class="eyebrow">' + esc(T('plan.scenario.eyebrow')) + '</span>' +
        '<h3>' + esc(T('plan.scenario.title')) + '</h3></div>' +
        '<span class="badge ' + (plan.side === 'long' ? 'badge-bull' : 'badge-bear') + '">' +
          esc(T(plan.side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell')) + '</span></div>' +
      (s.hypothetical ? '<p class="tiny muted">' + esc(T('plan.scenario.hypothetical')) + '</p>' : '') +
      '<div class="plan-scenario-grid">' +
        planCell(T('plan.levels.entry'), s.entryText, '', 'entry') +
        planCell(T('plan.scenario.target'), s.targetText, U.isNum(s.gainPct) ? U.fmtPct(s.gainPct, { sign: true }) : '', 'target') +
        planCell(T('plan.levels.stop'), s.stopText, U.isNum(s.lossPct) ? U.fmtPct(-s.lossPct, { sign: true }) : '', 'stop') +
        planCell(T('plan.levels.rr'), U.isNum(s.rr) ? s.rr.toFixed(1) + ' : 1' : '—', '', 'rr') +
      '</div>' +
      '<p class="tiny muted plan-scenario-method">' + esc(T('plan.scenario.method')) + '</p>' +
    '</section>';
  }

  function planSidePickerHtml(entry) {
    return '<div class="plan-side-picker" role="group" aria-label="' + U.attr(T('plan.scenario.choose')) + '">' +
      '<span class="tiny muted">' + esc(T('plan.scenario.choose')) + '</span>' +
      ['long', 'short'].map(function (side) {
        var chosen = entry.selectedSide === side;
        return '<button type="button" class="btn btn-sm plan-side-btn ' + (chosen ? 'selected ' : '') + side + '" ' +
          'data-plan-side="' + side + '" aria-pressed="' + (chosen ? 'true' : 'false') + '">' +
          esc(T(side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell')) + '</button>';
      }).join('') +
    '</div>';
  }

  function planChecksHtml(plan) {
    if (!plan.checks || !plan.checks.length) return '';
    if (plan.state === 'invalidated' || plan.state === 'extended') return '';
    return '<div class="plan-checks" role="list" aria-label="' + U.attr(T('plan.checks.label')) + '">' +
      plan.checks.map(function (c) {
        return '<span class="plan-check ' + (c.ok ? 'ok' : '') + '" role="listitem">' +
          ui.icon(c.ok ? 'check' : 'close', 11) + ' ' + esc(T(c.key, c.params)) + '</span>';
      }).join('') +
    '</div>';
  }

  function planStepsHtml(plan) {
    var hasLevels = U.isNum(plan.entry) && U.isNum(plan.stop) && U.isNum(plan.target) &&
      plan.state !== 'no_edge' && plan.state !== 'invalidated' && plan.state !== 'practice' && plan.state !== 'extended';
    var size = plan.sizeAllowed ? TA.tradeplan.size(plan, TA.store.settings()) : null;
    var action = T(plan.actionKey || 'plan.act.noEdge', plan.actionParams || {});
    var risk = hasLevels
      ? T('plan.steps.riskReady', { entry: plan.entryText, stop: plan.stopText, target: plan.targetText, rr: plan.rrText })
      : T('plan.steps.riskWait');
    var sizeText = size
      ? T('plan.steps.sizeReady', { units: U.fmtNum(size.units, lang(), size.units >= 1 ? 2 : 6), loss: U.fmtPrice(size.maxLoss, '$', lang()) })
      : T('plan.steps.sizeWait');
    var rows = [
      ['plan.steps.entry', action],
      ['plan.steps.risk', risk],
      ['plan.steps.size', sizeText]
    ];
    return '<section class="plan-steps" aria-labelledby="plan-steps-title">' +
      '<h3 id="plan-steps-title">' + esc(T('plan.steps.title')) + '</h3>' +
      '<ol>' + rows.map(function (row, i) {
        return '<li><span class="plan-step-number" aria-hidden="true">' + (i + 1) + '</span>' +
          '<div><b>' + esc(T(row[0])) + '</b><p>' + esc(row[1]) + '</p></div></li>';
      }).join('') + '</ol></section>';
  }

  function levelErrorsHtml(errors) {
    var keys = [];
    if (errors && errors.stop) keys.push(errors.stop);
    if (errors && errors.target) keys.push(errors.target);
    if (!keys.length) return '';
    return keys.map(function (k) {
      return '<span class="plan-levels-error">' + ui.icon('warning', 11) + ' ' + esc(T(k)) + '</span>';
    }).join('');
  }

  function simulationBand(labelKey, band) {
    return '<div class="sim-band"><span class="k">' + esc(T(labelKey)) + '</span>' +
      '<b class="mono">' + esc(U.fmtPct(band.movePct, { sign: true })) + '</b>' +
      '<span class="tiny muted">' + esc(T('sim.endPrice', { price: U.fmtPrice(band.endPrice, '$', lang()) })) + '</span></div>';
  }

  function simulationResultsHtml(entry) {
    var sim = entry.simulation;
    if (!entry.selectedSide) return '<p class="tiny muted">' + esc(T('sim.chooseSide')) + '</p>';
    if (!sim) return '<p class="tiny muted">' + esc(T('sim.prompt')) + '</p>';
    if (sim.error) return '<p class="tiny muted">' + esc(T(sim.error)) + '</p>';
    var rows = simulationBand('sim.p10', sim.p10) +
      simulationBand('sim.median', sim.median) +
      simulationBand('sim.p90', sim.p90);
    var barriers = (sim.hasStop || sim.hasTarget)
      ? '<div class="sim-hits">' +
        (sim.hasTarget ? '<span>' + esc(T('sim.targetFirst', { pct: U.fmtPct(sim.targetFirstPct, { sign: false }) })) + '</span>' : '') +
        (sim.hasStop ? '<span>' + esc(T('sim.stopFirst', { pct: U.fmtPct(sim.stopFirstPct, { sign: false }) })) + '</span>' : '') +
        '<span>' + esc(T('sim.neither', { pct: U.fmtPct(sim.neitherPct, { sign: false }) })) + '</span></div>'
      : '';
    return '<p class="tiny muted sim-summary">' + esc(T('sim.resultLead', {
      n: sim.paths, h: sim.horizon, interval: T('an.interval.' + (sim.interval === 'intraday' ? 'intraday' : 'daily')),
      side: T(sim.side === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell'),
      entry: U.fmtPrice(sim.entry, '$', lang()), history: sim.historyCount
    })) + '</p>' +
      (sim.hypotheticalEntry ? '<p class="tiny muted">' + esc(T('sim.hypothetical')) + '</p>' : '') +
      (sim.sample ? '<p class="tiny muted sim-sample">' + esc(T('sim.sample')) + '</p>' : '') +
      '<div class="sim-bands">' + rows + '</div>' + barriers +
      '<p class="tiny muted sim-caveat">' + esc(T('sim.caveat')) + '</p>';
  }

  function simulationPanelHtml(entry) {
    var selected = !!entry.selectedSide;
    return '<section class="plan-simulation" data-simulation aria-labelledby="simulation-title">' +
      '<div class="plan-simulation-head"><div><span class="eyebrow">' + esc(T('copilot.title')) + '</span>' +
        '<h3 id="simulation-title">' + esc(T('sim.title')) + '</h3>' +
        '<p class="tiny muted">' + esc(T('sim.subtitle')) + '</p></div>' +
        '<span class="badge badge-neutral">' + esc(T(selected ? (entry.selectedSide === 'long' ? 'plan.scenario.buy' : 'plan.scenario.sell') : 'plan.side.none')) + '</span></div>' +
      '<div class="sim-controls"><label><span>' + esc(T('sim.horizon')) + '</span>' +
        '<select class="input" data-sim-horizon>' +
          [5, 10, 20].map(function (n) {
            var chosen = Number(entry.simulationHorizon || 10) === n;
            return '<option value="' + n + '"' + (chosen ? ' selected' : '') + '>' + esc(T('sim.steps', { n: n })) + '</option>';
          }).join('') +
        '</select></label>' +
        '<button type="button" class="btn btn-sm btn-primary" data-sim-run' + (selected ? '' : ' disabled') + '>' +
          ui.icon('pulse', 13) + ' ' + esc(T('sim.run')) + '</button></div>' +
      '<div class="sim-results" data-sim-results aria-live="polite">' + simulationResultsHtml(entry) + '</div>' +
    '</section>';
  }

  function planBodyHtml(plan, entry) {
    var tone = plan.side === 'long' ? 'up' : plan.side === 'short' ? 'down' : 'flat';
    var chgBadge = U.isNum(plan.changePct)
      ? '<span class="badge ' + (plan.changePct > 0 ? 'badge-bull' : plan.changePct < 0 ? 'badge-bear' : 'badge-neutral') + '">' +
        esc(U.fmtPct(plan.changePct, { sign: true })) + '</span>'
      : '';
    return '<div class="plan-body">' +
      '<div class="plan-badges">' + planBadges(plan) + '</div>' +
      '<div class="plan-grid">' +
        '<div class="plan-call">' +
          '<div class="plan-quote"><span class="k">' + esc(T('plan.now')) + '</span>' +
            '<span class="mono">' + esc(plan.priceText) + '</span>' + chgBadge + '</div>' +
          '<p class="plan-action ' + tone + '">' + esc(T(plan.actionKey, plan.actionParams)) + '</p>' +
          '<ul class="plan-reasons">' + plan.reasons.map(function (r) {
            return '<li>' + esc(T(r.key, r.params)) + '</li>';
          }).join('') + '</ul>' +
          (plan.warnings.length
            ? '<div class="plan-warns">' + plan.warnings.map(function (k) {
              return '<span class="plan-warn">' + ui.icon('warning', 11) + ' ' + esc(T(k)) + '</span>';
            }).join('') + '</div>'
            : '') +
        '</div>' +
        planLevelsHtml(plan) +
      '</div>' +
      planStepsHtml(plan) +
      simulationPanelHtml(entry) +
      planScenarioHtml(plan) +
      planSizingHtml(plan) +
      '<div data-plan-checks>' + planChecksHtml(plan) + '</div>' +
      '<div class="plan-foot">' +
        '<span class="data-stamp">' + ui.icon('clock', 12) + ' ' +
          esc(T('plan.asOf', { time: U.fmtDateTime(plan.asOf, lang()) })) + '</span>' +
        '<span class="data-stamp">' + esc(T('plan.foot')) + '</span>' +
      '</div>' +
      '<p class="tiny muted plan-disclaim">' + esc(T('plan.disclaim')) + '</p>' +
    '</div>';
  }

  function planCard(entry) {
    var plan = entry.plan;
    if (!plan) return '';
    return '<section class="card plan" data-plan aria-labelledby="plan-title">' +
      '<div class="plan-head">' +
        '<div class="titles">' +
          '<div class="eyebrow">' + esc(T('plan.eyebrow')) + '</div>' +
          '<h2 id="plan-title">' + ui.icon('target', 16) + ' ' + esc(T('plan.title')) + '</h2>' +
          '<p>' + esc(T('plan.sub')) + '</p>' +
        '</div>' + planSidePickerHtml(entry) +
      '</div>' +
      '<div data-plan-body>' + planBodyHtml(plan, entry) + '</div>' +
    '</section>';
  }

  /* ---------------- copilot ---------------- */
  var CITE_TARGETS = {
    plan: 'plan-title',
    snapshot: 'sec1',
    context: 'sec2',
    cases: 'sec3',
    levels: 'sec4',
    scenarios: 'sec5',
    risks: 'sec6',
    sources: 'sec7'
  };

  function copilotBriefHtml(brief) {
    return '<div class="copilot-brief-head"><span class="eyebrow">' + esc(T('copilot.briefLabel')) + '</span></div>' +
      '<p class="copilot-headline ' + brief.tone + '">' + esc(brief.headline) + '</p>' +
      '<div class="copilot-reads">' + brief.reads.map(function (r) {
        return '<div class="copilot-read"><span class="k">' + esc(r.label) + '</span>' +
          '<span class="v">' + esc(r.value) + '</span></div>';
      }).join('') + '</div>' +
      (brief.points.length
        ? '<ul class="copilot-points">' + brief.points.map(function (p) {
          return '<li>' + esc(p.text) + '</li>';
        }).join('') + '</ul>'
        : '');
  }

  function refreshCopilotBrief(root, entry) {
    var el = root.querySelector('[data-copilot-brief]');
    if (!el || !entry.plan || !TA.copilot) return;
    el.innerHTML = copilotBriefHtml(TA.copilot.brief(entry.a, entry.plan));
  }

  function copilotCard(entry) {
    var brief = TA.copilot.brief(entry.a, entry.plan);
    return '<section class="card copilot edge-cyan" data-copilot aria-labelledby="copilot-title">' +
      '<div class="copilot-head">' +
        '<span class="copilot-orb" aria-hidden="true">' + ui.icon('sparkles', 17) + '</span>' +
        '<div class="titles">' +
          '<div class="eyebrow">' + esc(T('copilot.eyebrow')) + '</div>' +
          '<h2 id="copilot-title">' + esc(T('copilot.title')) + '</h2>' +
          '<p>' + esc(T('copilot.sub')) + '</p>' +
        '</div>' +
        '<div class="copilot-head-actions">' +
          '<span class="badge badge-live"><i class="plan-dot"></i>' + esc(T('copilot.badge')) + '</span>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-copilot-clear hidden>' + esc(T('copilot.clear')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="copilot-body">' +
        '<div class="copilot-brief" data-copilot-brief>' + copilotBriefHtml(brief) + '</div>' +
        '<div class="copilot-ask">' +
          '<div class="copilot-prompts">' +
            '<span class="k">' + esc(T('copilot.suggested')) + '</span>' +
            brief.prompts.map(function (p) {
              return '<button type="button" class="copilot-prompt" data-copilot-prompt="' + U.attr(p.id) + '">' +
                esc(p.text) + '</button>';
            }).join('') +
          '</div>' +
          '<div class="copilot-thread" data-copilot-thread role="log" aria-live="polite" aria-label="' +
            U.attr(T('copilot.thread')) + '"></div>' +
          '<form class="copilot-form" data-copilot-form novalidate>' +
            '<label class="sr-only" for="copilot-input">' + esc(T('copilot.placeholder')) + '</label>' +
            '<input id="copilot-input" class="input" data-copilot-input type="text" maxlength="240" ' +
              'autocomplete="off" spellcheck="false" placeholder="' + U.attr(T('copilot.placeholder')) + '">' +
            '<button type="submit" class="btn btn-primary copilot-send">' +
              ui.icon('sparkles', 13) + ' ' + esc(T('copilot.send')) + '</button>' +
          '</form>' +
        '</div>' +
      '</div>' +
      '<div class="copilot-foot">' +
        '<span class="data-stamp">' + ui.icon('shield', 12) + ' ' + esc(T('copilot.foot')) + '</span>' +
      '</div>' +
      '</section>';
  }

  function bindCopilot(root, entry) {
    var card = root.querySelector('[data-copilot]');
    if (!card || !TA.copilot) return;
    var threadEl = card.querySelector('[data-copilot-thread]');
    var form = card.querySelector('[data-copilot-form]');
    var input = card.querySelector('[data-copilot-input]');
    var clearBtn = card.querySelector('[data-copilot-clear]');
    var items = [];
    var max = 6;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function citesHtml(cites) {
      return cites.map(function (c) {
        var target = CITE_TARGETS[c];
        if (!target) return '';
        return '<button type="button" class="copilot-cite" data-copilot-cite="' + U.attr(target) + '">' +
          esc(T('copilot.cite.' + c)) + '</button>';
      }).join('');
    }

    function messageHtml(item) {
      var ans = item.ans;
      return '<div class="copilot-msg copilot-msg-user"><span class="who">' + esc(T('copilot.you')) + '</span>' +
          esc(item.q) + '</div>' +
        '<div class="copilot-msg copilot-msg-ai">' +
          '<div class="copilot-msg-head"><span class="copilot-avatar">' + ui.icon('sparkles', 11) + '</span>' +
            esc(ans.title) + '</div>' +
          ans.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
          (ans.cites.length
            ? '<div class="copilot-cites"><span class="k">' + esc(T('copilot.citations')) + '</span>' +
              citesHtml(ans.cites) + '</div>'
            : '') +
          (ans.followups.length
            ? '<div class="copilot-followups"><span class="k">' + esc(T('copilot.followups')) + '</span>' +
              ans.followups.map(function (id) {
                return '<button type="button" class="copilot-prompt" data-copilot-prompt="' + U.attr(id) + '">' +
                  esc(TA.copilot.question(id)) + '</button>';
              }).join('') + '</div>'
            : '') +
        '</div>';
    }

    function renderThread() {
      if (!threadEl) return;
      threadEl.innerHTML = items.map(messageHtml).join('');
    }

    function ask(text) {
      var q = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (!q) {
        if (input) input.focus();
        return;
      }
      items.push({ q: q, ans: TA.copilot.answer(q, entry.a, entry.plan) });
      if (items.length > max) items.shift();
      renderThread();
      if (clearBtn) clearBtn.hidden = false;
      if (input) {
        input.value = '';
        input.focus();
      }
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        ask(input ? input.value : '');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        items = [];
        renderThread();
        clearBtn.hidden = true;
        if (input) input.focus();
      });
    }

    U.on(card, 'click', '[data-copilot-prompt]', function (e, btn) {
      ask(TA.copilot.question(btn.getAttribute('data-copilot-prompt')));
    });

    U.on(card, 'click', '[data-copilot-cite]', function (e, btn) {
      var target = document.getElementById(btn.getAttribute('data-copilot-cite'));
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  }

  function planLevelsKey(a, style) {
    return [a.asset.symbol, a.asset.assetClass, style].join('|');
  }

  function bindPlan(root, entry, style) {
    var card = root.querySelector('[data-plan]');
    if (!card) return;
    stopPlanLive();

    var levelKey = planLevelsKey(entry.a, style);
    var timer = null;
    var visHandler = null;
    var alive = true;

    function runSimulation() {
      if (!entry.selectedSide || !TA.simulation) return;
      var select = card.querySelector('[data-sim-horizon]');
      entry.simulationHorizon = select ? Number(select.value) : Number(entry.simulationHorizon || 10);
      entry.simulation = TA.simulation.run(entry.a, entry.plan, { horizon: entry.simulationHorizon });
      entry.plan.simulation = entry.simulation;
      var results = card.querySelector('[data-sim-results]');
      if (results) results.innerHTML = simulationResultsHtml(entry);
    }

    function stop() {
      alive = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (visHandler) { document.removeEventListener('visibilitychange', visHandler); visHandler = null; }
    }

    function repaint() {
      var body = root.querySelector('[data-plan-body]');
      if (body) body.innerHTML = planBodyHtml(entry.plan, entry);
      refreshCopilotBrief(root, entry);
    }

    function paintRegions() {
      var plan = entry.plan;
      if (!plan) return;
      var grid = root.querySelector('[data-levels-grid]');
      if (grid) grid.innerHTML = planLevelsGridHtml(plan);
      var checks = root.querySelector('[data-plan-checks]');
      if (checks) checks.innerHTML = planChecksHtml(plan);
      var out = root.querySelector('[data-size-out]');
      if (out) out.innerHTML = planSizeOutHtml(plan, TA.store.settings());
      var errEl = root.querySelector('[data-level-errors]');
      if (errEl) errEl.innerHTML = levelErrorsHtml(plan.levelErrors);
      var custom = !!(plan.customStop || plan.customTarget);
      var badge = root.querySelector('[data-level-custom]');
      if (badge) badge.hidden = !custom;
      var reset = root.querySelector('[data-level-reset]');
      if (reset) reset.hidden = !custom;
      var simResults = root.querySelector('[data-sim-results]');
      if (simResults) simResults.innerHTML = simulationResultsHtml(entry);
      refreshCopilotBrief(root, entry);
    }

    function applyLevelEdits() {
      var stopEl = root.querySelector('[data-level-stop]');
      var targetEl = root.querySelector('[data-level-target]');
      if (!stopEl || !targetEl || !entry.plan) return;
      var levels = {};
      var stopRaw = stopEl.value.trim();
      var targetRaw = targetEl.value.trim();
      if (stopRaw !== '') levels.stop = Number(stopRaw);
      if (targetRaw !== '') levels.target = Number(targetRaw);
      var prev = entry.plan;
      entry.plan = TA.tradeplan.build(entry.a, {
        lang: lang(), style: style, levels: levels,
        side: entry.selectedSide,
        price: prev.live ? prev.price : undefined,
        changePct: prev.live ? prev.changePct : undefined,
        live: prev.live,
        asOf: prev.live ? prev.asOf : undefined
      });
      runSimulation();
      TA.store.setPlanLevels(levelKey, {
        stop: entry.plan.customStop ? entry.plan.stop : null,
        target: entry.plan.customTarget ? entry.plan.target : null
      });
      paintRegions();
    }

    function poll() {
      if (!alive || !card.isConnected) { stop(); return; }
      if (document.hidden || document.querySelector('.modal-backdrop')) return;
      if (card.contains(document.activeElement)) return;
      var asset = entry.a.asset;
      if (!asset || asset.assetClass !== 'crypto') { stop(); return; }
      if (TA.store.settings().dataMode === 'sample') return;
      TA.data.getQuotes([{ symbol: asset.symbol, assetClass: 'crypto', coingeckoId: asset.coingeckoId || null }])
        .then(function (res) {
          if (!alive || !card.isConnected) return;
          var q = res && res[asset.symbol];
          if (!q || q.dataMode !== 'live' || !U.isNum(q.price) || !entry.plan) return;
          if (entry.plan.live && q.price === entry.plan.price) return;
          entry.plan = TA.tradeplan.build(entry.a, {
            lang: lang(), style: style,
            side: entry.selectedSide,
            price: q.price, changePct: q.changePct, live: true,
            asOf: q.asOf || Date.now(),
            levels: TA.store.getPlanLevels(levelKey)
          });
          runSimulation();
          repaint();
        })
        .catch(function () {});
    }

    U.on(card, 'input', '[data-level-stop], [data-level-target]', applyLevelEdits);

    U.on(card, 'click', '[data-plan-side]', function (e, btn) {
      var side = btn.getAttribute('data-plan-side');
      if (side !== 'long' && side !== 'short') return;
      entry.selectedSide = side;
      var prev = entry.plan || {};
      entry.plan = TA.tradeplan.build(entry.a, {
        lang: lang(), style: style, side: side,
        price: prev.live ? prev.price : undefined,
        changePct: prev.live ? prev.changePct : undefined,
        live: prev.live,
        asOf: prev.live ? prev.asOf : undefined,
        levels: TA.store.getPlanLevels(levelKey)
      });
      entry.simulationHorizon = Number(entry.simulationHorizon || 10);
      runSimulation();
      var picker = card.querySelector('.plan-side-picker');
      if (picker) picker.outerHTML = planSidePickerHtml(entry);
      repaint();
    });

    U.on(card, 'click', '[data-sim-run]', runSimulation);
    U.on(card, 'change', '[data-sim-horizon]', runSimulation);

    U.on(card, 'click', '[data-level-reset]', function () {
      TA.store.clearPlanLevels(levelKey);
      var stopEl = root.querySelector('[data-level-stop]');
      var targetEl = root.querySelector('[data-level-target]');
      if (stopEl) stopEl.value = '';
      if (targetEl) targetEl.value = '';
      applyLevelEdits();
    });

    U.on(card, 'input', '[data-size-account], [data-size-risk]', function () {
      var accEl = root.querySelector('[data-size-account]');
      var riskEl = root.querySelector('[data-size-risk]');
      if (!accEl || !riskEl || !entry.plan) return;
      var acc = Number(accEl.value);
      var risk = Number(riskEl.value);
      var s = TA.store.settings();
      s.accountSize = acc > 0 ? acc : 0;
      s.riskPct = risk > 0 ? Math.min(risk, 100) : 0;
      var out = root.querySelector('[data-size-out]');
      if (out) out.innerHTML = planSizeOutHtml(entry.plan, s);
      var patch = {};
      if (acc > 0) patch.accountSize = acc;
      if (risk > 0) patch.riskPct = Math.min(risk, 100);
      if (Object.keys(patch).length) TA.store.updateSettings(patch);
    });

    visHandler = function () { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', visHandler);
    planLiveStop = stop;
    setTimeout(poll, 500);
    timer = setInterval(poll, 60000);
  }

  /* ---------------- chart fullscreen ---------------- */
  var chartFsStop = null;

  function stopChartFullscreen() {
    if (chartFsStop) { chartFsStop(); chartFsStop = null; }
  }

  function bindChartFullscreen(root, a) {
    stopChartFullscreen();
    var panel = root.querySelector('[data-chart-panel]');
    var btn = panel && panel.querySelector('[data-chart-fs]');
    var wrap = panel && panel.querySelector('.chart-wrap');
    if (!panel || !btn) return;

    var sizeTimer = null;

    function freshUid() {
      return 'g' + Math.random().toString(36).slice(2, 8);
    }
    function renderChart(w, h) {
      if (wrap) wrap.innerHTML = TA.charts.price(chartModel(a, freshUid(), w, h));
    }
    function scheduleSize(tries) {
      if (sizeTimer) clearTimeout(sizeTimer);
      sizeTimer = setTimeout(function () {
        sizeTimer = null;
        if (!isOpen() || !wrap) return;
        var w = Math.round(wrap.clientWidth);
        var h = Math.round(wrap.clientHeight);
        if (w > 0 && h > 0) renderChart(w, h);
        else if ((tries || 0) < 3) scheduleSize((tries || 0) + 1);
      }, 80);
    }
    function restoreChart() {
      if (sizeTimer) { clearTimeout(sizeTimer); sizeTimer = null; }
      renderChart();
    }

    function nativeEl() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }
    function isOpen() {
      return nativeEl() === panel || panel.classList.contains('is-fs');
    }
    function paint() {
      var open = isOpen();
      var label = T(open ? 'an.chart.fs.exit' : 'an.chart.fs.enter');
      btn.setAttribute('aria-pressed', open ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.innerHTML = ui.icon(open ? 'collapse' : 'expand', 13) +
        ' <span class="label" data-chart-fs-label>' + esc(label) + '</span>';
    }
    function fallbackOn() {
      panel.classList.add('is-fs');
      document.body.classList.add('chart-fs-open');
      paint();
      scheduleSize(0);
    }
    function clearFallback() {
      panel.classList.remove('is-fs');
      document.body.classList.remove('chart-fs-open');
    }
    function focusButton() {
      btn.focus({ preventScroll: true });
    }
    function enterFs() {
      var request = panel.requestFullscreen || panel.webkitRequestFullscreen;
      if (!request) { fallbackOn(); focusButton(); return; }
      var result;
      try {
        result = request.call(panel);
      } catch (e) {
        fallbackOn(); focusButton(); return;
      }
      if (result && result.then) {
        result.then(function () { focusButton(); scheduleSize(0); }, function () { fallbackOn(); focusButton(); });
      } else {
        paint();
        scheduleSize(0);
        focusButton();
      }
    }
    function exitFs() {
      if (nativeEl() === panel) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
          try {
            var result = exit.call(document);
            if (result && result.catch) result.catch(function () {});
          } catch (e) {}
        }
      }
      clearFallback();
      paint();
      restoreChart();
      focusButton();
    }
    function onChange() {
      var open = isOpen();
      if (!open) clearFallback();
      paint();
      if (open) scheduleSize(0);
      else restoreChart();
    }
    function onKey(e) {
      if (!panel.classList.contains('is-fs')) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        focusButton();
        return;
      }
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      e.preventDefault();
      exitFs();
    }
    function onResize() {
      if (isOpen()) scheduleSize(0);
    }

    btn.addEventListener('click', function () {
      if (isOpen()) exitFs();
      else enterFs();
    });
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    paint();

    chartFsStop = function () {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (sizeTimer) { clearTimeout(sizeTimer); sizeTimer = null; }
      if (nativeEl() === panel) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
          try {
            var result = exit.call(document);
            if (result && result.catch) result.catch(function () {});
          } catch (e) {}
        }
      }
      clearFallback();
    };
  }

  /* ---------------- data banners ---------------- */
  function dataBanners(a) {
    var m = a.meta;
    if (m.dataMode === 'sample') {
      var cta = a.asset.assetClass === 'stock' && TA.store.settings().dataMode !== 'sample'
        ? '<a class="btn btn-sm" href="#/settings" style="margin-left:auto;flex:none">' + esc(T('an.sample_banner_cta')) + '</a>'
        : '';
      return '<div class="sample-banner">' + ui.icon('warning', 15) +
        '<div><b>' + esc(T('an.sample_banner')) + '</b>' +
        (m.fallback ? '<br>' + esc(T('an.fallback_banner')) : '') + '</div>' + cta + '</div>';
    }
    return '';
  }

  /* ---------------- lens ---------------- */
  function lensSection(a, style) {
    var f = a.facts;
    var cfg = { lede: '', bullets: [], stats: [], note: '' };
    var dirKey = a.lean.dir;

    if (style === 'day') {
      cfg.lede = T('lens.day.lede.' + (a.asset.assetClass === 'crypto' ? 'crypto' : 'stock'), { session: T(a.session.key) });
      cfg.bullets = [
        T('lens.day.b1', { range: f.typicalRangeText }),
        T('lens.day.b2', { s: a.nearestSupport.priceText, r: a.nearestResistance.priceText }),
        T('lens.day.b3', { interval: T('an.interval.' + (f.intraday ? 'intraday' : 'daily')) })
      ];
      cfg.stats = [
        [T('lens.day.m1'), T(a.session.key)],
        [T('lens.day.m2'), f.typicalRangeText],
        [T('lens.day.m3'), f.vol30Text],
        [T('lens.day.m4'), f.nearestDistText]
      ];
      cfg.note = T('lens.day.note');
      if (a.meta.requestedIntraday && a.meta.interval === 'daily') cfg.bullets.push(T('an.intraday_unavailable'));
    } else if (style === 'long') {
      var side = U.isNum(f.longSma) && f.price > f.longSma ? T('an.side.above') : T('an.side.below');
      var dist = U.isNum(f.longSma) && f.longSma ? U.fmtPct(Math.abs(f.price / f.longSma - 1) * 100, false) : '—';
      cfg.lede = T('lens.long.lede');
      cfg.bullets = [
        T('lens.long.b1', { dd: f.drawdownText, window: f.windowBars, dl: f.fromLowText }),
        T('lens.long.b2', { sma: f.longLen, dist: dist, side: side }),
        T('lens.long.b3')
      ];
      cfg.stats = [
        [T('lens.long.m1'), f.drawdownText],
        [T('lens.long.m2'), f.fromLowText],
        [T('lens.long.m3'), f.longSmaText],
        [T('lens.long.m4'), T(a.volatility.key)]
      ];
      cfg.note = T('lens.long.note');
    } else if (style === 'options') {
      cfg.lede = T('lens.options.lede');
      cfg.bullets = [
        T('lens.options.b1', { vol: f.vol30Text }),
        T('lens.options.b2', { price: f.priceText, lo: f.moveLoText, hi: f.moveHiText }),
        T('lens.options.b3')
      ];
      cfg.stats = [
        [T('lens.options.m1'), f.vol30Text],
        [T('lens.options.m2'), '± ' + f.expectedMoveText],
        [T('lens.options.m3'), f.moveLoText + ' – ' + f.moveHiText],
        [T('lens.options.m4'), T('common.unavailable')]
      ];
      cfg.note = T('lens.options.note');
    } else if (style === 'fx') {
      cfg.lede = T('lens.fx.lede');
      cfg.bullets = [
        T('lens.fx.b1', { session: T(a.session.key) }),
        T('lens.fx.b2', { vol: f.vol30Text }),
        T('lens.fx.b3')
      ];
      cfg.stats = [
        [T('lens.fx.m1'), T(a.session.key)],
        [T('lens.fx.m2'), f.vol30Text],
        [T('lens.fx.m3'), T('common.unavailable')],
        [T('lens.fx.m4'), T('common.unavailable')]
      ];
      cfg.note = T('lens.fx.note');
    } else if (style === 'beginner') {
      cfg.lede = T('lens.beginner.lede', { summary: T('lens.beginner.sum.' + dirKey) });
      cfg.bullets = [
        T('lens.beginner.b1', { summary2: T('lens.beginner.sum2.' + dirKey) }),
        T('lens.beginner.b2', { s: a.nearestSupport.priceText, r: a.nearestResistance.priceText }),
        T('lens.beginner.b3')
      ];
      cfg.stats = [
        [T('lens.beginner.m1'), T('an.lean.' + dirKey)],
        [T('lens.beginner.m2'), T('an.conf.' + a.lean.confidence)],
        [T('lens.beginner.m3'), a.nearestSupport.priceText],
        [T('lens.beginner.m4'), a.nearestResistance.priceText]
      ];
      cfg.note = T('lens.beginner.note');
    } else {
      cfg.lede = T('lens.swing.lede');
      cfg.bullets = [
        T('lens.swing.b1', { trend: T(a.trend.key), d: f.sma50Text ? U.fmtPct(f.price / f.sma50 * 100 - 100, true) : '—' }),
        T('lens.swing.b2', { ret: f.ret20Text, rsi: f.rsiText }),
        T('lens.swing.b3')
      ];
      cfg.stats = [
        [T('lens.swing.m1'), T(a.trend.key)],
        [T('lens.swing.m2'), T(a.momentum.key)],
        [T('lens.swing.m3'), a.nearestSupport.priceText],
        [T('lens.swing.m4'), a.nearestResistance.priceText]
      ];
      cfg.note = T('lens.swing.note');
    }

    var icons = { day: 'clock', swing: 'pulse', long: 'layers', options: 'scale', fx: 'clock', beginner: 'book' };

    return '<section class="card lens" aria-labelledby="lens-title">' +
      '<div class="lens-main">' +
        '<h2 id="lens-title">' + ui.icon(icons[style], 16) + ' ' +
          esc(T('an.lens.title', { style: T('an.tab.' + style) })) + '</h2>' +
        '<p>' + esc(cfg.lede) + '</p>' +
        '<ul>' + cfg.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
      '</div>' +
      '<div class="lens-side">' +
        '<div class="stat-grid">' + cfg.stats.map(function (s) {
          return '<div class="stat"><div class="k">' + esc(s[0]) + '</div><div class="v">' + esc(s[1]) + '</div></div>';
        }).join('') + '</div>' +
        '<div class="lens-note">' + ui.icon('info', 13) + '<span>' + esc(cfg.note) + '</span></div>' +
        '<div class="lens-note" style="margin-top:8px">' + ui.icon('shield', 13) + '<span>' + esc(T('an.lens.note')) + '</span></div>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- section 02 ---------------- */
  function contextSection(a) {
    var f = a.facts;
    var liqNote = a.liquidity.sampleStock ? T('liq.note_stock') : T('liq.note', a.liquidity.noteParams);
    function ctx(title, termKey, value, meter, meterClass, note) {
      return '<div class="ctx">' +
        '<div class="k"><span>' + ui.term(termKey, title) + '</span></div>' +
        '<div class="v">' + esc(value) + '</div>' +
        '<div class="meter ' + meterClass + '"><i style="width:' + U.clamp(meter, 2, 100) + '%"></i></div>' +
        '<div class="n">' + esc(note) + '</div>' +
      '</div>';
    }
    return '<section class="card section" aria-labelledby="sec2">' +
      '<div class="section-head">' +
        '<span class="section-num">02</span>' +
        '<div class="titles"><h2 id="sec2">' + esc(T('an.ctx.title')) + '</h2><p>' + esc(T('an.sec.context.sub')) + '</p></div>' +
      '</div>' +
      '<div class="section-body">' +
        '<div class="ctx-grid">' +
          ctx(T('an.ctx.trend'), 'trend', T(a.trend.key), a.trend.strengthPct,
            a.trend.key.indexOf('up') >= 0 ? 'bull' : a.trend.key.indexOf('down') >= 0 ? 'bear' : '',
            T('trend.note', a.trend.noteParams)) +
          ctx(T('an.ctx.vol'), 'volatility', T(a.volatility.key), a.volatility.meter,
            a.volatility.key === 'vol.high' || a.volatility.key === 'vol.elevated' ? 'warn' : '',
            T('vol.note', a.volatility.noteParams)) +
          ctx(T('an.ctx.liq'), 'liquidity', T(a.liquidity.key), a.liquidity.meter, '', liqNote) +
          ctx(T('an.ctx.momentum'), 'momentum', T(a.momentum.key),
            U.isNum(a.momentum.rsi) ? a.momentum.rsi : 50, '', T('momentum.note', a.momentum.noteParams)) +
        '</div>' +
        '<div style="margin-top:14px;border:1px solid var(--line-soft);border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start">' +
          '<span style="color:var(--muted-2);flex:none;margin-top:1px">' + ui.icon('info', 15) + '</span>' +
          '<div><div class="small" style="font-weight:580">' + esc(T('an.ctx.news')) + '</div>' +
          '<div class="tiny muted" style="margin-top:2px">' + esc(T('an.news.none')) + '</div></div>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- section 03 ---------------- */
  function evidenceHtml(list) {
    return list.map(function (e, i) {
      return '<div class="evidence">' +
        '<span class="mark">' + (i + 1) + '</span>' +
        '<div><div class="t">' + esc(T(e.key, e.params)) + '</div>' +
        '<div class="d">' + esc(T(e.key + '.d', e.params)) + '</div></div>' +
      '</div>';
    }).join('');
  }

  function casesSection(a) {
    return '<section class="section" aria-labelledby="sec3">' +
      '<div class="section-head" style="padding-bottom:12px">' +
        '<span class="section-num">03</span>' +
        '<div class="titles"><h2 id="sec3">' + esc(T('an.bull')) + ' / ' + esc(T('an.bear')) + '</h2><p>' + esc(T('an.sec.cases.sub')) + '</p></div>' +
        '<span class="badge ' + (a.lean.dir === 'bull' ? 'badge-bull' : a.lean.dir === 'bear' ? 'badge-bear' : 'badge-neutral') + '" style="margin-left:auto">' +
          esc(T('an.lean')) + ' ' + esc(T('an.lean.' + a.lean.dir)) + '</span>' +
      '</div>' +
      '<div class="cases">' +
        '<div class="card case">' +
          '<div class="case-head"><h2>' + ui.icon('up', 14) + ' ' + esc(T('an.bull')) + '</h2>' +
            '<span class="hint">' + esc(T('an.bull.sub')) + '</span></div>' +
          '<div class="case-list">' + evidenceHtml(a.evidence.bull) + '</div>' +
          '<div class="case-foot">' + ui.icon('warning', 12) + '<span>' +
            esc(T('ev.weakenBull', { s: a.nearestSupport.priceText })) + '</span></div>' +
        '</div>' +
        '<div class="card case bear">' +
          '<div class="case-head"><h2>' + ui.icon('down', 14) + ' ' + esc(T('an.bear')) + '</h2>' +
            '<span class="hint">' + esc(T('an.bear.sub')) + '</span></div>' +
          '<div class="case-list">' + evidenceHtml(a.evidence.bear) + '</div>' +
          '<div class="case-foot">' + ui.icon('warning', 12) + '<span>' +
            esc(T('ev.weakenBear', { r: a.nearestResistance.priceText })) + '</span></div>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- section 04 ---------------- */
  function levelsSection(a) {
    var f = a.facts;
    var rows = a.levels.slice().sort(function (x, y) { return y.price - x.price; });
    var currentHtml = '<tr class="current-row">' +
      '<td><span class="lvl-kind"><i style="background:var(--accent)"></i>' + esc(T('an.levels.current')) + '</span></td>' +
      '<td class="price-cell">' + esc(U.fmtPrice(f.price, '$', lang())) + '</td>' +
      '<td class="note">—</td><td></td><td class="note">' + esc(T('an.as_of')) + ' ' + esc(U.fmtDateTime(a.meta.seriesEnd, lang())) + '</td></tr>';

    var body = '', placed = false;
    rows.forEach(function (l) {
      if (!placed && l.price < f.price) { body += currentHtml; placed = true; }
      var dot = l.kind === 'support' ? 'var(--bull)' : l.kind === 'resistance' ? 'var(--bear)' : 'var(--muted-2)';
      var dirText = l.price > f.price
        ? T('an.levels.above', { dist: l.distText })
        : T('an.levels.below', { dist: l.distText });
      var strength = '<span class="strength">';
      for (var i = 0; i < 3; i++) strength += '<i class="' + (i < l.strength ? 'on' : '') + '"></i>';
      strength += '</span>';
      body += '<tr>' +
        '<td><span class="lvl-kind"><i style="background:' + dot + '"></i>' + esc(T('an.kind.' + l.kind)) + '</span></td>' +
        '<td class="price-cell">' + esc(l.priceText) + '</td>' +
        '<td class="note">' + esc(dirText) + '</td>' +
        '<td>' + strength + '</td>' +
        '<td class="note">' + esc(T(l.basisKey, l.basisParams)) + '</td>' +
      '</tr>';
    });
    if (!placed) body += currentHtml;

    return '<section class="card section" aria-labelledby="sec4">' +
      '<div class="section-head">' +
        '<span class="section-num">04</span>' +
        '<div class="titles"><h2 id="sec4">' + esc(T('an.levels.title')) + '</h2><p>' + esc(T('an.sec.levels.sub')) + '</p></div>' +
      '</div>' +
      '<div class="section-body">' +
        '<div class="table-scroll"><table class="levels"><thead><tr>' +
          '<th>' + esc(T('an.levels.h.level')) + '</th>' +
          '<th>' + esc(T('an.levels.h.price')) + '</th>' +
          '<th>' + esc(T('an.levels.h.dist')) + '</th>' +
          '<th>' + esc(T('an.levels.h.strength')) + '</th>' +
          '<th>' + esc(T('an.levels.h.note')) + '</th>' +
        '</tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<p class="tiny muted" style="margin-top:12px">' + esc(T('an.levels.note')) + '</p>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- section 05 ---------------- */
  function scenariosSection(a) {
    return '<section class="card section" aria-labelledby="sec5">' +
      '<div class="section-head">' +
        '<span class="section-num">05</span>' +
        '<div class="titles"><h2 id="sec5">' + esc(T('an.scenarios.title')) + '</h2><p>' + esc(T('an.sec.scenarios.sub')) + '</p></div>' +
      '</div>' +
      '<div class="section-body">' +
        '<div class="scenarios">' +
          a.scenarios.map(function (sc) {
            var label = sc.kind === 'base' ? T('an.sc.base') : sc.kind === 'bull' ? T('an.sc.bull') : T('an.sc.bear');
            return '<article class="scenario ' + sc.kind + '">' +
              '<div class="bar"></div><div class="in">' +
                '<div class="label"><h3>' + esc(T(sc.titleKey, sc.params)) + '</h3>' +
                  '<span class="badge ' + (sc.kind === 'bull' ? 'badge-bull' : sc.kind === 'bear' ? 'badge-bear' : 'badge-neutral') + '">' + esc(label) + '</span></div>' +
                '<p class="desc">' + esc(T(sc.descKey, sc.params)) + '</p>' +
                '<dl>' +
                  '<div><dt>' + esc(T('an.sc.trigger')) + '</dt><dd>' + esc(T(sc.triggerKey, sc.params2)) + '</dd></div>' +
                  '<div><dt>' + esc(T('an.sc.strengthen')) + '</dt><dd>' + esc(T(sc.strengthenKey, sc.params2)) + '</dd></div>' +
                  '<div><dt>' + esc(T('an.sc.invalidate')) + '</dt><dd class="invalid">' + esc(T(sc.invalidKey, sc.params2)) + '</dd></div>' +
                '</dl>' +
              '</div></article>';
          }).join('') +
        '</div>' +
        '<p class="tiny muted" style="margin-top:12px">' + esc(T('an.scenarios.note')) + '</p>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- section 06 ---------------- */
  function risksSection(a) {
    var limits = ['news', 'events', 'fund', 'options', 'execution', 'model'];
    return '<section class="card section" aria-labelledby="sec6">' +
      '<div class="section-head">' +
        '<span class="section-num">06</span>' +
        '<div class="titles"><h2 id="sec6">' + esc(T('an.risks.title')) + '</h2><p>' + esc(T('an.sec.risks.sub')) + '</p></div>' +
      '</div>' +
      '<div class="section-body">' +
        '<div class="risks">' + a.risks.map(function (r) {
          return '<div class="risk">' +
            '<span class="sev ' + r.sev + '" aria-hidden="true"></span>' +
            '<div><div class="t">' + esc(T(r.key)) +
              '<span class="tag">' + esc(T('an.risks.tag.' + r.tag)) + '</span>' +
              '<span class="tag">' + esc(T('an.sev.' + r.sev)) + '</span></div>' +
            '<div class="d">' + esc(T(r.key + '.d', r.params)) + '</div></div>' +
          '</div>';
        }).join('') + '</div>' +
        '<div class="limitations"><h4>' + esc(T('an.limits.title')) + '</h4><ul>' +
          limits.map(function (k) { return '<li>' + esc(T('an.limits.' + k)) + '</li>'; }).join('') +
        '</ul></div>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- section 07 ---------------- */
  function sourcesSection(a) {
    var m = a.meta;
    var providerKey = 'src.' + m.provider;
    var providerUrl = m.providerUrl || m.apiUrl;
    var items = [];
    items.push({
      icon: 'external', title: T(providerKey + '.name'), meta: T(providerKey + '.meta'), url: providerUrl,
      stamp: T('an.sources.retrieved', { time: U.fmtDateTime(m.retrievedAt, lang()) })
    });
    items.push({
      icon: 'chart', title: T('an.sources.engine_name'),
      meta: T('an.sources.engine_meta', { n: m.barCount, ind: 'SMA · RSI(14) · volatility · pivots' }),
      url: null, stamp: T('an.sources.series', { time: U.fmtDateTime(m.seriesEnd, lang()) })
    });
    items.push({
      icon: 'info', title: T('an.sources.news_none'), meta: T('an.news.none'), url: null, stamp: null
    });

    return '<section class="card section" aria-labelledby="sec7">' +
      '<div class="section-head">' +
        '<span class="section-num">07</span>' +
        '<div class="titles"><h2 id="sec7">' + esc(T('an.sources.title')) + '</h2><p>' + esc(T('an.sec.sources.sub')) + '</p></div>' +
      '</div>' +
      '<div class="section-body">' +
        '<div class="sources">' + items.map(function (s) {
          return '<div class="source"><span class="ico">' + ui.icon(s.icon, 14) + '</span><div>' +
            '<div class="t">' + (s.url
              ? '<a href="' + U.attr(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a>'
              : esc(s.title)) + '</div>' +
            '<div class="meta">' + esc(s.meta) + (s.stamp ? ' · ' + esc(s.stamp) : '') + '</div>' +
            (s.url ? '<div class="u"><a href="' + U.attr(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.url) + '</a></div>' : '') +
          '</div></div>';
        }).join('') + '</div>' +
        '<div class="engine-note">' +
          '<div class="box"><b>' + esc(T('an.method.title')) + '</b>' + esc(T('an.method.body')) + '</div>' +
          '<div class="box"><b>' + esc(T('an.engine.title')) + '</b>' + esc(T('an.engine.body')) + '</div>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- feedback + note ---------------- */
  function feedbackCard() {
    return '<section class="card" style="margin-top:18px" aria-labelledby="fb-title">' +
      '<div class="feedback">' +
        '<div><div class="q" id="fb-title">' + esc(T('an.feedback.q')) + '</div>' +
        '<div class="sub">' + esc(T('an.feedback.sub')) + '</div></div>' +
        '<div class="fb-actions">' +
          '<button class="btn btn-sm fb-btn" data-fb="helpful">' + ui.icon('thumbUp', 14) + ' ' + esc(T('common.helpful')) + '</button>' +
          '<button class="btn btn-sm fb-btn" data-fb="inaccurate">' + ui.icon('thumbDown', 14) + ' ' + esc(T('common.inaccurate')) + '</button>' +
          '<button class="btn btn-sm fb-btn" data-fb="missing">' + ui.icon('flag', 14) + ' ' + esc(T('common.missing')) + '</button>' +
        '</div>' +
        '<div class="fb-comment" hidden>' +
          '<input type="text" maxlength="240" data-fb-comment placeholder="' + U.attr(T('an.feedback.comment')) + '" aria-label="' + U.attr(T('an.feedback.comment')) + '" />' +
          '<button class="btn btn-sm btn-primary" data-fb-send>' + esc(T('an.feedback.send')) + '</button>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  function noteCard(a) {
    var note = TA.store.note(a.asset.symbol);
    return '<section class="card" style="margin-top:18px" aria-labelledby="note-title">' +
      '<div class="card-head"><h2 id="note-title">' + esc(T('an.note.title')) + '</h2>' +
        '<span class="hint">' + esc(note ? T('an.note.updated', { time: U.fmtDateTime(note.ts, lang()) }) : T('common.optional')) + '</span></div>' +
      '<div class="card-body">' +
        '<textarea class="input" data-note rows="3" maxlength="2000" style="width:100%;height:auto;min-height:76px;padding:10px 12px;resize:vertical" ' +
          'placeholder="' + U.attr(T('an.note.placeholder')) + '" aria-label="' + U.attr(T('an.note.title')) + '">' +
          esc(note ? note.text : '') + '</textarea>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap">' +
          '<span class="tiny muted">' + esc(T('an.feedback.sub')) + '</span>' +
          '<button class="btn btn-sm btn-primary" data-note-save>' + esc(T('an.note.save')) + '</button>' +
        '</div>' +
      '</div>' +
      '</section>';
  }

  function disclaimerBlock() {
    return '<div class="disclaimer">' + ui.icon('warning', 15) +
      '<div><b>' + esc(T('app.disclaimer_short')) + '.</b> ' + esc(T('an.disclaimer')) +
      ' <a href="#" data-open-legal>' + esc(T('an.disclaimer_more')) + '</a></div></div>';
  }

  /* ---------------- page assembly ---------------- */
  function assetHead(a) {
    var watched = TA.store.isWatched(a.asset.symbol);
    var stars = '<span class="badge badge-neutral">' + esc(T('an.interval.' + (a.meta.interval === 'intraday' ? 'intraday' : 'daily'))) + '</span>';
    return '<div class="asset-head">' +
      '<div>' +
        '<div class="asset-title">' +
          '<h1><span class="mono">' + esc(a.asset.symbol) + '</span><span class="name">' + esc(a.asset.name) + '</span></h1>' +
          '<button class="icon-btn" data-watch aria-pressed="' + (watched ? 'true' : 'false') + '" ' +
            'aria-label="' + U.attr(T(watched ? 'nav.unstar' : 'nav.star', { sym: a.asset.symbol })) + '" ' +
            'title="' + U.attr(T(watched ? 'nav.unstar' : 'nav.star', { sym: a.asset.symbol })) + '">' +
            ui.icon(watched ? 'starFill' : 'star', 16) + '</button>' +
        '</div>' +
        '<div class="asset-meta">' +
          ui.modeBadge(a.meta) + ui.assetBadge(a.asset) + stars +
          '<span class="tiny muted">' + esc(a.asset.exchange || '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="asset-actions">' +
        '<button class="btn btn-sm" data-open-glossary>' + ui.icon('book', 14) + ' ' + esc(T('common.glossary')) + '</button>' +
        '<button class="btn btn-sm" data-refresh>' + ui.icon('refresh', 14) + ' ' + esc(T('an.refresh')) + '</button>' +
      '</div>' +
    '</div>';
  }

  function tabs(a, style, settings) {
    return '<div class="tabs" role="tablist" aria-label="' + U.attr(T('an.tabs.label')) + '">' +
      STYLES.map(function (s) {
        var isDefault = settings.defaultStyle === s;
        return '<a class="tab" role="tab" href="' + U.attr(TA.app.analysisUrl(a.asset, s)) + '" ' +
          'aria-selected="' + (s === style ? 'true' : 'false') + '">' +
          esc(T('an.tab.' + s)) +
          (isDefault ? '<span class="dot-default" title="' + U.attr(T('an.tab.default')) + '"></span>' : '') +
        '</a>';
      }).join('') +
    '</div>';
  }

  function pageHtml(entry, style) {
    var a = entry.a;
    var settings = TA.store.settings();
    return '<div class="wrap page">' +
      '<div class="crumbs"><a href="#/">' + esc(T('an.back')) + '</a><span>/</span><span>' + esc(T('an.crumb')) + '</span>' +
        '<span>/</span><span class="mono">' + esc(a.asset.symbol) + '</span></div>' +
      assetHead(a) +
      tabs(a, style, settings) +
      dataBanners(a) +
      '<div style="margin-top:18px"></div>' +
      snapshotSection(a) +
      planCard(entry) +
      copilotCard(entry) +
      lensSection(a, style) +
      contextSection(a) +
      casesSection(a) +
      levelsSection(a) +
      scenariosSection(a) +
      risksSection(a) +
      sourcesSection(a) +
      feedbackCard() +
      noteCard(a) +
      disclaimerBlock() +
      '<div class="tiny muted" style="text-align:center;margin-top:22px">' + esc(T('dash.footer')) + '</div>' +
      '</div>';
  }

  function skeletonPage(asset, style) {
    return '<div class="wrap page">' +
      '<div class="crumbs"><a href="#/">' + esc(T('an.back')) + '</a><span>/</span><span>' + esc(T('an.crumb')) + '</span></div>' +
      '<div class="asset-head"><div><div class="asset-title"><h1><span class="mono">' + esc(asset ? asset.symbol : '') + '</span>' +
        (asset ? '<span class="name">' + esc(asset.name) + '</span>' : '') + '</h1></div>' +
        '<div class="asset-meta"><span class="badge badge-neutral">' + esc(T('common.loading')) + '</span></div></div></div>' +
      '<div class="card loading-card" style="margin-top:10px" role="status" aria-live="polite">' +
        '<div class="row"><span class="spinner"></span><span style="font-size:13px">' + esc(T('an.loading.title')) + '</span></div>' +
        '<div class="skeleton" style="height:12px;width:46%"></div>' +
        '<div class="skeleton" style="height:12px;width:62%"></div>' +
        '<div class="skeleton" style="height:180px;width:100%;margin-top:6px"></div>' +
        '<div class="tiny muted">' + esc(T('an.loading.step1')) + ' · ' + esc(T('an.loading.step2')) + ' · ' + esc(T('an.loading.step3')) + '</div>' +
      '</div></div>';
  }

  function errorPage(msgTitle, msgBody, showRetry) {
    return '<div class="wrap page">' +
      '<div class="crumbs"><a href="#/">' + esc(T('an.back')) + '</a></div>' +
      '<div class="card error-card" style="margin-top:22px"><div class="card-body">' +
        '<h2>' + esc(msgTitle) + '</h2>' +
        '<p class="muted small">' + esc(msgBody) + '</p>' +
        '<div style="display:flex;gap:8px;margin-top:6px">' +
          (showRetry ? '<button class="btn btn-primary btn-sm" data-retry>' + esc(T('common.retry')) + '</button>' : '') +
          '<a class="btn btn-sm" href="#/">' + esc(T('an.back')) + '</a>' +
        '</div>' +
      '</div></div></div>';
  }

  /* ---------------- bindings ---------------- */
  function bind(root, entry, style, reload) {
    var a = entry.a;
    bindChartFullscreen(root, a);
    bindPlan(root, entry, style);
    bindCopilot(root, entry);
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-open-legal]')) { e.preventDefault(); ui.legalModal(); }
      if (e.target.closest('[data-open-glossary]')) { e.preventDefault(); ui.glossaryModal(); }
    });

    var refresh = root.querySelector('[data-refresh]');
    if (refresh) refresh.addEventListener('click', function () {
      TA.data.clearCache();
      reload(true);
    });

    var watch = root.querySelector('[data-watch]');
    if (watch) watch.addEventListener('click', function () {
      var added = TA.store.toggleWatch(a.asset.symbol, a.asset.assetClass, a.asset.coingeckoId, a.asset.name, a.asset.exchange);
      watch.setAttribute('aria-pressed', added ? 'true' : 'false');
      watch.innerHTML = ui.icon(added ? 'starFill' : 'star', 16);
      var lbl = T(added ? 'nav.unstar' : 'nav.star', { sym: a.asset.symbol });
      watch.setAttribute('aria-label', lbl);
      watch.setAttribute('title', lbl);
    });

    var currentFbId = null;
    var commentRow = root.querySelector('.fb-comment');
    U.$$('[data-fb]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        U.$$('[data-fb]', root).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        var verdict = b.getAttribute('data-fb');
        currentFbId = TA.store.addFeedback({
          symbol: a.asset.symbol,
          assetClass: a.asset.assetClass,
          style: style,
          interval: a.meta.interval,
          dataMode: a.meta.dataMode,
          engine: a.engine,
          lean: a.lean.dir,
          confidence: a.lean.confidence,
          verdict: verdict,
          comment: ''
        });
        if (commentRow) { commentRow.hidden = false; }
        ui.toast(T('an.feedback.thanks'));
      });
    });
    var send = root.querySelector('[data-fb-send]');
    if (send) send.addEventListener('click', function () {
      var input = root.querySelector('[data-fb-comment]');
      if (currentFbId) TA.store.updateFeedback(currentFbId, { comment: (input.value || '').slice(0, 240) });
      ui.toast(T('an.feedback.thanks'));
      if (input) input.value = '';
    });

    var noteSave = root.querySelector('[data-note-save]');
    if (noteSave) noteSave.addEventListener('click', function () {
      var ta = root.querySelector('[data-note]');
      TA.store.setNote(a.asset.symbol, ta.value);
      var hint = root.querySelector('#note-title');
      ui.toast(T('an.note.saved'));
      var card = noteSave.closest('.card');
      var h = card.querySelector('.hint');
      if (h) h.textContent = T('an.note.updated', { time: U.fmtDateTime(Date.now(), lang()) });
    });

    U.$$('[data-retry]', root).forEach(function (b) {
      b.addEventListener('click', function () { reload(true); });
    });
  }

  /* ---------------- render ---------------- */
  function render(root, params) {
    stopPlanLive();
    stopChartFullscreen();
    var settings = TA.store.settings();
    var style = STYLES.indexOf(params.style) >= 0 ? params.style : settings.defaultStyle;
    if (STYLES.indexOf(style) < 0) style = 'swing';
    var asset = assetFromParams(params);
    var mySeq = ++seq;
    var key = asset ? cacheKey(asset, style) : null;

    function paint(entry) {
      if (mySeq !== seq) return;
      root.innerHTML = pageHtml(entry, style);
      bind(root, entry, style, function (force) { load(force); });
      if (TA.store.isWatched(entry.a.asset.symbol)) {
        // header star already reflects store state
      }
    }

    function load(force) {
      if (!asset) {
        root.innerHTML = errorPage(T('an.error.notfound'), T('an.error.notfound_body'), false);
        return;
      }
      if (!force && cache[key]) { paint(cache[key]); return; }
      root.innerHTML = skeletonPage(asset, style);
      var tf = style === 'day' ? 'intraday' : 'daily';
      TA.data.getMarketData(asset, { timeframe: tf }).then(function (payload) {
        if (mySeq !== seq) return;
        var a = TA.analysis.build({
          asset: payload.asset, candles: payload.candles, quote: payload.quote,
          meta: payload.meta, lang: lang()
        });
        var entry = { payload: payload, a: a, ts: Date.now() };
        entry.plan = TA.tradeplan.build(a, {
          lang: lang(), style: style,
          levels: TA.store.getPlanLevels(planLevelsKey(a, style))
        });
        cache[key] = entry;
        TA.store.addRecent({
          symbol: a.asset.symbol, assetClass: a.asset.assetClass, name: a.asset.name,
          coingeckoId: a.asset.coingeckoId || null, exchange: a.asset.exchange || null,
          style: style, tf: tf, dataMode: a.meta.dataMode,
          lean: { dir: a.lean.dir, confidence: a.lean.confidence }
        });
        paint(entry);
      }).catch(function (err) {
        if (mySeq !== seq) return;
        root.innerHTML = errorPage(T('an.error.title'), T('an.error.body') + ' (' + (err && err.message || 'error') + ')', true);
        var retry = root.querySelector('[data-retry]');
        if (retry) retry.addEventListener('click', function () { load(true); });
      });
    }

    load(false);
  }

  TA.views = TA.views || {};
  TA.views.analysis = { render: render, STYLES: STYLES };
})(window.TA = window.TA || {});
