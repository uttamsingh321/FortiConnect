import React, { useState } from 'react';
import { useAuthStore } from '../store';
import { login } from '../api';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loginSuccess = useAuthStore((state) => state.loginSuccess);

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
          ? 'Invalid username or password. Please try again.'
          : err.response?.status === 400
          ? 'Invalid credentials format. Please check your username and password.'
          : 'Unable to reach backend server. Please verify backend is running on port 8000.');
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
      {/* Background ambient decorative shapes */}
      <div style={styles.bgGlowTop}></div>
      <div style={styles.bgGlowBottom}></div>

      <div style={styles.card}>
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
                placeholder="e.g. emp001"
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
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={styles.input}
              />
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
            Password pattern: <code>&lt;username&gt;Pass123!</code>
          </p>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0f1d',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
    overflow: 'hidden',
    padding: '1.5rem',
  },
  bgGlowTop: {
    position: 'absolute',
    top: '-15%',
    left: '20%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(14, 165, 233, 0.12) 0%, rgba(14, 165, 233, 0) 70%)',
    pointerEvents: 'none',
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: '-20%',
    right: '15%',
    width: '650px',
    height: '650px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, rgba(99, 102, 241, 0) 70%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    backgroundColor: '#111827',
    borderRadius: '16px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.07)',
    width: '100%',
    maxWidth: '460px',
    padding: '2.5rem',
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
    transition: 'all 0.15s ease-in-out',
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
    padding: '0.375rem 0.65rem',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '6px',
    color: '#38bdf8',
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  quickHelp: {
    margin: 0,
    fontSize: '0.72rem',
    color: '#64748b',
    textAlign: 'center',
  },
};
