import { useState, useMemo } from 'react';
import ActivityRow from './ActivityRow';

const SIGNAL_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'price_move', label: 'Price moves' },
  { value: 'volume_anomaly', label: 'Volume anomalies' },
  { value: 'range_breach', label: 'Session highs/lows' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Seen' },
  { value: 'dismissed', label: 'Dismissed' },
];

export default function NotificationsPage({ alerts }) {
  const [signalFilter, setSignalFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

  const filtered = useMemo(() => {
    let result = alerts;
    if (signalFilter !== 'all') {
      result = result.filter((a) => a.signal_type === signalFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      result = result.filter((a) => a.symbol.includes(q));
    }
    result = [...result].sort((a, b) => {
      const diff = new Date(a.created_at) - new Date(b.created_at);
      return sortNewestFirst ? -diff : diff;
    });
    return result;
  }, [alerts, signalFilter, statusFilter, search, sortNewestFirst]);

  return (
    <section className="notifications-page">
      <div className="notifications-page__controls">
        <input
          type="text"
          placeholder="Search by ticker…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="notifications-page__search"
          aria-label="Search alerts by ticker symbol"
        />

        <div className="notifications-page__filter-group">
          {SIGNAL_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`notifications-page__filter-btn ${signalFilter === f.value ? 'notifications-page__filter-btn--active' : ''}`}
              onClick={() => setSignalFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="notifications-page__filter-group">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`notifications-page__filter-btn ${statusFilter === f.value ? 'notifications-page__filter-btn--active' : ''}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          className="notifications-page__sort-btn"
          onClick={() => setSortNewestFirst((s) => !s)}
        >
          {sortNewestFirst ? 'Newest first' : 'Oldest first'} ↕
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="notifications-page__empty">Nothing matches these filters.</p>
      ) : (
        <ul className="activity-list activity-list--wide">
          {filtered.map((a) => <ActivityRow key={a.id} alert={a} />)}
        </ul>
      )}
    </section>
  );
}
