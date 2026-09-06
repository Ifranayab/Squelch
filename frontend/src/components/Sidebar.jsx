export default function Sidebar({ currentPage, onNavigate, pendingCount }) {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">S</span>
      </div>

      <button
        className={`sidebar__item ${currentPage === 'dashboard' ? 'sidebar__item--active' : ''}`}
        onClick={() => onNavigate('dashboard')}
        aria-label="Dashboard"
      >
        <HomeIcon />
        <span className="sidebar__label">Dashboard</span>
      </button>

      <button
        className={`sidebar__item ${currentPage === 'market' ? 'sidebar__item--active' : ''}`}
        onClick={() => onNavigate('market')}
        aria-label="Market Overview"
      >
        <ChartIcon />
        <span className="sidebar__label">Market</span>
      </button>

      <button
        className={`sidebar__item ${currentPage === 'notifications' ? 'sidebar__item--active' : ''}`}
        onClick={() => onNavigate('notifications')}
        aria-label={`Notifications${pendingCount > 0 ? `, ${pendingCount} pending` : ''}`}
      >
        <BellIcon />
        {pendingCount > 0 && <span className="sidebar__badge">{pendingCount}</span>}
        <span className="sidebar__label">Alerts</span>
      </button>

      <button
        className={`sidebar__item ${currentPage === 'settings' ? 'sidebar__item--active' : ''}`}
        onClick={() => onNavigate('settings')}
        aria-label="Settings"
      >
        <GearIcon />
        <span className="sidebar__label">Settings</span>
      </button>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 11.5L12 4l9 7.5M5 10v10h5v-6h4v6h5V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 20V10M12 20V4M20 20v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zm8.4-3.5a8.4 8.4 0 0 0-.13-1.47l2.02-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.38.96a8.5 8.5 0 0 0-1.27-.74l-.36-2.54a.5.5 0 0 0-.5-.43h-3.84a.5.5 0 0 0-.5.43l-.36 2.54c-.45.19-.88.44-1.27.74l-2.38-.96a.5.5 0 0 0-.6.22L1.6 8.31a.5.5 0 0 0 .12.64l2.02 1.58A8.4 8.4 0 0 0 3.6 12c0 .5.05.99.13 1.47L1.72 15.05a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.38-.96c.39.3.82.55 1.27.74l.36 2.54a.5.5 0 0 0 .5.43h3.84a.5.5 0 0 0 .5-.43l.36-2.54c.45-.19.88-.44 1.27-.74l2.38.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.02-1.58c.08-.48.13-.97.13-1.47z"
        stroke="currentColor"
        strokeWidth="0.5"
        fill="currentColor"
      />
    </svg>
  );
}
