# Frontend Setup

1. Unzip into your project folder, open the `frontend/` folder in VS Code.
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the env example and point it at your backend:
   ```
   cp .env.example .env
   ```
   Default assumes backend is running locally on port 4000. Change `VITE_API_URL` if your backend runs elsewhere (e.g. after deploying to Railway/Render).
4. Run it:
   ```
   npm run dev
   ```
   Opens on `http://localhost:5173` by default.

**Backend must be running first** — this app has no fallback/offline mode; it polls the backend every 8 seconds for alerts and watchlist state. If you see a red "Could not reach the backend" banner, check the backend is up and `VITE_API_URL` is correct.

## What's here
- `src/App.jsx` — top-level state, polling loop, bootstraps a demo user on first load
- `src/api.js` — all backend calls in one place
- `src/components/Watchlist.jsx` — sidebar: tracked tickers, add/remove
- `src/components/AlertQueue.jsx` — the core feature: pending alerts with approve/dismiss, shows the mute banner when the 3-dismissal threshold triggers
- `src/components/DashboardStrip.jsx` — quiet history of resolved alerts
- `src/App.css` / `src/index.css` — design tokens and layout (see requirements doc for the reasoning behind the visual choices)

## Build for deployment
```
npm run build
```
Outputs static files to `dist/` — deployable to Vercel/Netlify as-is. Set `VITE_API_URL` as an environment variable on the hosting platform to point at your deployed backend.
