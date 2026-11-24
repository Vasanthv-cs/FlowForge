import fs from 'node:fs';
import path from 'node:path';
import { loadCliConfig, exitOrThrow } from '../config';
import { CliApiClient } from '../api';
import { redactSensitiveData } from '@flowforge/shared';

export interface WorkflowPullOptions {
  workspace?: string;
  out?: string;
}

export async function workflowPullCommand(
  workflowId: string,
  options: WorkflowPullOptions,
  client: CliApiClient = new CliApiClient()
): Promise<void> {
  const config = loadCliConfig();
  const workspaceId = options.workspace || config.activeWorkspaceId;

  if (!workspaceId) {
    exitOrThrow('Error: Workspace ID is required. Pass --workspace <id> or configure with "flowforge login".');
  }

  if (!workflowId) {
    exitOrThrow('Error: Workflow ID is required. Usage: flowforge workflow pull <workflow-id>');
  }

  const response = await client.request<{ workflow: { id: string; name: string; definition: unknown } }>(
    `/api/workspaces/${workspaceId}/workflows/${workflowId}`
  );

  const wf = response.workflow;
  if (!wf) {
    exitOrThrow(`Error: Workflow "${workflowId}" not found in workspace.`);
  }

  const cleanDefinition = redactSensitiveData(wf.definition);
  const outPath = options.out || path.join(process.cwd(), `${wf.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);

  fs.writeFileSync(outPath, JSON.stringify(cleanDefinition, null, 2), 'utf8');

  console.log(`✓ Pulled workflow "${wf.name}" (${wf.id})`);
  console.log(`  Saved to: ${outPath}`);
}
