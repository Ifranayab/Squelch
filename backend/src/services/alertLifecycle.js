const db = require('../db');

const MUTE_THRESHOLD = 3;      // dismissals before muting kicks in
const MUTE_DURATION_DAYS = 7;

const getAlert = db.prepare('SELECT * FROM alerts WHERE id = ?');

const setAlertStatus = db.prepare(
  `UPDATE alerts SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`
);

const getDismissRow = db.prepare(
  `SELECT * FROM dismiss_counts WHERE user_id = ? AND symbol = ? AND signal_type = ?`
);

const upsertDismissCount = db.prepare(
  `INSERT INTO dismiss_counts (user_id, symbol, signal_type, count, muted_until)
   VALUES (@user_id, @symbol, @signal_type, @count, @muted_until)
   ON CONFLICT(user_id, symbol, signal_type)
   DO UPDATE SET count = @count, muted_until = @muted_until`
);

/**
 * Approve an alert — just marks it acknowledged. No effect on dismiss counter.
 * Approving does NOT reset a prior dismiss streak — intentional: approving one
 * alert doesn't mean the user suddenly wants every future alert of that type.
 * Only 7 days of quiet + the natural passage of muted_until resets it.
 */
function approveAlert(alertId) {
  const alert = getAlert.get(alertId);
  if (!alert) throw new Error('Alert not found');
  if (alert.status !== 'pending') throw new Error('Alert already resolved');

  setAlertStatus.run('approved', alertId);
  return { ...alert, status: 'approved' };
}

/**
 * Dismiss an alert — increments the dismiss counter for (user, symbol, signal_type).
 * On the 3rd dismissal, mutes that exact (symbol, signal_type) combination for
 * this user for 7 days. Muting is scoped narrowly on purpose: dismissing
 * price_move alerts on TICKER_A does not mute volume_anomaly alerts on TICKER_A,
 * or price_move alerts on TICKER_B. This keeps the mechanism predictable and
 * explainable in a demo — no hidden cross-effects.
 */
function dismissAlert(alertId) {
  const alert = getAlert.get(alertId);
  if (!alert) throw new Error('Alert not found');
  if (alert.status !== 'pending') throw new Error('Alert already resolved');

  setAlertStatus.run('dismissed', alertId);

  const existing = getDismissRow.get(alert.user_id, alert.symbol, alert.signal_type);
  const newCount = (existing ? existing.count : 0) + 1;

  let mutedUntil = existing ? existing.muted_until : null;
  let justMuted = false;

  if (newCount >= MUTE_THRESHOLD) {
    const muteDate = new Date();
    muteDate.setDate(muteDate.getDate() + MUTE_DURATION_DAYS);
    mutedUntil = muteDate.toISOString();
    justMuted = true;
  }

  upsertDismissCount.run({
    user_id: alert.user_id,
    symbol: alert.symbol,
    signal_type: alert.signal_type,
    count: justMuted ? 0 : newCount, // reset counter once mute kicks in — next 3 dismissals AFTER mute expires start fresh
    muted_until: mutedUntil,
  });

  return { ...alert, status: 'dismissed', dismissCount: newCount, justMuted, mutedUntil };
}

function getMuteStatus(userId, symbol, signalType) {
  return getDismissRow.get(userId, symbol, signalType) || null;
}

module.exports = { approveAlert, dismissAlert, getMuteStatus, MUTE_THRESHOLD, MUTE_DURATION_DAYS };
