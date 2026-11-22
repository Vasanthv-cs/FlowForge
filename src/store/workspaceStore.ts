import { create } from 'zustand';
import type { WorkspaceRole } from '@flowforge/workflow-schema';
import { workspaceService, type WorkspaceWithRole, type WorkspaceMemberInfo } from '@/services/workspaceService';

interface WorkspaceState {
  workspaces: WorkspaceWithRole[];
  activeWorkspaceId: string | null;
  members: WorkspaceMemberInfo[];
  isLoading: boolean;
  isMembersLoading: boolean;
  error: string | null;

  loadWorkspaces: () => Promise<void>;
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<{ success: boolean; id?: string; error?: string }>;
  renameWorkspace: (id: string, name: string) => Promise<{ success: boolean; error?: string }>;
  deleteWorkspace: (id: string) => Promise<{ success: boolean; error?: string }>;

  loadMembers: (workspaceId: string) => Promise<void>;
  addMember: (workspaceId: string, email: string, role: WorkspaceRole) => Promise<{ success: boolean; error?: string }>;
  updateRole: (workspaceId: string, userId: string, role: WorkspaceRole) => Promise<{ success: boolean; error?: string }>;
  removeMember: (workspaceId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;

  // Permission helpers
  getActiveWorkspace: () => WorkspaceWithRole | null;
  canManageMembers: () => boolean;
  canCreateWorkflows: () => boolean;
  canEditWorkflows: () => boolean;
  canDeleteWorkflows: () => boolean;
  canDeleteWorkspace: () => boolean;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  members: [],
  isLoading: false,
  isMembersLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    const { data, error } = await workspaceService.listUserWorkspaces();

    if (error || !data) {
      set({ isLoading: false, error: error || 'Failed to load workspaces' });
      return;
    }

    const currentActiveId = get().activeWorkspaceId;
    let newActiveId = currentActiveId;

    if (!newActiveId || !data.some((w) => w.id === newActiveId)) {
      newActiveId = data.length > 0 ? data[0].id : null;
    }

    set({
      workspaces: data,
      activeWorkspaceId: newActiveId,
      isLoading: false,
      error: null,
    });

    if (newActiveId) {
      get().loadMembers(newActiveId);
    }
  },

  setActiveWorkspace: (id: string) => {
    set({ activeWorkspaceId: id });
    get().loadMembers(id);
  },

  createWorkspace: async (name: string) => {
    set({ isLoading: true, error: null });
    const { data, error } = await workspaceService.createWorkspace(name);

    if (error || !data) {
      set({ isLoading: false, error: error || 'Failed to create workspace' });
      return { success: false, error: error || 'Failed to create workspace' };
    }

    await get().loadWorkspaces();
    set({ activeWorkspaceId: data, isLoading: false });
    return { success: true, id: data };
  },

  renameWorkspace: async (id: string, name: string) => {
    set({ isLoading: true, error: null });
    const { error } = await workspaceService.renameWorkspace(id, name);

    if (error) {
      set({ isLoading: false, error });
      return { success: false, error };
    }

    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
      isLoading: false,
    }));

    return { success: true };
  },

  deleteWorkspace: async (id: string) => {
    set({ isLoading: true, error: null });
    const { error } = await workspaceService.deleteWorkspace(id);

    if (error) {
      set({ isLoading: false, error });
      return { success: false, error };
    }

    await get().loadWorkspaces();
    return { success: true };
  },

  loadMembers: async (workspaceId: string) => {
    set({ isMembersLoading: true });
    const { data, error } = await workspaceService.listWorkspaceMembers(workspaceId);

    if (error || !data) {
      set({ isMembersLoading: false, error: error || 'Failed to load members' });
      return;
    }

    set({ members: data, isMembersLoading: false });
  },

  addMember: async (workspaceId: string, email: string, role: WorkspaceRole) => {
    const { error } = await workspaceService.addMemberByEmail(workspaceId, email, role);
    if (error) {
      return { success: false, error };
    }
    await get().loadMembers(workspaceId);
    return { success: true };
  },

  updateRole: async (workspaceId: string, userId: string, role: WorkspaceRole) => {
    const { error } = await workspaceService.updateMemberRole(workspaceId, userId, role);
    if (error) {
      return { success: false, error };
    }
    await get().loadMembers(workspaceId);
    return { success: true };
  },

  removeMember: async (workspaceId: string, userId: string) => {
    const { error } = await workspaceService.removeMember(workspaceId, userId);
    if (error) {
      return { success: false, error };
    }
    await get().loadMembers(workspaceId);
    return { success: true };
  },

  clearError: () => set({ error: null }),

  getActiveWorkspace: () => {
    const { workspaces, activeWorkspaceId } = get();
    return workspaces.find((w) => w.id === activeWorkspaceId) || null;
  },

  canManageMembers: () => {
    const active = get().getActiveWorkspace();
    return active?.role === 'owner' || active?.role === 'admin';
  },

  canCreateWorkflows: () => {
    const active = get().getActiveWorkspace();
    return active?.role === 'owner' || active?.role === 'admin' || active?.role === 'developer';
  },

  canEditWorkflows: () => {
    const active = get().getActiveWorkspace();
    return active?.role === 'owner' || active?.role === 'admin' || active?.role === 'developer';
  },

  canDeleteWorkflows: () => {
    const active = get().getActiveWorkspace();
    return active?.role === 'owner' || active?.role === 'admin';
  },

  canDeleteWorkspace: () => {
    const active = get().getActiveWorkspace();
    return active?.role === 'owner';
  },
}));
