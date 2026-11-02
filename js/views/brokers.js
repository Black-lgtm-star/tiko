/* views/brokers.js — educational broker landscape reference (no accounts, no execution) */
(function (TA) {
  'use strict';
  var U = TA.util;
  var ui = TA.ui;
  var T = function () { return TA.i18n.t.apply(null, arguments); };

  var REGIONS = [
    {
      id: 'south-asia',
      nameKey: 'brokers.region.southAsia',
      snapKey: 'brokers.region.southAsia.snap',
      lead: {
        equities: 'Groww · Zerodha · Angel One · Upstox · Dhan · KTrade',
        intl: 'IBKR · Saxo · Vested · INDmoney · Moomoo',
        fx: 'Exness · XM · Pepperstone · IC Markets (offshore; restricted in India)',
        crypto: 'CoinDCX · WazirX · CoinSwitch (India); no licensed local exchange in Pakistan'
      },
      regulators: 'SEBI · SECP · BSEC · SEC (LK) · SEBON',
      notes: ['brokers.region.southAsia.n1', 'brokers.region.southAsia.n2', 'brokers.region.southAsia.n3'],
      other: 'Motilal Oswal · Kotak Securities · IIFL · Mirae Asset (mStock) · Fyers · Alice Blue · ZebPay · Mudrex · Giottus · JS Global · AHL · IDLC · BRAC EPL · Acuity · Asia Securities'
    },
    {
      id: 'southeast-asia',
      nameKey: 'brokers.region.seAsia',
      snapKey: 'brokers.region.seAsia.snap',
      lead: {
        equities: 'Ajaib · Stockbit · Bibit · VPS · SSI · TCBS · COL · GStocks · Dime · Moomoo MY · Rakuten Trade',
        intl: 'Moomoo · Tiger · IBKR · Saxo · Webull',
        fx: 'Exness · XM · Pepperstone · IC Markets · local futures brokers',
        crypto: 'Indodax · Pintu · Tokocrypto · Bitkub · Binance TH · Coins.ph · PDAX · Luno MY · Tokenize'
      },
      regulators: 'OJK · SSC · SEC (PH) · SEC Thailand · SC Malaysia',
      notes: ['brokers.region.seAsia.n1', 'brokers.region.seAsia.n2', 'brokers.region.seAsia.n3'],
      other: 'Mirae Asset (ID) · Sinarmas Sekuritas · Mandiri Sekuritas · BNI Sekuritas · Reku · Nanovest · HSC · MBS · Vietcap · VPBank Securities · Philstocks · BDO Securities · BPI Trade · KSecurities · SCB Securities · InnovestX · Webull Thailand · CGS International · Kenanga · Apex Securities · Webull Malaysia · Hata · MX Global'
    },
    {
      id: 'latam',
      nameKey: 'brokers.region.latam',
      snapKey: 'brokers.region.latam.snap',
      lead: {
        equities: 'XP · BTG · Nubank/NuInvest · Inter · GBM+ · Kuspit · Hapi · Balanz · Cocos · IOL · Trii · Tyba · Fintual · Racional',
        intl: 'IBKR · Hapi · Avenue · XTB · eToro',
        fx: 'XTB · Exness · XM · local exchange-traded derivatives',
        crypto: 'Bitso · Mercado Bitcoin · Foxbit · Lemon · Ripio · Belo · Buda · CryptoMKT'
      },
      regulators: 'CVM · CNBV · CNV · SFC · CMF',
      notes: ['brokers.region.latam.n1', 'brokers.region.latam.n2', 'brokers.region.latam.n3'],
      other: 'Genial · Terra · Ativa · Guide · Órama · Modal · Nova Futura · Clear Corretora · Bitcoin Market · Volabit · Flink · Actinver · Vector Capital · LarrainVial · Credicorp Capital · Kallpa · Renta4 · Balanz Peru'
    },
    {
      id: 'mena',
      nameKey: 'brokers.region.mena',
      snapKey: 'brokers.region.mena.snap',
      lead: {
        equities: 'Al Rajhi Capital · SNB Capital · Derayah · Sarwa · Baraka · Thndr · Midas',
        intl: 'IBKR · Saxo · eToro · Sarwa · Baraka',
        fx: 'Exness · XM · Pepperstone · IG · local licensed brokers',
        crypto: 'Rain · BitOasis · CoinMena · BtcTurk · Paribu · Binance TR'
      },
      regulators: 'CMA · SCA · DFSA · FSRA · VARA · FRA · SPK',
      notes: ['brokers.region.mena.n1', 'brokers.region.mena.n2', 'brokers.region.mena.n3'],
      other: 'StashAway MENA · FAB Securities · Mashreq Securities · HSBC UAE · Saxo (DFSA) · Interactive Brokers · Alinma Investment · SAB Invest · Albilad Capital · Saudi Fransi Capital · Jadwa · Falcom · Arabeya Online · CI Capital · Pioneers Securities · Gedik Yatırım · Ak Yatırım · ICrypex · Coinbase (where available)'
    },
    {
      id: 'sub-saharan-africa',
      nameKey: 'brokers.region.ssa',
      snapKey: 'brokers.region.ssa.snap',
      lead: {
        equities: 'EasyEquities · Standard Bank · FNB · Absa · Bamboo · Trove · Chaka · Hisa · Ndovu',
        intl: 'IBKR · Chaka · Bamboo · Trove · EasyEquities',
        fx: 'Exness · XM · Pepperstone · local FSCA/CMA-licensed firms',
        crypto: 'Luno · VALR · AltCoinTrader · Quidax · Busha · Yellow Card'
      },
      regulators: 'FSCA · SEC Nigeria · CMA Kenya · CREPMF · AMMC',
      notes: ['brokers.region.ssa.n1', 'brokers.region.ssa.n2', 'brokers.region.ssa.n3'],
      other: 'Investec · PSG Wealth · Sanlam iTrade · Allan Gray · Sygnia · Bright Futures · Meristem · Cordros · ARM · CardinalStone · Chapel Hill Denham · FBNQuest · GTCO · Patricia · Roqqu · Breet · Cytonn · NCBA Invest · Dyer & Blair · Sterling Capital · Orbit Securities · Vertex · CDG Capital · Attijari Intermédiation · BMCE Capital · NSIA Bourse · Coris Bourse'
    },
    {
      id: 'emerging-europe',
      nameKey: 'brokers.region.europe',
      snapKey: 'brokers.region.europe.snap',
      lead: {
        equities: 'XTB · mBank eMakler · DM BOŚ · Tradeville · Fio · T-Bank · Finam · BCS · Freedom Broker · Halyk · Kaspi',
        intl: 'IBKR · Saxo · XTB · Freedom',
        fx: 'XTB · Exness · XM · Pepperstone · local FX dealers',
        crypto: 'Zonda (PL/EU) · licensed KZ exchanges; crypto restricted in RU'
      },
      regulators: 'KNF · ASF · CNB · MNB · HCMC · CBR · AFSA',
      notes: ['brokers.region.europe.n1', 'brokers.region.europe.n2', 'brokers.region.europe.n3'],
      other: 'Santander Bank Polska · ING Poland · Raiffeisen Romania · Swiss Capital · Goldring · Concorde · Random Capital · Piraeus Securities · Eurobank Equities · Alpha Finance · Aton · ITI Capital · Gazprombank · Opening · Halyk Global Markets · Forte Finance · Asyl Invest · Uznex'
    }
  ];

  var ARCHETYPES = [
    { t: 'brokers.arch.full.t', d: 'brokers.arch.full.d', earn: 'brokers.arch.full.earn', e: 'ICICI Direct · Al Rajhi Capital · BTG Pactual · Standard Bank · EFG Hermes' },
    { t: 'brokers.arch.discount.t', d: 'brokers.arch.discount.d', earn: 'brokers.arch.discount.earn', e: 'Groww · Zerodha · Ajaib · XP · EasyEquities · Midas' },
    { t: 'brokers.arch.robo.t', d: 'brokers.arch.robo.d', earn: 'brokers.arch.robo.earn', e: 'Fintual · Bibit · Sarwa · 10X · Ndovu · Cowrywise' },
    { t: 'brokers.arch.fx.t', d: 'brokers.arch.fx.d', earn: 'brokers.arch.fx.earn', e: 'Pepperstone · IC Markets · Exness · XM · IG · Saxo · XTB' },
    { t: 'brokers.arch.futures.t', d: 'brokers.arch.futures.d', earn: 'brokers.arch.futures.earn', e: 'IBKR · Saxo · tastytrade · AMP Global · local exchange members' },
    { t: 'brokers.arch.crypto.t', d: 'brokers.arch.crypto.d', earn: 'brokers.arch.crypto.earn', e: 'Bitso · Mercado Bitcoin · Luno · Indodax · Bitkub · BtcTurk · CoinDCX' },
    { t: 'brokers.arch.intl.t', d: 'brokers.arch.intl.d', earn: 'brokers.arch.intl.earn', e: 'Interactive Brokers · Saxo · Swissquote · eToro · XTB' },
    { t: 'brokers.arch.exchange.t', d: 'brokers.arch.exchange.d', earn: 'brokers.arch.exchange.earn', e: 'DFM app · ADX app · MeroShare · some PSE apps' }
  ];

  var LADDER = ['1', '2', '3', '4', '5'].map(function (n) {
    return { t: 'brokers.reg.l' + n + '.t', d: 'brokers.reg.l' + n + '.d' };
  });

  var COMPENSATION = [
    { label: 'SIPC', key: 'brokers.comp.sipc' },
    { label: 'FSCS', key: 'brokers.comp.fscs' },
    { label: 'EU', key: 'brokers.comp.eu' },
    { label: 'CIPF', key: 'brokers.comp.cipf' },
    { label: 'HK', key: 'brokers.comp.hk' },
    { label: '—', key: 'brokers.comp.most' }
  ];

  var VERIFY = ['1', '2', '3', '4', '5', '6'].map(function (n) {
    return 'brokers.verify.' + n;
  });

  var FEES = [
    { t: 'brokers.fee.commission', d: 'brokers.fee.commission.d' },
    { t: 'brokers.fee.spread', d: 'brokers.fee.spread.d' },
    { t: 'brokers.fee.fx', d: 'brokers.fee.fx.d' },
    { t: 'brokers.fee.custody', d: 'brokers.fee.custody.d' },
    { t: 'brokers.fee.inactivity', d: 'brokers.fee.inactivity.d' },
    { t: 'brokers.fee.withdrawal', d: 'brokers.fee.withdrawal.d' },
    { t: 'brokers.fee.financing', d: 'brokers.fee.financing.d' },
    { t: 'brokers.fee.data', d: 'brokers.fee.data.d' },
    { t: 'brokers.fee.taxes', d: 'brokers.fee.taxes.d' },
    { t: 'brokers.fee.corporate', d: 'brokers.fee.corporate.d' }
  ];

  var COST_TRAPS = ['1', '2', '3', '4', '5', '6', '7', '8'].map(function (n) {
    return 'brokers.traps.' + n;
  });

  var ALLIN = [
    { label: 'brokers.allin.india', value: '~0.15–0.30%' },
    { label: 'brokers.allin.indiaUs', value: '~1–3% + TCS' },
    { label: 'brokers.allin.brazil', value: '~0.05–0.20%' },
    { label: 'brokers.allin.southAfrica', value: '~0.75–1.0%' },
    { label: 'brokers.allin.uae', value: '~0.3–1.0%' },
    { label: 'brokers.allin.nigeria', value: '~2–4%' },
    { label: 'brokers.allin.vietnam', value: '~0.25–0.45%' },
    { label: 'brokers.allin.indonesia', value: '~0.40%' },
    { label: 'brokers.allin.philippines', value: '~0.30–0.50%' }
  ];

  var ASSETS = [
    { icon: 'chart', t: 'brokers.assets.equities.t', bullets: ['1', '2', '3', '4'].map(function (n) { return 'brokers.assets.equities.' + n; }) },
    { icon: 'pulse', t: 'brokers.assets.fx.t', bullets: ['1', '2', '3'].map(function (n) { return 'brokers.assets.fx.' + n; }) },
    { icon: 'target', t: 'brokers.assets.futures.t', bullets: ['1', '2', '3'].map(function (n) { return 'brokers.assets.futures.' + n; }) },
    { icon: 'shield', t: 'brokers.assets.crypto.t', bullets: ['1', '2', '3', '4'].map(function (n) { return 'brokers.assets.crypto.' + n; }) }
  ];

  var TAX = ['1', '2', '3', '4', '5', '6'].map(function (n) { return 'brokers.tax.' + n; });

  var CHECKS = [
    'brokers.check.q1', 'brokers.check.q2', 'brokers.check.q3', 'brokers.check.q4', 'brokers.check.q5',
    'brokers.check.q6', 'brokers.check.q7', 'brokers.check.q8', 'brokers.check.q9', 'brokers.check.q10',
    'brokers.check.q11', 'brokers.check.q12', 'brokers.check.q13', 'brokers.check.q14', 'brokers.check.q15',
    'brokers.check.q16', 'brokers.check.q17', 'brokers.check.q18', 'brokers.check.q19', 'brokers.check.q20'
  ];

  var RED_FLAGS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(function (n) {
    return 'brokers.red.' + n;
  });

  var SCORECARD = [
    { key: 'brokers.score.regulation', weight: '20%' },
    { key: 'brokers.score.cost', weight: '15%' },
    { key: 'brokers.score.products', weight: '15%' },
    { key: 'brokers.score.funding', weight: '10%' },
    { key: 'brokers.score.platform', weight: '10%' },
    { key: 'brokers.score.research', weight: '10%' },
    { key: 'brokers.score.tax', weight: '5%' },
    { key: 'brokers.score.local', weight: '5%' },
    { key: 'brokers.score.strength', weight: '5%' },
    { key: 'brokers.score.complaints', weight: '5%' }
  ];

  var TRENDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(function (n) {
    return 'brokers.trends.' + n;
  });

  var REGISTERS = [
    { label: 'SEBI', url: 'https://www.sebi.gov.in' },
    { label: 'CVM Brazil', url: 'https://www.gov.br/cvm' },
    { label: 'CNBV Mexico', url: 'https://www.gob.mx/cnbv' },
    { label: 'CNV Argentina', url: 'https://www.argentina.gob.ar/cnv' },
    { label: 'SFC Colombia', url: 'https://www.superfinanciera.gov.co' },
    { label: 'CMF Chile', url: 'https://www.cmfchile.cl' },
    { label: 'CMA Saudi Arabia', url: 'https://www.cma.org.sa' },
    { label: 'SCA UAE', url: 'https://www.sca.gov.ae' },
    { label: 'DFSA', url: 'https://www.dfsa.ae' },
    { label: 'VARA', url: 'https://www.vara.ae' },
    { label: 'FRA Egypt', url: 'https://fra.gov.eg' },
    { label: 'SPK Turkey', url: 'https://www.spk.gov.tr' },
    { label: 'FSCA South Africa', url: 'https://www.fsca.co.za' },
    { label: 'SEC Nigeria', url: 'https://sec.gov.ng' },
    { label: 'CMA Kenya', url: 'https://www.cma.or.ke' },
    { label: 'OJK Indonesia', url: 'https://www.ojk.go.id' },
    { label: 'SSC Vietnam', url: 'https://www.ssc.gov.vn' },
    { label: 'SEC Philippines', url: 'https://www.sec.gov.ph' },
    { label: 'SEC Thailand', url: 'https://www.sec.or.th' },
    { label: 'SC Malaysia', url: 'https://www.sc.com.my' },
    { label: 'KNF Poland', url: 'https://www.knf.gov.pl' },
    { label: 'CBR Russia', url: 'https://www.cbr.ru' },
    { label: 'AFSA Kazakhstan', url: 'https://afsa.kz' },
    { label: 'SFC Hong Kong', url: 'https://www.sfc.hk' }
  ];

  var currentRegion = REGIONS[0].id;

  function findRegion(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return REGIONS[0];
  }

  function titleIcon(name, key) {
    return ui.icon(name, 14) + U.esc(T(key));
  }

  function hero() {
    return '<section class="hero broker-hero" aria-labelledby="broker-title">' +
      '<div class="hero-inner"><div class="hero-copy">' +
        '<span class="eyebrow hero-kicker"><i class="dot"></i>' + U.esc(T('brokers.eyebrow')) + '</span>' +
        '<h1 id="broker-title">' + U.esc(T('brokers.title')) + '</h1>' +
        '<p class="hero-sub">' + U.esc(T('brokers.lede')) + '</p>' +
        '<div class="hero-actions"><span class="badge badge-sample">' + U.esc(T('brokers.badge')) + '</span></div>' +
      '</div></div></section>';
  }

  function noticeCard() {
    return '<section class="card span-12 broker-notice" aria-labelledby="broker-notice-title">' +
      '<div class="card-body broker-notice-body">' +
        '<span class="broker-notice-icon" aria-hidden="true">' + ui.icon('warning', 18) + '</span>' +
        '<div><h2 id="broker-notice-title">' + U.esc(T('brokers.notice.title')) + '</h2>' +
        '<ul class="broker-list">' +
          '<li>' + U.esc(T('brokers.notice.p1')) + '</li>' +
          '<li>' + U.esc(T('brokers.notice.p2')) + '</li>' +
          '<li>' + U.esc(T('brokers.notice.p3')) + '</li>' +
        '</ul></div>' +
      '</div></section>';
  }

  function startCard() {
    var icons = ['shield', 'search', 'scale'];
    return '<section class="card span-12 edge-cyan" aria-labelledby="broker-start-title">' +
      '<div class="card-head"><div><h2 id="broker-start-title">' + titleIcon('shield', 'brokers.start.title') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.start.lede')) + '</p></div></div>' +
      '<div class="card-body"><div class="broker-start-grid">' +
        [1, 2, 3].map(function (n) {
          return '<div class="broker-start-step">' +
            '<h3>' + ui.icon(icons[n - 1], 14) + U.esc(T('brokers.start.' + n + '.t')) + '</h3>' +
            '<p class="small muted">' + U.esc(T('brokers.start.' + n + '.d')) + '</p></div>';
        }).join('') +
      '</div></div></section>';
  }

  function catCard(labelKey, value) {
    return '<div class="broker-cat"><span class="broker-cat-label">' + U.esc(T(labelKey)) + '</span>' +
      '<p>' + U.esc(value) + '</p></div>';
  }

  function regionPanel(region) {
    return '<p class="broker-snapshot">' + U.esc(T(region.snapKey)) + '</p>' +
      '<div class="broker-cat-grid">' +
        catCard('brokers.regions.equities', region.lead.equities) +
        catCard('brokers.regions.intl', region.lead.intl) +
        catCard('brokers.regions.fx', region.lead.fx) +
        catCard('brokers.regions.crypto', region.lead.crypto) +
      '</div>' +
      '<div class="broker-region-cols">' +
        '<div><h3>' + U.esc(T('brokers.regions.notes')) + '</h3><ul class="broker-notes">' +
          region.notes.map(function (key) { return '<li>' + U.esc(T(key)) + '</li>'; }).join('') +
        '</ul></div>' +
        '<div><h3>' + U.esc(T('brokers.regions.regulators')) + '</h3>' +
          '<p class="small">' + U.esc(region.regulators) + '</p>' +
          '<h3 class="broker-col-gap">' + U.esc(T('brokers.regions.other')) + '</h3>' +
          '<p class="tiny muted">' + U.esc(region.other) + '</p>' +
        '</div>' +
      '</div>' +
      '<p class="tiny muted broker-region-foot">' + U.esc(T('brokers.regions.foot')) + '</p>';
  }

  function regionCard() {
    var region = findRegion(currentRegion);
    return '<section class="card span-12 edge-cyan" aria-labelledby="broker-regions-title">' +
      '<div class="card-head"><div><h2 id="broker-regions-title">' + titleIcon('layers', 'brokers.regions.title') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.regions.lede')) + '</p></div>' +
      '<span class="badge badge-neutral">' + U.esc(T('brokers.badge')) + '</span></div>' +
      '<div class="card-body">' +
        '<div class="tabs broker-tabs" role="tablist" aria-label="' + U.attr(T('brokers.regions.title')) + '">' +
          REGIONS.map(function (r) {
            var selected = r.id === region.id;
            return '<button class="tab" type="button" role="tab" id="broker-tab-' + r.id + '" ' +
              'aria-controls="broker-region-panel" aria-selected="' + selected + '" data-region="' + r.id + '">' +
              U.esc(T(r.nameKey)) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="broker-region-panel" id="broker-region-panel" role="tabpanel" ' +
          'aria-labelledby="broker-tab-' + region.id + '" data-region-panel>' + regionPanel(region) + '</div>' +
      '</div></section>';
  }

  function archetypeCard() {
    return '<section class="card span-12 edge-violet" aria-labelledby="broker-arch-title">' +
      '<div class="card-head"><div><h2 id="broker-arch-title">' + titleIcon('layers', 'brokers.arch.title') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.arch.lede')) + '</p></div></div>' +
      '<div class="card-body"><div class="broker-arch-grid">' +
        ARCHETYPES.map(function (a) {
          return '<article class="broker-arch"><h3>' + U.esc(T(a.t)) + '</h3>' +
            '<p>' + U.esc(T(a.d)) + '</p>' +
            '<p class="tiny muted"><b>' + U.esc(T('brokers.arch.how')) + '</b> ' + U.esc(T(a.earn)) + '</p>' +
            '<p class="tiny muted"><b>' + U.esc(T('brokers.arch.examples')) + '</b> ' + U.esc(a.e) + '</p></article>';
        }).join('') +
      '</div></div></section>';
  }

  function regulationCard() {
    return '<section class="card span-7 edge-amber" aria-labelledby="broker-reg-title">' +
      '<div class="card-head"><div><h2 id="broker-reg-title">' + titleIcon('scale', 'brokers.reg.title') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.reg.lede')) + '</p></div></div>' +
      '<div class="card-body"><ol class="broker-ladder">' +
        LADDER.map(function (l, i) {
          return '<li><span class="section-num">0' + (i + 1) + '</span><div>' +
            '<b>' + U.esc(T(l.t)) + '</b><p>' + U.esc(T(l.d)) + '</p></div></li>';
        }).join('') +
      '</ol><p class="broker-rule">' + U.esc(T('brokers.reg.rule')) + '</p></div></section>';
  }

  function verifyCard() {
    return '<section class="card span-5 edge-cyan" aria-labelledby="broker-verify-title">' +
      '<div class="card-head"><h2 id="broker-verify-title">' + titleIcon('check', 'brokers.verify.title') + '</h2></div>' +
      '<div class="card-body"><ol class="broker-list broker-verify-list">' +
        VERIFY.map(function (key) { return '<li>' + U.esc(T(key)) + '</li>'; }).join('') +
      '</ol></div></section>';
  }

  function compensationCard() {
    return '<section class="card span-6 edge-amber" aria-labelledby="broker-comp-title">' +
      '<div class="card-head"><h2 id="broker-comp-title">' + titleIcon('shield', 'brokers.comp.title') + '</h2></div>' +
      '<div class="card-body"><div class="broker-comp-list">' +
        COMPENSATION.map(function (c) {
          return '<div class="broker-comp-row"><b>' + U.esc(c.label) + '</b><span>' + U.esc(T(c.key)) + '</span></div>';
        }).join('') +
      '</div><p class="tiny muted broker-comp-note">' + U.esc(T('brokers.comp.note')) + '</p></div></section>';
  }

  function scorecardCard() {
    return '<section class="card span-6 edge-violet" aria-labelledby="broker-score-title">' +
      '<div class="card-head"><div><h2 id="broker-score-title">' + titleIcon('target', 'brokers.score.title') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.score.lede')) + '</p></div></div>' +
      '<div class="card-body"><div class="broker-weights">' +
        SCORECARD.map(function (s) {
          return '<div class="broker-weight"><span>' + U.esc(T(s.key)) + '</span><b class="mono">' + U.esc(s.weight) + '</b></div>';
        }).join('') +
      '</div></div></section>';
  }

  function feesCard() {
    return '<section class="card span-12 edge-magenta" aria-labelledby="broker-fees-title">' +
      '<div class="card-head"><div><h2 id="broker-fees-title">' + titleIcon('scale', 'brokers.fees.title') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.fees.lede')) + '</p></div></div>' +
      '<div class="card-body broker-fee-cols">' +
        '<div><div class="broker-subhead">' + U.esc(T('brokers.fees.taxonomy')) + '</div>' +
          '<div class="broker-table-wrap"><table class="broker-table"><thead><tr>' +
            '<th>' + U.esc(T('brokers.fees.col')) + '</th><th>' + U.esc(T('brokers.fees.why')) + '</th>' +
          '</tr></thead><tbody>' +
            FEES.map(function (f) {
              return '<tr><td><b>' + U.esc(T(f.t)) + '</b></td><td>' + U.esc(T(f.d)) + '</td></tr>';
            }).join('') +
          '</tbody></table></div></div>' +
        '<div><div class="broker-subhead">' + U.esc(T('brokers.fees.traps')) + '</div>' +
          '<ol class="broker-trap-list">' +
            COST_TRAPS.map(function (key) { return '<li>' + U.esc(T(key)) + '</li>'; }).join('') +
          '</ol></div>' +
      '</div></section>';
  }

  function allInCard() {
    return '<section class="card span-12 edge-amber" aria-labelledby="broker-allin-title">' +
      '<div class="card-head"><div><h2 id="broker-allin-title">' + titleIcon('pulse', 'brokers.fees.allin') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.fees.note')) + '</p></div></div>' +
      '<div class="card-body"><div class="broker-table-wrap"><table class="broker-table broker-allin-table"><thead><tr>' +
        '<th>' + U.esc(T('brokers.fees.scenario')) + '</th><th>' + U.esc(T('brokers.fees.rough')) + '</th>' +
      '</tr></thead><tbody>' +
        ALLIN.map(function (a) {
          return '<tr><td>' + U.esc(T(a.label)) + '</td><td class="broker-allin-value">' + U.esc(a.value) + '</td></tr>';
        }).join('') +
      '</tbody></table></div></div></section>';
  }

  function assetsCard() {
    return '<section class="card span-12 edge-cyan" aria-labelledby="broker-assets-title">' +
      '<div class="card-head"><h2 id="broker-assets-title">' + titleIcon('chart', 'brokers.assets.title') + '</h2></div>' +
      '<div class="card-body"><div class="broker-asset-grid">' +
        ASSETS.map(function (a) {
          return '<article class="broker-asset"><h3>' + ui.icon(a.icon, 14) + U.esc(T(a.t)) + '</h3><ul>' +
            a.bullets.map(function (key) { return '<li>' + U.esc(T(key)) + '</li>'; }).join('') +
          '</ul></article>';
        }).join('') +
      '</div></div></section>';
  }

  function taxCard() {
    return '<section class="card span-12 edge-violet" aria-labelledby="broker-tax-title">' +
      '<div class="card-head"><div><h2 id="broker-tax-title">' + titleIcon('flag', 'brokers.tax.title') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.tax.note')) + '</p></div></div>' +
      '<div class="card-body"><ul class="broker-list broker-tax-list">' +
        TAX.map(function (key) { return '<li>' + U.esc(T(key)) + '</li>'; }).join('') +
      '</ul></div></section>';
  }

  function checkItem(key, index) {
    var id = 'q' + (index + 1);
    var stored = TA.store.brokerChecks ? TA.store.brokerChecks() : {};
    var on = stored[id] === true;
    return '<label class="broker-check' + (on ? ' is-done' : '') + '">' +
      '<input type="checkbox" data-check-id="' + id + '"' + (on ? ' checked' : '') + '>' +
      '<span class="broker-check-box" aria-hidden="true">' + ui.icon('check', 11) + '</span>' +
      '<span>' + U.esc(T(key)) + '</span></label>';
  }

  function checklistCard() {
    return '<section class="card span-7 edge-cyan" aria-labelledby="broker-check-title">' +
      '<div class="card-head"><div><h2 id="broker-check-title">' + titleIcon('check', 'brokers.check.title') + '</h2>' +
      '<p class="tiny muted">' + U.esc(T('brokers.check.lede')) + '</p></div>' +
      '<span class="badge badge-neutral" data-check-count></span></div>' +
      '<div class="card-body">' +
        '<div class="broker-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + CHECKS.length + '" data-check-meter>' +
          '<span data-check-bar></span></div>' +
        '<div class="broker-check-grid">' +
          CHECKS.map(checkItem).join('') +
        '</div>' +
        '<div class="broker-check-foot"><button class="btn btn-sm btn-ghost" type="button" data-check-reset>' +
          ui.icon('refresh', 12) + U.esc(T('brokers.check.reset')) + '</button></div>' +
      '</div></section>';
  }

  function redFlagsCard() {
    return '<section class="card span-5 edge-magenta" aria-labelledby="broker-red-title">' +
      '<div class="card-head"><h2 id="broker-red-title">' + titleIcon('warning', 'brokers.red.title') + '</h2></div>' +
      '<div class="card-body"><ul class="broker-list broker-red-list">' +
        RED_FLAGS.map(function (key) { return '<li>' + U.esc(T(key)) + '</li>'; }).join('') +
      '</ul></div></section>';
  }

  function trendsCard() {
    return '<section class="card span-12 edge-violet" aria-labelledby="broker-trends-title">' +
      '<div class="card-head"><h2 id="broker-trends-title">' + titleIcon('pulse', 'brokers.trends.title') + '</h2></div>' +
      '<div class="card-body"><ol class="broker-trend-list">' +
        TRENDS.map(function (key, i) {
          var n = i + 1;
          return '<li><span class="section-num">' + (n < 10 ? '0' + n : n) + '</span><p>' + U.esc(T(key)) + '</p></li>';
        }).join('') +
      '</ol></div></section>';
  }

  function sourcesCard() {
    return '<section class="card span-12" aria-labelledby="broker-sources-title">' +
      '<div class="card-head"><h2 id="broker-sources-title">' + titleIcon('book', 'brokers.sources.title') + '</h2></div>' +
      '<div class="card-body broker-sources">' +
        '<p class="small muted">' + U.esc(T('brokers.sources.p1')) + '</p>' +
        '<p class="small muted">' + U.esc(T('brokers.sources.p2')) + '</p>' +
        '<p class="small muted">' + U.esc(T('brokers.sources.p3')) + '</p>' +
        '<div class="broker-subhead">' + U.esc(T('brokers.sources.registers')) + '</div>' +
        '<div class="broker-register-grid">' +
          REGISTERS.map(function (r) {
            return '<a class="broker-register" href="' + U.attr(r.url) + '" target="_blank" rel="noopener noreferrer">' +
              '<span>' + U.esc(r.label) + '</span>' + ui.icon('external', 12) + '</a>';
          }).join('') +
        '</div>' +
        '<p class="small muted broker-source-note">' + U.esc(T('brokers.sources.p4')) + '</p>' +
      '</div></section>';
  }

  function disclaimer() {
    return '<div class="disclaimer">' + ui.icon('warning', 15) +
      '<div><b>' + U.esc(T('app.disclaimer_short')) + '.</b> ' + U.esc(T('an.disclaimer')) +
      ' <a href="#" data-open-legal>' + U.esc(T('an.disclaimer_more')) + '</a></div></div>';
  }

  function paintRegion(root, id) {
    currentRegion = id;
    var tabs = U.$$('[data-region]', root);
    tabs.forEach(function (tab) {
      var selected = tab.getAttribute('data-region') === id;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('tabindex', selected ? '0' : '-1');
    });
    var panel = root.querySelector('[data-region-panel]');
    if (!panel) return;
    panel.innerHTML = regionPanel(findRegion(id));
    panel.setAttribute('aria-labelledby', 'broker-tab-' + id);
  }

  function paintChecklist(root) {
    var boxes = U.$$('[data-check-id]', root);
    if (!boxes.length) return;
    var done = boxes.filter(function (box) { return box.checked; }).length;
    var total = boxes.length;
    var count = root.querySelector('[data-check-count]');
    if (count) count.textContent = T('brokers.check.progress', { done: done, total: total });
    var bar = root.querySelector('[data-check-bar]');
    if (bar) bar.style.width = Math.round(done / total * 100) + '%';
    var meter = root.querySelector('[data-check-meter]');
    if (meter) meter.setAttribute('aria-valuenow', String(done));
    boxes.forEach(function (box) {
      var label = box.closest('.broker-check');
      if (label) label.classList.toggle('is-done', box.checked);
    });
  }

  function bind(root) {
    root.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-region]');
      if (tab) { paintRegion(root, tab.getAttribute('data-region')); return; }
      if (e.target.closest('[data-check-reset]')) {
        if (TA.store.clearBrokerChecks) TA.store.clearBrokerChecks();
        U.$$('[data-check-id]', root).forEach(function (box) { box.checked = false; });
        paintChecklist(root);
        return;
      }
      if (e.target.closest('[data-open-legal]')) { e.preventDefault(); ui.legalModal(); }
    });
    root.addEventListener('change', function (e) {
      var box = e.target.closest('[data-check-id]');
      if (!box) return;
      if (TA.store.setBrokerCheck) TA.store.setBrokerCheck(box.getAttribute('data-check-id'), box.checked);
      paintChecklist(root);
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tab = e.target.closest('[data-region]');
      if (!tab) return;
      e.preventDefault();
      var tabs = U.$$('[data-region]', root);
      var index = tabs.indexOf(tab);
      var next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      if (next) { next.focus(); paintRegion(root, next.getAttribute('data-region')); }
    });
    paintChecklist(root);
  }

  function render(root) {
    root.innerHTML = '<div class="wrap page">' + hero() + '<div class="dash-grid">' +
      noticeCard() + startCard() + regionCard() + archetypeCard() +
      regulationCard() + verifyCard() + compensationCard() + scorecardCard() +
      feesCard() + allInCard() + assetsCard() + taxCard() +
      checklistCard() + redFlagsCard() + trendsCard() + sourcesCard() + disclaimer() +
      '</div></div>';
    bind(root);
  }

  TA.views = TA.views || {};
  TA.views.brokers = {
    render: render,
    regions: REGIONS,
    checks: CHECKS,
    redFlags: RED_FLAGS,
    registers: REGISTERS
  };
})(window.TA = window.TA || {});
