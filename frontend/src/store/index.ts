import { create } from 'zustand';
import type { Employee, Conversation, Notification } from '../types';
import { getMe, setTokens, clearTokens } from '../api';

interface AuthState {
  user: Employee | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginSuccess: (access: string, refresh: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('fc_access_token'),
  isLoading: true,

  loginSuccess: async (access: string, refresh: string) => {
    setTokens(access, refresh);
    set({ isAuthenticated: true, isLoading: true });
    try {
      const user = await getMe();
      set({ user, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
      clearTokens();
    }
  },

  logout: () => {
    clearTokens();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  loadUser: async () => {
    if (!localStorage.getItem('fc_access_token')) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const user = await getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

interface ChatState {
  activeConversationId: number | null;
  conversations: Conversation[];
  notifications: Notification[];
  unreadNotificationCount: number;
  setActiveConversationId: (id: number | null) => void;
  setConversations: (convs: Conversation[]) => void;
  setNotifications: (notifs: Notification[]) => void;
  setUnreadNotificationCount: (count: number) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  conversations: [],
  notifications: [],
  unreadNotificationCount: 0,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setConversations: (conversations) => set({ conversations }),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadNotificationCount: (unreadNotificationCount) => set({ unreadNotificationCount }),
}));

