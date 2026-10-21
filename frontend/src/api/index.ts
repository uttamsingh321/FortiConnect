/**
 * FortiConnect — API Functions (typed)
 */
import type { AuthTokens, Conversation, Employee, EmployeeListItem, Message, Notification } from '../types';
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
export const getConversations = () =>
  client.get<Conversation[]>('/conversations/').then((r) => r.data);

export const getConversation = (id: number) =>
  client.get<Conversation>(`/conversations/${id}/`).then((r) => r.data);

export const createDirectConversation = (participantId: number) =>
  client.post<Conversation>('/conversations/', {
    type: 'direct',
    participant_employee_id: participantId,
  }).then((r) => r.data);

export const createGroupConversation = (name: string, description: string, memberIds: number[]) =>
  client.post<Conversation>('/conversations/', {
    type: 'group',
    name,
    description,
    member_ids: memberIds,
  }).then((r) => r.data);

export const updateConversation = (id: number, data: { name?: string; description?: string }) =>
  client.patch<Conversation>(`/conversations/${id}/`, data).then((r) => r.data);

export const leaveConversation = (id: number) =>
  client.post(`/conversations/${id}/leave/`);

export const getMembers = (conversationId: number) =>
  client.get(`/conversations/${conversationId}/members/`).then((r) => r.data);

export const addMember = (conversationId: number, employeeId: number) =>
  client.post(`/conversations/${conversationId}/members/`, { employee_id: employeeId }).then((r) => r.data);

export const removeMember = (conversationId: number, membershipId: number) =>
  client.delete(`/conversations/${conversationId}/members/${membershipId}/`);

// ── Messages ──────────────────────────────────────────────────────────────
export const getMessages = (conversationId: number, beforeId?: number, limit = 50) =>
  client.get<Message[]>(`/conversations/${conversationId}/messages/`, {
    params: { before_id: beforeId, limit },
  }).then((r) => r.data);

export const sendMessage = (conversationId: number, content: string) =>
  client.post<Message>(`/conversations/${conversationId}/messages/`, { content }).then((r) => r.data);

export const editMessage = (messageId: number, content: string) =>
  client.patch<Message>(`/messages/${messageId}/`, { content }).then((r) => r.data);

export const deleteMessage = (messageId: number) =>
  client.delete(`/messages/${messageId}/`);

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

