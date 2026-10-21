import React, { useEffect, useState, useRef } from 'react';
import type { Message } from '../types';
import { getConversations, getMessages, sendMessage, createGroupConversation } from '../api';
import { useChatStore, useAuthStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import { CallModal } from '../components/CallModal';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

export const ChatPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const { activeConversationId, setActiveConversationId, conversations, setConversations } = useChatStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setInputMessage((prev) => `${prev}[Attached: ${file.name}] `);
    }
  };

  // Call management state
  const [activeCall, setActiveCall] = useState<{
    callType: 'voice' | 'video';
    isIncoming: boolean;
    incomingOffer?: any;
    contactName: string;
  } | null>(null);

  // WebSocket message receiver
  const handleWsMessage = (data: any) => {
    if (data.type === 'message.new' && data.message) {
      if (data.message.conversation === activeConversationId) {
        setMessages((prev) => [...prev, data.message]);
      }
      loadConversations();
    } else if (data.type === 'call.offer') {
      setActiveCall({
        callType: data.call_type || 'video',
        isIncoming: true,
        incomingOffer: data.payload,
        contactName: data.sender_name || 'Incoming Call',
      });
    } else if (data.type === 'call.end') {
      setActiveCall(null);
    }
  };

  const { isConnected, subscribe, unsubscribe, sendSignal } = useWebSocket(handleWsMessage);

  const loadConversations = async () => {
    try {
      const data = await getConversations();
      const list = Array.isArray(data) ? data : (data as any)?.results || [];
      setConversations(list);
    } catch (e) {
      console.error('Failed to load conversations', e);
    }
  };

  const loadMessages = async (convId: number) => {
    setLoading(true);
    try {
      const data = await getMessages(convId);
      const list = Array.isArray(data) ? data : (data as any)?.results || [];
      setMessages(list);
    } catch (e) {
      console.error('Failed to load messages', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
      subscribe(activeConversationId);
    }
    return () => {
      if (activeConversationId) {
        unsubscribe(activeConversationId);
      }
    };
  }, [activeConversationId, subscribe, unsubscribe]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId) return;

    const content = inputMessage.trim();
    setInputMessage('');
    setShowEmojiPicker(false);
    try {
      const msg = await sendMessage(activeConversationId, content);
      // Optimistic append if not received via WS immediately
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      loadConversations();
    } catch (e) {
      alert('Failed to send message.');
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const newConv = await createGroupConversation(newGroupName.trim(), '', []);
      setNewGroupName('');
      setShowCreateGroup(false);
      await loadConversations();
      setActiveConversationId(newConv.id);
    } catch {
      alert('Failed to create group');
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="fc-chat-container">
      {/* Sidebar: Conversation List (hidden on mobile when a chat is open) */}
      <div className={`fc-chat-sidebar ${activeConversationId ? 'hidden-mobile' : ''}`}>
        <div style={styles.sidebarHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3 style={styles.sidebarTitle}>Conversations</h3>
            <span style={styles.countBadge}>{conversations.length}</span>
          </div>
          <button style={styles.addGroupBtn} onClick={() => setShowCreateGroup(!showCreateGroup)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Group
          </button>
        </div>

        {showCreateGroup && (
          <form onSubmit={handleCreateGroup} style={styles.newGroupForm}>
            <input
              type="text"
              placeholder="Enter new channel name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              style={styles.newGroupInput}
              autoFocus
            />
            <button type="submit" style={styles.newGroupSubmit}>
              Create
            </button>
          </form>
        )}

        <div style={styles.conversationList}>
          {conversations.length === 0 ? (
            <div style={styles.emptySidebar}>
              <div style={styles.emptySidebarIcon}>💬</div>
              <p style={{ fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem' }}>No Conversations Yet</p>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Visit the Employee Directory to start direct messaging your colleagues.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = conv.id === activeConversationId;
              const title =
                conv.type === 'group'
                  ? conv.name || 'Unnamed Group'
                  : conv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name || 'Direct Message';

              const initials = title
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  style={isSelected ? { ...styles.convItem, ...styles.convItemSelected } : styles.convItem}
                >
                  <div
                    style={
                      conv.type === 'group'
                        ? { ...styles.convAvatar, background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }
                        : styles.convAvatar
                    }
                  >
                    {initials}
                  </div>
                  <div style={styles.convDetails}>
                    <div style={styles.convTitleRow}>
                      <span style={styles.convTitle}>{title}</span>
                      {conv.type === 'group' && <span style={styles.groupPill}>Group</span>}
                    </div>
                    <span style={styles.lastMsgPreview}>
                      {conv.last_message ? conv.last_message.content : 'No messages yet'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Thread (hidden on mobile when no conversation is active) */}
      <div className={`fc-chat-thread ${!activeConversationId ? 'hidden-mobile' : ''}`}>
        {activeConv ? (
          <>
            <div style={styles.chatHeader}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                {/* Back Button on Mobile */}
                <button
                  onClick={() => setActiveConversationId(null)}
                  className="fc-chat-back-btn fc-hide-desktop"
                  title="Back to conversations"
                  aria-label="Back to conversations"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>

                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    backgroundColor: activeConv.type === 'group' ? '#059669' : '#0284c7',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    marginRight: '0.75rem',
                    flexShrink: 0,
                  }}
                >
                  {(
                    activeConv.type === 'group'
                      ? activeConv.name || 'G'
                      : activeConv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name || 'U'
                  )
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <h3 style={styles.chatHeaderTitle}>
                    {activeConv.type === 'group'
                      ? activeConv.name
                      : activeConv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name}
                  </h3>
                  <div style={styles.chatHeaderSub}>
                    <span>{activeConv.type === 'group' ? 'Channel' : 'Direct Message'}</span>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: isConnected ? '#4ade80' : '#f87171',
                          display: 'inline-block',
                        }}
                      />
                      {isConnected ? 'Real-Time' : 'Connecting...'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Voice & Video Call Action Buttons */}
              <div style={styles.callButtonsGroup}>
                <button
                  onClick={() =>
                    setActiveCall({
                      callType: 'voice',
                      isIncoming: false,
                      contactName:
                        activeConv.type === 'group'
                          ? activeConv.name
                          : activeConv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name || 'Contact',
                    })
                  }
                  style={styles.callActionButton}
                  title="Start Voice Call"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  <span>Voice</span>
                </button>

                <button
                  onClick={() =>
                    setActiveCall({
                      callType: 'video',
                      isIncoming: false,
                      contactName:
                        activeConv.type === 'group'
                          ? activeConv.name
                          : activeConv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name || 'Contact',
                    })
                  }
                  style={{ ...styles.callActionButton, backgroundColor: '#0284c7' }}
                  title="Start Video Call"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                  <span>Video</span>
                </button>
              </div>
            </div>

            <div style={styles.messagesContainer}>
              {loading ? (
                <div style={styles.centerMessage}>
                  <div style={styles.innerSpinner}></div>
                  <span>Fetching conversation history...</span>
                </div>
              ) : messages.length === 0 ? (
                <div style={styles.centerMessage}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                  <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '0.25rem' }}>Encrypted Workspace Channel</div>
                  <div style={{ fontSize: '0.8125rem' }}>Send a message to start communicating securely with this colleague.</div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.author?.id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      style={isMine ? { ...styles.msgWrapper, justifyContent: 'flex-end' } : styles.msgWrapper}
                    >
                      <div className="fc-msg-bubble" style={isMine ? { ...styles.msgBubble, ...styles.msgBubbleMine } : styles.msgBubble}>
                        {!isMine && <span style={styles.msgSender}>{msg.author?.display_name || 'Colleague'}</span>}
                        <div style={styles.msgText}>{msg.content}</div>
                        <span style={styles.msgTime}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Composer Area */}
            <div style={styles.composerWrapper}>
              {/* Overlay Backdrop to close Emoji picker when touching outside */}
              {showEmojiPicker && (
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                  onClick={() => setShowEmojiPicker(false)}
                />
              )}

              {/* Comprehensive Full Emoji Mart Picker Popup */}
              {showEmojiPicker && (
                <div className="fc-emoji-picker-container" style={styles.emojiPicker}>
                  <Picker
                    data={data}
                    onEmojiSelect={(emoji: any) => {
                      if (emoji.native) {
                        setInputMessage((prev) => prev + emoji.native);
                      }
                    }}
                    theme="dark"
                    previewPosition="none"
                    skinTonePosition="search"
                    autoFocus={true}
                  />
                </div>
              )}

              <form onSubmit={handleSend} style={styles.composerForm}>
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />

                {/* Attachment / Paperclip Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={styles.iconActionBtn}
                  title="Attach document or asset"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                  </svg>
                </button>

                {/* Emoji Picker Button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  style={showEmojiPicker ? { ...styles.iconActionBtn, color: '#38bdf8', backgroundColor: '#1e293b' } : styles.iconActionBtn}
                  title="Choose emoji"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                    <line x1="9" y1="9" x2="9.01" y2="9"></line>
                    <line x1="15" y1="9" x2="15.01" y2="9"></line>
                  </svg>
                </button>

                {/* Text Input */}
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type a secure message..."
                  style={styles.composerInput}
                />

                {/* Send Button */}
                <button type="submit" disabled={!inputMessage.trim()} style={!inputMessage.trim() ? { ...styles.composerSend, opacity: 0.5, cursor: 'not-allowed' } : styles.composerSend}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                  <span className="fc-hide-mobile" style={{ marginLeft: '4px' }}>Send</span>
                </button>
              </form>
            </div>

            {/* WebRTC Video / Voice Call Modal */}
            {activeCall && activeConversationId && (
              <CallModal
                conversationId={activeConversationId}
                contactName={activeCall.contactName}
                callType={activeCall.callType}
                isIncoming={activeCall.isIncoming}
                incomingOffer={activeCall.incomingOffer}
                sendSignal={sendSignal}
                onClose={() => setActiveCall(null)}
              />
            )}
          </>
        ) : (
          <div style={styles.noChatSelected}>
            <div style={styles.emptyIllustration}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem' }}>Select a Conversation</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', maxWidth: '380px', lineHeight: 1.5, margin: '0 auto' }}>
              Choose a discussion thread from the left, or visit the Employee Directory to start a new encrypted direct conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebarHeader: {
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  sidebarTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: '-0.2px',
  },
  countBadge: {
    fontSize: '0.6875rem',
    fontWeight: '700',
    color: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    padding: '0.1rem 0.45rem',
    borderRadius: '9999px',
  },
  addGroupBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.35rem 0.65rem',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  newGroupForm: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    gap: '0.5rem',
    backgroundColor: '#0d131f',
  },
  newGroupInput: {
    flex: 1,
    padding: '0.45rem 0.65rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    fontSize: '0.8125rem',
    outline: 'none',
  },
  newGroupSubmit: {
    padding: '0.45rem 0.75rem',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  conversationList: {
    flex: 1,
    overflowY: 'auto',
  },
  emptySidebar: {
    padding: '3rem 1.5rem',
    textAlign: 'center',
  },
  emptySidebarIcon: {
    fontSize: '2rem',
    marginBottom: '0.75rem',
  },
  convItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.875rem 1.25rem',
    cursor: 'pointer',
    borderBottom: '1px solid #1a2234',
    transition: 'all 0.15s ease',
  },
  convItemSelected: {
    backgroundColor: '#1e293b',
    borderLeft: '3px solid #38bdf8',
  },
  convAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '0.84rem',
    flexShrink: 0,
  },
  convDetails: {
    flex: 1,
    overflow: 'hidden',
  },
  convTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.2rem',
  },
  convTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  groupPill: {
    fontSize: '0.625rem',
    fontWeight: '700',
    color: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    padding: '0.1rem 0.35rem',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  lastMsgPreview: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#94a3b8',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  chatHeader: {
    padding: '0.75rem 1.25rem',
    borderBottom: '1px solid #1f2937',
    backgroundColor: '#111827',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
    gap: '0.5rem',
  },
  callButtonsGroup: {
    display: 'flex',
    gap: '0.4rem',
    flexShrink: 0,
  },
  callActionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.45rem 0.75rem',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#059669',
    color: '#ffffff',
    fontSize: '0.78rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  chatHeaderTitle: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: '700',
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chatHeaderSub: {
    fontSize: '0.72rem',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginTop: '0.1rem',
  },
  messagesContainer: {
    flex: 1,
    padding: '1.25rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    backgroundColor: '#0b0f19',
  },
  centerMessage: {
    margin: 'auto',
    textAlign: 'center',
    color: '#64748b',
    padding: '2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  innerSpinner: {
    width: '32px',
    height: '32px',
    border: '2px solid #1e293b',
    borderTop: '2px solid #38bdf8',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '0.75rem',
  },
  msgWrapper: {
    display: 'flex',
    width: '100%',
  },
  msgBubble: {
    maxWidth: '65%',
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '0.625rem 0.875rem',
    border: '1px solid #334155',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
  },
  msgBubbleMine: {
    backgroundColor: '#0284c7',
    borderColor: '#0369a1',
  },
  msgSender: {
    display: 'block',
    fontSize: '0.6875rem',
    color: '#38bdf8',
    fontWeight: '700',
    marginBottom: '0.2rem',
  },
  msgText: {
    fontSize: '0.875rem',
    lineHeight: '1.45',
    wordBreak: 'break-word',
    color: '#f8fafc',
  },
  msgTime: {
    display: 'block',
    fontSize: '0.625rem',
    color: '#cbd5e1',
    textAlign: 'right',
    marginTop: '0.3rem',
    opacity: 0.85,
  },
  composerWrapper: {
    position: 'relative',
    backgroundColor: '#111827',
    borderTop: '1px solid #1f2937',
    flexShrink: 0,
  },
  emojiPicker: {
    position: 'absolute',
    bottom: '100%',
    left: '1rem',
    marginBottom: '8px',
    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.8)',
    borderRadius: '16px',
    overflow: 'hidden',
    zIndex: 1000,
  },
  iconActionBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.45rem',
    borderRadius: '8px',
    transition: 'all 0.15s ease',
  },
  composerForm: {
    padding: '0.75rem 1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  composerInput: {
    flex: 1,
    padding: '0.65rem 0.875rem',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#0b0f19',
    color: '#f8fafc',
    fontSize: '0.875rem',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  },
  composerSend: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.65rem 1rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    flexShrink: 0,
  },
  noChatSelected: {
    margin: 'auto',
    textAlign: 'center',
    padding: '2rem',
  },
  emptyIllustration: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1.25rem',
    boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4)',
  },
};
