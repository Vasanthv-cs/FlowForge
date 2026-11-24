import fs from 'node:fs';
import path from 'node:path';
import { loadCliConfig, exitOrThrow } from '../config';
import { CliApiClient } from '../api';
import { validateImportedWorkflow, type SavedWorkflow } from '@flowforge/workflow-schema';
import { validateWorkflowEnvironment } from '@flowforge/workflow-core';
import { redactSensitiveData } from '@flowforge/shared';

export interface WorkflowPushOptions {
  workspace?: string;
  overwrite?: boolean;
  force?: boolean;
}

export async function workflowPushCommand(
  filePath: string,
  options: WorkflowPushOptions,
  client: CliApiClient = new CliApiClient()
): Promise<void> {
  const config = loadCliConfig();
  const workspaceId = options.workspace || config.activeWorkspaceId;

  if (!workspaceId) {
    exitOrThrow('Error: Workspace ID is required. Pass --workspace <id> or configure with "flowforge login".');
  }

  if (!filePath) {
    exitOrThrow('Error: File path is required. Usage: flowforge workflow push <file.json>');
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    exitOrThrow(`Error: File not found at ${resolvedPath}`);
  }

  let rawJson: unknown;
  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    rawJson = JSON.parse(content);
  } catch (err) {
    exitOrThrow(`Error: Invalid JSON file: ${(err as Error).message}`);
  }

  // 1. Validate Schema
  const validation = validateImportedWorkflow<SavedWorkflow>(rawJson);
  if (!validation.success || !validation.data) {
    exitOrThrow(`Error: Workflow schema validation failed:\n  ${validation.error}`);
  }

  const workflow = validation.data;

  // 2. Environment Variables Check
  const envReport = validateWorkflowEnvironment(workflow, process.env);
  if (envReport.requiredVars.length > 0) {
    console.log(`Environment variables used by workflow (${envReport.requiredVars.length}):`);
    for (const v of envReport.requiredVars) {
      const isMissing = envReport.missingVars.includes(v);
      console.log(`  ${isMissing ? '⚠️' : '✓'} ${v} ${isMissing ? '(Missing in current environment)' : '(Configured)'}`);
    }
  }

  // 3. Check for existing workflows to prevent accidental overwrite
  const existingList = await client.request<{ workflows: Array<{ id: string; name: string }> }>(
    `/api/workspaces/${workspaceId}/workflows`
  );

  const existingMatch = (existingList.workflows || []).find(
    (w) => w.id === workflow.id || w.name.toLowerCase() === workflow.name.toLowerCase()
  );

  const allowOverwrite = Boolean(options.overwrite || options.force);

  if (existingMatch && !allowOverwrite) {
    exitOrThrow(
      `Conflict Error: Workflow "${workflow.name}" already exists in workspace (ID: ${existingMatch.id}).\n` +
      `To safely overwrite this workflow, re-run with --overwrite or --force:\n` +
      `  flowforge workflow push "${filePath}" --overwrite\n`
    );
  }

  // 4. Sanitize Secrets Before Upload
  const safeDefinition = redactSensitiveData(workflow);

  if (existingMatch && allowOverwrite) {
    // Update existing workflow
    await client.request(`/api/workspaces/${workspaceId}/workflows/${existingMatch.id}`, {
      method: 'PUT',
      body: {
        name: workflow.name,
        definition: safeDefinition,
      },
    });

    console.log(`\n✓ Successfully updated workflow "${workflow.name}" (${existingMatch.id}) in workspace ${workspaceId}.`);
  } else {
    // Create new workflow
    const created = await client.request<{ workflow: { id: string; name: string } }>(
      `/api/workspaces/${workspaceId}/workflows`,
      {
        method: 'POST',
        body: {
          name: workflow.name,
          definition: safeDefinition,
        },
      }
    );

    console.log(`\n✓ Successfully pushed new workflow "${workflow.name}" (ID: ${created.workflow.id}) to workspace ${workspaceId}.`);
  }
}
