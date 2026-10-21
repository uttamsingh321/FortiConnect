import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store';
import { LoginPage } from './pages/LoginPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { ChatPage } from './pages/ChatPage';

export const App: React.FC = () => {
  const { isAuthenticated, isLoading, loadUser, logout, user } = useAuthStore();
  const [currentTab, setCurrentTab] = useState<'chat' | 'directory'>('chat');

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  if (isLoading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Initializing FortiConnect...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div style={styles.appLayout}>
      {/* Top Navbar */}
      <header style={styles.navbar}>
        <div style={styles.brand}>
          <div style={styles.logoBadge}>FC</div>
          <span style={styles.brandTitle}>FortiConnect</span>
          <span style={styles.badgeEnv}>Secure MVP</span>
        </div>

        <nav style={styles.navLinks}>
          <button
            onClick={() => setCurrentTab('chat')}
            style={currentTab === 'chat' ? { ...styles.navButton, ...styles.navButtonActive } : styles.navButton}
          >
            Messages & Groups
          </button>
          <button
            onClick={() => setCurrentTab('directory')}
            style={currentTab === 'directory' ? { ...styles.navButton, ...styles.navButtonActive } : styles.navButton}
          >
            Employee Directory
          </button>
        </nav>

        <div style={styles.userProfile}>
          <div style={styles.userInfo}>
            <span style={styles.userName}>{user?.display_name || 'Employee'}</span>
            <span style={styles.userDept}>{user?.department || 'Staff'}</span>
          </div>
          <button onClick={logout} style={styles.logoutButton}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={styles.mainContent}>
        {currentTab === 'chat' ? (
          <ChatPage />
        ) : (
          <DirectoryPage onSelectChat={() => setCurrentTab('chat')} />
        )}
      </main>
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
    backgroundColor: '#0f172a',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #1e293b',
    borderTop: '3px solid #38bdf8',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  appLayout: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    backgroundColor: '#0f172a',
  },
  navbar: {
    height: '60px',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 1.5rem',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  logoBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.875rem',
  },
  brandTitle: {
    fontSize: '1.125rem',
    fontWeight: '700',
    color: '#f8fafc',
  },
  badgeEnv: {
    fontSize: '0.625rem',
    padding: '0.125rem 0.375rem',
    borderRadius: '4px',
    backgroundColor: '#0369a1',
    color: '#e0f2fe',
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: '0.05em',
  },
  navLinks: {
    display: 'flex',
    gap: '0.5rem',
  },
  navButton: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.875rem',
    transition: 'all 0.15s ease',
  },
  navButtonActive: {
    backgroundColor: '#334155',
    color: '#38bdf8',
  },
  userProfile: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  userName: {
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: '#f8fafc',
  },
  userDept: {
    fontSize: '0.6875rem',
    color: '#94a3b8',
  },
  logoutButton: {
    padding: '0.375rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #475569',
    backgroundColor: 'transparent',
    color: '#cbd5e1',
    fontSize: '0.75rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  mainContent: {
    flex: 1,
    overflow: 'hidden',
  },
};
