import ActivityRow from './ActivityRow';

const RECENT_LIMIT_PER_COLUMN = 5;

const COLUMN_ORDER = [
  { signal_type: 'price_move', title: 'Price moves' },
  { signal_type: 'volume_anomaly', title: 'Volume anomalies' },
  { signal_type: 'range_breach', title: 'Session highs/lows' },
];

export default function DashboardStrip({ resolvedAlerts }) {
  const columns = COLUMN_ORDER.map((col) => ({
    ...col,
    items: resolvedAlerts.filter((a) => a.signal_type === col.signal_type).slice(0, RECENT_LIMIT_PER_COLUMN),
  }));

  const hasAny = columns.some((col) => col.items.length > 0);

  return (
    <section className="dashboard-strip">
      <h2 className="dashboard-strip__title">Recent activity</h2>
      {!hasAny ? (
        <p className="dashboard-strip__empty">Nothing resolved yet.</p>
      ) : (
        <div className="dashboard-strip__columns">
          {columns.map((col) => (
            <div className="dashboard-strip__column" key={col.signal_type}>
              <h3 className="dashboard-strip__column-title">{col.title}</h3>
              {col.items.length === 0 ? (
                <p className="dashboard-strip__empty">None yet.</p>
              ) : (
                <ul className="activity-list">
                  {col.items.map((a) => <ActivityRow key={a.id} alert={a} />)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
