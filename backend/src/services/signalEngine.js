const db = require('../db');
const { getLatestPrice, getRollingAvgVolume, isStale } = require('./dataGenerator');

const VOLUME_ANOMALY_MULTIPLIER = 2.0; // volume >= 2x rolling avg counts as meaningful

const getWatchersFor = db.prepare(
  'SELECT DISTINCT user_id FROM watchlist_items WHERE symbol = ?'
);

const getTicker = db.prepare('SELECT * FROM tickers WHERE symbol = ?');

const getMuteState = db.prepare(
  `SELECT * FROM dismiss_counts WHERE user_id = ? AND symbol = ? AND signal_type = ?`
);

const insertAlert = db.prepare(
  `INSERT INTO alerts (user_id, symbol, signal_type, status, detail_json, created_at)
   VALUES (?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)`
);

// Avoid duplicate pending alerts for the same (user, symbol, signal_type) piling up
const findExistingPending = db.prepare(
  `SELECT id FROM alerts WHERE user_id = ? AND symbol = ? AND signal_type = ? AND status = 'pending'`
);

// Cooldown guard: even after an alert resolves, don't fire a fresh one for the
// same (user, symbol, signal_type) within this window. Without this, a spike
// that stays elevated across the PRICE_WINDOW_MINUTES comparison window would
// re-trigger a "new" alert every ~20s scan cycle right after you resolve the
// last one — same real-world event, spammed as if it were new each time.
const RESOLVED_COOLDOWN_SECONDS = 90;

const findRecentAlert = db.prepare(
  `SELECT id FROM alerts
   WHERE user_id = ? AND symbol = ? AND signal_type = ?
   AND created_at >= datetime('now', ?)`
);

function hasRecentAlert(userId, symbol, signalType) {
  return !!findRecentAlert.get(userId, symbol, signalType, `-${RESOLVED_COOLDOWN_SECONDS} seconds`);
}

function isMuted(userId, symbol, signalType) {
  const row = getMuteState.get(userId, symbol, signalType);
  if (!row || !row.muted_until) return false;
  return new Date(row.muted_until) > new Date();
}

/**
 * Classify the shape of recent movement from the last few ticks — this is
 * what lets the reasoning layer say something concrete ("steadily climbing"
 * vs "a sudden single-tick spike") instead of generic hedge language, since
 * it now has actual trend shape to describe rather than just two numbers.
 * Rule-based, not ML — consistent with keeping detection logic auditable.
 */
function getTrendDescriptor(symbol, column, lookback = 6) {
  const rows = db.prepare(
    `SELECT ${column} as value FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT ?`
  ).all(symbol, lookback);
  if (rows.length < 3) return 'not enough history yet to describe a trend';

  const values = rows.map((r) => r.value).reverse(); // oldest to newest
  const deltas = [];
  for (let i = 1; i < values.length; i++) deltas.push(values[i] - values[i - 1]);

  const allPositive = deltas.every((d) => d > 0);
  const allNegative = deltas.every((d) => d < 0);
  const lastDelta = deltas[deltas.length - 1];
  const priorDeltas = deltas.slice(0, -1);
  const avgPriorMagnitude = priorDeltas.length
    ? priorDeltas.reduce((a, b) => a + Math.abs(b), 0) / priorDeltas.length
    : 0;
  const lastIsMuchBigger = avgPriorMagnitude > 0 && Math.abs(lastDelta) > avgPriorMagnitude * 2.5;

  if (allPositive) return 'steadily climbing over the last several checks, not a one-off jump';
  if (allNegative) return 'steadily falling over the last several checks, not a one-off drop';
  if (lastIsMuchBigger) return 'a sudden single-tick spike, not part of a building trend';
  return 'choppy, moving back and forth with no clear direction';
}

/**
 * Get the current price vs. a price from ~PRICE_WINDOW_MINUTES ago.
 *
 * Fixed from an earlier version that only compared the last two recorded
 * ticks — that meant a real spike was only detectable in the single instant
 * right after it happened; one baseline tick later, the comparison window
 * had already slid past it and the move became invisible to any later scan.
 * Comparing against a fixed time window means a scan run any time within
 * that window (not just the exact instant of the spike) will still catch it.
 */
const PRICE_WINDOW_MINUTES = 2;

function getPriceMoveDetail(symbol) {
  const current = db.prepare(
    'SELECT price FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT 1'
  ).get(symbol);
  if (!current) return null;

  // price from ~PRICE_WINDOW_MINUTES ago, or the oldest available if history is shorter than that
  let baseline = db.prepare(
    `SELECT price FROM price_history
     WHERE symbol = ? AND recorded_at <= datetime('now', ?)
     ORDER BY recorded_at DESC LIMIT 1`
  ).get(symbol, `-${PRICE_WINDOW_MINUTES} minutes`);

  if (!baseline) {
    baseline = db.prepare(
      'SELECT price FROM price_history WHERE symbol = ? ORDER BY recorded_at ASC LIMIT 1'
    ).get(symbol);
  }
  if (!baseline || baseline.price === current.price) return null;

  const pctChange = (current.price - baseline.price) / baseline.price;
  return { currentPrice: current.price, previousPrice: baseline.price, pctChange };
}

function getVolumeAnomalyDetail(symbol) {
  const last = getLatestPrice(symbol);
  const avgVolume = getRollingAvgVolume(symbol, 10);
  if (!last || !avgVolume) return null;

  const ratio = last.volume / avgVolume;
  return { currentVolume: last.volume, avgVolume, ratio };
}

/**
 * Session high/low breach — deliberately called "session" rather than
 * "52-week" since this demo's data only spans however long the server has
 * been running, not real historical range. Same idea, honestly scoped:
 * flag when a stock hits a new extreme relative to everything recorded so
 * far, since that's meaningful to a retail investor regardless of the time
 * span behind it.
 */
