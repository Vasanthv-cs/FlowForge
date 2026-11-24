import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface CliConfig {
  apiUrl: string;
  token?: string;
  activeWorkspaceId?: string;
}

export type CliConfigFile = {
  apiUrl?: string;
  token?: string;
  defaultWorkspace?: string;
  activeWorkspaceId?: string;
};

const DEFAULT_CONFIG: CliConfig = {
  apiUrl: 'http://localhost:3001',
};

export function getCliConfigDir(): string {
  return path.join(os.homedir(), '.flowforge');
}

export function getCliConfigPath(): string {
  return path.join(getCliConfigDir(), 'config.json');
}

export function exitOrThrow(message: string, code = 1): never {
  if (process.env.NODE_ENV === 'test') {
    throw new Error(message);
  }
  console.error(message);
  process.exit(code);
}

/**
 * Loads CLI configuration from ~/.flowforge/config.json with environment variable fallbacks.
 */
export function loadCliConfig(customPath?: string): CliConfig {
  const configPath = customPath || getCliConfigPath();
  let fileConfig: Partial<CliConfigFile> = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(raw);
    } catch {
      // Ignore corrupted config and fall back to defaults
    }
  }

  const workspace =
    process.env.FLOWFORGE_WORKSPACE ||
    fileConfig.activeWorkspaceId ||
    fileConfig.defaultWorkspace;

  return {
    apiUrl: process.env.FLOWFORGE_API_URL || fileConfig.apiUrl || DEFAULT_CONFIG.apiUrl,
    token: process.env.FLOWFORGE_TOKEN || fileConfig.token,
    activeWorkspaceId: workspace,
  };
}

/**
 * Saves CLI configuration to ~/.flowforge/config.json with restrictive permissions (0600).
 */
export function saveCliConfig(newConfig: Partial<CliConfigFile>, customPath?: string): CliConfig {
  const configPath = customPath || getCliConfigPath();
  const current = loadCliConfig(configPath);
  const workspace =
    newConfig.activeWorkspaceId !== undefined
      ? newConfig.activeWorkspaceId
      : newConfig.defaultWorkspace !== undefined
      ? newConfig.defaultWorkspace
      : current.activeWorkspaceId;

  const merged: CliConfig = {
    apiUrl: newConfig.apiUrl || current.apiUrl || DEFAULT_CONFIG.apiUrl,
    token: newConfig.token !== undefined ? newConfig.token : current.token,
    activeWorkspaceId: workspace,
  };

  const fileData: CliConfigFile = {
    apiUrl: merged.apiUrl,
    token: merged.token,
    defaultWorkspace: merged.activeWorkspaceId,
    activeWorkspaceId: merged.activeWorkspaceId,
  };

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(fileData, null, 2), {
    mode: 0o600, // Read/write only by owner
  });

  return merged;
}

export function getEffectiveCliConfig(
  options: { url?: string; token?: string; workspace?: string } = {},
  customPath?: string
): { apiUrl: string; token?: string; workspaceId?: string } {
  const fileConfig = loadCliConfig(customPath);
  return {
    apiUrl: options.url || process.env.FLOWFORGE_API_URL || fileConfig.apiUrl || DEFAULT_CONFIG.apiUrl,
    token: options.token || process.env.FLOWFORGE_TOKEN || fileConfig.token,
    workspaceId: options.workspace || process.env.FLOWFORGE_WORKSPACE || fileConfig.activeWorkspaceId,
  };
}

/**
 * Safely masks a token for terminal output. Never logs full tokens.
 */
export function maskToken(token?: string): string {
  if (!token) return '(not set)';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
