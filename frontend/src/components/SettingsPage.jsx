import { useEffect, useState } from 'react';
import { api } from '../api';

export default function SettingsPage({ userId, userEmail, watchlist, onSwitchAccount, onHistoryCleared, onDemoFired }) {
  const [stats, setStats] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [demoSymbol, setDemoSymbol] = useState('');
  const [firing, setFiring] = useState(false);

  useEffect(() => {
    api.getStats(userId).then(setStats).catch(() => setStats(null));
  }, [userId]);

  async function handleClearHistory() {
    setClearing(true);
    try {
      await api.clearHistory(userId);
      setConfirming(false);
      onHistoryCleared();
      const fresh = await api.getStats(userId);
      setStats(fresh);
    } finally {
      setClearing(false);
    }
  }

  async function handleFireDemo() {
    if (!demoSymbol) return;
    setFiring(true);
    try {
      await api.fireDemoAlerts(userId, demoSymbol);
      onDemoFired();
    } finally {
      setFiring(false);
    }
  }

  return (
    <section className="settings-page">
      <div className="settings-page__block">
        <h2 className="settings-page__block-title">Account</h2>
        <p className="settings-page__row">
          <span>Signed in as</span>
          <strong>{userEmail}</strong>
        </p>
        <p className="settings-page__note">
          No password — this is an identifier, not a secured account. Use the same email on any device to see the same watchlist.
        </p>
        <button className="settings-page__switch" onClick={onSwitchAccount}>
          Switch account
        </button>
      </div>

      {stats && (
        <div className="settings-page__block">
          <h2 className="settings-page__block-title">At a glance</h2>
          <div className="settings-page__stats">
            <div className="settings-page__stat">
              <span className="settings-page__stat-value numeric">{stats.watchlistCount}</span>
              <span className="settings-page__stat-label">Tracked stocks</span>
            </div>
            <div className="settings-page__stat">
              <span className="settings-page__stat-value numeric">{stats.pending || 0}</span>
              <span className="settings-page__stat-label">Pending alerts</span>
            </div>
            <div className="settings-page__stat">
              <span className="settings-page__stat-value numeric">{stats.dismissed || 0}</span>
              <span className="settings-page__stat-label">Dismissed</span>
            </div>
            <div className="settings-page__stat">
              <span className="settings-page__stat-value numeric">{stats.activeMutes?.length || 0}</span>
              <span className="settings-page__stat-label">Active mutes</span>
            </div>
          </div>

          {stats.activeMutes?.length > 0 && (
            <ul className="settings-page__mute-list">
              {stats.activeMutes.map((m, i) => (
                <li key={i}>
                  {m.symbol} · {m.signal_type === 'price_move' ? 'Price move' : 'Volume anomaly'} — muted until{' '}
                  {new Date(m.muted_until.replace(' ', 'T') + 'Z').toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="settings-page__block">
        <h2 className="settings-page__block-title">Data</h2>
        <p className="settings-page__note">
          Clears your resolved alert history and lifts any active mutes. Pending alerts you haven't acted on are left alone.
        </p>
        {!confirming ? (
          <button className="settings-page__danger" onClick={() => setConfirming(true)}>
            Clear history &amp; mutes
          </button>
        ) : (
          <div className="settings-page__confirm">
            <span>Are you sure? This can't be undone.</span>
            <button className="settings-page__danger" onClick={handleClearHistory} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Yes, clear it'}
            </button>
            <button className="settings-page__cancel" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="settings-page__block settings-page__block--demo">
        <h2 className="settings-page__block-title">Demo tools</h2>
        <p className="settings-page__note">
          Not a real feature — this instantly fires 3 pending price-move alerts for a chosen stock,
          so you can dismiss all three and see the 3-dismissal mute trigger without waiting for a real
          market signal to happen on its own.
        </p>
        <div className="settings-page__demo-row">
          <select
            value={demoSymbol}
            onChange={(e) => setDemoSymbol(e.target.value)}
            className="settings-page__demo-select"
          >
            <option value="">Choose a stock…</option>
            {watchlist.map((w) => (
              <option key={w.symbol} value={w.symbol}>{w.symbol}</option>
            ))}
          </select>
          <button
            className="settings-page__demo-fire"
            onClick={handleFireDemo}
            disabled={!demoSymbol || firing}
          >
            {firing ? 'Firing…' : 'Fire 3 test alerts'}
          </button>
        </div>
      </div>
    </section>
  );
}
