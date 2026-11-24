import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import { URL } from 'node:url';

export interface SafeRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  allowedPorts?: number[];
  allowLoopbackForTesting?: boolean;
}

export interface SafeResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  ok: boolean;
}

export interface SecurityCheckResult {
  isSafe: boolean;
  reason?: string;
}

/**
 * Standard safe web ports permitted for outbound HTTP requests.
 * Blocks sensitive service ports (SSH 22, SMTP 25, Redis 6379, Postgres 5432, etc.)
 */
export const DEFAULT_ALLOWED_PORTS = [80, 443, 8080, 8443];

/**
 * Hostnames blocked by policy (metadata endpoints, localhost aliases).
 */
export const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'internal',
  'metadata.google.internal',
  'instance-data',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

/**
 * Checks whether an IPv4 address belongs to a private, loopback, link-local,
 * multicast, carrier-grade NAT, or reserved subnet.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed -> consider unsafe
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network / "this" network)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (Private Class A)
  if (b0 === 10) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT: 100.64.0.0 to 100.127.255.255)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 169.254.0.0/16 (Link-Local, AWS/GCP/Azure Metadata: 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (Private Class B: 172.16.0.0 to 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;

  // 192.168.0.0/16 (Private Class C)
  if (b0 === 192 && b1 === 168) return true;

  // 198.18.0.0/15 (Network benchmark tests: 198.18.0.0 - 198.19.255.255)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 to 239.255.255.255)
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future Use) & 255.255.255.255 (Broadcast)
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to a loopback, link-local, unique local (ULA),
 * multicast, or IPv4-mapped/compatible private address.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // Strip brackets if present e.g. [::1]
  const cleanIp = normalized.replace(/^\[|\]$/g, '');

  // 1. Loopback (::1) and Unspecified (::)
  if (cleanIp === '::1' || cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:1' || cleanIp === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // 2. IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1, ::ffff:10.0.0.1, ::ffff:7f00:1)
  const ipv4MappedMatch = cleanIp.match(/^(?:::ffff:(?:0:0:)?)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (ipv4MappedMatch) {
    return isPrivateIPv4(ipv4MappedMatch[1]);
  }

  // Check hex notation of IPv4-mapped e.g. ::ffff:7f00:0001
  if (cleanIp.startsWith('::ffff:')) {
    const remainder = cleanIp.slice(7);
    if (remainder.includes('.')) {
      return isPrivateIPv4(remainder);
    }
    // Hex representation
    const hexSegments = remainder.split(':');
    if (hexSegments.length === 2) {
      const b0 = parseInt(hexSegments[0].slice(0, 2), 16);
      const b1 = parseInt(hexSegments[0].slice(2, 4), 16);
      const b2 = parseInt(hexSegments[1].slice(0, 2), 16);
      const b3 = parseInt(hexSegments[1].slice(2, 4), 16);
      return isPrivateIPv4(`${b0}.${b1}.${b2}.${b3}`);
    }
    return true;
  }

  // 3. Unique Local Addresses (ULA: fc00::/7 -> starts with fc or fd)
  if (/^f[cd][0-9a-f]{2}:/i.test(cleanIp)) {
    return true;
  }

  // 4. Link-Local Addresses (fe80::/10 -> fe8, fe9, fea, feb)
  if (/^fe[89ab][0-9a-f]:/i.test(cleanIp)) {
    return true;
  }

  // 5. Multicast (ff00::/8)
  if (/^ff[0-9a-f]{2}:/i.test(cleanIp)) {
    return true;
  }

  // 6. Documentation (2001:db8::/32)
  if (/^2001:0?db8:/i.test(cleanIp)) {
    return true;
  }

  // 7. 6to4 prefix (2002::/16) - embeds IPv4 in next 32 bits
  if (cleanIp.startsWith('2002:')) {
    const parts = cleanIp.split(':');
    if (parts.length >= 3) {
      const p1 = parseInt(parts[1], 16);
      const p2 = parseInt(parts[2], 16);
      if (!isNaN(p1) && !isNaN(p2)) {
        const b0 = (p1 >> 8) & 0xff;
        const b1 = p1 & 0xff;
        const b2 = (p2 >> 8) & 0xff;
        const b3 = p2 & 0xff;
        return isPrivateIPv4(`${b0}.${b1}.${b2}.${b3}`);
      }
    }
    return true;
  }

  return false;
}

/**
 * Validates a single IP address (IPv4 or IPv6) against private and dangerous ranges.
 */
