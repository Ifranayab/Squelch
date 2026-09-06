const db = require('../db');
const { evaluateAllTickers, evaluateTicker } = require('./signalEngine');
const { explainAlert } = require('./reasoning');

const setExplanation = db.prepare('UPDATE alerts SET explanation = ? WHERE id = ?');

// Small pause between sequential Groq calls. Without this, a single scan pass
// that creates several alerts at once (e.g. multiple tickers cross their
// threshold in the same cycle) can fire requests fast enough to trip Groq's
// free-tier per-second rate limit, even while comfortably under the
// per-minute quota — you'd see some alerts get real explanations and others
// silently fall back, which looks like a bug but is actually just unpaced
// bursty traffic hitting a limit.
const GROQ_CALL_DELAY_MS = 600;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attachExplanations(newAlerts) {
  // Multiple watchers of the same symbol produce multiple alert ROWS for the
  // same real-world event — evaluateTicker computes `detail` once and fans
  // it out per watcher, so every row for that event has identical content.
  // Explaining each row separately means N watchers = N near-identical
  // sequential LLM calls for one thing that happened once (500 watchers =
  // 500 calls, ~5 minutes at the current throttle, for one price move).
  //
  // Fix: group rows by the event they actually describe, call the LLM once
  // per unique event, then write that one explanation to every row in the
  // group. Grouping key is content-based (not just symbol+signal_type)
  // because in principle two DIFFERENT events for the same symbol/type could
  // land in the same batch (e.g. a price move and, moments later, another
  // price move after the user resolved the first) — those must stay separate.
  const groups = new Map();
  for (const alert of newAlerts) {
    const key = `${alert.symbol}::${alert.signal_type}::${JSON.stringify(alert.detail)}`;
    if (!groups.has(key)) {
      groups.set(key, { symbol: alert.symbol, signal_type: alert.signal_type, detail: alert.detail, ids: [] });
    }
    groups.get(key).ids.push(alert.id);
  }

  const uniqueEvents = Array.from(groups.values());
  for (let i = 0; i < uniqueEvents.length; i++) {
    const event = uniqueEvents[i];
    const explanation = await explainAlert({
      symbol: event.symbol,
      signal_type: event.signal_type,
      detail: event.detail,
    });
    for (const id of event.ids) {
      setExplanation.run(explanation, id);
    }

    if (i < uniqueEvents.length - 1) {
      await sleep(GROQ_CALL_DELAY_MS);
    }
  }
}

async function runFullScan() {
  const newAlerts = evaluateAllTickers();
  if (newAlerts.length > 0) {
    await attachExplanations(newAlerts);
  }
  return newAlerts;
}

async function runScanForTicker(symbol) {
  const newAlerts = evaluateTicker(symbol);
  if (newAlerts.length > 0) {
    await attachExplanations(newAlerts);
  }
  return newAlerts;
}

module.exports = { runFullScan, runScanForTicker };
