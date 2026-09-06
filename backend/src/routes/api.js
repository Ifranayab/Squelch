const express = require('express');
const db = require('../db');
const { approveAlert, dismissAlert, getMuteStatus } = require('../services/alertLifecycle');
const { runScanForTicker } = require('../services/scanJob');
const { isStale } = require('../services/dataGenerator');
const { explainAlert } = require('../services/reasoning');

const router = express.Router();

// --- Users (minimal — hackathon scope, single demo user by default) ---
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users').all();
  res.json(users);
});

router.post('/users', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare('INSERT INTO users (name) VALUES (?)').run(name);
  res.status(201).json({ id: result.lastInsertRowid, name });
});

// --- Session: find-or-create a user by email. This is the cross-device
// persistence mechanism — no password, no verification, just an identifier.
// Same email on any device resolves to the same user_id, and everything
// (watchlist, alerts, mute state) is keyed off that id already, so nothing
// else needs to change to make this work.
//
// Deliberately not real auth: no email verification, no session tokens, no
// protection against someone typing an email that isn't theirs. That's a
// documented, intentional scope cut for a hackathon — the differentiator
// here is the mute mechanism, not account security. Real auth would be the
// next step for production (verified email or OAuth).
const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const insertUserWithEmail = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
const touchLastSeen = db.prepare('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?');

router.post('/session', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'a valid email is required' });
  }
  const normalized = email.trim().toLowerCase();

  let user = findUserByEmail.get(normalized);
  // Capture the visit timestamp BEFORE we overwrite it — this is what "since
  // you last checked" means downstream (e.g. the watchlist sparkline window).
  // null here has two distinct causes the frontend needs to tell apart:
  // brand-new user (no prior visit exists at all) vs. an existing user whose
  // last_seen_at just hasn't been backfilled — both get treated the same way
  // (no meaningful "since" yet), which is the correct behavior either way.
  let previousVisitAt = null;
  if (!user) {
    const name = normalized.split('@')[0];
    const result = insertUserWithEmail.run(name, normalized);
    user = { id: result.lastInsertRowid, name, email: normalized };
  } else {
    previousVisitAt = user.last_seen_at || null;
  }
  touchLastSeen.run(user.id);

  res.json({ ...user, previousVisitAt });
});

// --- Tickers (universe available to add to watchlist) ---
router.get('/tickers', (req, res) => {
  res.json(db.prepare('SELECT * FROM tickers').all());
});

// --- Price history (for sparkline/chart rendering on the frontend) ---
//
// Two modes:
//   - no `since` param: old behavior, just the last N points. Used for a
//     user's first-ever visit, where "since last time" doesn't mean anything.
//   - `since=<ISO timestamp>`: points recorded after that time, i.e. "what's
//     happened since you last looked." Falls back to the last N points if
//     `since` is too recent to return a meaningful number of points (e.g. the
//     user refreshed 30 seconds ago) — a 1-2 point chart is as useless as no
//     chart, so `usedFallback` tells the frontend which case it got, and it
//     should label the chart accordingly rather than claiming a window that
//     wasn't actually used.
const MIN_MEANINGFUL_POINTS = 8;

router.get('/price-history/:symbol', (req, res) => {
  const { symbol } = req.params;
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  const { since } = req.query;

  if (since) {
    const sinceRows = db.prepare(
      'SELECT price, volume, recorded_at FROM price_history WHERE symbol = ? AND recorded_at > ? ORDER BY recorded_at ASC LIMIT 500'
    ).all(symbol, since);

    if (sinceRows.length >= MIN_MEANINGFUL_POINTS) {
      return res.json({ points: sinceRows, usedFallback: false });
    }
    // Not enough happened since `since` to draw anything useful — fall
    // through to the fixed-window fallback below instead of returning a
    // near-empty chart.
  }

  const rows = db.prepare(
    'SELECT price, volume, recorded_at FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT ?'
  ).all(symbol, limit);
  res.json({ points: rows.reverse(), usedFallback: Boolean(since) });
});

