import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store';
import { LoginPage } from './pages/LoginPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { ChatPage } from './pages/ChatPage';
import { CalendarPage } from './pages/CalendarPage';
import './App.css';

export const App: React.FC = () => {
  const { isAuthenticated, isLoading, loadUser, logout, user } = useAuthStore();
  const [currentTab, setCurrentTab] = useState<'chat' | 'directory' | 'calendar'>('chat');

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  if (isLoading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>
          Initializing FortiConnect Enterprise...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="fc-app-layout">
      {/* Top Navbar */}
      <header className="fc-navbar">
        <div className="fc-brand">
          <div className="fc-brand-logo">FC</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span className="fc-brand-title">FortiConnect</span>
              <span className="fc-brand-badge">Enterprise</span>
            </div>
          </div>
        </div>

        {/* Desktop Navigation Links (hidden on mobile) */}
        <nav className="fc-nav-tabs fc-hide-mobile">
          <button
            onClick={() => setCurrentTab('chat')}
            className={`fc-nav-tab ${currentTab === 'chat' ? 'active' : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Messages & Groups
          </button>
          <button
            onClick={() => setCurrentTab('directory')}
            className={`fc-nav-tab ${currentTab === 'directory' ? 'active' : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Employee Directory
          </button>
          <button
            onClick={() => setCurrentTab('calendar')}
            className={`fc-nav-tab ${currentTab === 'calendar' ? 'active' : ''}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            Calendar & Meetings
          </button>
        </nav>

        {/* User Profile & Sign Out */}
        <div className="fc-user-bar">
          <div className="fc-user-meta fc-hide-mobile">
            <span className="fc-user-name">{user?.display_name || 'Employee'}</span>
            <span className="fc-user-dept">{user?.department || 'Staff'} • {user?.employee_id || ''}</span>
          </div>

          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.8125rem',
              boxShadow: '0 0 0 2px #334155',
            }}
            title={`${user?.display_name || 'User'} (${user?.employee_id || ''})`}
          >
            {(user?.display_name || 'U').charAt(0).toUpperCase()}
          </div>

          <button onClick={logout} className="fc-logout-btn" title="Sign out of FortiConnect">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span className="fc-hide-mobile">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="fc-main-view">
        {currentTab === 'chat' && <ChatPage />}
        {currentTab === 'directory' && (
          <DirectoryPage onSelectChat={() => setCurrentTab('chat')} />
        )}
        {currentTab === 'calendar' && (
          <CalendarPage onSelectChat={() => setCurrentTab('chat')} />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (visible only on <= 768px) */}
      <nav className="fc-bottom-nav">
        <button
          onClick={() => setCurrentTab('chat')}
          className={`fc-bottom-tab ${currentTab === 'chat' ? 'active' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Chats</span>
        </button>

        <button
          onClick={() => setCurrentTab('directory')}
          className={`fc-bottom-tab ${currentTab === 'directory' ? 'active' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span>Directory</span>
        </button>

        <button
          onClick={() => setCurrentTab('calendar')}
          className={`fc-bottom-tab ${currentTab === 'calendar' ? 'active' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span>Calendar</span>
        </button>
      </nav>
    </div>
  );
};

export default App;

const styles: Record<string, React.CSSProperties> = {
  loadingScreen: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0f19',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  spinner: {
    width: '44px',
    height: '44px',
    border: '3px solid #1e293b',
    borderTop: '3px solid #38bdf8',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
