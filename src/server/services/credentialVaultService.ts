import { getSupabaseAdminClient } from '../supabase.ts';
import { encryptSecret, decryptSecret } from '../crypto/encryption.ts';
import type { CredentialType, CredentialMetadata } from '@flowforge/workflow-schema';

export interface ApiKeyData {
  apiKey: string;
  headerName?: string;
}

export interface BearerTokenData {
  token: string;
}

export interface BasicAuthData {
  username: string;
  password: string;
}

export interface CustomHeadersData {
  headers: Record<string, string>;
}

export type CredentialSecretData =
  | ApiKeyData
  | BearerTokenData
  | BasicAuthData
  | CustomHeadersData;

export interface CreateCredentialInput {
  name: string;
  description?: string | null;
  credentialType: CredentialType;
  data: CredentialSecretData;
}

export interface UpdateCredentialInput {
  name?: string;
  description?: string | null;
  data?: CredentialSecretData;
}

export interface ResolvedCredential {
  id: string;
  workspaceId: string;
  name: string;
  credentialType: CredentialType;
  data: CredentialSecretData;
}

/**
 * Validates the secret payload structure for a specific credential type.
 */
export function validateCredentialSecretData(type: CredentialType, data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Credential secret data must be an object.');
  }

  const obj = data as Record<string, unknown>;

  switch (type) {
    case 'api_key': {
      if (typeof obj.apiKey !== 'string' || !obj.apiKey.trim()) {
        throw new Error('API Key credential requires a non-empty "apiKey" string.');
      }
      if (obj.headerName !== undefined && (typeof obj.headerName !== 'string' || !obj.headerName.trim())) {
        throw new Error('API Key "headerName" must be a non-empty string when provided.');
      }
      break;
    }
    case 'bearer_token': {
      if (typeof obj.token !== 'string' || !obj.token.trim()) {
        throw new Error('Bearer Token credential requires a non-empty "token" string.');
      }
      break;
    }
    case 'basic_auth': {
      if (typeof obj.username !== 'string' || !obj.username.trim()) {
        throw new Error('Basic Auth credential requires a non-empty "username" string.');
      }
      if (typeof obj.password !== 'string') {
        throw new Error('Basic Auth credential requires a "password" string.');
      }
      break;
    }
    case 'custom_headers': {
      if (!obj.headers || typeof obj.headers !== 'object' || Array.isArray(obj.headers)) {
        throw new Error('Custom Headers credential requires a "headers" key-value object.');
      }
      for (const [k, v] of Object.entries(obj.headers)) {
        if (typeof k !== 'string' || !k.trim() || typeof v !== 'string') {
          throw new Error(`Invalid custom header: "${k}". Keys and values must be non-empty strings.`);
        }
      }
      break;
    }
    default: {
      throw new Error(`Unsupported credential type: "${type as string}".`);
    }
  }
}

/**
 * Maps database row to safe CredentialMetadata, guaranteeing no cipher or plaintext exposure.
 */
