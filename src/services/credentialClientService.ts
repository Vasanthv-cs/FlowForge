import { supabase } from '@/lib/supabase';
import type { CredentialType, CredentialMetadata } from '@flowforge/workflow-schema';
import type { CredentialSecretData } from '@/server/services/credentialVaultService';

export interface ClientCreateCredentialInput {
  name: string;
  description?: string | null;
  credentialType: CredentialType;
  data: CredentialSecretData;
}

export interface ClientUpdateCredentialInput {
  name?: string;
  description?: string | null;
  data?: CredentialSecretData;
}

export const credentialClientService = {
  /**
   * Helper to execute API requests with Supabase JWT bearer token
   */
  async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };

    return fetch(url, { ...options, headers });
  },

  async listCredentials(workspaceId: string): Promise<CredentialMetadata[]> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/credentials`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to list credentials');
    }
    const data = await res.json();
    return data.data || [];
  },

  async getCredential(workspaceId: string, credentialId: string): Promise<CredentialMetadata> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/credentials/${credentialId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to get credential metadata');
    }
    const data = await res.json();
    return data.data;
  },

  async createCredential(
    workspaceId: string,
    input: ClientCreateCredentialInput
  ): Promise<CredentialMetadata> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/credentials`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create credential');
    }
    const data = await res.json();
    return data.data;
  },

  async updateCredential(
    workspaceId: string,
    credentialId: string,
    input: ClientUpdateCredentialInput
  ): Promise<CredentialMetadata> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/credentials/${credentialId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update credential');
    }
    const data = await res.json();
    return data.data;
  },

  async deleteCredential(workspaceId: string, credentialId: string): Promise<boolean> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/credentials/${credentialId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete credential');
    }
    return true;
  },
};
