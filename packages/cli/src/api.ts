import { loadCliConfig } from './config';

export interface ApiClientOptions {
  apiUrl?: string;
  token?: string;
}

export class CliApiClient {
  private apiUrl: string;
  private token?: string;

  constructor(options: ApiClientOptions = {}) {
    const config = loadCliConfig();
    this.apiUrl = (options.apiUrl || config.apiUrl || 'http://localhost:3001').replace(/\/+$/, '');
    this.token = options.token || config.token;
  }

  public setToken(token: string) {
    this.token = token;
  }

  public setApiUrl(url: string) {
    this.apiUrl = url.replace(/\/+$/, '');
  }

  async request<T = unknown>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (this.token) {
      requestHeaders['Authorization'] = `Bearer ${this.token}`;
    }

    const fullUrl = `${this.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;

    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err: unknown) {
      throw new Error(
        `Failed to connect to FlowForge API at ${this.apiUrl}: ${err instanceof Error ? err.message : 'Connection refused'}`,
        { cause: err }
      );
    }

    let json: Record<string, unknown> = {};
    const text = await response.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required or session expired. Run "flowforge login --token <token>" to authenticate.');
      }
      if (response.status === 403) {
        throw new Error('Permission denied. Your user role in this workspace is not authorized for this operation.');
      }
      if (response.status === 404) {
        throw new Error((json.message as string) || `Resource not found at ${path}.`);
      }
      if (response.status === 400) {
        throw new Error((json.message as string) || 'Bad Request: validation failed.');
      }

      throw new Error((json.message as string) || `API request failed with HTTP ${response.status}.`);
    }

    return json as T;
  }
}
