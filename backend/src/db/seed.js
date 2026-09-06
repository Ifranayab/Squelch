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

const insert = db.prepare(
  `INSERT OR IGNORE INTO tickers (symbol, name, base_price, volatility) VALUES (@symbol, @name, @base_price, @volatility)`
);

tickers.forEach((t) => insert.run(t));

console.log(`Seeded ${tickers.length} tickers.`);
