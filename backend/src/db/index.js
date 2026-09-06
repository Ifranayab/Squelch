const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

// Using Node's built-in sqlite module (stable since Node 22) instead of
// better-sqlite3 deliberately: better-sqlite3 is a native module that needs
// to compile C++ on install, which fails on machines without a C++ build
// toolchain (Visual Studio Build Tools on Windows, Xcode CLI tools on Mac).
// That's a real risk for a hackathon submission judges will clone and run
// themselves — removing the native dependency removes that whole failure
// class. Node logs an "experimental feature" warning on startup; that's
// expected and harmless, not a bug.

const DB_PATH = path.join(__dirname, '../../data/watchlist.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Lightweight migration: if this DB was created before the `email` column
// existed, add it now instead of forcing a full wipe. SQLite's ADD COLUMN
// doesn't support inline UNIQUE constraints cleanly, so uniqueness is
// enforced in application code (see routes/api.js /session handler) rather
// than at the schema level.
const userColumns = db.prepare("PRAGMA table_info(users)").all();
const hasEmailColumn = userColumns.some((col) => col.name === 'email');
if (!hasEmailColumn) {
  db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  console.log('[migration] added email column to users table');
}

// Versioned migration system, starting here. SQLite can't ALTER a CHECK
// constraint in place — widening one (e.g. adding a new allowed signal_type)
// requires rebuilding the table: create the new shape, copy data across,
// drop the old one, rename. Tracking a version number means this only ever
// runs once per database, and future schema changes have a clear place to
// slot in rather than each becoming its own bespoke ad-hoc check.
db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)');
const currentVersion = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get().v || 0;

if (currentVersion < 2) {
  console.log('[migration] running v2: widening signal_type to allow range_breach');
  db.exec(`
    CREATE TABLE alerts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      signal_type TEXT NOT NULL CHECK(signal_type IN ('price_move', 'volume_anomaly', 'range_breach')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'dismissed')),
      detail_json TEXT NOT NULL,
      explanation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (symbol) REFERENCES tickers(symbol)
    );
    INSERT INTO alerts_new SELECT * FROM alerts;
    DROP TABLE alerts;
    ALTER TABLE alerts_new RENAME TO alerts;
    CREATE INDEX IF NOT EXISTS idx_alerts_user_status ON alerts(user_id, status);

    CREATE TABLE dismiss_counts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      signal_type TEXT NOT NULL CHECK(signal_type IN ('price_move', 'volume_anomaly', 'range_breach')),
      count INTEGER NOT NULL DEFAULT 0,
      muted_until DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (symbol) REFERENCES tickers(symbol),
      UNIQUE(user_id, symbol, signal_type)
    );
    INSERT INTO dismiss_counts_new SELECT * FROM dismiss_counts;
    DROP TABLE dismiss_counts;
    ALTER TABLE dismiss_counts_new RENAME TO dismiss_counts;

    INSERT INTO schema_migrations (version) VALUES (2);
  `);
  console.log('[migration] v2 complete');
}

// Lightweight migration, same pattern as the email column above: track when
// a user was last seen so the frontend can show "what's changed since you
// last checked" (e.g. the watchlist sparkline) instead of an arbitrary fixed
// window. Nullable — null means "never seen before / brand new user", which
// the frontend treats as a distinct case (no meaningful "since" yet).
const hasLastSeenColumn = db.prepare("PRAGMA table_info(users)").all()
  .some((col) => col.name === 'last_seen_at');
if (!hasLastSeenColumn) {
  db.exec('ALTER TABLE users ADD COLUMN last_seen_at DATETIME');
  console.log('[migration] added last_seen_at column to users table');
}

module.exports = db;
