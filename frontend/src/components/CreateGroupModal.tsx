import React, { useEffect, useState } from 'react';
import type { EmployeeListItem } from '../types';
import { getEmployees, createGroupConversation } from '../api';
import { useAuthStore } from '../store';

interface CreateGroupModalProps {
  onClose: () => void;
  onGroupCreated: (newConversation: any) => void;
}

const PRESET_AVATARS = ['💻', '🛡️', '🚀', '📢', '💼', '🎯', '⚡', '🌐'];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose, onGroupCreated }) => {
  const currentUser = useAuthStore((state) => state.user);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<EmployeeListItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchList = async () => {
      setLoadingEmployees(true);
      try {
        const data = await getEmployees(search, true);
        const list = Array.isArray(data) ? data : (data as any)?.results || [];
        if (active) {
          // Exclude current user from pick list
          setEmployees(list.filter((e) => e.id !== currentUser?.id));
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoadingEmployees(false);
      }
    };

    const delay = setTimeout(fetchList, 250);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [search, currentUser?.id]);

  const handleToggleMember = (emp: EmployeeListItem) => {
    if (selectedMembers.some((m) => m.id === emp.id)) {
      setSelectedMembers((prev) => prev.filter((m) => m.id !== emp.id));
    } else {
      setSelectedMembers((prev) => [...prev, emp]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a channel name.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const memberIds = selectedMembers.map((m) => m.id);
      const newConv = await createGroupConversation(
        name.trim(),
        description.trim(),
        memberIds,
        selectedAvatar
      );
      onGroupCreated(newConv);
      onClose();
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        (err.response?.data?.name ? `Name: ${err.response.data.name.join(', ')}` : null) ||
        'Failed to create group. Please check fields.';
      setError(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>Create Group Channel</h3>
            <p style={styles.subtitle}>Collaborate securely with multiple team members</p>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="Close">
            ✕
          </button>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Channel Avatar Selector */}
          <div>
            <label style={styles.label}>Channel Avatar Icon</label>
            <div style={styles.avatarRow}>
              {PRESET_AVATARS.map((avatar) => (
                <button
                  type="button"
                  key={avatar}
                  onClick={() => setSelectedAvatar(avatar)}
                  style={
                    selectedAvatar === avatar
                      ? { ...styles.avatarOption, ...styles.avatarOptionSelected }
                      : styles.avatarOption
                  }
                >
                  {avatar}
                </button>
              ))}
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label style={styles.label}>
              Channel Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Core Engineering, Incident Response"
              style={styles.input}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label style={styles.label}>Description (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purpose of this channel..."
              style={styles.input}
            />
          </div>

          {/* Selected Members Pills */}
          <div>
            <label style={styles.label}>
              Initial Participants ({selectedMembers.length} selected)
            </label>
            {selectedMembers.length > 0 ? (
              <div style={styles.pillContainer}>
                {selectedMembers.map((member) => (
                  <span key={member.id} style={styles.memberPill}>
                    {member.display_name}
                    <button
                      type="button"
                      onClick={() => handleToggleMember(member)}
                      style={styles.removePillBtn}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
                You can create a group now and invite team members at any time.
              </p>
            )}
          </div>

          {/* Search Colleague Directory */}
          <div style={styles.searchSection}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search colleagues by name, ID, or department..."
              style={styles.directorySearch}
            />

            <div style={styles.employeeList}>
              {loadingEmployees ? (
                <div style={styles.emptyListNotice}>Searching directory...</div>
              ) : employees.length === 0 ? (
                <div style={styles.emptyListNotice}>No colleagues found.</div>
              ) : (
                employees.map((emp) => {
                  const isSelected = selectedMembers.some((m) => m.id === emp.id);
                  return (
                    <div
                      key={emp.id}
                      onClick={() => handleToggleMember(emp)}
                      style={isSelected ? { ...styles.empRow, ...styles.empRowSelected } : styles.empRow}
                    >
                      <div style={styles.empAvatar}>{emp.display_name.charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#f8fafc' }}>
                          {emp.display_name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          {emp.department} • {emp.employee_id}
                        </div>
                      </div>
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: isSelected ? 'none' : '1px solid #475569',
                          backgroundColor: isSelected ? '#0284c7' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '0.75rem',
                        }}
                      >
                        {isSelected ? '✓' : ''}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer Submit */}
          <div style={styles.footer}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              style={
                isSubmitting || !name.trim()
                  ? { ...styles.submitBtn, opacity: 0.5, cursor: 'not-allowed' }
                  : styles.submitBtn
              }
            >
              {isSubmitting ? 'Creating Channel...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(5, 10, 20, 0.8)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1050,
    padding: '1rem',
  },
  modal: {
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '520px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
  },
  header: {
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#161f30',
  },
  title: {
    margin: 0,
    fontSize: '1.15rem',
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    margin: '0.2rem 0 0',
    fontSize: '0.78rem',
    color: '#94a3b8',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '4px',
  },
  errorAlert: {
    margin: '1rem 1.5rem 0',
    padding: '0.65rem 0.85rem',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#fca5a5',
    fontSize: '0.8125rem',
  },
  form: {
    padding: '1.25rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    overflowY: 'auto',
  },
  label: {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: '0.35rem',
  },
  avatarRow: {
    display: 'flex',
    gap: '0.45rem',
    flexWrap: 'wrap',
  },
  avatarOption: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '0.4rem 0.65rem',
    fontSize: '1.25rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  avatarOptionSelected: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
    boxShadow: '0 0 10px rgba(56, 189, 248, 0.4)',
  },
  input: {
    width: '100%',
    padding: '0.65rem 0.85rem',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#0b0f19',
    color: '#f8fafc',
    fontSize: '0.84rem',
    outline: 'none',
  },
  pillContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
    marginTop: '0.25rem',
    maxHeight: '80px',
    overflowY: 'auto',
  },
  memberPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#38bdf8',
    padding: '0.2rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  removePillBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.65rem',
    padding: 0,
  },
  searchSection: {
    border: '1px solid #1f2937',
    borderRadius: '8px',
    padding: '0.65rem',
    backgroundColor: '#0b0f19',
  },
  directorySearch: {
    width: '100%',
    padding: '0.55rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#111827',
    color: '#f8fafc',
    fontSize: '0.8rem',
    outline: 'none',
    marginBottom: '0.5rem',
  },
  employeeList: {
    maxHeight: '140px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  empRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    padding: '0.45rem 0.65rem',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
  },
  empRowSelected: {
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
  },
  empAvatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '0.75rem',
  },
  emptyListNotice: {
    textAlign: 'center',
    padding: '1rem',
    color: '#64748b',
    fontSize: '0.78rem',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '0.5rem',
  },
  cancelBtn: {
    padding: '0.6rem 1rem',
    borderRadius: '8px',
    border: '1px solid #374151',
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '0.6rem 1.25rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
  },
};
