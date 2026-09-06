import { useState } from 'react';
import Sparkline from './Sparkline';

export default function Watchlist({ items, allTickers, onAdd, onRemove, sinceTimestamp }) {
  const [selectedSymbol, setSelectedSymbol] = useState('');

  const availableToAdd = allTickers.filter(
    (t) => !items.some((i) => i.symbol === t.symbol)
  );

  function handleAdd(e) {
    e.preventDefault();
    if (!selectedSymbol) return;
    onAdd(selectedSymbol);
    setSelectedSymbol('');
  }

  return (
    <aside className="watchlist">
      <h2 className="watchlist__title">Watchlist</h2>

      <ul className="watchlist__list">
        {items.length === 0 && (
          <li className="watchlist__empty">
            Nothing tracked yet. Add a stock below to start seeing what changes.
          </li>
        )}
        {items.map((item) => (
          <li key={item.symbol} className="watchlist__item">
            <div className="watchlist__item-top">
              <div className="watchlist__item-main">
                <span className="watchlist__symbol">{item.symbol}</span>
                <span className="watchlist__name">{item.name}</span>
              </div>
              <div className="watchlist__item-meta">
                <span className="watchlist__price numeric">
                  {item.latestPrice != null ? item.latestPrice.toFixed(2) : '—'}
                </span>
                {item.stale && (
                  <span className="watchlist__stale" title="No fresh data recently — alerts paused for this stock">
                    stale
                  </span>
                )}
                <button
                  className="watchlist__remove"
                  onClick={() => onRemove(item.symbol)}
                  aria-label={`Remove ${item.symbol} from watchlist`}
                >
                  ×
                </button>
              </div>
            </div>
            <Sparkline symbol={item.symbol} sinceTimestamp={sinceTimestamp} />
          </li>
        ))}
      </ul>

      {availableToAdd.length > 0 && (
        <form className="watchlist__add" onSubmit={handleAdd}>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            aria-label="Select a stock to add"
          >
            <option value="">Add a stock…</option>
            {availableToAdd.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol} — {t.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!selectedSymbol}>Add</button>
        </form>
      )}
    </aside>
  );
}
