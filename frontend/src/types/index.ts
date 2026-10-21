/**
 * FortiConnect — API Type Definitions
 */

export interface Employee {
  id: number;
  employee_id: string;
  display_name: string;
  email: string;
  department: string;
  title: string;
  phone?: string;
  location?: string;
  bio?: string;
  employment_status: 'active' | 'inactive' | 'on_leave' | 'terminated';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeListItem {
  id: number;
  employee_id: string;
  display_name: string;
  department: string;
  title: string;
  employment_status: string;
  is_active: boolean;
}

export interface Membership {
  id: number;
  employee: EmployeeListItem;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  removed_at: string | null;
}

export interface LastMessage {
  id: number;
  content: string;
  created_at: string;
  author_name: string;
}

export interface Conversation {
  id: number;
  type: 'direct' | 'group';
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  memberships: Membership[];
  last_message: LastMessage | null;
  unread_count: number;
}

export interface Message {
  id: number;
  conversation: number;
  author: EmployeeListItem | null;
  content: string;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
}

export interface Notification {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  conversation_id: number | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface PresenceStatus {
  employee_id: number;
  status: 'online' | 'offline' | 'away';
  last_seen_at: string | null;
}

// WebSocket message types
export type WsMessage =
  | { type: 'connection.established'; employee_id: number }
  | { type: 'subscribed'; conversation_id: number }
  | { type: 'message.new'; message: Message }
  | { type: 'presence.update'; employee_id: number; status: string }
  | { type: 'notification.new'; notification: Notification }
  | { type: 'typing.start'; employee_id: number; display_name: string; conversation_id: number; is_typing: true }
  | { type: 'typing.stop'; employee_id: number; display_name: string; conversation_id: number; is_typing: false }
  | { type: 'heartbeat.ack' }
  | { type: 'error'; code: string; message: string };

