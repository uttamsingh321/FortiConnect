import React, { useState } from 'react';
import { useAuthStore } from '../store';
import { login } from '../api';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => {
    return (
      (typeof window !== 'undefined' && localStorage.getItem('fc_custom_api_url')) ||
      'https://draft-vermont-totals-distinction.trycloudflare.com/api'
    );
  });
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const loginSuccess = useAuthStore((state) => state.loginSuccess);

  const testConnection = async (urlToTest: string) => {
    setTestStatus('testing');
    try {
      const cleanUrl = urlToTest.trim().replace(/\/$/, '');
      const healthUrl = cleanUrl.endsWith('/api') ? `${cleanUrl}/health/` : `${cleanUrl}/api/health/`;
      const res = await fetch(healthUrl, { method: 'GET' });
      if (res.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('failed');
      }
    } catch (_) {
      setTestStatus('failed');
    }
  };

  const saveServerUrl = () => {
    const cleanUrl = serverUrl.trim().replace(/\/$/, '');
    localStorage.setItem('fc_custom_api_url', cleanUrl);
    // Derive WS url
    const wsUrl = cleanUrl.replace(/^http/, 'ws').replace(/\/api$/, '') + '/ws/chat/';
    localStorage.setItem('fc_custom_ws_url', wsUrl);
    setShowServerModal(false);
    window.location.reload();
  };

  const resetServerUrl = () => {
    localStorage.removeItem('fc_custom_api_url');
    localStorage.removeItem('fc_custom_ws_url');
    setServerUrl('https://draft-vermont-totals-distinction.trycloudflare.com/api');
    setShowServerModal(false);
    window.location.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const tokens = await login(username.trim(), password);
      await loginSuccess(tokens.access, tokens.refresh);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        (err.response?.status === 401
          ? 'Invalid username or password. Please verify credentials or use quick-fill below.'
          : err.response?.status === 400
          ? 'Invalid request. Please check username and password.'
          : 'Unable to connect to server. Ensure Django backend is running at http://127.0.0.1:8000.');
      setError(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError(null);
  };

  return (
    <div style={styles.container}>
      {/* Background ambient lighting */}
      <div style={styles.bgGlowTop}></div>
      <div style={styles.bgGlowBottom}></div>

      <div className="fc-login-card" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h1 style={styles.title}>FortiConnect</h1>
          <p style={styles.subtitle}>Company-Hosted Global Communication Platform</p>
        </div>

        {error && (
          <div style={styles.errorAlert}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Username or Employee Identifier</label>
            <div style={styles.inputWrapper}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={styles.inputIcon}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="emp001 or EMP001"
                required
                style={styles.input}
                autoFocus
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <div style={styles.labelRow}>
              <label style={styles.label}>Password</label>
              <span style={styles.forgotHint}>Protected by Corporate Directory</span>
            </div>
            <div style={styles.inputWrapper}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={styles.inputIcon}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={{ ...styles.input, paddingRight: '2.75rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  // Eye slash icon (hide)
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  // Eye icon (show)
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={isSubmitting ? { ...styles.button, opacity: 0.75 } : styles.button}
          >
            {isSubmitting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <span style={styles.btnSpinner}></span> Authenticating...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Development Quick-Fill helper */}
        <div style={styles.quickAccessSection}>
          <div style={styles.quickHeader}>
            <span>Development Accounts (Click to auto-fill)</span>
          </div>
          <div style={styles.pillGroup}>
            <button
              type="button"
              onClick={() => handleQuickLogin('emp001', 'emp001Pass123!')}
              style={styles.pillButton}
            >
              <strong>Alice Chen</strong> (emp001)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('emp002', 'emp002Pass123!')}
              style={styles.pillButton}
            >
              <strong>Bob Martinez</strong> (emp002)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('emp003', 'emp003Pass123!')}
              style={styles.pillButton}
            >
              <strong>Carol Williams</strong> (emp003)
            </button>
          </div>
          <p style={styles.quickHelp}>
            Pattern: <code>emp001</code> / <code>emp001Pass123!</code>
          </p>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', borderTop: '1px solid #1f2937', paddingTop: '1rem' }}>
            <button
              type="button"
              onClick={() => setShowServerModal(true)}
              style={styles.serverSettingsBtn}
            >
              <span>⚙️ Server Connection Endpoint</span>
            </button>
          </div>
        </div>
      </div>

      {/* Server Configuration Modal */}
      {showServerModal && (
        <div style={styles.serverModalOverlay}>
          <div style={styles.serverModalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem', fontWeight: 700 }}>
                ⚙️ Backend Server Connection
              </h3>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                style={styles.closeBtn}
              >
                ✕
              </button>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1rem' }}>
              Configure where FortiConnect points to for the Django backend API and WebSockets.
            </p>

            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Backend API Base URL:
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setTestStatus('idle');
              }}
              placeholder="https://your-backend.onrender.com/api"
              style={styles.input}
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => testConnection(serverUrl)}
                style={styles.testBtn}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              {testStatus === 'success' && (
                <span style={{ color: '#4ade80', fontSize: '0.85rem', fontWeight: 600 }}>
                  🟢 Server Online (200 OK)
                </span>
              )}
              {testStatus === 'failed' && (
                <span style={{ color: '#f87171', fontSize: '0.85rem', fontWeight: 600 }}>
                  🔴 Server Unreachable
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.75rem', borderTop: '1px solid #1f2937', paddingTop: '1rem' }}>
              <button
                type="button"
                onClick={resetServerUrl}
                style={styles.resetBtn}
              >
                Reset to Default
              </button>
              <button
                type="button"
                onClick={saveServerUrl}
                style={styles.saveBtn}
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0f1d',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
    overflowY: 'auto',
    padding: '2rem 1rem',
    boxSizing: 'border-box',
  },
  bgGlowTop: {
    position: 'fixed',
    top: '-15%',
    left: '20%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(14, 165, 233, 0.12) 0%, rgba(14, 165, 233, 0) 70%)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  bgGlowBottom: {
    position: 'fixed',
    bottom: '-20%',
    right: '15%',
    width: '650px',
    height: '650px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, rgba(99, 102, 241, 0) 70%)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  card: {
    position: 'relative',
    zIndex: 10,
    backgroundColor: '#111827',
    borderRadius: '16px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    width: '100%',
    maxWidth: '460px',
    padding: '2.5rem',
    margin: 'auto',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: '2rem',
  },
  logoBadge: {
    width: '52px',
    height: '52px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1rem',
    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
  },
  title: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    color: '#f8fafc',
  },
  subtitle: {
    margin: '0.5rem 0 0',
    fontSize: '0.875rem',
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.35rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: '#cbd5e1',
    letterSpacing: '0.01em',
  },
  forgotHint: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '14px',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '0.8rem 1rem 0.8rem 2.6rem',
    borderRadius: '10px',
    border: '1px solid #374151',
    backgroundColor: '#1f2937',
    color: '#f9fafb',
    fontSize: '0.925rem',
    outline: 'none',
    transition: 'border-color 0.15s ease-in-out',
  },
  eyeButton: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: '4px',
    transition: 'color 0.15s ease',
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.85rem 1rem',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#ffffff',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
    transition: 'transform 0.1s ease, background 0.15s ease',
  },
  btnSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTop: '2px solid #ffffff',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.8s linear infinite',
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.875rem 1rem',
    borderRadius: '10px',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#fca5a5',
    fontSize: '0.875rem',
    lineHeight: 1.4,
    marginBottom: '1.25rem',
  },
  quickAccessSection: {
    marginTop: '1.75rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #1f2937',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  quickHeader: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: 'center',
  },
  pillGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    justifyContent: 'center',
  },
  pillButton: {
    padding: '0.4rem 0.75rem',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '6px',
    color: '#38bdf8',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  quickHelp: {
    margin: 0,
    fontSize: '0.72rem',
    color: '#64748b',
    textAlign: 'center',
  },
  serverSettingsBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '0.75rem',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '4px 8px',
  },
  serverModalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(5, 10, 20, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1rem',
  },
  serverModalBox: {
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '14px',
    padding: '1.75rem',
    width: '100%',
    maxWidth: '520px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
  },
  testBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#1f2937',
    border: '1px solid #4b5563',
    borderRadius: '8px',
    color: '#f8fafc',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  resetBtn: {
    padding: '0.55rem 1rem',
    backgroundColor: 'transparent',
    border: '1px solid #475569',
    borderRadius: '8px',
    color: '#94a3b8',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '0.55rem 1.25rem',
    backgroundColor: '#0284c7',
    border: 'none',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: '4px',
  },
};
