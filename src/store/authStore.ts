import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile } from '@flowforge/workflow-schema';
import { authService } from '@/services/authService';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true });
      const session = await authService.getSession();
      const user = session?.user ?? null;
      let profile: Profile | null = null;

      if (user) {
        profile = await authService.getProfile(user.id);
      }

      set({
        session,
        user,
        profile,
        isLoading: false,
        isInitialized: true,
      });

      // Subscribe to reactive auth updates
      authService.onAuthStateChange(async (_event, newSession) => {
        const newUser = newSession?.user ?? null;
        let newProfile: Profile | null = null;
        if (newUser) {
          newProfile = await authService.getProfile(newUser.id);
        }
        set({
          session: newSession,
          user: newUser,
          profile: newProfile,
        });
      });
    } catch (err) {
      set({
        isLoading: false,
        isInitialized: true,
        error: err instanceof Error ? err.message : 'Failed to initialize session',
      });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    const { data, error } = await authService.signIn(email, password);

    if (error || !data) {
      set({ isLoading: false, error: error || 'Failed to sign in' });
      return { success: false, error: error || 'Failed to sign in' };
    }

    const profile = await authService.getProfile(data.user.id);
    set({
      user: data.user,
      session: data.session,
      profile,
      isLoading: false,
      error: null,
    });

    return { success: true };
  },

  signUp: async (email: string, password: string, displayName?: string) => {
    set({ isLoading: true, error: null });
    const { data, error } = await authService.signUp(email, password, displayName);

    if (error) {
      set({ isLoading: false, error });
      return { success: false, error };
    }

    if (data?.session) {
      const profile = data.user ? await authService.getProfile(data.user.id) : null;
      set({
        user: data.user,
        session: data.session,
        profile,
        isLoading: false,
        error: null,
      });
    } else {
      set({ isLoading: false, error: null });
    }

    return { success: true };
  },

  signOut: async () => {
    set({ isLoading: true });
    await authService.signOut();
    set({
      user: null,
      session: null,
      profile: null,
      isLoading: false,
      error: null,
    });
  },

  resetPassword: async (email: string) => {
    set({ isLoading: true, error: null });
    const { error } = await authService.resetPasswordForEmail(email);
    set({ isLoading: false, error });
    return { success: !error, error: error ?? undefined };
  },

  updatePassword: async (password: string) => {
    set({ isLoading: true, error: null });
    const { error } = await authService.updatePassword(password);
    set({ isLoading: false, error });
    return { success: !error, error: error ?? undefined };
  },

  clearError: () => set({ error: null }),

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const profile = await authService.getProfile(user.id);
    set({ profile });
  },
}));
