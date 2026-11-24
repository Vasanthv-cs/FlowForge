import { supabase } from '@/lib/supabase';
import {
  STARTER_WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
  type TemplateValidationReport,
} from '@flowforge/workflow-schema';

export interface ListTemplatesParams {
  category?: string;
  search?: string;
}

export const templateClientService = {
  /**
   * List templates: pulls starter templates and workspace private templates from backend.
   */
  async listTemplates(
    workspaceId?: string | null,
    params: ListTemplatesParams = {}
  ): Promise<{ data: WorkflowTemplate[]; error: string | null }> {
    try {
      if (!workspaceId) {
        // Fall back to starter templates if not in cloud workspace
        let starters = [...STARTER_WORKFLOW_TEMPLATES];
        if (params.category && params.category !== 'all') {
          starters = starters.filter((t) => t.category === params.category);
        }
        if (params.search && params.search.trim()) {
          const q = params.search.toLowerCase().trim();
          starters = starters.filter(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              t.description.toLowerCase().includes(q) ||
              t.category.toLowerCase().includes(q)
          );
        }
        return { data: starters, error: null };
      }

      const session = (await supabase.auth.getSession()).data.session;
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const queryParts: string[] = [];
      if (params.category && params.category !== 'all') {
        queryParts.push(`category=${encodeURIComponent(params.category)}`);
      }
      if (params.search && params.search.trim()) {
        queryParts.push(`search=${encodeURIComponent(params.search.trim())}`);
      }
      const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/templates${qs}`, {
        headers,
      });

      if (!res.ok) {
        // Fallback to starters if offline or endpoint error
        return { data: STARTER_WORKFLOW_TEMPLATES, error: null };
      }

      const json = await res.json();
      return { data: json.templates || STARTER_WORKFLOW_TEMPLATES, error: null };
    } catch {
      return { data: STARTER_WORKFLOW_TEMPLATES, error: null };
    }
  },

  /**
   * Saves current workflow as a private workspace template.
   */
  async saveAsWorkspaceTemplate(
    workspaceId: string,
    templateData: {
      name: string;
      description?: string;
      category?: string;
      definition: unknown;
    }
  ): Promise<{ data: WorkflowTemplate | null; validation?: TemplateValidationReport; error: string | null }> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) {
        return { data: null, error: 'Sign in to save private workspace templates.' };
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(templateData),
      });

      const json = await res.json();
      if (!res.ok) {
        return { data: null, error: json.message || 'Failed to save template.' };
      }

      return { data: json.template, validation: json.validation, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Network error' };
    }
  },

  /**
   * Deletes a private workspace template.
   */
  async deleteWorkspaceTemplate(
    workspaceId: string,
    templateId: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) {
        return { success: false, error: 'Authentication required.' };
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/templates/${templateId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const json = await res.json();
        return { success: false, error: json.message || 'Failed to delete template.' };
      }

      return { success: true, error: null };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  },
};