export function isDisallowedIp(ip: string, allowLoopback = false): boolean {
  if (allowLoopback && (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost')) {
    return false;
  }
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateIPv4(ip);
  }
  if (version === 6) {
    return isPrivateIPv6(ip);
  }
  // Not a valid IP string
  return true;
}

/**
 * Validates URL string structure, scheme, credentials, and port before network activity.
 */
export function validateUrlSyntax(
  urlString: string,
  allowedPorts: number[] = DEFAULT_ALLOWED_PORTS,
  allowLoopback = false
): { isValid: boolean; parsedUrl?: URL; reason?: string } {
  try {
    const parsed = new URL(urlString);

    // 1. Allowed protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        isValid: false,
        reason: `Disallowed protocol "${parsed.protocol}". Only "http:" and "https:" are allowed.`,
      };
    }

    // 2. Reject embedded credentials (http://user:pass@host)
    if (parsed.username || parsed.password) {
      return {
        isValid: false,
        reason: 'URL credentials (user:password@host) are strictly forbidden for security.',
      };
    }

    // 3. Port restrictions
    const port = parsed.port
      ? parseInt(parsed.port, 10)
      : parsed.protocol === 'https:'
      ? 443
      : 80;

    if (isNaN(port) || port < 1 || port > 65535) {
      return { isValid: false, reason: `Invalid port "${parsed.port}".` };
    }

    if (!allowedPorts.includes(port)) {
      return {
        isValid: false,
        reason: `Port ${port} is blocked. Allowed ports: ${allowedPorts.join(', ')}.`,
      };
    }

    // 4. Hostname validation
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) {
      return { isValid: false, reason: 'Hostname cannot be empty.' };
    }

    if (
      BLOCKED_HOSTNAMES.has(hostname) ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      if (!allowLoopback || (hostname !== 'localhost' && hostname !== '127.0.0.1')) {
        return {
          isValid: false,
          reason: `Targeting domain "${hostname}" is blocked for security.`,
        };
      }
    }

    // 5. If hostname is directly an IP literal, validate immediately
    if (net.isIP(hostname)) {
      if (isDisallowedIp(hostname, allowLoopback)) {
        return {
          isValid: false,
          reason: `Targeting private or restricted IP address "${hostname}" is blocked.`,
        };
      }
    }

    return { isValid: true, parsedUrl: parsed };
  } catch {
    return { isValid: false, reason: 'Invalid or malformed URL format.' };
  }
}

/**
 * Resolves all IP addresses for a hostname and verifies that none are private or restricted.
 * Throws or returns an error if any resolved address is unsafe.
 */