export function mapCredentialMetadata(row: Record<string, unknown>): CredentialMetadata {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    description: (row.description as string) || null,
    credentialType: row.credential_type as CredentialType,
    keyVersion: (row.key_version as string) || 'v1',
    createdBy: (row.created_by as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class CredentialVaultService {
  /**
   * Creates a new credential in the workspace vault.
   * Encrypts secret data with AES-256-GCM before persisting.
   * Returns only safe metadata.
   */
  async createCredential(
    workspaceId: string,
    userId: string | null,
    input: CreateCredentialInput
  ): Promise<CredentialMetadata> {
    if (!input.name || !input.name.trim()) {
      const err = new Error('Credential name is required.');
      (err as { statusCode?: number }).statusCode = 400;
      throw err;
    }

    validateCredentialSecretData(input.credentialType, input.data);

    // Encrypt payload JSON
    const plaintext = JSON.stringify(input.data);
    const { encryptedData, iv, authTag, keyVersion } = encryptSecret(plaintext);

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('credentials')
      .insert({
        workspace_id: workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        credential_type: input.credentialType,
        encrypted_data: encryptedData,
        iv,
        auth_tag: authTag,
        key_version: keyVersion,
        created_by: userId,
      })
      .select('id, workspace_id, name, description, credential_type, key_version, created_by, created_at, updated_at')
      .single();

    if (error || !data) {
      throw new Error(`Failed to store credential: ${error?.message || 'Database insert error'}`);
    }

    return mapCredentialMetadata(data as Record<string, unknown>);
  }

  /**
   * Lists all credentials for a workspace.
   * Returns safe metadata only (no secret values or cipher blobs).
   */
  async listCredentials(workspaceId: string): Promise<CredentialMetadata[]> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('credentials')
      .select('id, workspace_id, name, description, credential_type, key_version, created_by, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list credentials: ${error.message}`);
    }

    return (data || []).map((row) => mapCredentialMetadata(row as Record<string, unknown>));
  }

  /**
   * Retrieves single credential metadata by ID and workspace.
   */
  async getCredentialMetadata(workspaceId: string, credentialId: string): Promise<CredentialMetadata> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('credentials')
      .select('id, workspace_id, name, description, credential_type, key_version, created_by, created_at, updated_at')
      .eq('id', credentialId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get credential metadata: ${error.message}`);
    }

    if (!data) {
      const err = new Error(`Credential "${credentialId}" not found in workspace.`);
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    return mapCredentialMetadata(data as Record<string, unknown>);
  }

  /**
   * Updates an existing credential (name, description, or secret rotation).
   */
  async updateCredential(
    workspaceId: string,
    credentialId: string,
    input: UpdateCredentialInput
  ): Promise<CredentialMetadata> {
    const existing = await this.getCredentialMetadata(workspaceId, credentialId);

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) {
      if (!input.name.trim()) {
        const err = new Error('Credential name cannot be empty.');
        (err as { statusCode?: number }).statusCode = 400;
        throw err;
      }
      updatePayload.name = input.name.trim();
    }

    if (input.description !== undefined) {
      updatePayload.description = input.description ? input.description.trim() : null;
    }

    // If rotating the secret data
    if (input.data !== undefined) {
      validateCredentialSecretData(existing.credentialType, input.data);
      const plaintext = JSON.stringify(input.data);
      const { encryptedData, iv, authTag, keyVersion } = encryptSecret(plaintext);
      updatePayload.encrypted_data = encryptedData;
      updatePayload.iv = iv;
      updatePayload.auth_tag = authTag;
      updatePayload.key_version = keyVersion;
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('credentials')
      .update(updatePayload)
      .eq('id', credentialId)
      .eq('workspace_id', workspaceId)
      .select('id, workspace_id, name, description, credential_type, key_version, created_by, created_at, updated_at')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update credential: ${error?.message || 'Database update error'}`);
    }

    return mapCredentialMetadata(data as Record<string, unknown>);
  }

  /**
   * Deletes a credential from the workspace vault.
   */
  async deleteCredential(workspaceId: string, credentialId: string): Promise<boolean> {
    // Verify existence first
    await this.getCredentialMetadata(workspaceId, credentialId);

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('credentials')
      .delete()
      .eq('id', credentialId)
      .eq('workspace_id', workspaceId);

    if (error) {
      throw new Error(`Failed to delete credential: ${error.message}`);
    }

    return true;
  }

  /**
   * Resolves and decrypts a credential in backend memory for workflow execution.
   * Strictly enforces workspace tenancy. Never expose to client API routes.
   */
  async resolveCredentialForExecution(workspaceId: string, credentialId: string): Promise<ResolvedCredential> {
    if (!workspaceId || !credentialId) {
      throw new Error('Both workspaceId and credentialId are required to resolve a credential.');
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('credentials')
      .select('id, workspace_id, name, credential_type, encrypted_data, iv, auth_tag, key_version')
      .eq('id', credentialId)
      .maybeSingle();

    if (error) {
      throw new Error(`Error resolving credential for execution: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Credential with ID "${credentialId}" does not exist.`);
    }

    // Strict Cross-Workspace Access Prevention
    if (data.workspace_id !== workspaceId) {
      throw new Error(
        `Cross-workspace credential access rejected: Credential "${credentialId}" does not belong to workspace "${workspaceId}".`
      );
    }

    // Decrypt secret
    const decryptedJson = decryptSecret(
      data.encrypted_data,
      data.iv,
      data.auth_tag,
      data.key_version
    );

    let parsedSecret: CredentialSecretData;
    try {
      parsedSecret = JSON.parse(decryptedJson) as CredentialSecretData;
    } catch (err) {
      throw new Error(`Corrupted secret data for credential "${credentialId}".`, { cause: err });
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      name: data.name,
      credentialType: data.credential_type as CredentialType,
      data: parsedSecret,
    };
  }
}

export const credentialVaultService = new CredentialVaultService();
