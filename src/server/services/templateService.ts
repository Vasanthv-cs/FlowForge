import { getSupabaseAdminClient } from '../supabase.ts';
import {
  STARTER_WORKFLOW_TEMPLATES,
  validateWorkflowTemplate,
  type WorkflowTemplate,
  type TemplateValidationReport,
} from '@flowforge/workflow-schema';
import { redactSensitiveData } from '@flowforge/shared';

export interface ListTemplatesOptions {
  category?: string;
  search?: string;
}

export class TemplateService {
  /**
   * Lists available workflow templates: starter templates + workspace private templates.
   */
  async listTemplates(
    workspaceId: string,
    options: ListTemplatesOptions = {}
  ): Promise<WorkflowTemplate[]> {
    const supabase = getSupabaseAdminClient();

    // 1. Fetch workspace private templates
    let query = supabase
      .from('workflow_templates')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (options.category && options.category !== 'all') {
      query = query.eq('category', options.category);
    }

    const { data: dbTemplates, error } = await query;
    if (error) {
      throw new Error(`Failed to list workspace templates: ${error.message}`);
    }

    const privateTemplates: WorkflowTemplate[] = (dbTemplates || []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description || '',
      category: t.category,
      icon: t.icon || 'Workflow',
      color: t.color || '#6366f1',
      requiredConfig: (t.required_config as string[]) || [],
      requiredEnvVars: (t.required_env_vars as string[]) || [],
      definition: t.definition,
      isWorkspaceTemplate: true,
      workspaceId: t.workspace_id,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    // 2. Filter starter templates
    let starters = [...STARTER_WORKFLOW_TEMPLATES];
    if (options.category && options.category !== 'all') {
      starters = starters.filter((s) => s.category === options.category);
    }

    const combined = [...starters, ...privateTemplates];

    // 3. Search filter
    if (options.search && options.search.trim()) {
      const q = options.search.toLowerCase().trim();
      return combined.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      );
    }

    return combined;
  }

  /**
   * Retrieves a single template by ID.
   */
  async getTemplate(workspaceId: string, templateId: string): Promise<WorkflowTemplate | null> {
    const starter = STARTER_WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (starter) return starter;

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('workflow_templates')
      .select('*')
      .eq('id', templateId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      category: data.category,
      icon: data.icon || 'Workflow',
      color: data.color || '#6366f1',
      requiredConfig: (data.required_config as string[]) || [],
      requiredEnvVars: (data.required_env_vars as string[]) || [],
      definition: data.definition,
      isWorkspaceTemplate: true,
      workspaceId: data.workspace_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Validates and saves a workflow as a private workspace template.
   */
  async createWorkspaceTemplate(
    workspaceId: string,
    templateData: {
      name: string;
      description?: string;
      category?: string;
      icon?: string;
      color?: string;
      definition: unknown;
      requiredConfig?: string[];
      requiredEnvVars?: string[];
    },
    userId?: string
  ): Promise<{ template: WorkflowTemplate; validation: TemplateValidationReport }> {
    const candidateTemplate = {
      id: 'candidate-id',
      name: templateData.name,
      description: templateData.description || '',
      category: templateData.category || 'general',
      icon: templateData.icon || 'Workflow',
      color: templateData.color || '#6366f1',
      requiredConfig: templateData.requiredConfig || [],
      requiredEnvVars: templateData.requiredEnvVars || [],
      definition: templateData.definition,
      isWorkspaceTemplate: true,
      workspaceId,
    };

    const validation = validateWorkflowTemplate(candidateTemplate);
    if (!validation.isValid) {
      const err = new Error(`Template validation failed: ${validation.errors.join(' | ')}`);
      (err as { statusCode?: number }).statusCode = 400;
      throw err;
    }

    const sanitizedDefinition = redactSensitiveData(templateData.definition);

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('workflow_templates')
      .insert({
        workspace_id: workspaceId,
        name: templateData.name,
        description: templateData.description || '',
        category: templateData.category || 'general',
        icon: templateData.icon || 'Workflow',
        color: templateData.color || '#6366f1',
        definition: sanitizedDefinition,
        required_config: validation.requiredConfig,
        required_env_vars: validation.requiredEnvVars,
        created_by: userId || null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to save workspace template: ${error?.message || 'Database error'}`);
    }

    const saved: WorkflowTemplate = {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      icon: data.icon,
      color: data.color,
      requiredConfig: data.required_config,
      requiredEnvVars: data.required_env_vars,
      definition: data.definition,
      isWorkspaceTemplate: true,
      workspaceId: data.workspace_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return { template: saved, validation };
  }

  /**
   * Deletes a private workspace template.
   */
  async deleteWorkspaceTemplate(workspaceId: string, templateId: string): Promise<boolean> {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('workflow_templates')
      .delete()
      .eq('id', templateId)
      .eq('workspace_id', workspaceId);

    if (error) {
      throw new Error(`Failed to delete workspace template: ${error.message}`);
    }
    return true;
  }
}

export const templateService = new TemplateService();
