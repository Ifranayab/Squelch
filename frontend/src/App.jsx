import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';
import Sidebar from './components/Sidebar';
import Watchlist from './components/Watchlist';
import AlertQueue from './components/AlertQueue';
import DashboardStrip from './components/DashboardStrip';
import NotificationsPage from './components/NotificationsPage';
import SettingsPage from './components/SettingsPage';
import MarketOverviewPage from './components/MarketOverviewPage';
import CorrelationBanner from './components/CorrelationBanner';
import LoginGate from './components/LoginGate';
import './App.css';

const POLL_INTERVAL_MS = 8000;
const EMAIL_STORAGE_KEY = 'squelch_email';

export default function App() {
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [previousVisitAt, setPreviousVisitAt] = useState(null);
  const [tickers, setTickers] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [pulse, setPulse] = useState(null);
  const [justMutedInfo, setJustMutedInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState('dashboard');
  const bootstrapStarted = useRef(false);

  const identify = useCallback(async (email) => {
    const user = await api.identify(email);
    localStorage.setItem(EMAIL_STORAGE_KEY, user.email);
    setUserId(user.id);
    setUserEmail(user.email);
    setPreviousVisitAt(user.previousVisitAt || null);
    return user;
  }, []);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    async function bootstrap() {
      try {
        const storedEmail = localStorage.getItem(EMAIL_STORAGE_KEY);
        if (storedEmail) {
          await identify(storedEmail);
        }
        const allTickers = await api.getTickers();
        setTickers(allTickers);
      } catch (err) {
        setError('Could not reach the backend. Is it running?');
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, [identify]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [wl, al, st, pu] = await Promise.all([
        api.getWatchlist(userId),
        api.getAlerts(userId),
        api.getStats(userId),
        api.getMarketPulse(userId),
      ]);
      setWatchlist(wl);
      setAlerts(al);
      setStats(st);
      setPulse(pu);
      setError(null);
    } catch (err) {
      setError('Could not reach the backend. Is it running?');
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, refresh]);

  function handleSwitchAccount() {
    localStorage.removeItem(EMAIL_STORAGE_KEY);
    setUserId(null);
    setUserEmail(null);
    setPreviousVisitAt(null);
    setWatchlist([]);
    setAlerts([]);
    setStats(null);
    setPulse(null);
    setPage('dashboard');
  }

  async function handleAdd(symbol) {
    await api.addToWatchlist(userId, symbol);
    refresh();
  }

  async function handleRemove(symbol) {
    await api.removeFromWatchlist(userId, symbol);
    refresh();
  }

  async function handleApprove(alertId) {
    await api.approveAlert(alertId);
    refresh();
  }

  async function handleDismiss(alertId) {
    const result = await api.dismissAlert(alertId);
    if (result.justMuted) {
      setJustMutedInfo({ symbol: result.symbol, signal_type: result.signal_type });
      setTimeout(() => setJustMutedInfo(null), 6000);
    }
    refresh();
  }

  const pendingAlerts = alerts.filter((a) => a.status === 'pending');
  const resolvedAlerts = alerts.filter((a) => a.status !== 'pending');
  const totalAlertsEver = stats ? (stats.pending || 0) + (stats.approved || 0) + (stats.dismissed || 0) : 0;
  const activeMuteCount = stats?.activeMutes?.length || 0;

  if (loading) {
    return <div className="app__loading">Loading…</div>;
  }

  if (!userId) {
    return <LoginGate onIdentified={identify} />;
  }

  const pageTitles = {
    notifications: 'Notifications',
    settings: 'Settings',
    market: 'Market Overview',
    dashboard: 'Watchlist',
  };
  const pageTaglines = {
    notifications: "Every alert you've ever gotten, in one place.",
    settings: 'Your account and data, in one place.',
    market: 'Browse the market, not just what you track.',
    dashboard: "We didn't predict the market. We predicted what you'd ignore.",
  };

  return (
    <div className="app-shell">
      <Sidebar currentPage={page} onNavigate={setPage} pendingCount={pendingAlerts.length} />

      <div className="app">
        <header className="app__header">
          <div className="app__header-row">
            <div>
              <h1>{pageTitles[page]}</h1>
              <p className="app__tagline">{pageTaglines[page]}</p>
            </div>
          </div>
        </header>

        {error && <div className="app__error">{error}</div>}

        {page === 'notifications' ? (
          <NotificationsPage alerts={alerts} />
        ) : page === 'settings' ? (
          <SettingsPage
            userId={userId}
            userEmail={userEmail}
            watchlist={watchlist}
            onSwitchAccount={handleSwitchAccount}
            onHistoryCleared={refresh}
            onDemoFired={refresh}
          />
        ) : page === 'market' ? (
          <MarketOverviewPage
            watchlistSymbols={watchlist.map((w) => w.symbol)}
            onAdd={handleAdd}
          />
        ) : (
          <div className="app__layout">
            <Watchlist
              items={watchlist}
              allTickers={tickers}
              onAdd={handleAdd}
              onRemove={handleRemove}
              sinceTimestamp={previousVisitAt}
            />
            <main className="app__main">
              {stats && totalAlertsEver > 0 && (
                <p className="app__noise-stat">
                  <strong>{totalAlertsEver}</strong> signal{totalAlertsEver === 1 ? '' : 's'} detected so far.
                  {activeMuteCount > 0 && (
                    <> <strong>{activeMuteCount}</strong> muted — you won't see those again for a while.</>
                  )}
                </p>
              )}
              <CorrelationBanner pulse={pulse} />
              <AlertQueue
                alerts={alerts}
                onApprove={handleApprove}
                onDismiss={handleDismiss}
                justMutedInfo={justMutedInfo}
              />
              <DashboardStrip resolvedAlerts={resolvedAlerts} />
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
