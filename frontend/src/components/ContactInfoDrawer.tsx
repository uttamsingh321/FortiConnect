import React, { useState, useEffect } from 'react';
import type { Employee, EmployeeListItem, Conversation, MessageAttachment } from '../types';
import { getEmployee, downloadAttachment } from '../api';

interface ContactInfoDrawerProps {
  employee: EmployeeListItem;
  conversation: Conversation;
  attachments?: MessageAttachment[];
  onClose: () => void;
  onStartCall: (callType: 'voice' | 'video') => void;
  onSearch: () => void;
}

export const ContactInfoDrawer: React.FC<ContactInfoDrawerProps> = ({
  employee,
  conversation: _conversation,
  attachments = [],
  onClose,
  onStartCall,
  onSearch,
}) => {
  const [fullEmployee, setFullEmployee] = useState<Employee | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [downloadingAttId, setDownloadingAttId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'media'>('info');

  useEffect(() => {
    let isMounted = true;
    getEmployee(employee.id)
      .then((data) => {
        if (isMounted) setFullEmployee(data);
      })
      .catch((err) => {
        console.warn('Failed to load full employee details', err);
      });

    return () => {
      isMounted = false;
    };
  }, [employee.id]);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownload = async (att: MessageAttachment) => {
    setDownloadingAttId(att.id);
    try {
      await downloadAttachment(att.id, att.original_name);
    } catch (err) {
      console.error('Failed to download attachment', err);
      alert('Unable to download attachment. Please ensure you are connected to the server.');
    } finally {
      setDownloadingAttId(null);
    }
  };

  const displayName = fullEmployee?.display_name || employee.display_name;
  const initial = displayName.charAt(0).toUpperCase();
  const department = fullEmployee?.department || employee.department;
  const title = fullEmployee?.title || employee.title || 'Team Member';
  const email = fullEmployee?.email;
  const phone = fullEmployee?.phone;
  const location = fullEmployee?.location;
  const bio = fullEmployee?.bio;
  const employeeId = fullEmployee?.employee_id || employee.employee_id;
  const isActive = fullEmployee?.is_active ?? employee.is_active;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button onClick={onClose} style={styles.backBtn} title="Close info">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <h3 style={styles.headerTitle}>Contact Info</h3>
          </div>

          <div style={styles.headerRightBadge}>
            <span style={styles.verifiedDot} />
            <span>Encrypted Direct Message</span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={styles.content}>
          {/* Identity Section (Large WhatsApp Avatar & Meta) */}
          <div style={styles.profileCard}>
            <div style={styles.avatarWrapper}>
              <div style={styles.avatarLarge}>
                {initial}
              </div>
              <span
                style={{
                  ...styles.statusIndicator,
                  backgroundColor: isActive ? '#10b981' : '#64748b',
                }}
                title={isActive ? 'Online / Active' : 'Offline'}
              />
            </div>

            <h2 style={styles.profileName}>{displayName}</h2>
            <div style={styles.profileRole}>{title}</div>
            <div style={styles.profileDepartment}>
              <span style={styles.deptBadge}>{department}</span>
              {employeeId && <span style={styles.idBadge}>{employeeId}</span>}
            </div>

            {/* Quick Action Buttons (WhatsApp Style 3-button bar) */}
            <div style={styles.quickActionsBar}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartCall('voice');
                }}
                style={styles.quickActionBtn}
                title="Start Voice Call"
              >
                <div style={styles.quickActionIconCircle}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                </div>
                <span style={styles.quickActionText}>Audio</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartCall('video');
                }}
                style={styles.quickActionBtn}
                title="Start Video Call"
              >
                <div style={{ ...styles.quickActionIconCircle, backgroundColor: '#0284c7' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                </div>
                <span style={styles.quickActionText}>Video</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSearch();
                }}
                style={styles.quickActionBtn}
                title="Search conversation"
              >
                <div style={styles.quickActionIconCircle}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <span style={styles.quickActionText}>Search</span>
              </button>
            </div>
          </div>

          {/* Tab Selector: Profile Info vs Shared Media */}
          <div style={styles.tabBar}>
            <button
              onClick={() => setActiveTab('info')}
              style={{
                ...styles.tabBtn,
                ...(activeTab === 'info' ? styles.tabBtnActive : {}),
              }}
            >
              Overview & Details
            </button>
            <button
              onClick={() => setActiveTab('media')}
              style={{
                ...styles.tabBtn,
                ...(activeTab === 'media' ? styles.tabBtnActive : {}),
              }}
            >
              Media & Files ({attachments.length})
            </button>
          </div>

          {activeTab === 'info' ? (
            <>
              {/* "About" / Bio Section */}
              <div style={styles.sectionCard}>
                <div style={styles.sectionHeading}>About & Status</div>
                <p style={styles.bioText}>
                  {bio || 'FortiConnect verified enterprise team member. Active in corporate communications.'}
                </p>
              </div>

              {/* Contact Information Cards */}
              <div style={styles.sectionCard}>
                <div style={styles.sectionHeading}>Corporate Details</div>

                {/* Email */}
                {email && (
                  <div style={styles.infoRow}>
                    <div style={styles.infoIconBox}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                      </svg>
                    </div>
                    <div style={styles.infoContent}>
                      <span style={styles.infoLabel}>Work Email</span>
                      <a href={`mailto:${email}`} style={styles.infoValueLink}>
                        {email}
                      </a>
                    </div>
                    <button
                      onClick={() => handleCopy(email, 'email')}
                      style={styles.copyBtn}
                      title="Copy email"
                    >
                      {copiedField === 'email' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                {/* Phone */}
                {phone && (
                  <div style={styles.infoRow}>
                    <div style={styles.infoIconBox}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                      </svg>
                    </div>
                    <div style={styles.infoContent}>
                      <span style={styles.infoLabel}>Direct Phone</span>
                      <a href={`tel:${phone}`} style={styles.infoValueLink}>
                        {phone}
                      </a>
                    </div>
                    <button
                      onClick={() => handleCopy(phone, 'phone')}
                      style={styles.copyBtn}
                      title="Copy phone"
                    >
                      {copiedField === 'phone' ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                {/* Location */}
                {location && (
                  <div style={styles.infoRow}>
                    <div style={styles.infoIconBox}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                    </div>
                    <div style={styles.infoContent}>
                      <span style={styles.infoLabel}>Office Location</span>
                      <span style={styles.infoValueText}>{location}</span>
                    </div>
                  </div>
                )}

                {/* Status */}
                <div style={styles.infoRow}>
                  <div style={styles.infoIconBox}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <polyline points="16 11 18 13 22 9"></polyline>
                    </svg>
                  </div>
                  <div style={styles.infoContent}>
                    <span style={styles.infoLabel}>Employment Status</span>
                    <span style={styles.infoValueText}>
                      {isActive ? 'Active Staff Member' : 'Inactive'}
                    </span>
                  </div>
                  <span style={styles.verifiedTag}>Verified</span>
                </div>
              </div>

              {/* Security & Encryption Notice */}
              <div style={styles.encryptionCard}>
                <div style={styles.encryptionIcon}>🔒</div>
                <div>
                  <div style={styles.encryptionTitle}>End-to-End Encrypted</div>
                  <div style={styles.encryptionSub}>
                    Direct messages and voice/video calls with {displayName} are secured with WebRTC SRTP/DTLS encryption.
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Media, Links & Docs Tab */
            <div style={styles.sectionCard}>
              <div style={styles.sectionHeading}>Shared Files & Documents ({attachments.length})</div>
              {attachments.length === 0 ? (
                <div style={styles.emptyMediaBox}>
                  <span style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>📁</span>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No documents or media shared yet</div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                    Files shared in this chat will appear here for easy access.
                  </div>
                </div>
              ) : (
                <div style={styles.mediaList}>
                  {attachments.map((att) => {
                    const isDownloading = downloadingAttId === att.id;
                    return (
                      <div key={att.id} style={styles.mediaItem}>
                        <div style={styles.mediaFileIcon}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={styles.mediaFileName}>{att.original_name}</div>
                          <div style={styles.mediaFileSize}>
                            {(att.file_size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownload(att)}
                          disabled={isDownloading}
                          style={styles.downloadMediaBtn}
                          title="Download file"
                        >
                          {isDownloading ? '⏳' : '⬇️'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(5, 10, 20, 0.72)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    justifyContent: 'flex-end',
    zIndex: 1040,
  },
  drawer: {
    width: '100%',
    maxWidth: '430px',
    height: '100%',
    backgroundColor: '#0d1322',
    borderLeft: '1px solid #1f2937',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.6)',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#f8fafc',
    animation: 'slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  headerTitle: {
    margin: 0,
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#f8fafc',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    transition: 'color 0.15s ease',
  },
  headerRightBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.7rem',
    color: '#38bdf8',
    fontWeight: 600,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    border: '1px solid rgba(56, 189, 248, 0.25)',
    padding: '0.2rem 0.5rem',
    borderRadius: '9999px',
  },
  verifiedDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#38bdf8',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.1rem',
  },
  profileCard: {
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '14px',
    padding: '1.5rem 1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: '0.85rem',
  },
  avatarLarge: {
    width: '84px',
    height: '84px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#ffffff',
    fontSize: '2.25rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 18px rgba(2, 132, 199, 0.35)',
    border: '3px solid #1e293b',
  },
  statusIndicator: {
    position: 'absolute',
    bottom: '2px',
    right: '4px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: '3px solid #111827',
  },
  profileName: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#f8fafc',
    margin: '0 0 0.2rem',
  },
  profileRole: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    marginBottom: '0.6rem',
  },
  profileDepartment: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginBottom: '1.2rem',
  },
  deptBadge: {
    fontSize: '0.72rem',
    fontWeight: 600,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    padding: '0.2rem 0.55rem',
    borderRadius: '6px',
    border: '1px solid rgba(56, 189, 248, 0.25)',
  },
  idBadge: {
    fontSize: '0.72rem',
    fontWeight: 600,
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    padding: '0.2rem 0.55rem',
    borderRadius: '6px',
    border: '1px solid #334155',
  },
  quickActionsBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1.5rem',
    width: '100%',
    paddingTop: '0.85rem',
    borderTop: '1px solid #1f2937',
  },
  quickActionBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.35rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#cbd5e1',
    transition: 'transform 0.15s ease',
  },
  quickActionIconCircle: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    border: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  quickActionText: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#94a3b8',
  },
  tabBar: {
    display: 'flex',
    backgroundColor: '#111827',
    padding: '3px',
    borderRadius: '8px',
    border: '1px solid #1f2937',
  },
  tabBtn: {
    flex: 1,
    padding: '0.45rem',
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '0.78rem',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  tabBtnActive: {
    backgroundColor: '#1e293b',
    color: '#ffffff',
    fontWeight: 600,
  },
  sectionCard: {
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '12px',
    padding: '1rem',
  },
  sectionHeading: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
  },
  bioText: {
    fontSize: '0.85rem',
    color: '#cbd5e1',
    lineHeight: '1.5',
    margin: 0,
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  infoIconBox: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    color: '#38bdf8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoContent: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    display: 'block',
    fontSize: '0.68rem',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  infoValueLink: {
    color: '#38bdf8',
    fontSize: '0.85rem',
    textDecoration: 'none',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  infoValueText: {
    color: '#f8fafc',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  copyBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    color: '#94a3b8',
    borderRadius: '4px',
    padding: '0.2rem 0.5rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  verifiedTag: {
    fontSize: '0.68rem',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    color: '#34d399',
    border: '1px solid rgba(52, 211, 153, 0.3)',
    borderRadius: '4px',
    padding: '0.15rem 0.45rem',
    fontWeight: 600,
  },
  encryptionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    border: '1px solid rgba(56, 189, 248, 0.15)',
    borderRadius: '10px',
    padding: '0.85rem',
  },
  encryptionIcon: {
    fontSize: '1.25rem',
  },
  encryptionTitle: {
    fontSize: '0.8125rem',
    fontWeight: 700,
    color: '#f8fafc',
    marginBottom: '0.15rem',
  },
  encryptionSub: {
    fontSize: '0.72rem',
    color: '#94a3b8',
    lineHeight: '1.4',
  },
  emptyMediaBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem 1rem',
    textAlign: 'center',
  },
  mediaList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  mediaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    padding: '0.5rem 0.65rem',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  mediaFileIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mediaFileName: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mediaFileSize: {
    fontSize: '0.7rem',
    color: '#94a3b8',
  },
  downloadMediaBtn: {
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
    cursor: 'pointer',
    padding: '4px',
  },
};
