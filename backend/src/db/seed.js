const db = require('./index');

// volatility = the normalized "meaningful move" threshold for that ticker.
// Larger, stable stocks get a tighter threshold; smaller/volatile ones get a wider one.
// This is what makes the price_move signal per-stock instead of a flat % for everyone.
const tickers = [
  { symbol: 'GRWFIN', name: 'Groww Finserv (demo)', base_price: 1450.0, volatility: 0.015 },
  { symbol: 'BIGCAP', name: 'BigCap Industries (demo)', base_price: 2800.0, volatility: 0.01 },
  { symbol: 'MIDCAP', name: 'MidCap Motors (demo)', base_price: 640.0, volatility: 0.025 },
  { symbol: 'SMALLX', name: 'SmallX Tech (demo)', base_price: 85.0, volatility: 0.04 },
  { symbol: 'ENERGX', name: 'EnergX Power (demo)', base_price: 310.0, volatility: 0.02 },
  { symbol: 'PHARMX', name: 'PharmaX Labs (demo)', base_price: 920.0, volatility: 0.02 },
  { symbol: 'AUTOMO', name: 'AutoMotion Ltd (demo)', base_price: 410.0, volatility: 0.03 },
  { symbol: 'BANKLY', name: 'Bankly Financial (demo)', base_price: 1180.0, volatility: 0.012 },
  { symbol: 'REALTY', name: 'Realty Holdings (demo)', base_price: 260.0, volatility: 0.035 },
  { symbol: 'TELCOM', name: 'Telcom Networks (demo)', base_price: 540.0, volatility: 0.018 },
];

// Exported so server.js can call this on every boot, not just via the CLI.
// `INSERT OR IGNORE` makes this safe to run repeatedly — already-seeded rows
// are left untouched, so calling it on every startup costs nothing on a
// warm database and fixes an empty one automatically. This matters on
// Render's free tier specifically: the disk (and therefore the SQLite file)
// gets wiped on every redeploy, and free services don't get Shell access to
// run the seed script by hand — so "seed on boot if needed" isn't just a
// convenience here, it's the only way to reliably seed at all.
function seedTickers() {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO tickers (symbol, name, base_price, volatility) VALUES (@symbol, @name, @base_price, @volatility)`
  );
  tickers.forEach((t) => insert.run(t));
  return tickers.length;
}

// Still runnable standalone via `node src/db/seed.js` for local dev.
if (require.main === module) {
  const count = seedTickers();
  console.log(`Seeded ${count} tickers.`);
}

module.exports = { seedTickers };
