import { saveCliConfig, loadCliConfig, maskToken, exitOrThrow } from '../config';
import { CliApiClient } from '../api';

export interface LoginOptions {
  token?: string;
  url?: string;
  workspace?: string;
}

export async function loginCommand(options: LoginOptions): Promise<void> {
  const current = loadCliConfig();

  const apiUrl = options.url || current.apiUrl;
  const token = options.token || current.token;
  const workspaceId = options.workspace || current.activeWorkspaceId;

  if (!token) {
    exitOrThrow('Error: Token is required. Use --token <jwt_token>');
  }

  // Verify connection and credentials
  const client = new CliApiClient({ apiUrl, token });

  try {
    const health = await client.request<{ status: string; version?: string }>('/health');
    console.log(`✓ Connected to FlowForge API at ${apiUrl} (${health.status || 'OK'})`);
  } catch (err) {
    console.warn(`Warning: Could not verify API health at ${apiUrl}: ${(err as Error).message}`);
  }

  // Save config
  saveCliConfig({
    apiUrl,
    token,
    activeWorkspaceId: workspaceId,
  });

  console.log('✓ Successfully authenticated FlowForge CLI.');
  console.log(`  API URL:   ${apiUrl}`);
  console.log(`  Token:     ${maskToken(token)}`);
  if (workspaceId) {
    console.log(`  Workspace: ${workspaceId}`);
  }
}
