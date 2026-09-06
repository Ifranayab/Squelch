import { useEffect, useState } from 'react';
import { api } from '../api';
import Sparkline from './Sparkline';

export default function MarketOverviewPage({ watchlistSymbols, onAdd }) {
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getMarketOverview();
        if (!cancelled) setOverview(data);
      } catch {
        // leave whatever we last had rather than break the page
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!overview) {
    return <p className="market-overview__loading">Loading market data…</p>;
  }

  return (
    <section className="market-overview">
      <p className="market-overview__note">
        Every stock in the market, whether you're watching it or not — for browsing before you decide what to track.
      </p>
      <ul className="market-overview__list">
        {overview.map((t) => {
          const isWatching = watchlistSymbols.includes(t.symbol);
          const changeClass = t.changePct >= 0 ? 'market-overview__change--up' : 'market-overview__change--down';
          return (
            <li key={t.symbol} className="market-overview__row">
              <div className="market-overview__info">
                <span className="market-overview__symbol">{t.symbol}</span>
                <span className="market-overview__name">{t.name}</span>
              </div>
              <div className="market-overview__spark">
                <Sparkline symbol={t.symbol} compact />
              </div>
              <span className="market-overview__price numeric">{t.price.toFixed(2)}</span>
              <span className={`market-overview__change numeric ${changeClass}`}>
                {t.changePct >= 0 ? '+' : ''}{t.changePct.toFixed(2)}%
              </span>
              {t.stale && <span className="watchlist__stale">stale</span>}
              <button
                className="market-overview__add"
                disabled={isWatching}
                onClick={() => onAdd(t.symbol)}
              >
                {isWatching ? 'Watching' : 'Add'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
