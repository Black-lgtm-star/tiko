# Groundtruth — evidence-first market analysis (MVP)

> Understand the setup, the evidence, and the risks — at a glance.

A zero-build, zero-dependency web app that produces the same structured read for every market:
snapshot, context, bull/bear evidence, key levels, conditional scenarios, risks and sources.
It is informational only. It does not place trades, connect to brokers, or issue predictions.

## Run it

No install, no build step.

- Open `index.html` directly in a modern browser (works from `file://`), **or**
- Serve the folder for the most reliable live-data behavior:

```bash
python -m http.server 8000
# or: npx serve .
```

Then open `http://localhost:8000`.

Live requests go to public APIs from your browser. If a request fails or is rate-limited, the app
falls back to a clearly labeled synthetic sample and tells you why.

## What is in the MVP

- **Onboarding** — experience, markets, time horizon, preferred analysis, risk comfort, language.
  Answers are editable later in Settings and drive the default lens and copy density.
- **Dashboard** — search (ticker/asset), quick analysis, watchlist, recent analyses, market overview,
  and reference events. Recently opened analyses and non-catalog tickers are persisted with enough
  metadata to reopen them.
- **Analysis page** — identical seven-section structure for every asset:
  1. Snapshot (price, timeframe, data timestamp)
  2. Market context (trend, volatility, liquidity, momentum, news/event coverage)
  3. Bull case / bear case, each with its counter-case
  4. Key levels (swing points, averages, round numbers)
  5. Scenarios, each with trigger, what strengthens it, and invalidation
  6. Risks (data limits, missing feeds, model caveats)
  7. Sources (provider, retrieval time, series end, method)
- **Six lenses** — Day, Swing, Long term, Options, FX & futures, Beginner. They are tailored views of
  the same core read, not separate products. Each lens re-weights what is emphasized.
- **Settings** — profile chips, default lens, language (English/Spanish), data mode (`auto` / `sample`),
  optional Alpha Vantage key, feedback export, and full local reset.
- **Feedback and notes** — helpful / inaccurate / missing context, plus a free-text comment and a
  per-symbol note. Stored locally, exportable as JSON.

## Data sources and honesty rules

| Market | Default source | Labeling |
| --- | --- | --- |
| Crypto | CoinGecko public API (`/coins/markets`, `/market_chart`) | `LIVE` with retrieval timestamp, or `SAMPLE` |
| Stocks | Synthetic seeded series | `SAMPLE`, watermark and banner, sample exchange label |
| Stocks (optional) | Alpha Vantage (`TIME_SERIES_DAILY`, `GLOBAL_QUOTE`) with your own key | `LIVE` / `DELAYED`, end-of-day bars |

- Sample data is generated with a seeded geometric random walk so it is stable per session and asset.
  It is explicitly labeled in the header, chart, banner and sources. It is never presented as a quote.
- Every number can be traced: the Sources section lists provider, API URL, retrieval time and series end.
- News, sentiment, earnings and macro calendars are **not** connected. The UI says so in context,
  risks and sources instead of implying coverage.
- Crypto series are fetched with a 14-second timeout, serialized requests, in-memory TTL caches
  (45–90 seconds) and a single overview call to reduce rate-limit pressure.
- Intraday availability depends on the provider. When a provider cannot supply intraday bars, the
  analysis reports the actual interval used rather than silently substituting it.

### Optional Alpha Vantage key

1. Get a free key at <https://www.alphavantage.co/support/#api-key>.
2. Open **Settings → Data sources**, paste the key, and use **Test key**.
3. The key is stored unencrypted in this browser's localStorage and sent only to Alpha Vantage.
4. The free tier has a low daily quota. Failures fall back to labeled sample data.

## Architecture

Classic scripts sharing a `window.TA` namespace, loaded in dependency order by `index.html`.

```
index.html          script order, app roots
styles.css          design tokens, layout, components, responsive rules
js/util.js          escaping, formatting, DOM helpers, seeded RNG, storage helpers
js/i18n.js          EN/ES dictionaries and templating ({{var}})
js/store.js         settings, watchlist, recents, notes, feedback (localStorage)
js/indicators.js    SMA, RSI(14), ATR, realized volatility, pivots, drawdown
js/catalog.js       supported assets, search, sample-series parameters
js/data.js          providers, caching, fallback, overview/quotes, resolution
js/analysis.js      rule-based engine: evidence, levels, scenarios, risks
js/charts.js        SVG line charts and sparklines
js/ui.js            icons, modal, toast, search combobox, glossary, badges
js/views/*.js       onboarding, dashboard, analysis, settings
js/app.js           shell, hash router, language refresh, boot
```

Data flow: `views → data.getMarketData(asset, {timeframe}) → {asset, candles, quote, meta}`.
`meta` carries `dataMode`, provider URLs, timestamps, interval, bar count and fallback reasons.
The analysis engine is deterministic: it computes indicators locally, scores evidence for and
against, derives levels from structure, and generates scenarios and risks. No LLM is involved and
nothing is sent to a server by this app.

Routes: `#/`, `#/settings`, `#/analysis/:symbol?style=&cls=&id=&name=`.
The two extra query parameters let non-catalog crypto assets (resolved via CoinGecko search) reopen
correctly from recents or the watchlist.

### Storage keys

`gt.settings.v1`, `gt.watchlist.v1`, `gt.recents.v1`, `gt.notes.v1`, `gt.feedback.v1`.
Recents are capped at 12 (deduped by symbol), feedback at 300 items, notes at 2,000 characters.
Nothing leaves the browser; feedback export is a local JSON download.

### Adding a market data provider

1. Add an adapter in `js/data.js` that returns
   `{ asset, candles, quote, meta }`, with `meta.dataMode`, `provider`, `providerUrl`,
   `retrievedAt`, `seriesEnd`, `interval`, `timeframe`, `barCount`, `fallback`.
2. Route it inside `getMarketData` based on `asset.assetClass` (or a new field), keeping the
   sample fallback and its `fallbackReason`.
3. Add symbols and descriptors to `js/catalog.js`, including a stable id for external lookups.
4. If the provider needs search for unknown tickers, extend `resolveSymbol`.
5. Keep the honesty contract: label live vs. delayed vs. sample, expose timestamps, and update the
   Sources section if the provider changes.

### Adding a language

Add a dictionary to `js/i18n.js`, add an entry to `langs`, and translate the generated-analysis
strings used by `js/analysis.js`. Interface and generated copy are both localized; the language is
applied on change and persists in settings.

## Accessibility and UX notes

- Skip link, labeled landmarks, `aria-pressed` chips, `aria-selected` tabs, focus-trapped modals,
  keyboard search (`/`), visible focus styles, reduced-motion support.
- Responsive from narrow mobile to desktop; the dashboard grid collapses to single-column cards.
- Watchlist rows use sibling buttons (open + remove) instead of nested interactive controls.
- Feedback, notes and reset are local-first; reset clears all app data and returns to onboarding.

## Scope boundaries

Included: stocks and crypto, on-demand analysis, search, watchlist, recent analyses, local feedback.
Excluded by design: alerts, broker connections, portfolio tracking, automated strategies, licensed
news/event feeds, options chains, fundamental valuation data.

## Disclaimer

Informational only. This is a description of a market setup produced by fixed rules, not investment
advice, a recommendation, or a guarantee. Data may be delayed, incomplete or — where labeled —
synthetic. You are responsible for your decisions.
