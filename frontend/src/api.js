const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getTickers: () => request('/tickers'),
  getWatchlist: (userId) => request(`/watchlist/${userId}`),
  addToWatchlist: (userId, symbol) =>
    request(`/watchlist/${userId}`, { method: 'POST', body: JSON.stringify({ symbol }) }),
  removeFromWatchlist: (userId, symbol) =>
    request(`/watchlist/${userId}/${symbol}`, { method: 'DELETE' }),
  getAlerts: (userId, status) =>
    request(`/alerts/${userId}${status ? `?status=${status}` : ''}`),
  approveAlert: (id) => request(`/alerts/${id}/approve`, { method: 'POST' }),
  dismissAlert: (id) => request(`/alerts/${id}/dismiss`, { method: 'POST' }),
  getMuteStatus: (userId, symbol, signalType) =>
    request(`/mute-status/${userId}/${symbol}/${signalType}`),
  createUser: (name) => request('/users', { method: 'POST', body: JSON.stringify({ name }) }),
  getUsers: () => request('/users'),
  identify: (email) => request('/session', { method: 'POST', body: JSON.stringify({ email }) }),
  getPriceHistory: (symbol, { limit = 40, since } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (since) params.set('since', since);
    return request(`/price-history/${symbol}?${params.toString()}`);
  },
  getStats: (userId) => request(`/stats/${userId}`),
  clearHistory: (userId) => request(`/alerts/${userId}/history`, { method: 'DELETE' }),
  getMarketOverview: () => request('/market-overview'),
  fireDemoAlerts: (userId, symbol) =>
    request(`/demo/fire-alerts/${userId}/${symbol}`, { method: 'POST' }),
  getMarketPulse: (userId) => request(`/market-pulse/${userId}`),
};