// --- Market overview: every tracked ticker, regardless of any user's
// watchlist. This is the direct answer to "view latest market information" —
// everything else in this app is about *change*, but a user should also be
// able to just browse what exists before deciding what to watch.
router.get('/market-overview', (req, res) => {
  const tickers = db.prepare('SELECT * FROM tickers').all();
  const overview = tickers.map((t) => {
    const latest = db.prepare(
      'SELECT price, volume, recorded_at FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT 1'
    ).get(t.symbol);
    const dayAgo = db.prepare(
      `SELECT price FROM price_history WHERE symbol = ? AND recorded_at <= datetime('now', '-1 day')
       ORDER BY recorded_at DESC LIMIT 1`
    ).get(t.symbol);
    // Fallback: since this demo's data only exists from when the server
    // started (not actual days of history), "a day ago" often won't exist
    // yet. Falling back to the earliest available price still shows a real
    // change over whatever window of data actually exists, instead of
    // silently showing a meaningless 0%.
    const referenceRow = dayAgo || db.prepare(
      'SELECT price FROM price_history WHERE symbol = ? ORDER BY recorded_at ASC LIMIT 1'
    ).get(t.symbol);
    const referencePrice = referenceRow?.price ?? t.base_price;
    const currentPrice = latest?.price ?? t.base_price;
    const changePct = referencePrice ? ((currentPrice - referencePrice) / referencePrice) * 100 : 0;

    return {
      symbol: t.symbol,
      name: t.name,
      price: currentPrice,
      volume: latest?.volume ?? null,
      changePct,
      stale: isStale(t.symbol),
    };
  });
  res.json(overview);
});

// --- Watchlist ---
router.get('/watchlist/:userId', (req, res) => {
  const { userId } = req.params;
  const items = db.prepare(
    `SELECT w.id, w.symbol, t.name, t.base_price, t.volatility
     FROM watchlist_items w JOIN tickers t ON w.symbol = t.symbol
     WHERE w.user_id = ?`
  ).all(userId);

  // attach latest price + last-seen delta so "what changed" is visible at a glance
  const enriched = items.map((item) => {
    const latest = db.prepare(
      'SELECT price, volume, recorded_at FROM price_history WHERE symbol = ? ORDER BY recorded_at DESC LIMIT 1'
    ).get(item.symbol);
    return { ...item, latestPrice: latest?.price ?? null, latestVolume: latest?.volume ?? null, stale: isStale(item.symbol) };
  });

  res.json(enriched);
});

router.post('/watchlist/:userId', (req, res) => {
  const { userId } = req.params;
  const { symbol } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  const ticker = db.prepare('SELECT * FROM tickers WHERE symbol = ?').get(symbol);
  if (!ticker) return res.status(404).json({ error: 'unknown ticker' });

  try {
    db.prepare('INSERT INTO watchlist_items (user_id, symbol) VALUES (?, ?)').run(userId, symbol);
    res.status(201).json({ userId, symbol });
  } catch (err) {
    res.status(409).json({ error: 'already in watchlist' });
  }
});

router.delete('/watchlist/:userId/:symbol', (req, res) => {
  const { userId, symbol } = req.params;
  db.prepare('DELETE FROM watchlist_items WHERE user_id = ? AND symbol = ?').run(userId, symbol);
  res.status(204).send();
});

// --- Alerts ---
router.get('/alerts/:userId', (req, res) => {
  const { userId } = req.params;
  const { status } = req.query; // optional filter: pending | approved | dismissed
  const query = status
    ? 'SELECT * FROM alerts WHERE user_id = ? AND status = ? ORDER BY created_at DESC'
    : 'SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC';
  const alerts = status
    ? db.prepare(query).all(userId, status)
    : db.prepare(query).all(userId);
  res.json(alerts.map((a) => ({ ...a, detail_json: JSON.parse(a.detail_json) })));
});

