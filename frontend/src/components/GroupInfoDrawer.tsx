import React, { useState, useEffect } from 'react';
import type { Conversation, EmployeeListItem, Membership } from '../types';
import {
  addMember,
  archiveConversation,
  getEmployees,
  leaveConversation,
  removeMember,
  transferOwnership,
  updateConversation,
  updateMemberRole,
} from '../api';
import { useAuthStore } from '../store';

interface GroupInfoDrawerProps {
  conversation: Conversation;
  onClose: () => void;
  onConversationUpdated: (updated: Conversation) => void;
  onConversationLeft: () => void;
}

export const GroupInfoDrawer: React.FC<GroupInfoDrawerProps> = ({
  conversation,
  onClose,
  onConversationUpdated,
  onConversationLeft,
}) => {
  const currentUser = useAuthStore((state) => state.user);
  const myMembership = conversation.memberships?.find((m) => m.employee.id === currentUser?.id);
  const isOwner = myMembership?.role === 'owner';
  const isAdmin = isOwner || myMembership?.role === 'admin';

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(conversation.name);
  const [editDesc, setEditDesc] = useState(conversation.description || '');

  // Add Member State
  const [showAddMember, setShowAddMember] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryEmployees, setDirectoryEmployees] = useState<EmployeeListItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transfer Ownership State
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);

  useEffect(() => {
    if (!showAddMember) return;
    let active = true;
    const fetchEmps = async () => {
      try {
        const data = await getEmployees(directorySearch, true);
        const list = Array.isArray(data) ? data : (data as any)?.results || [];
        if (active) {
          // Filter out existing members
          const existingIds = new Set(conversation.memberships?.map((m) => m.employee.id));
          setDirectoryEmployees(list.filter((e) => !existingIds.has(e.id)));
        }
      } catch {
        // ignore
      }
    };
    const delay = setTimeout(fetchEmps, 200);
    return () => {
      active = false;
      clearTimeout(delay);
    };
  }, [showAddMember, directorySearch, conversation.memberships]);

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSubmitting(true);
    try {
      const updated = await updateConversation(conversation.id, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
      onConversationUpdated(updated);
      setIsEditing(false);
    } catch {
      alert('Failed to update group details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMember = async (empId: number) => {
    try {
      await addMember(conversation.id, empId);
      setShowAddMember(false);
      onConversationUpdated({ ...conversation });
    } catch {
      alert('Failed to add member.');
    }
  };

  const handleRemoveMember = async (membershipId: number, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this channel?`)) return;
    try {
      await removeMember(conversation.id, membershipId);
      onConversationUpdated({ ...conversation });
    } catch {
      alert('Failed to remove member.');
    }
  };

  const handleToggleAdminRole = async (membership: Membership) => {
    const newRole = membership.role === 'admin' ? 'member' : 'admin';
    try {
      await updateMemberRole(conversation.id, membership.id, newRole);
      onConversationUpdated({ ...conversation });
    } catch {
      alert('Failed to update member role.');
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTargetId) return;
    if (!confirm('Transfer ownership? You will become a Group Admin.')) return;
    try {
      const updated = await transferOwnership(conversation.id, transferTargetId);
      onConversationUpdated(updated);
      setShowTransfer(false);
    } catch {
      alert('Failed to transfer ownership.');
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group channel?')) return;
    try {
      await leaveConversation(conversation.id);
      onConversationLeft();
    } catch {
      alert('Failed to leave group.');
    }
  };

  const handleToggleArchive = async () => {
    try {
      const res = await archiveConversation(conversation.id);
      onConversationUpdated({ ...conversation, is_archived: res.is_archived });
    } catch {
      alert('Failed to toggle archive status.');
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div style={styles.header}>
          <h3 style={styles.headerTitle}>Channel Details</h3>
          <button onClick={onClose} style={styles.closeBtn} title="Close drawer">
            ✕
          </button>
        </div>

        <div style={styles.content}>
          {/* Channel Identity */}
          <div style={styles.identitySection}>
            <div style={styles.avatarBox}>
              {conversation.avatar || conversation.name.charAt(0).toUpperCase()}
            </div>
            {!isEditing ? (
              <div style={{ textAlign: 'center', marginTop: '0.75rem', width: '100%' }}>
                <h4 style={styles.channelName}>{conversation.name}</h4>
                <p style={styles.channelDesc}>
                  {conversation.description || 'No description provided for this channel.'}
                </p>
                {isAdmin && (
                  <button onClick={() => setIsEditing(true)} style={styles.editBtn}>
                    ✏️ Edit Details
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleSaveDetails} style={styles.editForm}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={styles.input}
                  required
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Channel description..."
                  style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <button type="button" onClick={() => setIsEditing(false)} style={styles.cancelBtn}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} style={styles.saveBtn}>
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Metadata Cards */}
          <div style={styles.metaGrid}>
            <div style={styles.metaCard}>
              <span style={styles.metaLabel}>Participants</span>
              <span style={styles.metaValue}>{conversation.memberships?.length || 0}</span>
            </div>
            <div style={styles.metaCard}>
              <span style={styles.metaLabel}>Status</span>
              <span style={conversation.is_archived ? styles.metaArchived : styles.metaActive}>
                {conversation.is_archived ? 'Archived' : 'Active'}
              </span>
            </div>
          </div>

          {/* Members Roster */}
          <div style={styles.rosterSection}>
            <div style={styles.rosterHeader}>
              <span style={styles.sectionTitle}>
                Members ({conversation.memberships?.length || 0})
              </span>
              {isAdmin && (
                <button
                  onClick={() => setShowAddMember(!showAddMember)}
                  style={styles.addMemberBtn}
                >
                  + Add Member
                </button>
              )}
            </div>

            {/* Add Member Pop-down */}
            {showAddMember && (
              <div style={styles.addMemberBox}>
                <input
                  type="text"
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder="Search colleagues to add..."
                  style={styles.addMemberInput}
                  autoFocus
                />
                <div style={styles.addMemberList}>
                  {directoryEmployees.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: '#64748b', padding: '0.5rem' }}>
                      No available colleagues found.
                    </div>
                  ) : (
                    directoryEmployees.map((emp) => (
                      <div key={emp.id} style={styles.addMemberRow}>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                            {emp.display_name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {emp.department}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddMember(emp.id)}
                          style={styles.confirmAddBtn}
                        >
                          Add
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Member List */}
            <div style={styles.membersList}>
              {conversation.memberships?.map((membership) => {
                const isMe = membership.employee.id === currentUser?.id;
                const isMemberOwner = membership.role === 'owner';
                const isMemberAdmin = membership.role === 'admin';

                return (
                  <div key={membership.id} style={styles.memberRow}>
                    <div style={styles.memberAvatar}>
                      {membership.employee.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.memberNameRow}>
                        <span style={styles.memberName}>
                          {membership.employee.display_name} {isMe && '(You)'}
                        </span>
                        {isMemberOwner && <span style={styles.ownerBadge}>👑 Owner</span>}
                        {isMemberAdmin && <span style={styles.adminBadge}>🛡️ Admin</span>}
                      </div>
                      <span style={styles.memberDept}>
                        {membership.employee.department} • Joined{' '}
                        {new Date(membership.joined_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Admin Actions */}
                    {isAdmin && !isMe && !isMemberOwner && (
                      <div style={styles.memberActionBtns}>
                        {isOwner && (
                          <button
                            onClick={() => handleToggleAdminRole(membership)}
                            style={styles.roleToggleBtn}
                            title={isMemberAdmin ? 'Demote to Member' : 'Promote to Admin'}
                          >
                            {isMemberAdmin ? 'Demote' : 'Promote'}
                          </button>
                        )}
                        <button
                          onClick={() =>
                            handleRemoveMember(membership.id, membership.employee.display_name)
                          }
                          style={styles.removeBtn}
                          title="Remove from channel"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Channel Actions */}
          <div style={styles.dangerZone}>
            {isOwner && (
              <button
                onClick={() => setShowTransfer(!showTransfer)}
                style={styles.actionOutlineBtn}
              >
                🔄 Transfer Group Ownership
              </button>
            )}

            {showTransfer && (
              <div style={styles.transferBox}>
                <label style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                  Select New Owner:
                </label>
                <select
                  style={styles.select}
                  value={transferTargetId || ''}
                  onChange={(e) => setTransferTargetId(Number(e.target.value))}
                >
                  <option value="">-- Choose member --</option>
                  {conversation.memberships
                    ?.filter((m) => m.employee.id !== currentUser?.id)
                    .map((m) => (
                      <option key={m.employee.id} value={m.employee.id}>
                        {m.employee.display_name} ({m.role})
                      </option>
                    ))}
                </select>
                <button onClick={handleTransferOwnership} style={styles.saveBtn}>
                  Confirm Transfer
                </button>
              </div>
            )}

            {isAdmin && (
              <button onClick={handleToggleArchive} style={styles.actionOutlineBtn}>
                {conversation.is_archived ? '📂 Unarchive Channel' : '📦 Archive Channel'}
              </button>
            )}

            <button onClick={handleLeaveGroup} style={styles.leaveBtn}>
              🚪 Leave Channel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(5, 10, 20, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    justifyContent: 'flex-end',
    zIndex: 1040,
  },
  drawer: {
    width: '100%',
    maxWidth: '420px',
    height: '100%',
    backgroundColor: '#111827',
    borderLeft: '1px solid #1f2937',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-10px 0 25px rgba(0, 0, 0, 0.5)',
  },
  header: {
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161f30',
  },
  headerTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '4px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  identitySection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  avatarBox: {
    width: '68px',
    height: '68px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    color: '#ffffff',
    fontSize: '2rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
  },
  channelName: {
    margin: '0.5rem 0 0.2rem',
    fontSize: '1.2rem',
    fontWeight: '700',
    color: '#f8fafc',
  },
  channelDesc: {
    margin: 0,
    fontSize: '0.8125rem',
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  editBtn: {
    marginTop: '0.65rem',
    background: 'none',
    border: '1px solid #334155',
    color: '#38bdf8',
    padding: '0.3rem 0.65rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  editForm: {
    marginTop: '0.75rem',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  input: {
    width: '100%',
    padding: '0.55rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#0b0f19',
    color: '#f8fafc',
    fontSize: '0.84rem',
    outline: 'none',
  },
  cancelBtn: {
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #475569',
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '0.4rem 0.85rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
  },
  metaCard: {
    backgroundColor: '#161f30',
    border: '1px solid #1f2937',
    borderRadius: '8px',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: '0.7rem',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#f8fafc',
    marginTop: '0.2rem',
  },
  metaActive: {
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: '#34d399',
    marginTop: '0.2rem',
  },
  metaArchived: {
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: '#f87171',
    marginTop: '0.2rem',
  },
  rosterSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  rosterHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  addMemberBtn: {
    background: 'none',
    border: 'none',
    color: '#38bdf8',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  addMemberBox: {
    backgroundColor: '#0b0f19',
    border: '1px solid #1f2937',
    borderRadius: '8px',
    padding: '0.65rem',
  },
  addMemberInput: {
    width: '100%',
    padding: '0.45rem 0.65rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#111827',
    color: '#f8fafc',
    fontSize: '0.78rem',
    outline: 'none',
    marginBottom: '0.45rem',
  },
  addMemberList: {
    maxHeight: '120px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  addMemberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.35rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: '#161f30',
  },
  confirmAddBtn: {
    padding: '0.25rem 0.5rem',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  membersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  memberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    padding: '0.55rem 0.65rem',
    backgroundColor: '#161f30',
    borderRadius: '8px',
    border: '1px solid #1f2937',
  },
  memberAvatar: {
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
  },
  memberNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  memberName: {
    fontSize: '0.84rem',
    fontWeight: 600,
    color: '#f8fafc',
  },
  ownerBadge: {
    fontSize: '0.625rem',
    fontWeight: 700,
    color: '#fbbf24',
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    padding: '0.1rem 0.35rem',
    borderRadius: '4px',
  },
  adminBadge: {
    fontSize: '0.625rem',
    fontWeight: 700,
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    padding: '0.1rem 0.35rem',
    borderRadius: '4px',
  },
  memberDept: {
    display: 'block',
    fontSize: '0.7rem',
    color: '#94a3b8',
    marginTop: '0.1rem',
  },
  memberActionBtns: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
  },
  roleToggleBtn: {
    padding: '0.2rem 0.4rem',
    backgroundColor: '#1e293b',
    border: '1px solid #475569',
    color: '#cbd5e1',
    borderRadius: '4px',
    fontSize: '0.6875rem',
    cursor: 'pointer',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#f87171',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    padding: '2px 4px',
  },
  dangerZone: {
    marginTop: 'auto',
    borderTop: '1px solid #1f2937',
    paddingTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem',
  },
  actionOutlineBtn: {
    padding: '0.55rem',
    borderRadius: '8px',
    border: '1px solid #374151',
    backgroundColor: '#161f30',
    color: '#cbd5e1',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
  transferBox: {
    backgroundColor: '#0b0f19',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  select: {
    padding: '0.45rem',
    borderRadius: '6px',
    border: '1px solid #475569',
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    fontSize: '0.8rem',
  },
  leaveBtn: {
    padding: '0.55rem',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#fca5a5',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
};
