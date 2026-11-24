import type { NodeExecutor } from './BaseExecutor';
import type { ExecutionContext, NodeExecutionResult } from '../types';
import type { HttpRequestConfig } from '@/types/nodeConfigs';
import { validateSafeUrl, sanitizeHeadersForLogging } from '../urlSecurity';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB maximum response size

export class HttpRequestExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as HttpRequestConfig;
    const {
      method = 'GET',
      url,
      queryParams = {},
      headers = {},
      body,
      timeoutMs = 5000,
      credentialId,
    } = config || {};

    if (credentialId) {
      context.emitLog(
        'info',
        '[Browser Engine] Node references vault credential. Secrets will be securely resolved during server execution.'
      );
    }

    // 1. SSRF and URL Security Validation
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

    const securityCheck = validateSafeUrl(requestUrl);
    if (!securityCheck.isSafe) {
      const err = `HTTP Request blocked: ${securityCheck.reason}`;
      context.emitLog('error', err);
      return { success: false, error: err };
    }

    // 2. Safe Logging (never expose sensitive secrets)
    const sanitizedHeaders = sanitizeHeadersForLogging(headers);
    context.emitLog(
      'info',
      `Dispatching ${method} ${requestUrl} (Timeout: ${timeoutMs}ms, Headers: ${JSON.stringify(sanitizedHeaders)})`,
    );

    // 3. Request Execution with Timeout
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 60000));

    try {
      const requestOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
        requestOptions.body = body;
      }

      const response = await fetch(requestUrl, requestOptions);
      clearTimeout(timeoutTimer);

      context.emitLog(
        response.ok ? 'info' : 'warn',
        `HTTP Response received: Status ${response.status} ${response.statusText}`,
      );

      // 4. Response parsing with size safety
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_RESPONSE_BYTES) {
        throw new Error(`Response size exceeds safe limit of ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB.`);
      }

      const text = await response.text();
      let responseData: unknown = text;
      try {
        responseData = JSON.parse(text);
      } catch {
        // keep text if not JSON
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      return {
        success: response.ok,
        output: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          data: responseData,
          ok: response.ok,
        },
        error: response.ok ? undefined : `HTTP request returned status ${response.status}`,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutTimer);
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
      const errorMsg = isTimeout
        ? `HTTP Request timed out after ${timeoutMs}ms.`
        : `HTTP Request failed: ${err instanceof Error ? err.message : 'Network error'}`;

      context.emitLog('error', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}
