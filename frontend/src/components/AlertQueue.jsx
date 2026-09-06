const SIGNAL_LABELS = {
  price_move: 'Price move',
  volume_anomaly: 'Volume anomaly',
  range_breach: 'Session high/low',
};

export default function AlertQueue({ alerts, onApprove, onDismiss, justMutedInfo }) {
  const pending = alerts.filter((a) => a.status === 'pending');

  return (
    <section className="alert-queue">
      <div className="alert-queue__header">
        <h2>Needs your attention</h2>
        <span className="alert-queue__count">{pending.length}</span>
      </div>

      {justMutedInfo && (
        <div className="alert-queue__mute-banner">
          Muted {SIGNAL_LABELS[justMutedInfo.signal_type]} on {justMutedInfo.symbol} for 7 days —
          you've dismissed this three times. It'll come back if it happens again after that.
        </div>
      )}

      {pending.length === 0 ? (
        <p className="alert-queue__empty">
          Nothing new since you last checked. That's not the system being quiet by default —
          it means nothing crossed the threshold, or you've already muted the noise.
        </p>
      ) : (
        <ul className="alert-queue__list">
          {pending.map((alert) => (
            <li key={alert.id} className={`alert-row alert-row--${alert.signal_type}`}>
              <div className="alert-row__main">
                <div className="alert-row__top">
                  <span className="alert-row__symbol">{alert.symbol}</span>
                  <span className="alert-row__signal">{SIGNAL_LABELS[alert.signal_type]}</span>
                </div>
                <p className="alert-row__explanation">
                  {alert.explanation || 'Explanation pending…'}
                </p>
              </div>
              <div className="alert-row__actions">
                <button
                  className="alert-row__approve"
                  onClick={() => onApprove(alert.id)}
                >
                  Seen it
                </button>
                <button
                  className="alert-row__dismiss"
                  onClick={() => onDismiss(alert.id)}
                >
                  Not useful
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
