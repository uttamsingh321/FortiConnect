import React, { useEffect, useState } from 'react';
import type { EmployeeListItem } from '../types';
import { getEmployees, createDirectConversation } from '../api';
import { useChatStore, useAuthStore } from '../store';

export const DirectoryPage: React.FC<{ onSelectChat: () => void }> = ({ onSelectChat }) => {
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [search, setSearch] = useState('');
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
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search]);

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
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Employee Directory</h2>
          <p style={styles.subtitle}>Find and connect with colleagues across FortiConnect</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, ID, or department..."
          style={styles.searchInput}
        />
      </div>

      {error && <div style={styles.errorAlert}>{error}</div>}

      {loading ? (
        <div style={styles.centerMessage}>Loading directory...</div>
      ) : employees.length === 0 ? (
        <div style={styles.centerMessage}>No employees found matching "{search}".</div>
      ) : (
        <div style={styles.grid}>
          {employees.map((emp) => (
            <div key={emp.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.avatar}>
                  {emp.display_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={styles.empName}>{emp.display_name}</h3>
                  <span style={styles.empId}>{emp.employee_id}</span>
                </div>
              </div>

              <div style={styles.cardBody}>
                <div style={styles.field}>
                  <span style={styles.fieldLabel}>Department</span>
                  <span style={styles.fieldVal}>{emp.department || 'General'}</span>
                </div>
                <div style={styles.field}>
                  <span style={styles.fieldLabel}>Title</span>
                  <span style={styles.fieldVal}>{emp.title || 'Team Member'}</span>
                </div>
                <div style={styles.field}>
                  <span style={styles.fieldLabel}>Status</span>
                  <span style={emp.is_active ? styles.statusActive : styles.statusInactive}>
                    {emp.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {emp.id === currentUser?.id ? (
                <button
                  disabled
                  style={{ ...styles.chatButton, backgroundColor: '#334155', color: '#94a3b8', cursor: 'default' }}
                >
                  You (Current Account)
                </button>
              ) : (
                <button
                  disabled={!emp.is_active}
                  onClick={() => handleStartChat(emp.id)}
                  style={emp.is_active ? styles.chatButton : { ...styles.chatButton, opacity: 0.5, cursor: 'not-allowed' }}
                >
                  Send Message
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '2rem',
    height: '100%',
    overflowY: 'auto',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    margin: '0.25rem 0 0',
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  searchInput: {
    padding: '0.625rem 1rem',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    width: '320px',
    fontSize: '0.875rem',
    outline: 'none',
  },
  centerMessage: {
    textAlign: 'center',
    padding: '4rem',
    color: '#64748b',
    fontSize: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1.25rem',
  },
  card: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#0369a1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '1.125rem',
  },
  empName: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: '600',
    color: '#f8fafc',
  },
  empId: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  field: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8125rem',
  },
  fieldLabel: {
    color: '#64748b',
  },
  fieldVal: {
    color: '#cbd5e1',
    fontWeight: '500',
  },
  statusActive: {
    color: '#4ade80',
    fontWeight: '600',
  },
  statusInactive: {
    color: '#f87171',
    fontWeight: '600',
  },
  chatButton: {
    marginTop: 'auto',
    padding: '0.5rem 0.75rem',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  },
  errorAlert: {
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#fca5a5',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
};

