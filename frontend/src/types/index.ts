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
  last_read_message_id?: number;
  is_muted?: boolean;
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
  avatar?: string;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  memberships: Membership[];
  last_message: LastMessage | null;
  unread_count: number;
  pinned_count?: number;
}

export interface MessageReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  user_ids: number[];
  has_reacted: boolean;
}

export interface MessageAttachment {
  id: number;
  original_name: string;
  file_size: number;
  content_type: string;
  created_at: string;
  file_url: string;
}

export interface ReplyPreview {
  id: number;
  author_name: string;
  content: string;
  is_deleted: boolean;
}

export interface Message {
  id: number;
  conversation: number;
  author: EmployeeListItem | null;
  content: string;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  reply_to?: ReplyPreview | null;
  reactions?: MessageReactionGroup[];
  attachments?: MessageAttachment[];
  is_pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: EmployeeListItem | null;
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
  | { type: 'message.reaction'; message_id: number; conversation_id: number; reactions: MessageReactionGroup[] }
  | { type: 'conversation.updated'; conversation: Conversation }
  | { type: 'presence.update'; employee_id: number; status: string }
  | { type: 'notification.new'; notification: Notification }
  | { type: 'chat.typing'; employee_id: number; display_name: string; conversation_id: number; is_typing: boolean }
  | { type: 'heartbeat.ack' }
  | { type: 'error'; code: string; message: string }
  | { type: 'call.offer'; sender_id: number; sender_name: string; payload: any; call_type: 'voice' | 'video'; conversation_id: number }
  | { type: 'call.answer'; sender_id: number; sender_name: string; payload: any; conversation_id: number }
  | { type: 'call.ice-candidate'; sender_id: number; payload: any; conversation_id: number }
  | { type: 'call.end'; sender_id: number; conversation_id: number };

// ── Calendar Event Types ──────────────────────────────────────────────────
export type CalendarEventType = 'meeting' | 'call' | 'review' | 'security' | 'deadline' | 'social';

export interface CalendarAttendee {
  id: number;
  name: string;
  department?: string;
  employee_id?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24h format)
  endTime: string; // HH:MM (24h format)
  type: CalendarEventType;
  location?: string;
  meetingLink?: string;
  attendees: CalendarAttendee[];
  createdBy?: {
    id: number;
    name: string;
  };
  createdAt: string;
}
