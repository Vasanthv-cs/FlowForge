import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import type { User, Session, AuthError } from '@supabase/supabase-js';

// Mock Supabase client
vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        getSession: vi.fn(),
        getUser: vi.fn(),
        onAuthStateChange: vi.fn((_cb) => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(),
      })),
      rpc: vi.fn(),
    },
    isSupabaseConfigured: true,
  };
});

describe('Auth Service & Auth Store (Batch 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      session: null,
      profile: null,
      isLoading: false,
      isInitialized: false,
      error: null,
    });
  });

  it('handles successful user registration', async () => {
    const mockUser = { id: 'u1', email: 'test@flowforge.dev' };
    const mockSession = { access_token: 'token123', user: mockUser };

    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: { user: mockUser as unknown as User, session: mockSession as unknown as Session },
      error: null,
    });

    const res = await authService.signUp('test@flowforge.dev', 'password123', 'Test User');
    expect(res.error).toBeNull();
    expect(res.data?.user?.email).toBe('test@flowforge.dev');
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@flowforge.dev',
      password: 'password123',
      options: {
        data: {
          display_name: 'Test User',
          full_name: 'Test User',
        },
      },
    });
  });

  it('handles registration errors gracefully', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'User already registered', name: 'AuthApiError', status: 400 } as unknown as AuthError,
    });

    const res = await authService.signUp('test@flowforge.dev', 'password123');
    expect(res.error).toBe('User already registered');
    expect(res.data).toBeNull();
  });

  it('handles successful email/password sign-in and session storage', async () => {
    const mockUser = { id: 'u1', email: 'test@flowforge.dev' };
    const mockSession = { access_token: 'token123', user: mockUser };

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: mockUser as unknown as User, session: mockSession as unknown as Session },
      error: null,
    });

    // Mock profile fetch
    const singleMock = vi.fn().mockResolvedValueOnce({
      data: { id: 'u1', display_name: 'Test User', avatar_url: null, created_at: new Date().toISOString() },
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: singleMock,
    } as unknown as ReturnType<typeof supabase.from>);

    const storeRes = await useAuthStore.getState().signIn('test@flowforge.dev', 'password123');
    expect(storeRes.success).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe('test@flowforge.dev');
    expect(useAuthStore.getState().profile?.displayName).toBe('Test User');
  });

  it('handles sign-in errors and bad credentials', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', name: 'AuthApiError', status: 400 } as unknown as AuthError,
    });

    const storeRes = await useAuthStore.getState().signIn('test@flowforge.dev', 'wrongpassword');
    expect(storeRes.success).toBe(false);
    expect(storeRes.error).toBe('Invalid login credentials');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('handles password reset request', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
      data: {} as unknown as Record<string, never>,
      error: null,
    });

    const res = await authService.resetPasswordForEmail('test@flowforge.dev');
    expect(res.data).toBe(true);
    expect(res.error).toBeNull();
  });

  it('handles password update during reset completion', async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
      data: { user: { id: 'u1' } as unknown as User },
      error: null,
    });

    const res = await authService.updatePassword('newSecurePassword123');
    expect(res.data).toBe(true);
    expect(res.error).toBeNull();
  });

  it('handles sign-out and purges authenticated state', async () => {
    useAuthStore.setState({
      user: { id: 'u1' } as unknown as User,
      session: { access_token: '123' } as unknown as Session,
      profile: { id: 'u1', displayName: 'User', createdAt: '' },
    });

    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
      error: null,
    });

    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it('restores session upon application initialization', async () => {
    const mockSession = {
      access_token: 'restored-token',
      user: { id: 'u1', email: 'restored@flowforge.dev' },
    };

    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: mockSession as unknown as Session },
      error: null,
    });

    // Mock profile fetch
    const singleMock = vi.fn().mockResolvedValueOnce({
      data: { id: 'u1', display_name: 'Restored User', avatar_url: null, created_at: '' },
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: singleMock,
    } as unknown as ReturnType<typeof supabase.from>);

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().isInitialized).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe('restored@flowforge.dev');
    expect(useAuthStore.getState().profile?.displayName).toBe('Restored User');
  });
});
