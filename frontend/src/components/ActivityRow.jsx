import { useState } from 'react';

const SIGNAL_LABELS = {
  price_move: 'Price move',
  volume_anomaly: 'Volume anomaly',
  range_breach: 'Session high/low',
};

function formatDetail(alert) {
  const d = alert.detail_json;
  if (alert.signal_type === 'price_move') {
    const pct = (d.pctChange * 100).toFixed(2);
    return `${d.previousPrice} → ${d.currentPrice} (${pct > 0 ? '+' : ''}${pct}%)`;
  }
  if (alert.signal_type === 'volume_anomaly') {
    return `${Math.round(d.currentVolume).toLocaleString()} vs avg ${Math.round(d.avgVolume).toLocaleString()} (${d.ratio.toFixed(1)}x)`;
  }
  if (alert.signal_type === 'range_breach') {
    return `New ${d.direction} of ${d.currentPrice} (prior: ${d.priorExtreme})`;
  }
  return '';
}

function formatTime(isoLike) {
  const d = new Date(isoLike.replace(' ', 'T') + 'Z');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityRow({ alert }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className={`activity-row activity-row--${alert.signal_type}`}>
      <button
        className="activity-row__summary"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="activity-row__symbol">{alert.symbol}</span>
        <span className="activity-row__signal">{SIGNAL_LABELS[alert.signal_type]}</span>
        <span className={`activity-row__status activity-row__status--${alert.status}`}>
          {alert.status === 'approved' ? 'Seen' : alert.status === 'dismissed' ? 'Dismissed' : 'Pending'}
        </span>
        <span className={`activity-row__chevron ${expanded ? 'activity-row__chevron--open' : ''}`}>
          ⌄
        </span>
      </button>
      {expanded && (
        <div className="activity-row__detail">
          <p>{alert.explanation}</p>
          <div className="activity-row__meta">
            <span>{formatDetail(alert)}</span>
            <span>{formatTime(alert.created_at)}</span>
          </div>
        </div>
      )}
    </li>
  );
}