router.post('/alerts/:id/approve', (req, res) => {
  try {
    const alert = approveAlert(req.params.id);
    res.json(alert);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/alerts/:id/dismiss', (req, res) => {
  try {
    const result = dismissAlert(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Mute status (for UI to show "this signal is muted for X days") ---
router.get('/mute-status/:userId/:symbol/:signalType', (req, res) => {
  const { userId, symbol, signalType } = req.params;
  const status = getMuteStatus(userId, symbol, signalType);
  res.json(status || { count: 0, muted_until: null });
});

// --- Manual trigger for demo control: force a scan on a specific ticker ---
router.post('/scan/:symbol', async (req, res) => {
  try {
    const newAlerts = await runScanForTicker(req.params.symbol);
    res.json({ created: newAlerts.length, alerts: newAlerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Account stats, for the Settings page ---
router.get('/stats/:userId', (req, res) => {
  const { userId } = req.params;
  const counts = db.prepare(
    `SELECT status, COUNT(*) as count FROM alerts WHERE user_id = ? GROUP BY status`
  ).all(userId);
  const watchlistCount = db.prepare(
    'SELECT COUNT(*) as count FROM watchlist_items WHERE user_id = ?'
  ).get(userId).count;
  const activeMutes = db.prepare(
    `SELECT symbol, signal_type, muted_until FROM dismiss_counts
     WHERE user_id = ? AND muted_until IS NOT NULL AND muted_until > datetime('now')`
  ).all(userId);

  const statusCounts = { pending: 0, approved: 0, dismissed: 0 };
  counts.forEach((row) => { statusCounts[row.status] = row.count; });

  res.json({ watchlistCount, ...statusCounts, activeMutes });
});

// --- Clear resolved alert history + reset all mutes for this user.
// Deliberately does NOT touch pending alerts — those still need a real
// decision from the user, clearing them would just hide unresolved signals
// rather than actually resolve anything.
router.delete('/alerts/:userId/history', (req, res) => {
  const { userId } = req.params;
  db.prepare(`DELETE FROM alerts WHERE user_id = ? AND status != 'pending'`).run(userId);
  db.prepare('DELETE FROM dismiss_counts WHERE user_id = ?').run(userId);
  res.status(204).send();
});

// --- Demo tool: instantly create 3 pending alerts for a ticker, bypassing
// real thresholds entirely. This exists for ONE reason: demonstrating the
// 3-dismissal mute mechanism live, on demand, instead of hoping real market
// signals line up within a judge's attention span. Clearly a demo utility,
// not a disguised feature — labeled as such in the frontend too.
router.post('/demo/fire-alerts/:userId/:symbol', async (req, res) => {
  const { userId, symbol } = req.params;
  const ticker = db.prepare('SELECT * FROM tickers WHERE symbol = ?').get(symbol);
  if (!ticker) return res.status(404).json({ error: 'unknown ticker' });

  const created = [];
  for (let i = 0; i < 3; i++) {
    const detail = {
      currentPrice: ticker.base_price * (1 + ticker.volatility * (3 + i)),
      previousPrice: ticker.base_price,
      pctChange: ticker.volatility * (3 + i),
    };
    const result = db.prepare(
      `INSERT INTO alerts (user_id, symbol, signal_type, status, detail_json, created_at)
       VALUES (?, ?, 'price_move', 'pending', ?, CURRENT_TIMESTAMP)`
    ).run(userId, symbol, JSON.stringify(detail));

    const explanation = await explainAlert({ symbol, signal_type: 'price_move', detail });
    db.prepare('UPDATE alerts SET explanation = ? WHERE id = ?').run(explanation, result.lastInsertRowid);
    created.push(result.lastInsertRowid);
  }

  res.json({ created: created.length, alertIds: created });
});

// --- Correlation pulse: if 3+ distinct symbols have pending alerts created
// within a short window for this user, that's worth calling out as possibly
// one underlying event rather than N unrelated ones. Computed on read from
// existing alert data — no schema change, no new storage, just a different
// way of looking at what's already there.
const CORRELATION_WINDOW_MINUTES = 5;
const CORRELATION_MIN_SYMBOLS = 3;

router.get('/market-pulse/:userId', (req, res) => {
  const { userId } = req.params;
  const recentPending = db.prepare(
    `SELECT DISTINCT symbol FROM alerts
     WHERE user_id = ? AND status = 'pending' AND created_at >= datetime('now', ?)`
  ).all(userId, `-${CORRELATION_WINDOW_MINUTES} minutes`);

  const symbols = recentPending.map((r) => r.symbol);
  const correlated = symbols.length >= CORRELATION_MIN_SYMBOLS;

  res.json({ correlated, symbols, windowMinutes: CORRELATION_WINDOW_MINUTES });
});

module.exports = router;
