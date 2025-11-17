import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Layout.css';

interface LayoutProps {
  children: React.ReactNode;
  showAiToggle?: boolean;
  aiEnabled?: boolean;
  onAiToggle?: () => void;
}

export default function Layout({ children, showAiToggle = false, aiEnabled = false, onAiToggle }: LayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <div className="dashboard-layout">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="mobile-overlay" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="url(#gradient)" fillOpacity="0.2"/>
              <path d="M24 12L32 20L24 28L16 20L24 12Z" fill="white" fillOpacity="0.9"/>
              <path d="M24 20L32 28L24 36L16 28L24 20Z" fill="white" fillOpacity="0.6"/>
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="48" y2="48">
                  <stop stopColor="#8B5CF6"/>
                  <stop offset="1" stopColor="#6366F1"/>
                </linearGradient>
              </defs>
            </svg>
            <span className="logo-text">Millitime</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <Link to="/" className={`nav-item ${isActive('/')}`} onClick={() => setSidebarOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Dashboard</span>
          </Link>

          <Link to="/watchlist" className={`nav-item ${isActive('/watchlist')}`} onClick={() => setSidebarOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span>Watchlist</span>
          </Link>

          <Link to="/signals" className={`nav-item ${isActive('/signals')}`} onClick={() => setSidebarOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <span>Signals</span>
          </Link>

          <Link to="/spotlight" className={`nav-item ${isActive('/spotlight')}`} onClick={() => setSidebarOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>Spotlight</span>
          </Link>

          <Link to="/settings" className={`nav-item ${isActive('/settings')}`} onClick={() => setSidebarOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6m8.66-12l-5.2 3m-2.92 1.68l-5.2 3M21 12h-6m-6 0H3m17.66 6l-5.2-3m-2.92-1.68l-5.2-3"></path>
            </svg>
            <span>Settings</span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <div className="user-info">
              <span className="user-name">{user?.username}</span>
              <button onClick={logout} className="logout-btn">Logout</button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Minimal Header */}
        <header className="minimal-header">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          {showAiToggle && (
            <div className="ai-toggle-minimal">
              <span className="ai-label">AI</span>
              <label className="toggle-switch-minimal">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={onAiToggle}
                />
                <span className="toggle-slider-minimal"></span>
              </label>
            </div>
          )}
        </header>

        {/* Page Content */}
        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
}
