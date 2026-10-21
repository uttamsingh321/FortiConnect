/**
 * FortiConnect — API Functions (typed)
 */
import type { AuthTokens, Conversation, Employee, EmployeeListItem, Message, MessageReactionGroup, Notification } from '../types';
import client from './client';

export * from './client';
export const login = (username: string, password: string) =>
  client.post<AuthTokens>('/auth/login/', { username, password }).then((r) => r.data);

export const logout = (refresh: string) =>
  client.post('/auth/logout/', { refresh });

// ── Employees ─────────────────────────────────────────────────────────────
export const getEmployees = (search?: string, activeOnly?: boolean) =>
  client.get<EmployeeListItem[]>('/employees/', {
    params: { search, active_only: activeOnly ? 'true' : undefined },
  }).then((r) => r.data);

export const getEmployee = (id: number) =>
  client.get<Employee>(`/employees/${id}/`).then((r) => r.data);

export const getMe = () =>
  client.get<Employee>('/employees/me/').then((r) => r.data);

// ── Conversations ─────────────────────────────────────────────────────────
export const getConversations = (includeArchived = false) =>
  client.get<Conversation[]>('/conversations/', {
    params: { include_archived: includeArchived ? 'true' : undefined },
  }).then((r) => r.data);

export const getConversation = (id: number) =>
  client.get<Conversation>(`/conversations/${id}/`).then((r) => r.data);

export const createDirectConversation = (participantId: number) =>
  client.post<Conversation>('/conversations/', {
    type: 'direct',
    participant_employee_id: participantId,
  }).then((r) => r.data);

export const createGroupConversation = (name: string, description: string, memberIds: number[], avatar?: string) =>
  client.post<Conversation>('/conversations/', {
    type: 'group',
    name,
    description,
    member_ids: memberIds,
    avatar: avatar || '',
  }).then((r) => r.data);

export const updateConversation = (id: number, data: { name?: string; description?: string; avatar?: string }) =>
  client.patch<Conversation>(`/conversations/${id}/`, data).then((r) => r.data);

export const archiveConversation = (id: number) =>
  client.post<{ is_archived: boolean }>(`/conversations/${id}/archive/`).then((r) => r.data);

export const transferOwnership = (conversationId: number, newOwnerId: number) =>
  client.post<Conversation>(`/conversations/${conversationId}/transfer-ownership/`, { new_owner_id: newOwnerId }).then((r) => r.data);

export const markConversationRead = (conversationId: number) =>
  client.post<{ last_read_message_id: number; unread_count: number }>(`/conversations/${conversationId}/read/`).then((r) => r.data);

export const leaveConversation = (id: number) =>
  client.post(`/conversations/${id}/leave/`);

export const getMembers = (conversationId: number) =>
  client.get(`/conversations/${conversationId}/members/`).then((r) => r.data);

export const addMember = (conversationId: number, employeeId: number) =>
  client.post(`/conversations/${conversationId}/members/`, { employee_id: employeeId }).then((r) => r.data);

export const updateMemberRole = (conversationId: number, membershipId: number, role: 'admin' | 'member') =>
  client.patch(`/conversations/${conversationId}/members/${membershipId}/`, { role }).then((r) => r.data);

export const removeMember = (conversationId: number, membershipId: number) =>
  client.delete(`/conversations/${conversationId}/members/${membershipId}/`);

// ── Messages ──────────────────────────────────────────────────────────────
export const getMessages = (conversationId: number, options?: { beforeId?: number; limit?: number; q?: string; pinnedOnly?: boolean }) =>
  client.get<Message[]>(`/conversations/${conversationId}/messages/`, {
    params: {
      before_id: options?.beforeId,
      limit: options?.limit || 50,
      q: options?.q || undefined,
      pinned_only: options?.pinnedOnly ? 'true' : undefined,
    },
  }).then((r) => r.data);

export const sendMessage = (
  conversationId: number,
  content: string,
  replyToId?: number | null,
  attachmentFile?: File,
  idempotencyKey?: string
) => {
  if (attachmentFile) {
    const formData = new FormData();
    if (content) formData.append('content', content);
    if (replyToId) formData.append('reply_to_id', String(replyToId));
    if (idempotencyKey) formData.append('idempotency_key', idempotencyKey);
    formData.append('attachment', attachmentFile);
    return client.post<Message>(`/conversations/${conversationId}/messages/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  }

  return client.post<Message>(`/conversations/${conversationId}/messages/`, {
    content,
    reply_to_id: replyToId || null,
    idempotency_key: idempotencyKey || undefined,
  }).then((r) => r.data);
};

export const editMessage = (messageId: number, content: string) =>
  client.patch<Message>(`/messages/${messageId}/`, { content }).then((r) => r.data);

export const deleteMessage = (messageId: number) =>
  client.delete(`/messages/${messageId}/`);

export const toggleReaction = (messageId: number, emoji: string) =>
  client.post<{ action: 'added' | 'removed'; reactions: MessageReactionGroup[] }>(`/messages/${messageId}/reactions/`, { emoji }).then((r) => r.data);

export const pinMessage = (conversationId: number, messageId: number) =>
  client.post<{ is_pinned: boolean; message: Message }>(`/conversations/${conversationId}/pin/${messageId}/`).then((r) => r.data);

// ── Notifications ─────────────────────────────────────────────────────────
export const getNotifications = (unreadOnly = false, beforeId?: number) =>
  client.get<{ results: Notification[]; unread_count: number }>('/notifications/', {
    params: { unread_only: unreadOnly ? 'true' : undefined, before_id: beforeId },
  }).then((r) => r.data);

export const getUnreadCount = () =>
  client.get<{ unread_count: number }>('/notifications/unread-count/').then((r) => r.data);

export const markNotificationRead = (id: number) =>
  client.post<Notification>(`/notifications/${id}/read/`).then((r) => r.data);

export const markAllNotificationsRead = () =>
  client.post<{ marked_read: number }>('/notifications/read-all/').then((r) => r.data);
