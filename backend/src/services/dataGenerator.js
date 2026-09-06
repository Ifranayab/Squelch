const db = require('../db');

/**
 * Synthetic market data generator.
 *
 * Design decision (stated explicitly, not hidden): this is NOT live market data.
 * Two reasons:
 *   1. Demo reliability — a live API can lag, rate-limit, or simply not move
 *      interestingly during a 5-minute judging window. A scripted anomaly
 *      guarantees the alert system has something real to react to, on schedule.
 *   2. Time budget — sourcing/cleaning a live feed eats hours better spent on
 *      the signal engine and alert lifecycle, which are the actual point.
 *
 * Every tick: all tracked tickers get a small random walk (baseline noise).
 * Every ANOMALY_INTERVAL_MS: exactly one ticker gets a scripted spike/volume
 * surge, cycling through the ticker list so the demo is repeatable.
 */

const TICK_INTERVAL_MS = 15_000;       // baseline price/volume update cadence
const ANOMALY_INTERVAL_MS = 120_000;   // one scripted anomaly every 2 minutes

// A tick is considered stale if it's older than 3x the expected cadence —
// i.e. the generator (or, in a real system, the upstream feed) has missed
// several beats in a row. This isn't about a single slow tick; it's about
// detecting that the data pipeline itself has stopped being trustworthy.
const STALE_THRESHOLD_MS = TICK_INTERVAL_MS * 3;

let anomalyTickerIndex = 0;
let tickTimer = null;
let anomalyTimer = null;

function getAllTickers() {
  return db.prepare('SELECT * FROM tickers').all();
}

function getLatestPrice(symbol) {
  const row = db.prepare(
    'SELECT price, volume FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT 1'
  ).get(symbol);
  return row || null;
}

/**
 * Freshness check — answers "can this ticker's data actually be trusted right
 * now?" Separate from getLatestPrice because most callers just want the
 * number; only the signal engine and the watchlist UI need to know whether
 * that number is current. If recorded_at is missing entirely (no data yet),
 * treat it as stale rather than fresh-by-default.
 */
function isStale(symbol) {
  const row = db.prepare(
    'SELECT recorded_at FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT 1'
  ).get(symbol);
  if (!row) return true;
  const recordedAt = new Date(row.recorded_at.replace(' ', 'T') + 'Z').getTime();
  return Date.now() - recordedAt > STALE_THRESHOLD_MS;
}

function getRollingAvgVolume(symbol, windowSize = 10) {
  const rows = db.prepare(
    'SELECT volume FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT ?'
  ).all(symbol, windowSize);
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + r.volume, 0);
  return sum / rows.length;
}

const insertPriceHistory = db.prepare(
  'INSERT INTO price_history (symbol, price, volume, recorded_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
);

/**
 * Defensive insert for any tick that might not arrive in order — matters if
 * this ever gets wired to a real market feed, where retries or multiple
 * sources can deliver ticks out of sequence. Our own synthetic generator
 * always writes with CURRENT_TIMESTAMP so this never actually rejects
 * anything today, but it's the documented answer to "how do you handle
 * conflicting/out-of-order data": reject a tick that's older than the most
 * recent one already on record for that symbol, rather than let it corrupt
 * the rolling-average and price-move calculations with an out-of-sequence value.
 */
function safeInsertTick(symbol, price, volume, recordedAtIso) {
  const latest = db.prepare(
    'SELECT recorded_at FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT 1'
  ).get(symbol);

  if (latest && recordedAtIso && new Date(recordedAtIso) < new Date(latest.recorded_at.replace(' ', 'T') + 'Z')) {
    console.warn(`[data] rejected out-of-order tick for ${symbol}: ${recordedAtIso} is older than latest recorded ${latest.recorded_at}`);
    return false;
  }

  db.prepare(
    'INSERT INTO price_history (symbol, price, volume, recorded_at) VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))'
  ).run(symbol, price, volume, recordedAtIso || null);
  return true;
}

/**
 * Baseline random walk — small, realistic-looking noise.
 * Does NOT itself trigger meaningful-change thresholds under normal signal params.
 */
function baselineTick() {
  const tickers = getAllTickers();
  tickers.forEach((ticker) => {
    const last = getLatestPrice(ticker.symbol);
    const lastPrice = last ? last.price : ticker.base_price;
    const lastVolume = last ? last.volume : 100000;

    // small drift: +/- up to 0.4%
    const drift = (Math.random() - 0.5) * 0.008;
    const newPrice = Math.max(0.01, lastPrice * (1 + drift));

    // volume noise: +/- up to 15% of last volume
    const volDrift = (Math.random() - 0.5) * 0.3;
    const newVolume = Math.max(1000, Math.round(lastVolume * (1 + volDrift)));

    insertPriceHistory.run(ticker.symbol, Number(newPrice.toFixed(2)), newVolume);
  });
}

/**
 * Scripted anomaly — deliberately breaches both signal thresholds for ONE
 * ticker, cycling through the list. This is what makes the demo repeatable:
 * you know something worth showing happens every ANOMALY_INTERVAL_MS.
 */
function injectScriptedAnomaly() {
  const tickers = getAllTickers();
  if (tickers.length === 0) return;

  const ticker = tickers[anomalyTickerIndex % tickers.length];
  anomalyTickerIndex += 1;

  const last = getLatestPrice(ticker.symbol);
  const lastPrice = last ? last.price : ticker.base_price;
  const avgVolume = getRollingAvgVolume(ticker.symbol) || 100000;

  // Scripted spike: random direction, magnitude well past normal volatility band
  const direction = Math.random() > 0.5 ? 1 : -1;
  const spikeMagnitude = ticker.volatility * (2.5 + Math.random() * 1.5); // 2.5x-4x the stock's own volatility band
  const newPrice = Math.max(0.01, lastPrice * (1 + direction * spikeMagnitude));

  // Scripted volume surge: 2.5x-4x rolling average
  const volumeMultiplier = 2.5 + Math.random() * 1.5;
  const newVolume = Math.round(avgVolume * volumeMultiplier);

  insertPriceHistory.run(ticker.symbol, Number(newPrice.toFixed(2)), newVolume);

  console.log(
    `[anomaly] ${ticker.symbol}: price ${lastPrice.toFixed(2)} -> ${newPrice.toFixed(2)} ` +
    `(${(direction * spikeMagnitude * 100).toFixed(1)}%), volume x${volumeMultiplier.toFixed(1)}`
  );

  return ticker.symbol; // caller (signal engine hook) can react immediately instead of waiting for next scan
}

function start(onAnomalyInjected) {
  tickTimer = setInterval(baselineTick, TICK_INTERVAL_MS);
  anomalyTimer = setInterval(() => {
    const symbol = injectScriptedAnomaly();
    if (onAnomalyInjected && symbol) onAnomalyInjected(symbol);
  }, ANOMALY_INTERVAL_MS);

  // run one tick immediately so there's data on server start, no waiting
  baselineTick();
}

function stop() {
  clearInterval(tickTimer);
  clearInterval(anomalyTimer);
}

module.exports = { start, stop, baselineTick, injectScriptedAnomaly, getLatestPrice, getRollingAvgVolume, isStale, safeInsertTick, STALE_THRESHOLD_MS };
