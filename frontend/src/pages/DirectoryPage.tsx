import React, { useEffect, useState, useMemo } from 'react';
import type { EmployeeListItem } from '../types';
import { getEmployees, createDirectConversation } from '../api';
import { useChatStore, useAuthStore } from '../store';

export const DirectoryPage: React.FC<{ onSelectChat: () => void }> = ({ onSelectChat }) => {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useAuthStore((state) => state.user);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);

  const fetchEmployees = async (query?: string) => {
    setLoading(true);
    try {
      const data = await getEmployees(query);
      const list = Array.isArray(data) ? data : (data as any)?.results || [];
      setEmployees(list);
    } catch {
      setError('Failed to load employee directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchEmployees(search);
    }, 250);
    return () => clearTimeout(delayDebounce);
  }, [search]);

  // Extract unique departments for filter pills
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return ['All', ...Array.from(set)];
  }, [employees]);

  // Filtered list by department
  const filteredEmployees = useMemo(() => {
    if (selectedDept === 'All') return employees;
    return employees.filter((e) => e.department === selectedDept);
  }, [employees, selectedDept]);

  const handleStartChat = async (employeeId: number) => {
    try {
      const conv = await createDirectConversation(employeeId);
      setActiveConversationId(conv.id);
      onSelectChat();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Could not start conversation with this employee.';
      alert(msg);
    }
  };

  return (
    <div className="fc-directory-page">
      <div className="fc-directory-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h2 style={styles.title}>Corporate Directory</h2>
            <span style={styles.activePill}>
              {filteredEmployees.length} {filteredEmployees.length === 1 ? 'Colleague' : 'Colleagues'}
            </span>
          </div>
          <p style={styles.subtitle}>Secure company directory with direct messaging & WebRTC calling</p>
        </div>

        {/* Search input bar */}
        <div style={styles.searchWrapper}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.searchIcon}>
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, or department..."
            className="fc-directory-search-input"
            style={styles.searchInput}
          />
          {search && (
            <button onClick={() => setSearch('')} style={styles.clearSearchBtn} title="Clear search">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Department Filter Pills */}
      {departments.length > 2 && (
        <div style={styles.filterBar}>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Filter:</span>
          <div style={styles.filterPillsScroll}>
            {departments.map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                style={selectedDept === dept ? { ...styles.filterPill, ...styles.filterPillActive } : styles.filterPill}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div style={styles.errorAlert}>{error}</div>}

      {loading ? (
        <div style={styles.centerMessage}>
          <div style={styles.spinner}></div>
          <p style={{ marginTop: '0.75rem', color: '#94a3b8' }}>Loading directory data...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div style={styles.centerMessage}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
          <h4 style={{ color: '#f8fafc', fontSize: '1.1rem', marginBottom: '0.25rem' }}>No Colleagues Found</h4>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
            No directory matches for "{search}" {selectedDept !== 'All' ? `in ${selectedDept}` : ''}.
          </p>
        </div>
      ) : (
        <div className="fc-directory-grid">
          {filteredEmployees.map((emp) => {
            const isMe = emp.id === currentUser?.id;
            return (
              <div key={emp.id} className="fc-directory-card">
                <div style={styles.cardHeader}>
                  <div style={styles.avatarWrapper}>
                    <div style={styles.avatar}>
                      {emp.display_name.charAt(0).toUpperCase()}
                    </div>
                    {emp.is_active && <div style={styles.onlineDot} title="Active in company directory" />}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <h3 style={styles.empName}>{emp.display_name}</h3>
                      <span style={styles.empIdBadge}>{emp.employee_id}</span>
                    </div>
                    <span style={styles.empTitleText}>{emp.title || 'Staff Member'}</span>
                  </div>
                </div>

                <div style={styles.cardBody}>
                  <div style={styles.fieldRow}>
                    <span style={styles.fieldLabel}>Department</span>
                    <span style={styles.deptBadge}>{emp.department || 'General'}</span>
                  </div>
                  <div style={styles.fieldRow}>
                    <span style={styles.fieldLabel}>Account Status</span>
                    <span style={emp.is_active ? styles.statusActive : styles.statusInactive}>
                      {emp.is_active ? '● Active' : '○ Deactivated'}
                    </span>
                  </div>
                </div>

                {isMe ? (
                  <button
                    disabled
                    style={styles.meButton}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    You (Current Account)
                  </button>
                ) : (
                  <button
                    disabled={!emp.is_active}
                    onClick={() => handleStartChat(emp.id)}
                    style={emp.is_active ? styles.chatButton : { ...styles.chatButton, opacity: 0.5, cursor: 'not-allowed' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    Message
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  title: {
    margin: 0,
    fontSize: '1.35rem',
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.8125rem',
    color: '#94a3b8',
  },
  activePill: {
    fontSize: '0.6875rem',
    fontWeight: '700',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    padding: '0.15rem 0.5rem',
    borderRadius: '9999px',
    border: '1px solid rgba(56, 189, 248, 0.25)',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    pointerEvents: 'none',
  },
  searchInput: {
    padding: '0.625rem 2.25rem 0.625rem 2.5rem',
    borderRadius: '10px',
    border: '1px solid #334155',
    backgroundColor: '#111827',
    color: '#f8fafc',
    width: '320px',
    fontSize: '0.84rem',
    outline: 'none',
    transition: 'all 0.15s ease',
  },
  clearSearchBtn: {
    position: 'absolute',
    right: '10px',
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '0.75rem',
    padding: '4px',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.25rem',
    overflowX: 'auto',
    paddingBottom: '4px',
  },
  filterPillsScroll: {
    display: 'flex',
    gap: '0.4rem',
  },
  filterPill: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '9999px',
    padding: '0.3rem 0.75rem',
    color: '#94a3b8',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  filterPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
    color: '#ffffff',
    fontWeight: 600,
  },
  centerMessage: {
    textAlign: 'center',
    padding: '4rem 1.5rem',
    color: '#64748b',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid #1e293b',
    borderTop: '3px solid #38bdf8',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  avatar: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '1.125rem',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
  },
  onlineDot: {
    position: 'absolute',
    bottom: '-2px',
    right: '-2px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    border: '2px solid #111827',
  },
  empName: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: '700',
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empTitleText: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    display: 'block',
    marginTop: '0.1rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empIdBadge: {
    fontSize: '0.625rem',
    fontWeight: '700',
    color: '#cbd5e1',
    backgroundColor: '#1e293b',
    padding: '0.1rem 0.35rem',
    borderRadius: '4px',
    fontFamily: 'monospace',
    border: '1px solid #334155',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
    backgroundColor: '#0b0f19',
    padding: '0.65rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #1e293b',
  },
  fieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.78rem',
  },
  fieldLabel: {
    color: '#64748b',
    fontSize: '0.75rem',
  },
  deptBadge: {
    color: '#38bdf8',
    fontWeight: '600',
    fontSize: '0.75rem',
  },
  statusActive: {
    color: '#34d399',
    fontWeight: '600',
    fontSize: '0.72rem',
  },
  statusInactive: {
    color: '#f87171',
    fontWeight: '600',
    fontSize: '0.72rem',
  },
  chatButton: {
    marginTop: 'auto',
    padding: '0.55rem 0.75rem',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    transition: 'all 0.15s ease',
  },
  meButton: {
    marginTop: 'auto',
    padding: '0.55rem 0.75rem',
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '0.78rem',
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
  },
  errorAlert: {
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#fca5a5',
    borderRadius: '8px',
    marginBottom: '1rem',
    border: '1px solid rgba(239, 68, 68, 0.25)',
  },
};
