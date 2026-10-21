import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { Message } from '../types';
import {
  getConversations,
  getMessages,
  sendMessage,
  toggleReaction,
  pinMessage,
  markConversationRead,
  deleteMessage,
} from '../api';
import { useChatStore, useAuthStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';
import { CallModal } from '../components/CallModal';
import { CreateGroupModal } from '../components/CreateGroupModal';
import { GroupInfoDrawer } from '../components/GroupInfoDrawer';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🚀', '👀'];

export const ChatPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const { activeConversationId, setActiveConversationId, conversations, setConversations } = useChatStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showGroupDrawer, setShowGroupDrawer] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  // In-chat search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  // Typing state
  const [typingUsers, setTypingUsers] = useState<Record<number, string>>({});
  const typingTimeoutRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Call management state
  const [activeCall, setActiveCall] = useState<{
    conversationId: number;
    callType: 'voice' | 'video';
    isIncoming: boolean;
    incomingOffer?: any;
    contactName: string;
  } | null>(null);

  const callSignalListenerRef = useRef<((signal: any) => void) | null>(null);
  const queuedCallSignalsRef = useRef<any[]>([]);

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // WebSocket message receiver
  const handleWsMessage = useCallback((data: any) => {
    if (data.type === 'message.new' && data.message) {
      if (data.message.conversation === activeConversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) {
            return prev.map((m) => (m.id === data.message.id ? data.message : m));
          }
          return [...prev, data.message];
        });
        // Clear unread
        if (activeConversationId) {
          markConversationRead(activeConversationId).catch(() => {});
        }
      }
      loadConversations();
    } else if (data.type === 'message.reaction') {
      if (data.conversation_id === activeConversationId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.message_id ? { ...m, reactions: data.reactions } : m))
        );
      }
    } else if (data.type === 'conversation.updated') {
      loadConversations();
    } else if (data.type === 'chat.typing') {
      if (data.conversation_id === activeConversationId && data.employee_id !== user?.id) {
        if (data.is_typing) {
          setTypingUsers((prev) => ({ ...prev, [data.employee_id]: data.display_name }));
        } else {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[data.employee_id];
            return next;
          });
        }
      }
    } else if (data.type === 'call.offer') {
      setActiveCall({
        conversationId: data.conversation_id,
        callType: data.call_type || 'video',
        isIncoming: true,
        incomingOffer: data.payload,
        contactName: data.sender_name || 'Incoming Call',
      });
      if (callSignalListenerRef.current) {
        callSignalListenerRef.current(data);
      } else {
        queuedCallSignalsRef.current.push(data);
      }
      // Show system desktop notification if available
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('📞 Incoming FortiConnect Call', {
            body: `${data.sender_name || 'A teammate'} is calling you (${data.call_type === 'video' ? 'Video' : 'Voice'}). Click to view.`,
          });
        } catch (_) {}
      }
    } else if (data.type === 'call.answer' || data.type === 'call.ice-candidate' || data.type === 'call.end') {
      if (callSignalListenerRef.current) {
        callSignalListenerRef.current(data);
      } else {
        queuedCallSignalsRef.current.push(data);
      }
      if (data.type === 'call.end') {
        setTimeout(() => {
          setActiveCall((curr) => (curr && curr.conversationId === data.conversation_id ? null : curr));
        }, 800);
      }
    }
  }, [activeConversationId, user?.id]);

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

  const loadMessages = async (convId: number, query?: string) => {
    setLoading(true);
    try {
      const data = await getMessages(convId, { q: query });
      const list = Array.isArray(data) ? data : (data as any)?.results || [];
      setMessages(list);
      markConversationRead(convId).catch(() => {});
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
      loadMessages(activeConversationId, searchKeyword);
      subscribe(activeConversationId);
      setReplyingTo(null);
      setAttachedFile(null);
      setTypingUsers({});
    }
    return () => {
      if (activeConversationId) {
        unsubscribe(activeConversationId);
      }
    };
  }, [activeConversationId, subscribe, unsubscribe]);

  useEffect(() => {
    if (!showSearch) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showSearch]);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const myMembership = activeConv?.memberships?.find((m) => m.employee.id === user?.id);
  const isAdminOrOwner = myMembership?.role === 'owner' || myMembership?.role === 'admin';

  // Typing event handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    if (!activeConversationId) return;

    sendSignal({
      type: 'typing.start',
      conversation_id: activeConversationId,
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      sendSignal({
        type: 'typing.stop',
        conversation_id: activeConversationId,
      });
    }, 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputMessage.trim() && !attachedFile) || !activeConversationId) return;

    const content = inputMessage.trim();
    const fileToSend = attachedFile;
    const replyId = replyingTo?.id;
    const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`;

    setInputMessage('');
    setAttachedFile(null);
    setReplyingTo(null);
    setShowEmojiPicker(false);

    // Stop typing indicator
    sendSignal({ type: 'typing.stop', conversation_id: activeConversationId });

    try {
      const msg = await sendMessage(activeConversationId, content, replyId, fileToSend || undefined, idempotencyKey);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      loadConversations();
    } catch (e) {
      alert('Failed to send message.');
    }
  };

  const handleReactionClick = async (messageId: number, emoji: string) => {
    try {
      const res = await toggleReaction(messageId, emoji);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m))
      );
    } catch {
      // ignore
    }
  };

  const handlePinToggle = async (messageId: number) => {
    if (!activeConversationId) return;
    try {
      const res = await pinMessage(activeConversationId, messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_pinned: res.is_pinned } : m))
      );
      loadConversations();
    } catch {
      alert('Only channel administrators can pin messages.');
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      await deleteMessage(messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, is_deleted: true, content: '[This message was deleted]' } : m
        )
      );
    } catch {
      alert('Failed to delete message.');
    }
  };

  const pinnedMessage = messages.find((m) => m.is_pinned && !m.is_deleted);
  const typingNames = Object.values(typingUsers);

  return (
    <div className="fc-chat-container">
      {/* Sidebar: Conversation List */}
      <div className={`fc-chat-sidebar ${activeConversationId ? 'hidden-mobile' : ''}`}>
        <div style={styles.sidebarHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3 style={styles.sidebarTitle}>Conversations</h3>
            <span style={styles.countBadge}>{conversations.length}</span>
          </div>
          <button style={styles.addGroupBtn} onClick={() => setShowCreateGroupModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Group
          </button>
        </div>

        <div style={styles.conversationList}>
          {conversations.length === 0 ? (
            <div style={styles.emptySidebar}>
              <div style={styles.emptySidebarIcon}>💬</div>
              <p style={{ fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem' }}>No Conversations</p>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Create a group or message an employee from Directory.</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = conv.id === activeConversationId;
              const title =
                conv.type === 'group'
                  ? conv.name || 'Unnamed Group'
                  : conv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name || 'Direct Message';

              const initials = conv.avatar || title.slice(0, 2).toUpperCase();

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
                  {conv.unread_count > 0 && (
                    <span style={styles.unreadBadge}>{conv.unread_count}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Thread */}
      <div className={`fc-chat-thread ${!activeConversationId ? 'hidden-mobile' : ''}`}>
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div style={styles.chatHeader}>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                {/* Mobile Back Button */}
                <button
                  onClick={() => setActiveConversationId(null)}
                  className="fc-chat-back-btn fc-hide-desktop"
                  title="Back to conversations"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>

                <div
                  onClick={() => activeConv.type === 'group' && setShowGroupDrawer(true)}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: activeConv.type === 'group' ? '10px' : '50%',
                    backgroundColor: activeConv.type === 'group' ? '#059669' : '#0284c7',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: activeConv.avatar ? '1.25rem' : '0.9rem',
                    marginRight: '0.75rem',
                    flexShrink: 0,
                    cursor: activeConv.type === 'group' ? 'pointer' : 'default',
                  }}
                  title={activeConv.type === 'group' ? 'Click for group details' : ''}
                >
                  {activeConv.avatar || (
                    activeConv.type === 'group'
                      ? activeConv.name || 'G'
                      : activeConv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name || 'U'
                  )
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <h3
                      onClick={() => activeConv.type === 'group' && setShowGroupDrawer(true)}
                      style={{
                        ...styles.chatHeaderTitle,
                        cursor: activeConv.type === 'group' ? 'pointer' : 'default',
                      }}
                    >
                      {activeConv.type === 'group'
                        ? activeConv.name
                        : activeConv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name}
                    </h3>
                    {activeConv.is_archived && <span style={styles.archivedTag}>Archived</span>}
                  </div>

                  <div style={styles.chatHeaderSub}>
                    {activeConv.type === 'group' ? (
                      <span
                        onClick={() => setShowGroupDrawer(true)}
                        style={{ cursor: 'pointer', color: '#38bdf8' }}
                      >
                        👥 {activeConv.memberships?.length || 0} Members
                      </span>
                    ) : (
                      <span>Direct Message</span>
                    )}
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
                      {isConnected ? 'Real-Time' : 'Reconnecting...'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons in Header */}
              <div style={styles.callButtonsGroup}>
                {/* Search Toggle */}
                <button
                  onClick={() => {
                    setShowSearch(!showSearch);
                    if (showSearch) {
                      setSearchKeyword('');
                      loadMessages(activeConv.id, '');
                    }
                  }}
                  style={showSearch ? { ...styles.headerToolBtn, color: '#38bdf8' } : styles.headerToolBtn}
                  title="Search messages in this channel"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </button>

                {/* Group Info Drawer Toggle */}
                {activeConv.type === 'group' && (
                  <button
                    onClick={() => setShowGroupDrawer(true)}
                    style={styles.headerToolBtn}
                    title="Channel Information & Members"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="16" x2="12" y2="12"></line>
                      <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                  </button>
                )}

                {/* Voice Call */}
                <button
                  onClick={() =>
                    setActiveCall({
                      conversationId: activeConv.id,
                      callType: 'voice',
                      isIncoming: false,
                      contactName: activeConv.name || 'Contact',
                    })
                  }
                  style={styles.callActionButton}
                  title="Start Voice Call"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  <span className="fc-hide-mobile">Voice</span>
                </button>

                {/* Video Call */}
                <button
                  onClick={() =>
                    setActiveCall({
                      conversationId: activeConv.id,
                      callType: 'video',
                      isIncoming: false,
                      contactName: activeConv.name || 'Contact',
                    })
                  }
                  style={{ ...styles.callActionButton, backgroundColor: '#0284c7' }}
                  title="Start Video Call"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                  <span className="fc-hide-mobile">Video</span>
                </button>
              </div>
            </div>

            {/* In-Chat Keyword Search Bar */}
            {showSearch && (
              <div style={styles.searchBarWrapper}>
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value);
                    loadMessages(activeConv.id, e.target.value);
                  }}
                  placeholder="Filter messages by keyword..."
                  style={styles.searchBarInput}
                  autoFocus
                />
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchKeyword('');
                    loadMessages(activeConv.id, '');
                  }}
                  style={styles.searchBarClose}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Pinned Message Banner */}
            {pinnedMessage && (
              <div style={styles.pinnedBanner}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                  <span style={{ fontSize: '0.9rem' }}>📌</span>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span style={styles.pinnedAuthor}>Pinned Announcement:</span>{' '}
                    <span style={styles.pinnedContent}>{pinnedMessage.content}</span>
                  </div>
                </div>
                {isAdminOrOwner && (
                  <button
                    onClick={() => handlePinToggle(pinnedMessage.id)}
                    style={styles.unpinBtn}
                    title="Unpin message"
                  >
                    Unpin
                  </button>
                )}
              </div>
            )}

            {/* Messages Scroll Area */}
            <div style={styles.messagesContainer}>
              {loading ? (
                <div style={styles.centerMessage}>
                  <div style={styles.innerSpinner}></div>
                  <span>Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <div style={styles.centerMessage}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💬</div>
                  <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '0.25rem' }}>
                    {searchKeyword ? `No messages found matching "${searchKeyword}"` : 'Encrypted Workspace Channel'}
                  </div>
                  <div style={{ fontSize: '0.8125rem' }}>
                    {searchKeyword ? 'Try a different search keyword.' : 'Send a message to start communicating securely.'}
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.author?.id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      style={isMine ? { ...styles.msgWrapper, justifyContent: 'flex-end' } : styles.msgWrapper}
                      className="fc-message-row"
                    >
                      <div className="fc-msg-bubble" style={isMine ? { ...styles.msgBubble, ...styles.msgBubbleMine } : styles.msgBubble}>
                        {/* Pinned Tag */}
                        {msg.is_pinned && (
                          <div style={styles.msgPinnedTag}>📌 Pinned Message</div>
                        )}

                        {/* Quoted Reply Preview */}
                        {msg.reply_to && (
                          <div style={styles.quotedReply}>
                            <span style={styles.quotedAuthor}>{msg.reply_to.author_name}</span>
                            <span style={styles.quotedContent}>{msg.reply_to.content}</span>
                          </div>
                        )}

                        {/* Author Tag */}
                        {!isMine && <span style={styles.msgSender}>{msg.author?.display_name || 'Colleague'}</span>}

                        {/* Message Content */}
                        <div style={styles.msgText}>{msg.content}</div>

                        {/* Attachments Card */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div style={styles.attachmentsList}>
                            {msg.attachments.map((att) => (
                              <a
                                key={att.id}
                                href={att.file_url}
                                target="_blank"
                                rel="noreferrer"
                                style={styles.attachmentCard}
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                  <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={styles.attName}>{att.original_name}</div>
                                  <div style={styles.attSize}>
                                    {(att.file_size / 1024).toFixed(1)} KB • Download
                                  </div>
                                </div>
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Message Footer: Time, Edited, Actions */}
                        <div style={styles.msgFooter}>
                          <div style={styles.quickActions}>
                            {/* Reply button */}
                            <button
                              onClick={() => setReplyingTo(msg)}
                              style={styles.actionIconBtn}
                              title="Reply to message"
                            >
                              ↩️
                            </button>

                            {/* Quick Reactions */}
                            {QUICK_EMOJIS.slice(0, 3).map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => handleReactionClick(msg.id, emoji)}
                                style={styles.actionIconBtn}
                              >
                                {emoji}
                              </button>
                            ))}

                            {/* Pin / Unpin button */}
                            {isAdminOrOwner && (
                              <button
                                onClick={() => handlePinToggle(msg.id)}
                                style={styles.actionIconBtn}
                                title={msg.is_pinned ? 'Unpin message' : 'Pin message'}
                              >
                                📌
                              </button>
                            )}

                            {/* Delete button */}
                            {(isMine || isAdminOrOwner) && !msg.is_deleted && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                style={{ ...styles.actionIconBtn, color: '#f87171' }}
                                title="Delete message"
                              >
                                🗑️
                              </button>
                            )}
                          </div>

                          <span style={styles.msgTime}>
                            {msg.edited_at && <span style={{ opacity: 0.7, marginRight: '4px' }}>(edited)</span>}
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Reaction Badges */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div style={styles.reactionsRow}>
                            {msg.reactions.map((r) => (
                              <button
                                key={r.emoji}
                                onClick={() => handleReactionClick(msg.id, r.emoji)}
                                style={r.has_reacted ? { ...styles.reactionPill, ...styles.reactionPillActive } : styles.reactionPill}
                                title={r.users.join(', ')}
                              >
                                <span>{r.emoji}</span>
                                <span>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing Indicator Bar */}
            {typingNames.length > 0 && (
              <div style={styles.typingNotice}>
                <span className="animate-pulse">●</span> {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...
              </div>
            )}

            {/* Message Composer Area */}
            <div style={styles.composerWrapper}>
              {/* Quoted Reply Banner */}
              {replyingTo && (
                <div style={styles.replyBanner}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}>
                      Replying to {replyingTo.author?.display_name || 'Colleague'}:
                    </span>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {replyingTo.content}
                    </p>
                  </div>
                  <button onClick={() => setReplyingTo(null)} style={styles.cancelReplyBtn}>
                    ✕
                  </button>
                </div>
              )}

              {/* Attachment Preview Banner */}
              {attachedFile && (
                <div style={styles.attachedBanner}>
                  <span>📎 Attached: {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)</span>
                  <button onClick={() => setAttachedFile(null)} style={styles.cancelReplyBtn}>
                    ✕
                  </button>
                </div>
              )}

              {/* Emoji Picker Backdrop */}
              {showEmojiPicker && (
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                  onClick={() => setShowEmojiPicker(false)}
                />
              )}

              {/* Emoji Picker */}
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
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setAttachedFile(file);
                  }}
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
                  onChange={handleInputChange}
                  placeholder={
                    replyingTo
                      ? `Replying to ${replyingTo.author?.display_name}...`
                      : activeConv.type === 'group'
                      ? `Message #${activeConv.name}...`
                      : 'Type a secure message...'
                  }
                  style={styles.composerInput}
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputMessage.trim() && !attachedFile}
                  style={
                    !inputMessage.trim() && !attachedFile
                      ? { ...styles.composerSend, opacity: 0.5, cursor: 'not-allowed' }
                      : styles.composerSend
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                  <span className="fc-hide-mobile" style={{ marginLeft: '4px' }}>Send</span>
                </button>
              </form>
            </div>

            {/* Group Info Drawer */}
            {showGroupDrawer && activeConv.type === 'group' && (
              <GroupInfoDrawer
                conversation={activeConv}
                onClose={() => setShowGroupDrawer(false)}
                onConversationUpdated={(updated) => {
                  setConversations(conversations.map((c) => (c.id === updated.id ? updated : c)));
                }}
                onConversationLeft={() => {
                  setShowGroupDrawer(false);
                  setActiveConversationId(null);
                  loadConversations();
                }}
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
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.5rem' }}>Select a Channel</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', maxWidth: '380px', lineHeight: 1.5, margin: '0 auto 1.5rem' }}>
              Choose a channel or direct message from the sidebar, or create a new team channel.
            </p>
            <button onClick={() => setShowCreateGroupModal(true)} style={styles.emptyCreateBtn}>
              + Create Team Channel
            </button>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <CreateGroupModal
          onClose={() => setShowCreateGroupModal(false)}
          onGroupCreated={async (newConv) => {
            await loadConversations();
            setActiveConversationId(newConv.id);
          }}
        />
      )}

      {/* WebRTC Video / Voice Call Modal (Root-level so incoming calls ring anywhere) */}
      {activeCall && (
        <CallModal
          conversationId={activeCall.conversationId}
          contactName={activeCall.contactName}
          callType={activeCall.callType}
          isIncoming={activeCall.isIncoming}
          incomingOffer={activeCall.incomingOffer}
          sendSignal={sendSignal}
          onRegisterSignalListener={(listener) => {
            callSignalListenerRef.current = listener;
            while (queuedCallSignalsRef.current.length > 0) {
              const sig = queuedCallSignalsRef.current.shift();
              if (sig) listener(sig);
            }
          }}
          onClose={() => {
            callSignalListenerRef.current = null;
            queuedCallSignalsRef.current = [];
            setActiveCall(null);
          }}
        />
      )}
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
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '0.9rem',
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
  },
  lastMsgPreview: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#94a3b8',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  unreadBadge: {
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '0.1rem 0.4rem',
    borderRadius: '9999px',
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
  chatHeaderTitle: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: '700',
    color: '#f8fafc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  archivedTag: {
    fontSize: '0.625rem',
    fontWeight: 700,
    color: '#f87171',
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    padding: '0.1rem 0.35rem',
    borderRadius: '4px',
  },
  chatHeaderSub: {
    fontSize: '0.72rem',
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    marginTop: '0.1rem',
  },
  callButtonsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flexShrink: 0,
  },
  headerToolBtn: {
    background: '#161f30',
    border: '1px solid #1f2937',
    color: '#94a3b8',
    borderRadius: '6px',
    padding: '0.45rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
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
  },
  searchBarWrapper: {
    padding: '0.5rem 1.25rem',
    backgroundColor: '#161f30',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  searchBarInput: {
    flex: 1,
    padding: '0.4rem 0.65rem',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#0b0f19',
    color: '#f8fafc',
    fontSize: '0.8rem',
    outline: 'none',
  },
  searchBarClose: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
  },
  pinnedBanner: {
    padding: '0.5rem 1.25rem',
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderBottom: '1px solid rgba(2, 132, 199, 0.25)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.78rem',
  },
  pinnedAuthor: {
    color: '#38bdf8',
    fontWeight: 700,
  },
  pinnedContent: {
    color: '#cbd5e1',
  },
  unpinBtn: {
    background: 'none',
    border: 'none',
    color: '#f87171',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: 600,
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
  },
  innerSpinner: {
    width: '32px',
    height: '32px',
    border: '2px solid #1e293b',
    borderTop: '2px solid #38bdf8',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 0.75rem',
  },
  msgWrapper: {
    display: 'flex',
    width: '100%',
  },
  msgBubble: {
    maxWidth: '65%',
    backgroundColor: '#111827',
    borderRadius: '12px',
    padding: '0.65rem 0.875rem',
    border: '1px solid #1f2937',
    position: 'relative',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
  },
  msgBubbleMine: {
    backgroundColor: '#0284c7',
    borderColor: '#0369a1',
  },
  msgPinnedTag: {
    fontSize: '0.65rem',
    color: '#fbbf24',
    fontWeight: 700,
    marginBottom: '0.25rem',
  },
  quotedReply: {
    borderLeft: '3px solid #38bdf8',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    padding: '0.3rem 0.5rem',
    borderRadius: '4px',
    marginBottom: '0.45rem',
    fontSize: '0.75rem',
  },
  quotedAuthor: {
    display: 'block',
    fontWeight: 700,
    color: '#38bdf8',
    fontSize: '0.6875rem',
  },
  quotedContent: {
    display: 'block',
    color: '#cbd5e1',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  attachmentsList: {
    marginTop: '0.45rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  attachmentCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.4rem 0.6rem',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '6px',
    textDecoration: 'none',
    color: '#f8fafc',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  attName: {
    fontSize: '0.78rem',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  attSize: {
    fontSize: '0.6875rem',
    color: '#94a3b8',
  },
  msgFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '0.35rem',
    gap: '0.5rem',
  },
  quickActions: {
    display: 'flex',
    gap: '0.25rem',
    opacity: 0.85,
  },
  actionIconBtn: {
    background: 'none',
    border: 'none',
    fontSize: '0.75rem',
    cursor: 'pointer',
    padding: '1px 3px',
    borderRadius: '3px',
  },
  msgTime: {
    fontSize: '0.625rem',
    color: '#cbd5e1',
    opacity: 0.85,
    whiteSpace: 'nowrap',
  },
  reactionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.3rem',
    marginTop: '0.45rem',
  },
  reactionPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.15rem 0.45rem',
    borderRadius: '9999px',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    color: '#cbd5e1',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  reactionPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38bdf8',
    color: '#38bdf8',
  },
  typingNotice: {
    padding: '0.35rem 1.25rem',
    fontSize: '0.72rem',
    color: '#38bdf8',
    backgroundColor: '#111827',
  },
  composerWrapper: {
    position: 'relative',
    backgroundColor: '#111827',
    borderTop: '1px solid #1f2937',
    flexShrink: 0,
  },
  replyBanner: {
    padding: '0.45rem 1.25rem',
    backgroundColor: '#161f30',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attachedBanner: {
    padding: '0.45rem 1.25rem',
    backgroundColor: '#161f30',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.75rem',
    color: '#34d399',
  },
  cancelReplyBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '0.75rem',
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
  },
  emptyCreateBtn: {
    padding: '0.65rem 1.25rem',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.84rem',
    cursor: 'pointer',
  },
};
