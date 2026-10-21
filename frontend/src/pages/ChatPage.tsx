import React, { useEffect, useState, useRef } from 'react';
import type { Message } from '../types';
import { getConversations, getMessages, sendMessage, createGroupConversation } from '../api';
import { useChatStore, useAuthStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';

export const ChatPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const { activeConversationId, setActiveConversationId, conversations, setConversations } = useChatStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // WebSocket message receiver
  const handleWsMessage = (data: any) => {
    if (data.type === 'message.new' && data.message) {
      if (data.message.conversation === activeConversationId) {
        setMessages((prev) => [...prev, data.message]);
      }
      // Update last message in conversation list
      loadConversations();
    }
  };

  const { isConnected, subscribe, unsubscribe } = useWebSocket(handleWsMessage);

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
    <div style={styles.container}>
      {/* Sidebar: Conversation List */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h3 style={styles.sidebarTitle}>Conversations</h3>
          <button style={styles.addGroupBtn} onClick={() => setShowCreateGroup(!showCreateGroup)}>
            + Group
          </button>
        </div>

        {showCreateGroup && (
          <form onSubmit={handleCreateGroup} style={styles.newGroupForm}>
            <input
              type="text"
              placeholder="Group name..."
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
            <div style={styles.emptySidebar}>No conversations yet. Visit the Directory to message a colleague!</div>
          ) : (
            conversations.map((conv) => {
              const isSelected = conv.id === activeConversationId;
              const title =
                conv.type === 'group'
                  ? conv.name || 'Unnamed Group'
                  : conv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name || 'Direct Message';

              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  style={isSelected ? { ...styles.convItem, ...styles.convItemSelected } : styles.convItem}
                >
                  <div style={styles.convAvatar}>{title.charAt(0).toUpperCase()}</div>
                  <div style={styles.convDetails}>
                    <div style={styles.convTitleRow}>
                      <span style={styles.convTitle}>{title}</span>
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

      {/* Main Thread */}
      <div style={styles.main}>
        {activeConv ? (
          <>
            <div style={styles.chatHeader}>
              <div>
                <h3 style={styles.chatHeaderTitle}>
                  {activeConv.type === 'group'
                    ? activeConv.name
                    : activeConv.memberships?.find((m) => m.employee.id !== user?.id)?.employee.display_name}
                </h3>
                <span style={styles.chatHeaderSub}>
                  {activeConv.type === 'group' ? 'Group Channel' : 'Direct Encrypted Communication'}
                  {' • '}
                  <span style={isConnected ? styles.connectedDot : styles.disconnectedDot}>
                    {isConnected ? 'Real-Time Connected' : 'Connecting WebSocket...'}
                  </span>
                </span>
              </div>
            </div>

            <div style={styles.messagesContainer}>
              {loading ? (
                <div style={styles.centerMessage}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={styles.centerMessage}>Send a message to start this secure conversation.</div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.author?.id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      style={isMine ? { ...styles.msgWrapper, justifyContent: 'flex-end' } : styles.msgWrapper}
                    >
                      <div style={isMine ? { ...styles.msgBubble, ...styles.msgBubbleMine } : styles.msgBubble}>
                        {!isMine && <span style={styles.msgSender}>{msg.author?.display_name || 'Unknown'}</span>}
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

            <form onSubmit={handleSend} style={styles.composerForm}>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a secure message..."
                style={styles.composerInput}
              />
              <button type="submit" style={styles.composerSend}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div style={styles.noChatSelected}>
            <h3>Select a conversation</h3>
            <p>Or start a new direct message from the Employee Directory.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100%',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
  },
  sidebar: {
    width: '320px',
    borderRight: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1e293b',
  },
  sidebarHeader: {
    padding: '1.25rem',
    borderBottom: '1px solid #334155',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sidebarTitle: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: '600',
  },
  addGroupBtn: {
    padding: '0.375rem 0.625rem',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  newGroupForm: {
    padding: '0.75rem',
    borderBottom: '1px solid #334155',
    display: 'flex',
    gap: '0.5rem',
  },
  newGroupInput: {
    flex: 1,
    padding: '0.375rem 0.5rem',
    borderRadius: '4px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    fontSize: '0.8125rem',
  },
  newGroupSubmit: {
    padding: '0.375rem 0.625rem',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  conversationList: {
    flex: 1,
    overflowY: 'auto',
  },
  emptySidebar: {
    padding: '2rem 1rem',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.8125rem',
  },
  convItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.875rem 1.25rem',
    cursor: 'pointer',
    borderBottom: '1px solid #334155',
    transition: 'background-color 0.1s ease',
  },
  convItemSelected: {
    backgroundColor: '#334155',
  },
  convAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '0.875rem',
  },
  convDetails: {
    flex: 1,
    overflow: 'hidden',
  },
  convTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  convTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#f8fafc',
  },
  lastMsgPreview: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#94a3b8',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '0.125rem',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  chatHeader: {
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #334155',
    backgroundColor: '#1e293b',
  },
  chatHeaderTitle: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: '600',
  },
  chatHeaderSub: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  connectedDot: {
    color: '#4ade80',
    fontWeight: '600',
  },
  disconnectedDot: {
    color: '#f87171',
    fontWeight: '600',
  },
  messagesContainer: {
    flex: 1,
    padding: '1.5rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  centerMessage: {
    margin: 'auto',
    color: '#64748b',
    fontSize: '0.875rem',
  },
  msgWrapper: {
    display: 'flex',
    width: '100%',
  },
  msgBubble: {
    maxWidth: '65%',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '0.625rem 0.875rem',
    border: '1px solid #334155',
  },
  msgBubbleMine: {
    backgroundColor: '#0369a1',
    border: 'none',
  },
  msgSender: {
    display: 'block',
    fontSize: '0.6875rem',
    color: '#38bdf8',
    fontWeight: '600',
    marginBottom: '0.25rem',
  },
  msgText: {
    fontSize: '0.875rem',
    lineHeight: '1.4',
  },
  msgTime: {
    display: 'block',
    fontSize: '0.625rem',
    color: '#94a3b8',
    textAlign: 'right',
    marginTop: '0.25rem',
  },
  composerForm: {
    padding: '1rem 1.5rem',
    borderTop: '1px solid #334155',
    backgroundColor: '#1e293b',
    display: 'flex',
    gap: '0.75rem',
  },
  composerInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #475569',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    fontSize: '0.875rem',
    outline: 'none',
  },
  composerSend: {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  noChatSelected: {
    margin: 'auto',
    textAlign: 'center',
    color: '#64748b',
  },
};
