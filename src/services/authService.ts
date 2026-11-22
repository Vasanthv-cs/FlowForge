import { supabase } from '@/lib/supabase';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type { Profile } from '@flowforge/workflow-schema';

export interface AuthResponse<T = unknown> {
  data: T | null;
  error: string | null;
}

export const authService = {
  /**
   * Register a new user with email and password.
   */
  async signUp(email: string, password: string, displayName?: string): Promise<AuthResponse<{ user: User | null; session: Session | null }>> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split('@')[0],
            full_name: displayName,
          },
        },
      });

      if (error) {
        return { data: null, error: error.message };
      }

      return { data: { user: data.user, session: data.session }, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Unknown registration error' };
    }
  },

  /**
   * Sign in an existing user with email and password.
   */
  async signIn(email: string, password: string): Promise<AuthResponse<{ user: User; session: Session }>> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { data: null, error: error.message };
      }

      if (!data.user || !data.session) {
        return { data: null, error: 'Sign in succeeded but session was not returned' };
      }

      return { data: { user: data.user, session: data.session }, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Unknown authentication error' };
    }
  },

  /**
   * Initiate Google OAuth flow.
   */
  async signInWithGoogle(): Promise<AuthResponse<{ url: string | null }>> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        return { data: null, error: error.message };
      }

      return { data: { url: data.url }, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to initialize Google OAuth' };
    }
  },

  /**
   * Request password reset email.
   */
  async resetPasswordForEmail(email: string): Promise<AuthResponse<boolean>> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#reset-password`,
      });

      if (error) {
        return { data: null, error: error.message };
      }

      return { data: true, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Password reset request failed' };
    }
  },

  /**
   * Update user password (used during password reset flow).
   */
  async updatePassword(newPassword: string): Promise<AuthResponse<boolean>> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { data: null, error: error.message };
      }

      return { data: true, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Password update failed' };
    }
  },

  /**
   * Sign out the active user and clear session.
   */
  async signOut(): Promise<AuthResponse<boolean>> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { data: null, error: error.message };
      }
      return { data: true, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Sign out failed' };
    }
  },

  /**
   * Get active session.
   */
  async getSession(): Promise<Session | null> {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch {
      return null;
    }
  },

  /**
   * Get active user.
   */
  async getUser(): Promise<User | null> {
    try {
      const { data } = await supabase.auth.getUser();
      return data.user;
    } catch {
      return null;
    }
  },

  /**
   * Fetch user profile from public.profiles.
   */
  async getProfile(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) return null;
      return {
        id: data.id,
        displayName: data.display_name,
        avatarUrl: data.avatar_url,
        createdAt: data.created_at,
      };
    } catch {
      return null;
    }
  },

  /**
   * Subscribe to auth state changes.
   */
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