function getRangeBreachDetail(symbol) {
  const current = db.prepare(
    'SELECT id, price FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT 1'
  ).get(symbol);
  if (!current) return null;

  // Compare against everything EXCEPT the current row — including it would
  // make every single tick trivially "the new high" the moment it's inserted.
  const stats = db.prepare(
    'SELECT MAX(price) as max, MIN(price) as min, COUNT(*) as cnt FROM price_history WHERE symbol = ? AND id != ?'
  ).get(symbol, current.id);

  if (!stats || stats.cnt < 5) return null; // need real history before "new high/low" means anything

  if (current.price > stats.max) {
    return { direction: 'high', currentPrice: current.price, priorExtreme: stats.max };
  }
  if (current.price < stats.min) {
    return { direction: 'low', currentPrice: current.price, priorExtreme: stats.min };
  }
  return null;
}

/**
 * Evaluate a single ticker for both signals, create alerts for any watcher
 * whose threshold is breached and who hasn't muted that signal for this ticker.
 */
function evaluateTicker(symbol) {
  const ticker = getTicker.get(symbol);
  if (!ticker) return [];

  // Don't evaluate — and don't alert on — data that's gone stale. A "big
  // move" calculated against an outdated price is meaningless at best and
  // misleading at worst (e.g. the feed froze mid-spike and never recovered).
  // Correct behavior here is silence, not a wrong alert.
  if (isStale(symbol)) {
    return [];
  }

  const watchers = getWatchersFor.all(symbol).map((r) => r.user_id);
  if (watchers.length === 0) return [];

  const createdAlerts = [];

  // Check which signals actually fire BEFORE building any alert. This is
  // what lets each one know about the others — a price spike that also came
  // with a volume surge is a materially different (and more meaningful)
  // situation than either alone, and the explanation should say so instead
  // of describing them as two unrelated facts.
  const priceDetail = getPriceMoveDetail(symbol);
  const priceFires = !!(priceDetail && Math.abs(priceDetail.pctChange) >= ticker.volatility);

  const volumeDetail = getVolumeAnomalyDetail(symbol);
  const volumeFires = !!(volumeDetail && volumeDetail.ratio >= VOLUME_ANOMALY_MULTIPLIER);

  const rangeDetail = getRangeBreachDetail(symbol);
  const rangeFires = !!rangeDetail;

  const firingSignals = [
    priceFires && 'price_move',
    volumeFires && 'volume_anomaly',
    rangeFires && 'range_breach',
  ].filter(Boolean);

  // --- Price move signal (normalized by the ticker's own volatility) ---
  if (priceFires) {
    // Enrich with context the reasoning layer actually needs to say something
    // concrete: how many multiples of this stock's normal move this is, and
    // whether it's a sudden spike or part of a building trend.
    const enrichedDetail = {
      ...priceDetail,
      volatilityThreshold: ticker.volatility,
      multipleOfThreshold: Math.abs(priceDetail.pctChange) / ticker.volatility,
      trend: getTrendDescriptor(symbol, 'price'),
      coOccurringSignals: firingSignals.filter((s) => s !== 'price_move'),
    };
    watchers.forEach((userId) => {
      if (isMuted(userId, symbol, 'price_move')) return;
      if (findExistingPending.get(userId, symbol, 'price_move')) return;
      if (hasRecentAlert(userId, symbol, 'price_move')) return;

      const result = insertAlert.run(
        userId, symbol, 'price_move', JSON.stringify(enrichedDetail)
      );
      createdAlerts.push({ id: result.lastInsertRowid, userId, symbol, signal_type: 'price_move', detail: enrichedDetail });
    });
  }

  // --- Volume anomaly signal ---
  if (volumeFires) {
    const enrichedDetail = {
      ...volumeDetail,
      trend: getTrendDescriptor(symbol, 'volume'),
      coOccurringSignals: firingSignals.filter((s) => s !== 'volume_anomaly'),
    };
    watchers.forEach((userId) => {
      if (isMuted(userId, symbol, 'volume_anomaly')) return;
      if (findExistingPending.get(userId, symbol, 'volume_anomaly')) return;
      if (hasRecentAlert(userId, symbol, 'volume_anomaly')) return;

      const result = insertAlert.run(
        userId, symbol, 'volume_anomaly', JSON.stringify(enrichedDetail)
      );
      createdAlerts.push({ id: result.lastInsertRowid, userId, symbol, signal_type: 'volume_anomaly', detail: enrichedDetail });
    });
  }

  // --- Session high/low breach ---
  if (rangeFires) {
    const enrichedRangeDetail = {
      ...rangeDetail,
      coOccurringSignals: firingSignals.filter((s) => s !== 'range_breach'),
    };
    watchers.forEach((userId) => {
      if (isMuted(userId, symbol, 'range_breach')) return;
      if (findExistingPending.get(userId, symbol, 'range_breach')) return;
      if (hasRecentAlert(userId, symbol, 'range_breach')) return;

      const result = insertAlert.run(userId, symbol, 'range_breach', JSON.stringify(enrichedRangeDetail));
      createdAlerts.push({ id: result.lastInsertRowid, userId, symbol, signal_type: 'range_breach', detail: enrichedRangeDetail });
    });
  }

  return createdAlerts;
}

function evaluateAllTickers() {
  const tickers = db.prepare('SELECT symbol FROM tickers').all();
  let all = [];
  tickers.forEach((t) => {
    all = all.concat(evaluateTicker(t.symbol));
  });
  return all;
}

module.exports = { evaluateTicker, evaluateAllTickers, isMuted };
