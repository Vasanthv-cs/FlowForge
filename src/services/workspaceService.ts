import { supabase } from '@/lib/supabase';
import type { WorkspaceRole, Workspace } from '@flowforge/workflow-schema';

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
  isDefault?: boolean;
}

export interface WorkspaceMemberInfo {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export const workspaceService = {
  /**
   * List all workspaces the authenticated user belongs to, including their role.
   */
  async listUserWorkspaces(): Promise<{ data: WorkspaceWithRole[] | null; error: string | null }> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return { data: null, error: 'User is not authenticated' };
      }

      // Query workspace_members joined with workspaces
      const { data, error } = await supabase
        .from('workspace_members')
        .select(`
          workspace_id,
          role,
          workspaces (
            id,
            name,
            owner_id,
            created_at
          )
        `)
        .eq('user_id', user.id);

      if (error) {
        return { data: null, error: error.message };
      }

      type RowType = {
        workspace_id: string;
        role: WorkspaceRole;
        workspaces: {
          id: string;
          name: string;
          owner_id: string;
          created_at: string;
        } | null;
      };

      const rows = (data || []) as unknown as RowType[];

      const workspaces: WorkspaceWithRole[] = rows
        .filter((row) => row.workspaces !== null)
        .map((row) => ({
          id: row.workspaces!.id,
          name: row.workspaces!.name,
          ownerId: row.workspaces!.owner_id,
          createdAt: row.workspaces!.created_at,
          role: row.role,
        }));

      return { data: workspaces, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch workspaces' };
    }
  },

  /**
   * Create a new workspace and make the user its owner.
   */
  async createWorkspace(name: string): Promise<{ data: string | null; error: string | null }> {
    try {
      const { data, error } = await supabase.rpc('create_workspace', {
        name: name.trim(),
      });

      if (error) {
        return { data: null, error: error.message };
      }

      return { data: data as string, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to create workspace' };
    }
  },

  /**
   * Rename a workspace (owner or admin only).
   */
  async renameWorkspace(workspaceId: string, newName: string): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ name: newName.trim() })
        .eq('id', workspaceId);

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to rename workspace' };
    }
  },

  /**
   * Delete a workspace (owner only).
   */
  async deleteWorkspace(workspaceId: string): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', workspaceId);

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to delete workspace' };
    }
  },

  /**
   * List all members of a workspace with profile details.
   */
  async listWorkspaceMembers(workspaceId: string): Promise<{ data: WorkspaceMemberInfo[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select(`
          workspace_id,
          user_id,
          role,
          created_at,
          profiles (
            display_name,
            avatar_url
          )
        `)
        .eq('workspace_id', workspaceId);

      if (error) {
        return { data: null, error: error.message };
      }

      type MemberRowType = {
        workspace_id: string;
        user_id: string;
        role: WorkspaceRole;
        created_at: string;
        profiles: {
          display_name: string | null;
          avatar_url: string | null;
        } | null;
      };

      const rows = (data || []) as unknown as MemberRowType[];

      const members: WorkspaceMemberInfo[] = rows.map((row) => ({
        workspaceId: row.workspace_id,
        userId: row.user_id,
        role: row.role,
        email: row.profiles?.display_name ? `${row.profiles.display_name}` : 'member@flowforge.dev',
        displayName: row.profiles?.display_name || 'FlowForge Member',
        avatarUrl: row.profiles?.avatar_url,
        createdAt: row.created_at,
      }));

      return { data: members, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to list members' };
    }
  },

  /**
   * Invite / add an existing user to workspace by email.
   */
  async addMemberByEmail(
    workspaceId: string,
    email: string,
    role: WorkspaceRole
  ): Promise<{ data: unknown; error: string | null }> {
    try {
      const { data, error } = await supabase.rpc('add_workspace_member_by_email', {
        target_workspace_id: workspaceId,
        target_email: email.trim().toLowerCase(),
        member_role: role,
      });

      if (error) {
        return { data: null, error: error.message };
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to add workspace member' };
    }
  },

  /**
   * Update a member's role (owner or admin only).
   */
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    newRole: WorkspaceRole
  ): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase.rpc('update_workspace_member_role', {
        target_workspace_id: workspaceId,
        target_user_id: userId,
        new_role: newRole,
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to update member role' };
    }
  },

  /**
   * Remove a member or leave workspace.
   */
  async removeMember(workspaceId: string, userId: string): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId);

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to remove member' };
    }
  },
};
