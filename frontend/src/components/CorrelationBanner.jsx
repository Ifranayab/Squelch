export default function CorrelationBanner({ pulse }) {
  if (!pulse || !pulse.correlated) return null;

  return (
    <div className="correlation-banner">
      <strong>{pulse.symbols.join(', ')}</strong> all moved within the last {pulse.windowMinutes} minutes —
      this might be one market-wide event, not {pulse.symbols.length} separate stories.
    </div>
  );
}
