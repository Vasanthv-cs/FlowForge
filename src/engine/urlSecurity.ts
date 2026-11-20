/**
 * Security utilities to block SSRF, private IPs, and localhost in HTTP node execution,
 * and to redact sensitive authentication tokens in logs.
 */

// Regex patterns for private/internal IPv4 address spaces
const PRIVATE_IPV4_PATTERNS = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,                // Loopback (127.0.0.0/8)
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,                 // Private Class A (10.0.0.0/8)
  /^192\.168\.\d{1,3}\.\d{1,3}$/,                    // Private Class C (192.168.0.0/16)
  /^169\.254\.\d{1,3}\.\d{1,3}$/,                    // Link-local / AWS metadata (169.254.0.0/16)
  /^0\.0\.0\.0$/,                                     // Current network
];

// Checks if an IPv4 is within 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)
function isClassBPrivate(ip: string): boolean {
  const match = ip.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!match) return false;
  const secondOctet = parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

// Disallowed hostnames
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'internal',
  'metadata.google.internal',
  'instance-data',
]);

/**
 * Validates a target URL against security policies:
 * - Must be HTTP or HTTPS
 * - Must not target localhost, 127.0.0.1, private RFC-1918 ranges, or cloud metadata endpoints
 */
export function validateSafeUrl(urlString: string): { isSafe: boolean; reason?: string } {
  try {
    const url = new URL(urlString);

    // 1. Enforce HTTP/HTTPS only
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        isSafe: false,
        reason: `Disallowed protocol "${url.protocol}". Only http: and https: are permitted.`,
      };
    }

    const hostname = url.hostname.toLowerCase();

    // 2. Check blocked hostnames
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      return {
        isSafe: false,
        reason: `Targeting localhost or local domain "${hostname}" is blocked for security.`,
      };
    }

    // 3. Check IPv6 loopback and private
    if (
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('[fe80:') ||
      hostname === '0:0:0:0:0:0:0:1'
    ) {
      return {
        isSafe: false,
        reason: 'Targeting IPv6 loopback or link-local address is blocked.',
      };
    }

    // 4. Check IPv4 private ranges
    for (const pattern of PRIVATE_IPV4_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          isSafe: false,
          reason: `Targeting private/loopback IP "${hostname}" is blocked for security.`,
        };
      }
    }

    if (isClassBPrivate(hostname)) {
      return {
        isSafe: false,
        reason: `Targeting private subnet IP "${hostname}" is blocked for security.`,
      };
    }

    return { isSafe: true };
  } catch {
    return { isSafe: false, reason: 'Invalid URL format.' };
  }
}

/**
 * Redacts secrets from headers and request bodies before recording logs.
 */
const SENSITIVE_KEY_PATTERNS = [
  /auth/i,
  /token/i,
  /bearer/i,
  /key/i,
  /secret/i,
  /password/i,
  /credential/i,
];

export function sanitizeHeadersForLogging(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
    sanitized[key] = isSensitive ? '********' : value;
  }
  return sanitized;
}