export async function resolveAndValidateHost(
  hostname: string,
  dnsResolver: typeof dns.promises.lookup = dns.promises.lookup,
  allowLoopback = false
): Promise<{ safeIps: string[]; primaryIp: string; isIPv6: boolean }> {
  // If already an IP address, validate directly
  const ipVersion = net.isIP(hostname);
  if (ipVersion !== 0) {
    if (isDisallowedIp(hostname, allowLoopback)) {
      throw new Error(`Targeting restricted IP address "${hostname}" is blocked.`);
    }
    return {
      safeIps: [hostname],
      primaryIp: hostname,
      isIPv6: ipVersion === 6,
    };
  }

  // Resolve all DNS records (IPv4 & IPv6)
  let records: dns.LookupAddress[];
  try {
    records = await dnsResolver(hostname, { all: true });
  } catch (err) {
    throw new Error(
      `DNS resolution failed for host "${hostname}": ${err instanceof Error ? err.message : 'Unknown DNS error'}`,
      { cause: err }
    );
  }

  if (!records || records.length === 0) {
    throw new Error(`No DNS records found for host "${hostname}".`);
  }

  // Validate EVERY resolved address
  for (const record of records) {
    if (isDisallowedIp(record.address, allowLoopback)) {
      throw new Error(
        `DNS resolution for "${hostname}" returned restricted IP "${record.address}". Request blocked to prevent SSRF.`
      );
    }
  }

  const primary = records[0];
  return {
    safeIps: records.map((r) => r.address),
    primaryIp: primary.address,
    isIPv6: primary.family === 6,
  };
}

/**
 * Executes a secure HTTP/HTTPS request with multi-layer SSRF protection:
 * - Pre-connection URL & port validation
 * - Full DNS resolution check (all resolved addresses must be public)
 * - DNS rebinding mitigation (pins socket connection directly to pre-validated IP)
 * - Redirect destination re-validation
 * - Stream-level response size enforcement (aborts before buffering oversized responses)
 * - Connection and request timeouts
 */
