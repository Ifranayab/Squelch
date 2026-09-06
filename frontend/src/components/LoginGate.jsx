import { useState } from 'react';

export default function LoginGate({ onIdentified }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await onIdentified(email);
      if (!user) setError('Something went wrong. Try again.');
    } catch (err) {
      setError(err.message || 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-gate">
      <div className="login-gate__card">
        <h1 className="login-gate__title">Squelch</h1>
        <p className="login-gate__tagline">
          We didn't predict the market. We predicted what you'd ignore.
        </p>
        <form onSubmit={handleSubmit} className="login-gate__form">
          <label htmlFor="email" className="login-gate__label">
            Enter your email to continue
          </label>
          <input
            id="email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-gate__input"
          />
          <button type="submit" disabled={loading} className="login-gate__button">
            {loading ? 'Signing in…' : 'Continue'}
          </button>
        </form>
        {error && <p className="login-gate__error">{error}</p>}
        <p className="login-gate__note">
          No password, no verification — just an identifier so your watchlist follows you across devices. Use the same email anywhere to pick up where you left off.
        </p>
      </div>
    </div>
  );
}
