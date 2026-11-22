import { supabase } from '@/lib/supabase';
import type { SavedWorkflow } from '@/store/persistence';

export interface CloudWorkflowSummary {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  nodeCount: number;
  edgeCount: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorkflowRecord extends CloudWorkflowSummary {
  definition: SavedWorkflow;
}

export interface CloudWorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: number;
  name?: string | null;
  definition: SavedWorkflow;
  createdBy?: string | null;
  createdAt: string;
}

export function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const cloudWorkflowService = {
  /**
   * List workflows belonging to a specific workspace.
   */
  async listWorkflows(workspaceId: string): Promise<{ data: CloudWorkflowSummary[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('id, workspace_id, name, description, definition, created_by, updated_by, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false });

      if (error) {
        return { data: null, error: error.message };
      }

      const summaries: CloudWorkflowSummary[] = (data || []).map((row) => {
        const def = (row.definition as SavedWorkflow) || { nodes: [], edges: [] };
        return {
          id: row.id,
          workspaceId: row.workspace_id,
          name: row.name,
          description: row.description,
          nodeCount: Array.isArray(def.nodes) ? def.nodes.length : 0,
          edgeCount: Array.isArray(def.edges) ? def.edges.length : 0,
          createdBy: row.created_by,
          updatedBy: row.updated_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });

      return { data: summaries, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to list workflows' };
    }
  },

  /**
   * Get complete workflow with JSONB definition.
   */
  async getWorkflow(workflowId: string): Promise<{ data: CloudWorkflowRecord | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (error || !data) {
        return { data: null, error: error?.message || 'Workflow not found' };
      }

      const def = data.definition as SavedWorkflow;
      return {
        data: {
          id: data.id,
          workspaceId: data.workspace_id,
          name: data.name,
          description: data.description,
          definition: def,
          nodeCount: def.nodes?.length || 0,
          edgeCount: def.edges?.length || 0,
          createdBy: data.created_by,
          updatedBy: data.updated_by,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        error: null,
      };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch workflow' };
    }
  },

  /**
   * Create a new workflow in the specified workspace.
   */
  async createWorkflow(
    workspaceId: string,
    name: string,
    definition: SavedWorkflow
  ): Promise<{ data: string | null; error: string | null }> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const newId = isUUID(definition.id) ? definition.id : generateUUID();
      const updatedDefinition: SavedWorkflow = {
        ...definition,
        id: newId,
        name: name.trim(),
        updatedAt: Date.now(),
      };

      const { data, error } = await supabase
        .from('workflows')
        .insert({
          id: newId,
          workspace_id: workspaceId,
          name: name.trim(),
          definition: updatedDefinition as unknown as Record<string, unknown>,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select('id')
        .single();

      if (error || !data) {
        return { data: null, error: error?.message || 'Failed to create workflow' };
      }

      return { data: data.id, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to create workflow' };
    }
  },

  /**
   * Save / update an existing workflow.
   */
  async saveWorkflow(
    workflowId: string,
    name: string,
    definition: SavedWorkflow
  ): Promise<{ error: string | null }> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const updatedDefinition: SavedWorkflow = {
        ...definition,
        id: workflowId,
        name: name.trim(),
        updatedAt: Date.now(),
      };

      const { error } = await supabase
        .from('workflows')
        .update({
          name: name.trim(),
          definition: updatedDefinition as unknown as Record<string, unknown>,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to save workflow' };
    }
  },

  /**
   * Rename a workflow.
   */
  async renameWorkflow(workflowId: string, newName: string): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase
        .from('workflows')
        .update({
          name: newName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to rename workflow' };
    }
  },

  /**
   * Delete a workflow.
   */
  async deleteWorkflow(workflowId: string): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase
        .from('workflows')
        .delete()
        .eq('id', workflowId);

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to delete workflow' };
    }
  },

  /**
   * List all versions of a workflow.
   */
  async listVersions(workflowId: string): Promise<{ data: CloudWorkflowVersion[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('workflow_versions')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('version_number', { ascending: false });

      if (error) {
        return { data: null, error: error.message };
      }

      const versions: CloudWorkflowVersion[] = (data || []).map((row) => ({
        id: row.id,
        workflowId: row.workflow_id,
        versionNumber: row.version_number,
        name: row.name,
        definition: row.definition as SavedWorkflow,
        createdBy: row.created_by,
        createdAt: row.created_at,
      }));

      return { data: versions, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to list versions' };
    }
  },

  /**
   * Create an immutable version snapshot.
   */
  async createVersion(
    workflowId: string,
    versionTag: string,
    definition: SavedWorkflow
  ): Promise<{ data: CloudWorkflowVersion | null; error: string | null }> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Determine next version_number
      const { data: latest } = await supabase
        .from('workflow_versions')
        .select('version_number')
        .eq('workflow_id', workflowId)
        .order('version_number', { ascending: false })
        .limit(1);

      const nextVersionNumber = latest && latest.length > 0 ? latest[0].version_number + 1 : 1;
      const versionId = generateUUID();

      const { data, error } = await supabase
        .from('workflow_versions')
        .insert({
          id: versionId,
          workflow_id: workflowId,
          version_number: nextVersionNumber,
          name: versionTag.trim() || `v${nextVersionNumber}.0`,
          definition: definition as unknown as Record<string, unknown>,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single();

      if (error || !data) {
        return { data: null, error: error?.message || 'Failed to create version snapshot' };
      }

      return {
        data: {
          id: data.id,
          workflowId: data.workflow_id,
          versionNumber: data.version_number,
          name: data.name,
          definition: data.definition as SavedWorkflow,
          createdBy: data.created_by,
          createdAt: data.created_at,
        },
        error: null,
      };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to create version snapshot' };
    }
  },
};
