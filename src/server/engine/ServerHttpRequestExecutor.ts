import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { HttpRequestConfig } from '@flowforge/workflow-schema';
import { safeHttpRequest } from '../http/safeHttpClient.ts';
import { sanitizeHeadersForLogging } from '@flowforge/shared';
import {
  credentialVaultService,
  type ApiKeyData,
  type BearerTokenData,
  type BasicAuthData,
  type CustomHeadersData,
} from '../services/credentialVaultService.ts';

const SERVER_MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB limit for server executions

export class ServerHttpRequestExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as HttpRequestConfig;
    const {
      method = 'GET',
      url,
      queryParams = {},
      headers = {},
      body,
      timeoutMs = 10000,
      credentialId,
    } = config || {};

    if (!url || !url.trim()) {
      const err = 'HTTP Request error: URL cannot be empty.';
      context.emitLog('error', err);
      return { success: false, error: err };
    }

    let requestUrl = url.trim();
    if (queryParams && typeof queryParams === 'object' && Object.keys(queryParams).length > 0) {
      try {
        const parsed = new URL(requestUrl);
        for (const [k, v] of Object.entries(queryParams)) {
          if (k && v !== undefined) parsed.searchParams.append(k, String(v));
        }
        requestUrl = parsed.toString();
      } catch {
        // Retain original URL if parsing fails
      }
    }

    const requestHeaders: Record<string, string> = { ...(headers || {}) };

    // 1. Resolve credential from vault if configured
    if (credentialId) {
      if (!context.workspaceId) {
        const err = 'HTTP Request error: Workspace context required to resolve credentials.';
        context.emitLog('error', err);
        return { success: false, error: err };
      }

      try {
        const cred = await credentialVaultService.resolveCredentialForExecution(
          context.workspaceId,
          credentialId
        );

        switch (cred.credentialType) {
          case 'api_key': {
            const apiData = cred.data as ApiKeyData;
            const headerName = apiData.headerName || 'X-API-Key';
            requestHeaders[headerName] = apiData.apiKey;
            break;
          }
          case 'bearer_token': {
            const bearerData = cred.data as BearerTokenData;
            requestHeaders['Authorization'] = `Bearer ${bearerData.token}`;
            break;
          }
          case 'basic_auth': {
            const basicData = cred.data as BasicAuthData;
            const encoded = Buffer.from(`${basicData.username}:${basicData.password}`).toString('base64');
            requestHeaders['Authorization'] = `Basic ${encoded}`;
            break;
          }
          case 'custom_headers': {
            const customData = cred.data as CustomHeadersData;
            Object.assign(requestHeaders, customData.headers);
            break;
          }
        }

        context.emitLog('info', `[Server Engine] Injected credential "${cred.name}" (${cred.credentialType})`);
      } catch (credErr) {
        const msg = credErr instanceof Error ? credErr.message : 'Failed to resolve credential';
        context.emitLog('error', `[Server Engine] Credential error: ${msg}`);
        return { success: false, error: msg };
      }
    }

    const sanitizedHeaders = sanitizeHeadersForLogging(requestHeaders);
    context.emitLog(
      'info',
      `[Server Engine] Dispatching SSRF-protected ${method} ${requestUrl} (Timeout: ${timeoutMs}ms, Headers: ${JSON.stringify(sanitizedHeaders)})`
    );

    try {
      const response = await safeHttpRequest(requestUrl, {
        method,
        headers: requestHeaders,
        body: body && ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
        timeoutMs: Math.min(timeoutMs, 30000), // Max 30s timeout per HTTP node
        maxResponseBytes: SERVER_MAX_RESPONSE_BYTES,
        maxRedirects: 3,
      });

      context.emitLog(
        response.ok ? 'info' : 'warn',
        `[Server Engine] HTTP Response received: Status ${response.status} ${response.statusText}`
      );

      return {
        success: response.ok,
        output: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
          ok: response.ok,
        },
        error: response.ok ? undefined : `HTTP request returned status ${response.status}`,
      };
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Server HTTP request failed due to security or network policy';

      context.emitLog('error', `[Server Engine] ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}
