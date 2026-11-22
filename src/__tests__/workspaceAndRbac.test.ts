import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspaceService, type WorkspaceWithRole } from '@/services/workspaceService';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
      })),
      rpc: vi.fn(),
    },
    isSupabaseConfigured: true,
  };
});

describe('Workspace Management & Role Permissions (Batch 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      members: [],
      isLoading: false,
      isMembersLoading: false,
      error: null,
    });
  });

  const mockWorkspaces: WorkspaceWithRole[] = [
    {
      id: 'ws-owner',
      name: 'Alpha Engineering',
      ownerId: 'u-1',
      role: 'owner',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-admin',
      name: 'Beta Operations',
      ownerId: 'u-2',
      role: 'admin',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-dev',
      name: 'Gamma Pipelines',
      ownerId: 'u-3',
      role: 'developer',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ws-viewer',
      name: 'Delta Analytics',
      ownerId: 'u-4',
      role: 'viewer',
      createdAt: new Date().toISOString(),
    },
  ];

  it('lists user workspaces and sets active workspace', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'u-1' } as unknown as User },
      error: null,
    });

    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: [
            {
              workspace_id: 'ws-owner',
              role: 'owner',
              workspaces: {
                id: 'ws-owner',
                name: 'Alpha Engineering',
                owner_id: 'u-1',
                created_at: new Date().toISOString(),
              },
            },
          ],
          error: null,
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    // Mock member loading
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    await useWorkspaceStore.getState().loadWorkspaces();
    expect(useWorkspaceStore.getState().workspaces.length).toBe(1);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-owner');
  });

  it('handles workspace creation through RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: 'ws-new-id',
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

    // Mock reload
    vi.spyOn(workspaceService, 'listUserWorkspaces').mockResolvedValueOnce({
      data: [
        {
          id: 'ws-new-id',
          name: 'New Test WS',
          ownerId: 'u-1',
          role: 'owner',
          createdAt: '',
        },
      ],
      error: null,
    });

    const res = await useWorkspaceStore.getState().createWorkspace('New Test WS');
    expect(res.success).toBe(true);
    expect(res.id).toBe('ws-new-id');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-new-id');
  });

  it('switches active workspace and loads members', () => {
    useWorkspaceStore.setState({
      workspaces: mockWorkspaces,
      activeWorkspaceId: 'ws-owner',
    });

    const loadMembersSpy = vi.spyOn(useWorkspaceStore.getState(), 'loadMembers');
    useWorkspaceStore.getState().setActiveWorkspace('ws-dev');

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-dev');
    expect(loadMembersSpy).toHaveBeenCalledWith('ws-dev');
  });

  describe('Permission Matrix Enforcement', () => {
    it('enforces OWNER permissions correctly', () => {
      useWorkspaceStore.setState({
        workspaces: mockWorkspaces,
        activeWorkspaceId: 'ws-owner',
      });

      const store = useWorkspaceStore.getState();
      expect(store.canManageMembers()).toBe(true);
      expect(store.canCreateWorkflows()).toBe(true);
      expect(store.canEditWorkflows()).toBe(true);
      expect(store.canDeleteWorkflows()).toBe(true);
      expect(store.canDeleteWorkspace()).toBe(true);
    });

    it('enforces ADMIN permissions correctly (cannot delete workspace)', () => {
      useWorkspaceStore.setState({
        workspaces: mockWorkspaces,
        activeWorkspaceId: 'ws-admin',
      });

      const store = useWorkspaceStore.getState();
      expect(store.canManageMembers()).toBe(true);
      expect(store.canCreateWorkflows()).toBe(true);
      expect(store.canEditWorkflows()).toBe(true);
      expect(store.canDeleteWorkflows()).toBe(true);
      expect(store.canDeleteWorkspace()).toBe(false); // Only owner can delete workspace
    });

    it('enforces DEVELOPER permissions correctly (cannot delete workflows or manage members)', () => {
      useWorkspaceStore.setState({
        workspaces: mockWorkspaces,
        activeWorkspaceId: 'ws-dev',
      });

      const store = useWorkspaceStore.getState();
      expect(store.canCreateWorkflows()).toBe(true);
      expect(store.canEditWorkflows()).toBe(true);
      expect(store.canDeleteWorkflows()).toBe(false); // Developers cannot delete workflows
      expect(store.canManageMembers()).toBe(false); // Developers cannot manage members
      expect(store.canDeleteWorkspace()).toBe(false);
    });

    it('enforces VIEWER permissions correctly (read-only)', () => {
      useWorkspaceStore.setState({
        workspaces: mockWorkspaces,
        activeWorkspaceId: 'ws-viewer',
      });

      const store = useWorkspaceStore.getState();
      expect(store.canCreateWorkflows()).toBe(false);
      expect(store.canEditWorkflows()).toBe(false);
      expect(store.canDeleteWorkflows()).toBe(false);
      expect(store.canManageMembers()).toBe(false);
      expect(store.canDeleteWorkspace()).toBe(false);
    });
  });

  describe('Member Management & Security Rules', () => {
    it('adds a member via RPC and rejects duplicates', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { userId: 'u-new', email: 'dev@flowforge.dev', role: 'developer' },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      const res = await useWorkspaceStore.getState().addMember('ws-owner', 'dev@flowforge.dev', 'developer');
      expect(res.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('add_workspace_member_by_email', {
        target_workspace_id: 'ws-owner',
        target_email: 'dev@flowforge.dev',
        member_role: 'developer',
      });

      // Duplicate membership error handling
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'User is already a member of this workspace', code: 'P0001', name: 'PostgrestError', details: '', hint: '' },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      const dupRes = await useWorkspaceStore.getState().addMember('ws-owner', 'dev@flowforge.dev', 'developer');
      expect(dupRes.success).toBe(false);
      expect(dupRes.error).toContain('already a member');
    });

    it('updates member role through RPC and checks errors', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      const res = await useWorkspaceStore.getState().updateRole('ws-owner', 'u-2', 'admin');
      expect(res.success).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('update_workspace_member_role', {
        target_workspace_id: 'ws-owner',
        target_user_id: 'u-2',
        new_role: 'admin',
      });
    });

    it('removes a member successfully', async () => {
      vi.mocked(supabase.from).mockReturnValueOnce({
        delete: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            eq: vi.fn().mockResolvedValueOnce({
              error: null,
            }),
          }),
        }),
      } as unknown as ReturnType<typeof supabase.from>);

      const res = await useWorkspaceStore.getState().removeMember('ws-owner', 'u-dev');
      expect(res.success).toBe(true);
    });
  });
});
