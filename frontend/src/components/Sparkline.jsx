import { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { api } from '../api';

const REFRESH_MS = 15000; // matches backend tick cadence — no point polling faster

// Small, dependency-free "2 hours ago" formatter. Deliberately coarse (no
// seconds precision) — the caption only needs to answer "roughly when," not
// give an exact duration.
function formatRelativeTime(isoLike) {
  if (!isoLike) return null;
  const then = new Date(isoLike.replace(' ', 'T') + (isoLike.includes('Z') ? '' : 'Z')).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatTooltipTime(isoLike) {
  const d = new Date(isoLike.replace(' ', 'T') + (isoLike.includes('Z') ? '' : 'Z'));
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  return (
    <div className="sparkline__tooltip">
      <div className="sparkline__tooltip-price">{point.price.toFixed(2)}</div>
      <div className="sparkline__tooltip-time">{formatTooltipTime(point.recorded_at)}</div>
    </div>
  );
}

export default function Sparkline({ symbol, sinceTimestamp, compact = false }) {
  const [data, setData] = useState(null);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // sinceTimestamp is null on a user's first-ever visit (no meaningful
        // "since" yet) — the API falls back to a fixed recent window either
        // way, so we don't need a separate code path here, just pass through
        // whatever we have.
        const result = await api.getPriceHistory(symbol, { limit: 30, since: sinceTimestamp });
        if (!cancelled) {
          setData(result.points);
          setUsedFallback(result.usedFallback);
        }
      } catch {
        // Chart is secondary to the row's core data (price, stale flag) — a
        // failed fetch shouldn't break the row. Silently keep whatever we
        // last had (or nothing) rather than error out.
      }
    }

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol, sinceTimestamp]);

  if (!data || data.length < 2) {
    return <div className="sparkline sparkline--empty" />;
  }

  const first = data[0].price;
  const last = data[data.length - 1].price;
  const pctChange = first ? ((last - first) / first) * 100 : 0;
  const isUp = last >= first;
  const trendColor = isUp ? 'var(--color-accent)' : 'var(--color-attention)';

  // Label always tells the reader what window they're actually looking at —
  // never claim "since your last visit" unless that's really what's shown.
  const caption = !usedFallback && sinceTimestamp
    ? `Since your last visit (${formatRelativeTime(sinceTimestamp)})`
    : `Last ${data.length} updates`;

  const chart = (
    <div className="sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={['dataMin', 'dataMax']} hide />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="price"
            stroke={trendColor}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  // compact = true skips the caption/%-change row. Used on screens (like
  // Market Overview) that already show their own change% next to the chart
  // — stacking a second, differently-windowed % there would read as two
  // conflicting numbers rather than one useful one.
  if (compact) return chart;

  return (
    <div className="sparkline-block">
      {chart}
      <div className="sparkline-block__caption">
        <span>{caption}</span>
        <span className="numeric" style={{ color: trendColor }}>
          {isUp ? '+' : ''}{pctChange.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
