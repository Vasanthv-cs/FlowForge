import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { HttpRequestConfig } from '@flowforge/workflow-schema';
import { safeHttpRequest } from '../http/safeHttpClient.ts';
import { sanitizeHeadersForLogging } from '@flowforge/shared';

const SERVER_MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB limit for server executions

export class ServerHttpRequestExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as HttpRequestConfig;
    const { method = 'GET', url, headers = {}, body, timeoutMs = 10000 } = config || {};

    if (!url || !url.trim()) {
      const err = 'HTTP Request error: URL cannot be empty.';
      context.emitLog('error', err);
      return { success: false, error: err };
    }

    const sanitizedHeaders = sanitizeHeadersForLogging(headers || {});
    context.emitLog(
      'info',
      `[Server Engine] Dispatching SSRF-protected ${method} ${url} (Timeout: ${timeoutMs}ms, Headers: ${JSON.stringify(sanitizedHeaders)})`
    );

    try {
      const response = await safeHttpRequest(url, {
        method,
        headers,
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
