import { loadCliConfig, exitOrThrow } from '../config';
import { CliApiClient } from '../api';

export interface WorkflowListOptions {
  workspace?: string;
  json?: boolean;
}

export async function workflowListCommand(
  options: WorkflowListOptions,
  client: CliApiClient = new CliApiClient()
): Promise<void> {
  const config = loadCliConfig();
  const workspaceId = options.workspace || config.activeWorkspaceId;

  if (!workspaceId) {
    exitOrThrow('Error: Workspace ID is required. Pass --workspace <id> or set default via "flowforge login --workspace <id>".');
  }

  const response = await client.request<{ workflows: Array<{ id: string; name: string; updated_at?: string; created_at?: string }> }>(
    `/api/workspaces/${workspaceId}/workflows`
  );

  const workflows = response.workflows || [];

  if (options.json) {
    console.log(JSON.stringify(workflows, null, 2));
    return;
  }

  if (workflows.length === 0) {
    console.log(`No workflows found in workspace ${workspaceId}.`);
    return;
  }

  console.log(`Workflows in workspace ${workspaceId} (${workflows.length}):\n`);
  console.log('ID                                    | NAME                                    | UPDATED');
  console.log('--------------------------------------+-----------------------------------------+-------------------------');

  for (const wf of workflows) {
    const idPad = wf.id.padEnd(36);
    const namePad = (wf.name.length > 39 ? wf.name.slice(0, 36) + '...' : wf.name).padEnd(39);
    const date = wf.updated_at ? new Date(wf.updated_at).toLocaleString() : '—';
    console.log(`${idPad} | ${namePad} | ${date}`);
  }
}
