# Backend Setup

1. Unzip this into your project folder (or open it directly in VS Code as its own folder).
2. In `backend/`, run:
   ```
   npm install
   ```
   This has no native/compiled dependencies — it uses Node's built-in `node:sqlite` module, so there's nothing to compile and no C++ build tools needed on any OS.
3. Copy `.env.example` to `.env` and fill in your Groq key when you have one:
   ```
   cp .env.example .env
   ```
   (Without a key, the app still works — alerts fall back to plain-text explanations instead of LLM-generated ones.)
4. Seed the ticker universe (only needs to be run once, or whenever you delete the DB file):
   ```
   node src/db/seed.js
   ```
5. Start the server:
   ```
   node src/server.js
   ```
   Should print `Backend listening on port 4000`. You'll also see a one-time `ExperimentalWarning: SQLite is an experimental feature` — that's expected and harmless, not a bug.

6. Sanity check it's alive:
   ```
   curl localhost:4000/health
   ```

## What happens on startup
- A SQLite file is created at `backend/data/watchlist.db` (auto-created, gitignored — don't commit it).
- The synthetic data generator starts immediately: baseline price/volume noise every 15s, one scripted anomaly every 2 minutes on a rotating ticker.
- A background scan runs every 20s across all watched tickers, in addition to an immediate scan triggered right after each scripted anomaly.

## Key endpoints
- `POST /api/users` — create a demo user
- `POST /api/watchlist/:userId` — add a ticker (body: `{ "symbol": "SMALLX" }`)
- `GET /api/watchlist/:userId` — view watchlist with latest prices
- `GET /api/alerts/:userId` — view alerts (optional `?status=pending`)
- `POST /api/alerts/:id/approve` / `POST /api/alerts/:id/dismiss`
- `GET /api/mute-status/:userId/:symbol/:signalType`
- `POST /api/scan/:symbol` — manually force a scan (useful for testing/demo control)

## Why node:sqlite instead of better-sqlite3
better-sqlite3 is a native module — it compiles C++ during `npm install`. On machines without a C++ toolchain (Visual Studio Build Tools on Windows, Xcode CLI tools on Mac), that install step fails outright. Since judges will clone and run this themselves, that's a real risk, not a hypothetical one. `node:sqlite` is built into Node 22+, needs zero compilation, and behaves the same way for everything this project does.

## Notes
- `data/` and `.env` are excluded from the zip — they're local/generated, not source.
- Don't put this project inside a OneDrive/Dropbox/Google Drive synced folder — active file syncing can lock files mid-write and cause random `EPERM`/`rmdir` errors during `npm install`. Keep it in a plain local folder.
- See the main requirements doc for the reasoning behind these design choices (synthetic data, deterministic mute mechanism, rule-based signals).
