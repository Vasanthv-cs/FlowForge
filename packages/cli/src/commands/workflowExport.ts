import fs from 'node:fs';
import path from 'node:path';
import { loadCliConfig, exitOrThrow } from '../config';
import { CliApiClient } from '../api';
import { redactSensitiveData } from '@flowforge/shared';

export interface WorkflowExportOptions {
  workspace?: string;
  out?: string;
  output?: string;
}

export async function workflowExportCommand(
  workflowId: string,
  options: WorkflowExportOptions,
  client: CliApiClient = new CliApiClient()
): Promise<void> {
  const config = loadCliConfig();
  const workspaceId = options.workspace || config.activeWorkspaceId;

  if (!workspaceId) {
    exitOrThrow('Error: Workspace ID is required. Pass --workspace <id> or configure with "flowforge login".');
  }

  if (!workflowId) {
    exitOrThrow('Error: Workflow ID is required. Usage: flowforge workflow export <workflow-id> [--out <file.json>]');
  }

  const response = await client.request<{ workflow: { id: string; name: string; definition: unknown } }>(
    `/api/workspaces/${workspaceId}/workflows/${workflowId}`
  );

  const wf = response.workflow;
  if (!wf) {
    exitOrThrow(`Error: Workflow "${workflowId}" not found in workspace.`);
  }

  const safeData = redactSensitiveData(wf.definition);
  const outPath =
    options.output ||
    options.out ||
    path.join(process.cwd(), `${wf.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.export.json`);

  const dir = path.dirname(path.resolve(outPath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(safeData, null, 2), 'utf8');

  console.log(`✓ Exported workflow "${wf.name}" (${wf.id}) without secrets.`);
  console.log(`  File: ${outPath}`);
}