export async function safeHttpRequest(
  urlString: string,
  options: SafeRequestOptions = {},
  dnsResolver?: typeof dns.promises.lookup
): Promise<SafeResponse> {
  const method = (options.method || 'GET').toUpperCase();
  let headers = { ...(options.headers || {}) };
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024; // 2MB default
  const maxRedirects = options.maxRedirects ?? 3;
  const allowedPorts = options.allowedPorts ?? DEFAULT_ALLOWED_PORTS;
  const allowLoopback = options.allowLoopbackForTesting ?? false;

  let currentUrl = urlString;
  let redirectsRemaining = maxRedirects;

  while (true) {
    // 1. URL Syntax & Scheme & Port check
    const syntaxCheck = validateUrlSyntax(currentUrl, allowedPorts, allowLoopback);
    if (!syntaxCheck.isValid || !syntaxCheck.parsedUrl) {
      throw new Error(`SSRF validation failed: ${syntaxCheck.reason}`);
    }

    const url = syntaxCheck.parsedUrl;
    const isHttps = url.protocol === 'https:';
    const port = url.port ? parseInt(url.port, 10) : isHttps ? 443 : 80;

    // 2. DNS resolution and validation
    const { primaryIp, isIPv6 } = await resolveAndValidateHost(url.hostname, dnsResolver, allowLoopback);

    // 3. DNS Rebinding Mitigation:
    // Create a safe custom lookup callback that returns strictly the pre-validated IP address.
    // When Node's net.connect establishes the socket, it connects to primaryIp,
    // while TLS SNI and the Host header retain the original domain name!
    const safeLookup = (
      _host: string,
      lookupOptsOrCb: unknown,
      cbMaybe?: unknown
    ) => {
      const opts =
        typeof lookupOptsOrCb === 'object' && lookupOptsOrCb !== null
          ? (lookupOptsOrCb as dns.LookupOptions)
          : {};
      const cb = (
        typeof lookupOptsOrCb === 'function' ? lookupOptsOrCb : cbMaybe
      ) as (
        err: NodeJS.ErrnoException | null,
        address: unknown,
        family?: number
      ) => void;

      if (opts && opts.all) {
        cb(null, [{ address: primaryIp, family: isIPv6 ? 6 : 4 }]);
      } else {
        cb(null, primaryIp, isIPv6 ? 6 : 4);
      }
    };

    const response = await new Promise<{
      statusCode: number;
      statusText: string;
      headers: Record<string, string>;
      bodyText: string;
      redirectLocation?: string;
    }>((resolve, reject) => {
      const clientModule = isHttps ? https : http;

      // Ensure Host header is set to original hostname
      if (!headers['Host'] && !headers['host']) {
        headers['Host'] = url.host;
      }

      const reqOptions: https.RequestOptions = {
        hostname: url.hostname,
        port,
        path: url.pathname + url.search,
        method,
        headers,
        lookup: safeLookup as unknown as typeof dns.lookup,
        timeout: timeoutMs,
      };

      if (isHttps) {
        reqOptions.servername = url.hostname; // Crucial for TLS SNI and cert validation
      }

      let timeoutTimer: NodeJS.Timeout | null = null;
      let isSettled = false;

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      };

      const fail = (err: Error) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        req.destroy();
        reject(err);
      };

      const req = clientModule.request(reqOptions, (res) => {
        const statusCode = res.statusCode || 500;
        const statusText = res.statusMessage || '';
        const resHeaders: Record<string, string> = {};

        for (const [k, v] of Object.entries(res.headers)) {
          if (v !== undefined) {
            resHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
          }
        }

        // Check for redirects (301, 302, 303, 307, 308)
        if (
          [301, 302, 303, 307, 308].includes(statusCode) &&
          resHeaders['location']
        ) {
          cleanup();
          res.resume(); // Drain and discard redirect body
          isSettled = true;
          resolve({
            statusCode,
            statusText,
            headers: resHeaders,
            bodyText: '',
            redirectLocation: resHeaders['location'],
          });
          return;
        }

        let totalBytes = 0;
        const chunks: Buffer[] = [];

        // Enforce stream-level response size limit
        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxResponseBytes) {
            res.destroy();
            fail(
              new Error(
                `Response size limit exceeded. Maximum permitted: ${maxResponseBytes / (1024 * 1024)}MB.`
              )
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          const bodyBuffer = Buffer.concat(chunks);
          resolve({
            statusCode,
            statusText,
            headers: resHeaders,
            bodyText: bodyBuffer.toString('utf-8'),
          });
        });

        res.on('error', (err) => {
          fail(new Error(`Response stream error: ${err.message}`));
        });
      });

      // Total timeout protection
      timeoutTimer = setTimeout(() => {
        fail(new Error(`Request timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      req.on('timeout', () => {
        fail(new Error(`Request timed out after ${timeoutMs}ms.`));
      });

      req.on('error', (err) => {
        fail(new Error(`Connection failed: ${err.message}`));
      });

      if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        req.write(options.body);
      }

      req.end();
    });

    // Handle Redirect
    if (response.redirectLocation) {
      if (redirectsRemaining <= 0) {
        throw new Error('Maximum redirect limit (3) exceeded.');
      }
      redirectsRemaining--;

      // Resolve relative redirect against current URL
      const nextUrl = new URL(response.redirectLocation, currentUrl).toString();

      // Check for cross-origin redirect and strip sensitive authorization headers
      try {
        const prevOrigin = new URL(currentUrl).origin;
        const nextOrigin = new URL(nextUrl).origin;
        if (prevOrigin !== nextOrigin) {
          const strippedHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(headers)) {
            const lower = k.toLowerCase();
            if (
              lower === 'authorization' ||
              lower === 'proxy-authorization' ||
              lower === 'cookie' ||
              lower === 'x-api-key' ||
              lower.includes('secret') ||
              lower.includes('token')
            ) {
              continue;
            }
            strippedHeaders[k] = v;
          }
          headers = strippedHeaders;
        }
      } catch {
        // Fallback: If URL parsing fails, continue to next iteration where validateUrlSyntax handles it
      }

      delete headers['Host'];
      delete headers['host'];
      currentUrl = nextUrl;
      continue;
    }

    // Parse Response
    let parsedData: unknown = response.bodyText;
    try {
      parsedData = JSON.parse(response.bodyText);
    } catch {
      // Retain as text
    }

    const ok = response.statusCode >= 200 && response.statusCode < 300;
    return {
      status: response.statusCode,
      statusText: response.statusText,
      headers: response.headers,
      data: parsedData,
      ok,
    };
  }
}
