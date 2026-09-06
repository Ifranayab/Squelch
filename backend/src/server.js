require('dotenv').config();
const express = require('express');
const cors = require('cors');

const apiRoutes = require('./routes/api');
const dataGenerator = require('./services/dataGenerator');
const { runScanForTicker, runFullScan } = require('./services/scanJob');
const { seedTickers } = require('./db/seed');

const app = express();
const PORT = process.env.PORT || 4000;

// Periodic full-universe scan. Separate from the scripted-anomaly hook, which
// only reacts to the one ticker that gets the deliberate spike each cycle.
// This poller catches everything else: baseline noise that happens to cross
// a threshold on its own, and any ticker not covered by the scripted anomaly
// in a given window. Without this, "meaningful change" detection only works
// for the one scripted stock — a real gap, not just an edge case.
const SCAN_INTERVAL_MS = 20_000; // slightly longer than the data tick (15s) so each scan sees fresh data
let scanTimer = null;

function startScanPoller() {
  scanTimer = setInterval(() => {
    runFullScan().catch((err) => console.error('[scan-poller] full scan failed:', err.message));
  }, SCAN_INTERVAL_MS);
}

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api', apiRoutes);

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);

  // Idempotent — safe on a warm DB, and the only reliable way to seed on
  // Render's free tier where the disk resets every redeploy and there's no
  // Shell tab to run this by hand.
  const seededCount = seedTickers();
  console.log(`[startup] ensured ${seededCount} tickers exist`);

  // Start synthetic data generator. When a scripted anomaly fires, immediately
  // run the signal engine for that ticker rather than waiting for a separate
  // polling cycle — keeps the demo tight (spike -> alert appears within seconds,
  // not on the next arbitrary scan interval).
  dataGenerator.start((symbol) => {
    runScanForTicker(symbol).catch((err) =>
      console.error(`[scan] failed for ${symbol}:`, err.message)
    );
  });

  startScanPoller();
});
