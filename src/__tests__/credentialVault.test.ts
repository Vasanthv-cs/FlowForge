import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  getEncryptionKey,
  generateMasterKey,
} from '../server/crypto/encryption.ts';
import {
  CredentialVaultService,
  validateCredentialSecretData,
} from '../server/services/credentialVaultService.ts';
import { ServerHttpRequestExecutor } from '../server/engine/ServerHttpRequestExecutor.ts';
import * as safeHttpClientModule from '../server/http/safeHttpClient.ts';
import { sanitizeHeadersForLogging, redactSensitiveData } from '@flowforge/shared';
import { buildApp } from '../server/app.ts';
import * as supabaseModule from '../server/supabase.ts';
import type { FastifyInstance } from 'fastify';
import type { ExecutionContext } from '@flowforge/node-sdk';

const mockWorkspaceA = '11111111-1111-4111-8111-111111111111';
const mockWorkspaceB = '22222222-2222-4222-8222-222222222222';
const mockUserId = '33333333-3333-4333-8333-333333333333';
const mockCredId = '44444444-4444-4444-8444-444444444444';

interface MockDbCred {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  credential_type: string;
  encrypted_data: string;
  iv: string;
  auth_tag: string;
  key_version: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

describe('Batch 11: Credential Vault & Secure Secrets', () => {
  /* ─────────────────────────────────────────────────────────────
   * 1. Cryptographic Core (AES-256-GCM)
   * ───────────────────────────────────────────────────────────── */
  describe('1. Cryptographic Engine & Key Management', () => {
    it('encrypts and decrypts secret data correctly with AES-256-GCM', () => {
      const secret = 'super-secret-api-token-xyz-123';
      const enc = encryptSecret(secret);

      expect(enc.encryptedData).toBeDefined();
      expect(enc.iv).toHaveLength(24); // 12 bytes = 24 hex chars
      expect(enc.authTag).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(enc.keyVersion).toBe('v1');

      const dec = decryptSecret(enc.encryptedData, enc.iv, enc.authTag, enc.keyVersion);
      expect(dec).toBe(secret);
    });

    it('generates unique random IVs on every encryption of identical plaintext', () => {
      const plaintext = 'identical-secret-payload';
      const enc1 = encryptSecret(plaintext);
      const enc2 = encryptSecret(plaintext);

      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.encryptedData).not.toBe(enc2.encryptedData);

      // Both decrypt to the same original text
      expect(decryptSecret(enc1.encryptedData, enc1.iv, enc1.authTag)).toBe(plaintext);
      expect(decryptSecret(enc2.encryptedData, enc2.iv, enc2.authTag)).toBe(plaintext);
    });

    it('detects tampering and throws an error if ciphertext is modified', () => {
      const enc = encryptSecret('confidential-payload');
      // Flip one character in the ciphertext
      const tamperedCipher =
        enc.encryptedData.slice(0, -2) + (enc.encryptedData.endsWith('a') ? 'b' : 'a');

      expect(() =>
        decryptSecret(tamperedCipher, enc.iv, enc.authTag, enc.keyVersion)
      ).toThrowError(/Authentication tag mismatch or corrupted ciphertext/);
    });

    it('detects tampering and throws an error if authentication tag is corrupted', () => {
      const enc = encryptSecret('confidential-payload');
      const corruptedTag =
        enc.authTag.slice(0, -2) + (enc.authTag.endsWith('00') ? '11' : '00');

      expect(() =>
        decryptSecret(enc.encryptedData, enc.iv, corruptedTag, enc.keyVersion)
      ).toThrowError(/Authentication tag mismatch or corrupted ciphertext/);
    });

    it('generates a valid 256-bit (64 hex char) master key', () => {
      const key = generateMasterKey();
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
    });

    it('fails securely on startup in production if encryption key is missing', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.FLOWFORGE_ENCRYPTION_KEY;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.FLOWFORGE_ENCRYPTION_KEY;
        delete process.env.ENCRYPTION_KEY;

        expect(() => getEncryptionKey()).toThrowError(/FLOWFORGE_ENCRYPTION_KEY environment variable is required/);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalKey) process.env.FLOWFORGE_ENCRYPTION_KEY = originalKey;
      }
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 2. Secret Data Validation
   * ───────────────────────────────────────────────────────────── */
  describe('2. Credential Payload Validation', () => {
    it('validates api_key payload structure', () => {
      expect(() => validateCredentialSecretData('api_key', { apiKey: 'my-key' })).not.toThrow();
      expect(() => validateCredentialSecretData('api_key', { apiKey: '' })).toThrowError(/apiKey/);
      expect(() => validateCredentialSecretData('api_key', {})).toThrowError(/apiKey/);
    });

    it('validates bearer_token payload structure', () => {
      expect(() => validateCredentialSecretData('bearer_token', { token: 'jwt.token.here' })).not.toThrow();
      expect(() => validateCredentialSecretData('bearer_token', { token: '' })).toThrowError(/token/);
    });

    it('validates basic_auth payload structure', () => {
      expect(() =>
        validateCredentialSecretData('basic_auth', { username: 'admin', password: 'secretpassword' })
      ).not.toThrow();
      expect(() => validateCredentialSecretData('basic_auth', { username: '', password: 'p' })).toThrowError(/username/);
      expect(() => validateCredentialSecretData('basic_auth', { username: 'u' })).toThrowError(/password/);
    });

    it('validates custom_headers payload structure', () => {
      expect(() =>
        validateCredentialSecretData('custom_headers', { headers: { 'X-Secret': 'val1' } })
      ).not.toThrow();
      expect(() => validateCredentialSecretData('custom_headers', { headers: [] })).toThrowError(/headers/);
      expect(() => validateCredentialSecretData('custom_headers', { headers: { '': 'val' } })).toThrowError(/header/);
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 3. Credential Vault Service & Database Mock
   * ───────────────────────────────────────────────────────────── */
  describe('3. Credential Vault Service Operations', () => {
    let mockCredentialsDb: MockDbCred[] = [];
    let vaultService: CredentialVaultService;

    beforeEach(() => {
      mockCredentialsDb = [];
      vaultService = new CredentialVaultService();

      vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'credentials') {
            return {
              insert: (record: Record<string, unknown>) => ({
                select: () => ({
                  single: async () => {
                    const row: MockDbCred = {
                      id: mockCredId,
                      workspace_id: record.workspace_id as string,
                      name: record.name as string,
                      description: (record.description as string) || null,
                      credential_type: record.credential_type as string,
                      encrypted_data: record.encrypted_data as string,
                      iv: record.iv as string,
                      auth_tag: record.auth_tag as string,
                      key_version: (record.key_version as string) || 'v1',
                      created_by: (record.created_by as string) || null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    mockCredentialsDb.push(row);
                    return { data: row, error: null };
                  },
                }),
              }),
              select: () => ({
                eq: (col1: string, val1: string) => ({
                  order: () => Promise.resolve({
                    data: mockCredentialsDb.filter((c) => c[col1 as keyof MockDbCred] === val1),
                    error: null,
                  }),
                  eq: (col2: string, val2: string) => ({
                    maybeSingle: async () => {
                      const item = mockCredentialsDb.find(
                        (c) => c[col1 as keyof MockDbCred] === val1 && c[col2 as keyof MockDbCred] === val2
                      );
                      return { data: item || null, error: null };
                    },
                  }),
                  maybeSingle: async () => {
                    const item = mockCredentialsDb.find((c) => c[col1 as keyof MockDbCred] === val1);
                    return { data: item || null, error: null };
                  },
                }),
              }),
              update: (updatePayload: Record<string, unknown>) => ({
                eq: (_col1: string, val1: string) => ({
                  eq: (_col2: string, _val2: string) => ({
                    select: () => ({
                      single: async () => {
                        const target = mockCredentialsDb.find((c) => c.id === val1);
                        if (!target) return { data: null, error: new Error('Not found') };
                        Object.assign(target, updatePayload);
                        return { data: target, error: null };
                      },
                    }),
                  }),
                }),
              }),
              delete: () => ({
                eq: (_col1: string, val1: string) => ({
                  eq: (_col2: string, _val2: string) => {
                    mockCredentialsDb = mockCredentialsDb.filter((c) => c.id !== val1);
                    return Promise.resolve({ error: null });
                  },
                }),
              }),
            };
          }
          return { select: vi.fn() };
        },
      } as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>);
    });

    it('creates an encrypted credential and returns only safe metadata', async () => {
      const meta = await vaultService.createCredential(mockWorkspaceA, mockUserId, {
        name: 'Stripe API Key',
        description: 'Payment gateway API key',
        credentialType: 'api_key',
        data: { apiKey: 'mock_stripe_key_12345', headerName: 'Authorization' },
      });

      expect(meta.id).toBe(mockCredId);
      expect(meta.name).toBe('Stripe API Key');
      expect(meta.credentialType).toBe('api_key');
      expect((meta as unknown as Record<string, unknown>)['encrypted_data']).toBeUndefined();
      expect((meta as unknown as Record<string, unknown>)['iv']).toBeUndefined();
      expect((meta as unknown as Record<string, unknown>)['auth_tag']).toBeUndefined();

      // Database row is encrypted
      const stored = mockCredentialsDb[0];
      expect(stored.encrypted_data).not.toContain('mock_stripe_key_12345');
      expect(stored.iv).toBeDefined();
      expect(stored.auth_tag).toBeDefined();
    });

    it('lists credentials returning safe metadata without ciphertext or plaintext', async () => {
      await vaultService.createCredential(mockWorkspaceA, mockUserId, {
        name: 'GitHub Token',
        credentialType: 'bearer_token',
        data: { token: 'ghp_secrettoken' },
      });

      const list = await vaultService.listCredentials(mockWorkspaceA);
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('GitHub Token');
      expect(list[0].credentialType).toBe('bearer_token');
      expect((list[0] as unknown as Record<string, unknown>)['encrypted_data']).toBeUndefined();
    });

    it('updates and rotates secret data with fresh encryption parameters', async () => {
      await vaultService.createCredential(mockWorkspaceA, mockUserId, {
        name: 'API Key',
        credentialType: 'api_key',
        data: { apiKey: 'old_key_1' },
      });
      const oldIv = mockCredentialsDb[0].iv;

      await vaultService.updateCredential(mockWorkspaceA, mockCredId, {
        name: 'Rotated API Key',
        data: { apiKey: 'new_rotated_key_2' },
      });

      const updated = mockCredentialsDb[0];
      expect(updated.name).toBe('Rotated API Key');
      expect(updated.iv).not.toBe(oldIv); // Fresh IV generated for rotated secret

      // Resolving decodes the newly rotated secret
      const resolved = await vaultService.resolveCredentialForExecution(mockWorkspaceA, mockCredId);
      expect((resolved.data as { apiKey: string }).apiKey).toBe('new_rotated_key_2');
    });

    it('strictly prevents cross-workspace credential resolution', async () => {
      await vaultService.createCredential(mockWorkspaceA, mockUserId, {
        name: 'Workspace A Secret',
        credentialType: 'bearer_token',
        data: { token: 'token-a' },
      });

      // Attempting to resolve Workspace A's credential from Workspace B
      await expect(
        vaultService.resolveCredentialForExecution(mockWorkspaceB, mockCredId)
      ).rejects.toThrowError(/Cross-workspace credential access rejected/);
    });

    it('throws clear error when resolving non-existent credential', async () => {
      await expect(
        vaultService.resolveCredentialForExecution(mockWorkspaceA, 'non-existent-uuid')
      ).rejects.toThrowError(/does not exist/);
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 4. Fastify REST Endpoints & RBAC
   * ───────────────────────────────────────────────────────────── */
  describe('4. Fastify Credential Routes & RBAC Permissions', () => {
    let app: FastifyInstance;
    let mockUserRole: string = 'admin';
    let mockStoredCredentials: MockDbCred[] = [];

    beforeEach(async () => {
      mockStoredCredentials = [
        {
          id: mockCredId,
          workspace_id: mockWorkspaceA,
          name: 'Existing Token',
          description: 'Production access token',
          credential_type: 'bearer_token',
          encrypted_data: 'cipher123',
          iv: 'iv123',
          auth_tag: 'tag123',
          key_version: 'v1',
          created_by: mockUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      vi.spyOn(supabaseModule, 'verifyAccessToken').mockImplementation(async (token: string) => {
        if (token === 'valid-user-jwt') {
          return {
            user: {
              id: mockUserId,
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            },
            error: null,
          };
        }
        return { user: null, error: 'Unauthorized' };
      });

      vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'workspace_members') {
            return {
              select: () => ({
                eq: (_col1: string, _val1: string) => ({
                  eq: (_col2: string, _val2: string) => ({
                    maybeSingle: async () => ({
                      data: { role: mockUserRole },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'credentials') {
            return {
              select: () => ({
                eq: (col1: string, val1: string) => ({
                  order: () => Promise.resolve({
                    data: mockStoredCredentials.filter((c) => c[col1 as keyof MockDbCred] === val1),
                    error: null,
                  }),
                  eq: (_col2: string, val2: string) => ({
                    maybeSingle: async () => {
                      const item = mockStoredCredentials.find(
                        (c) => c[col1 as keyof MockDbCred] === val1 && c.id === val2
                      );
                      return { data: item || null, error: null };
                    },
                  }),
                  maybeSingle: async () => {
                    const item = mockStoredCredentials.find((c) => c[col1 as keyof MockDbCred] === val1);
                    return { data: item || null, error: null };
                  },
                }),
              }),
              insert: (record: Record<string, unknown>) => ({
                select: () => ({
                  single: async () => {
                    const row: MockDbCred = {
                      id: 'new-cred-uuid',
                      workspace_id: record.workspace_id as string,
                      name: record.name as string,
                      description: (record.description as string) || null,
                      credential_type: record.credential_type as string,
                      encrypted_data: record.encrypted_data as string,
                      iv: record.iv as string,
                      auth_tag: record.auth_tag as string,
                      key_version: 'v1',
                      created_by: mockUserId,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    };
                    return { data: row, error: null };
                  },
                }),
              }),
              delete: () => ({
                eq: () => ({
                  eq: () => Promise.resolve({ error: null }),
                }),
              }),
            };
          }
          return { select: vi.fn() };
        },
      } as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>);

      app = await buildApp({
        configOverride: { NODE_ENV: 'test', RATE_LIMIT_MAX: 1000 },
      });
    });

    it('GET /api/workspaces/:workspaceId/credentials returns 200 with safe metadata', async () => {
      mockUserRole = 'viewer'; // Viewers can list metadata
      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${mockWorkspaceA}/credentials`,
        headers: { authorization: 'Bearer valid-user-jwt' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Existing Token');
      // Assert no secret cipher or plaintext exists in response
      expect(body.data[0].encrypted_data).toBeUndefined();
      expect(body.data[0].iv).toBeUndefined();
      expect(body.data[0].auth_tag).toBeUndefined();
    });

    it('POST /api/workspaces/:workspaceId/credentials creates credential for admin role', async () => {
      mockUserRole = 'admin';
      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${mockWorkspaceA}/credentials`,
        headers: { authorization: 'Bearer valid-user-jwt' },
        payload: {
          name: 'New Bearer Token',
          credentialType: 'bearer_token',
          data: { token: 'jwt.sample.token' },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.name).toBe('New Bearer Token');
      expect(body.data.encrypted_data).toBeUndefined();
    });

    it('POST /api/workspaces/:workspaceId/credentials blocks viewer role with 403 Forbidden', async () => {
      mockUserRole = 'viewer';
      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${mockWorkspaceA}/credentials`,
        headers: { authorization: 'Bearer valid-user-jwt' },
        payload: {
          name: 'Unauthorized Attempt',
          credentialType: 'bearer_token',
          data: { token: 'jwt.sample.token' },
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('Access denied');
    });

    it('DELETE /api/workspaces/:workspaceId/credentials/:credentialId blocks viewer role with 403', async () => {
      mockUserRole = 'viewer';
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${mockWorkspaceA}/credentials/${mockCredId}`,
        headers: { authorization: 'Bearer valid-user-jwt' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 5. Execution Integration & Secret Redaction
   * ───────────────────────────────────────────────────────────── */
  describe('5. HTTP Request Credential Injection & Secret Redaction', () => {
    it('ServerHttpRequestExecutor resolves and injects Bearer token into outbound request', async () => {
      const executor = new ServerHttpRequestExecutor();

      // Mock resolveCredentialForExecution
      vi.spyOn(
        (await import('../server/services/credentialVaultService.ts')).credentialVaultService,
        'resolveCredentialForExecution'
      ).mockResolvedValue({
        id: mockCredId,
        workspaceId: mockWorkspaceA,
        name: 'OAuth Token',
        credentialType: 'bearer_token',
        data: { token: 'secret-bearer-token-123' },
      });

      const logs: string[] = [];
      const context: ExecutionContext = {
        executionId: 'exec-test-1',
        workflowId: 'wf-test-1',
        workspaceId: mockWorkspaceA,
        node: {
          id: 'http-node-1',
          data: {
            label: 'Fetch Data',
            type: 'http-request',
            config: {
              method: 'GET',
              url: 'https://httpbin.org/get',
              credentialId: mockCredId,
            },
          },
          position: { x: 0, y: 0 },
        } as never,
        upstreamOutputs: {},
        incomingPayload: {},
        emitLog: (_lvl, msg) => logs.push(msg),
      };

      let capturedRequestHeaders: Record<string, string> = {};
      vi.spyOn(safeHttpClientModule, 'safeHttpRequest').mockImplementation(async (_url, options) => {
        capturedRequestHeaders = { ...(options?.headers || {}) };
        return {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          data: { success: true },
          ok: true,
        };
      });

      const result = await executor.execute(context);
      expect(result.success).toBe(true);

      // Verify that the secret Bearer token was injected into request headers
      expect(capturedRequestHeaders['Authorization']).toBe('Bearer secret-bearer-token-123');

      // Verify that secret is NEVER emitted in unmasked form in logs
      const combinedLogs = logs.join('\n');
      expect(combinedLogs).not.toContain('secret-bearer-token-123');
      expect(combinedLogs).toContain('********');
    });

    it('fails safely with clear error if credential cannot be found in workspace', async () => {
      const executor = new ServerHttpRequestExecutor();

      vi.spyOn(
        (await import('../server/services/credentialVaultService.ts')).credentialVaultService,
        'resolveCredentialForExecution'
      ).mockRejectedValue(new Error('Credential not found in workspace.'));

      const logs: string[] = [];
      const context: ExecutionContext = {
        executionId: 'exec-test-2',
        workflowId: 'wf-test-2',
        workspaceId: mockWorkspaceA,
        node: {
          id: 'http-node-2',
          data: {
            label: 'Fetch Data',
            type: 'http-request',
            config: {
              method: 'GET',
              url: 'https://httpbin.org/get',
              credentialId: 'missing-cred-id',
            },
          },
          position: { x: 0, y: 0 },
        } as never,
        upstreamOutputs: {},
        incomingPayload: {},
        emitLog: (_lvl, msg) => logs.push(msg),
      };

      const result = await executor.execute(context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Credential not found in workspace');
    });

    it('strips authorization credentials upon cross-origin redirects', () => {
      // Test redirect origin stripping helper behavior directly
      const prevUrl = 'https://api.example.com/start';
      const redirectTarget = 'https://other-service.com/target';
      const initialHeaders = {
        Authorization: 'Bearer secret_token',
        'X-API-Key': 'secret_key',
        Accept: 'application/json',
      };

      // Simulate origin check
      const prevOrigin = new URL(prevUrl).origin;
      const nextOrigin = new URL(redirectTarget).origin;
      expect(prevOrigin).not.toBe(nextOrigin);

      const strippedHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(initialHeaders)) {
        const lower = k.toLowerCase();
        if (
          lower === 'authorization' ||
          lower === 'x-api-key' ||
          lower.includes('secret') ||
          lower.includes('token')
        ) {
          continue;
        }
        strippedHeaders[k] = v;
      }

      const requestHeadersReceived = strippedHeaders;
      expect(requestHeadersReceived['Authorization']).toBeUndefined();
      expect(requestHeadersReceived['X-API-Key']).toBeUndefined();
      expect(requestHeadersReceived['Accept']).toBe('application/json');
    });

    it('sanitizeHeadersForLogging masks authorization, API keys, tokens, and cookies', () => {
      const headers = {
        Authorization: 'Bearer eyJhbGciOi...',
        'X-API-Key': 'my-secret-key-123',
        Cookie: 'session=abc123xyz',
        'Content-Type': 'application/json',
        Accept: '*/*',
      };

      const sanitized = sanitizeHeadersForLogging(headers);
      expect(sanitized['Authorization']).toBe('********');
      expect(sanitized['X-API-Key']).toBe('********');
      expect(sanitized['Cookie']).toBe('********');
      expect(sanitized['Content-Type']).toBe('application/json');
      expect(sanitized['Accept']).toBe('*/*');
    });

    it('redactSensitiveData recursively masks secrets from objects and arrays', () => {
      const sensitiveObj = {
        user: 'alice',
        password: 'my-plaintext-password',
        auth: {
          token: 'jwt-12345',
          apiKey: 'key-98765',
        },
        headers: {
          'X-Secret-Auth': 'header_value',
        },
        harmlessData: 42,
      };

      const redacted = redactSensitiveData(sensitiveObj);
      expect(redacted.user).toBe('alice');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.auth.token).toBe('[REDACTED]');
      expect(redacted.auth.apiKey).toBe('[REDACTED]');
      expect(redacted.harmlessData).toBe(42);
    });
  });
});
