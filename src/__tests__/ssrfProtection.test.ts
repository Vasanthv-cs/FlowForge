import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import * as net from 'node:net';
import type * as dns from 'node:dns';
import {
  isPrivateIPv4,
  isPrivateIPv6,
  isDisallowedIp,
  validateUrlSyntax,
  resolveAndValidateHost,
  safeHttpRequest,
  DEFAULT_ALLOWED_PORTS,
} from '../server/http/safeHttpClient.ts';

describe('SSRF Protection & Safe HTTP Client', () => {
  describe('1. Private & Loopback IPv4 Address Blocking', () => {
    it('blocks loopback addresses (127.0.0.0/8)', () => {
      expect(isPrivateIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateIPv4('127.0.1.1')).toBe(true);
      expect(isPrivateIPv4('127.255.255.254')).toBe(true);
    });

    it('blocks Class A private network (10.0.0.0/8)', () => {
      expect(isPrivateIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateIPv4('10.254.0.1')).toBe(true);
      expect(isPrivateIPv4('10.255.255.255')).toBe(true);
    });

    it('blocks Class B private network (172.16.0.0/12)', () => {
      expect(isPrivateIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateIPv4('172.24.10.5')).toBe(true);
      expect(isPrivateIPv4('172.31.255.255')).toBe(true);
      // Non-private 172 addresses should be allowed
      expect(isPrivateIPv4('172.15.255.255')).toBe(false);
      expect(isPrivateIPv4('172.32.0.1')).toBe(false);
    });

    it('blocks Class C private network (192.168.0.0/16)', () => {
      expect(isPrivateIPv4('192.168.0.1')).toBe(true);
      expect(isPrivateIPv4('192.168.1.254')).toBe(true);
    });

    it('blocks Link-Local & Cloud Metadata endpoint (169.254.0.0/16)', () => {
      expect(isPrivateIPv4('169.254.169.254')).toBe(true);
      expect(isPrivateIPv4('169.254.1.1')).toBe(true);
    });

    it('blocks Carrier-Grade NAT (100.64.0.0/10)', () => {
      expect(isPrivateIPv4('100.64.0.1')).toBe(true);
      expect(isPrivateIPv4('100.127.255.255')).toBe(true);
      expect(isPrivateIPv4('100.128.0.1')).toBe(false);
    });

    it('blocks Multicast (224.0.0.0/4), Broadcast, and 0.0.0.0', () => {
      expect(isPrivateIPv4('0.0.0.0')).toBe(true);
      expect(isPrivateIPv4('224.0.0.1')).toBe(true);
      expect(isPrivateIPv4('239.255.255.250')).toBe(true);
      expect(isPrivateIPv4('255.255.255.255')).toBe(true);
    });

    it('allows genuine public IPv4 addresses', () => {
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateIPv4('93.184.216.34')).toBe(false);
    });

    it('validates disallowed IP addresses across IPv4 and IPv6', () => {
      expect(isDisallowedIp('127.0.0.1')).toBe(true);
      expect(isDisallowedIp('127.0.0.1', true)).toBe(false);
      expect(isDisallowedIp('::1')).toBe(true);
      expect(isDisallowedIp('::1', true)).toBe(false);
      expect(isDisallowedIp('8.8.8.8')).toBe(false);
      expect(isDisallowedIp('invalid-ip')).toBe(true);
    });
  });

  describe('2. IPv6, ULA, Link-Local & IPv4-Mapped IPv6 Blocking', () => {
    it('blocks IPv6 loopback (::1) and unspecified (::)', () => {
      expect(isPrivateIPv6('::1')).toBe(true);
      expect(isPrivateIPv6('[::1]')).toBe(true);
      expect(isPrivateIPv6('0:0:0:0:0:0:0:1')).toBe(true);
      expect(isPrivateIPv6('::')).toBe(true);
    });

    it('blocks IPv6 link-local addresses (fe80::/10)', () => {
      expect(isPrivateIPv6('fe80::1')).toBe(true);
      expect(isPrivateIPv6('fe80::a00:27ff:fe4e:66a1')).toBe(true);
      expect(isPrivateIPv6('febf::ffff')).toBe(true);
    });

    it('blocks IPv6 unique local addresses (fc00::/7)', () => {
      expect(isPrivateIPv6('fc00::1')).toBe(true);
      expect(isPrivateIPv6('fd12:3456:789a::1')).toBe(true);
    });

    it('blocks IPv6 multicast (ff00::/8)', () => {
      expect(isPrivateIPv6('ff02::1')).toBe(true);
      expect(isPrivateIPv6('ff05::2')).toBe(true);
    });

    it('blocks IPv4-mapped IPv6 targeting private/loopback/metadata addresses', () => {
      expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIPv6('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateIPv6('::ffff:192.168.1.1')).toBe(true);
      // Public IPv4 mapped into IPv6 should be allowed
      expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
    });

    it('blocks 6to4 prefix (2002::/16) embedding private IPv4 addresses', () => {
      // 2002:7f00:0001:: embeds 127.0.0.1 (7f = 127, 00 = 0, 00 = 0, 01 = 1)
      expect(isPrivateIPv6('2002:7f00:0001::')).toBe(true);
      // 2002:0a00:0001:: embeds 10.0.0.1
      expect(isPrivateIPv6('2002:0a00:0001::')).toBe(true);
    });

    it('allows public IPv6 addresses', () => {
      expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false);
      expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false);
    });
  });

  describe('3. URL Syntax, Scheme, Credentials & Port Enforcement', () => {
    it('allows standard HTTP and HTTPS schemes', () => {
      expect(validateUrlSyntax('http://api.example.com/data').isValid).toBe(true);
      expect(validateUrlSyntax('https://api.example.com/data').isValid).toBe(true);
    });

    it('rejects dangerous protocols (file:, ftp:, gopher:, javascript:)', () => {
      expect(validateUrlSyntax('file:///etc/passwd').isValid).toBe(false);
      expect(validateUrlSyntax('ftp://ftp.example.com/file').isValid).toBe(false);
      expect(validateUrlSyntax('gopher://gopher.example.com').isValid).toBe(false);
      expect(validateUrlSyntax('javascript:alert(1)').isValid).toBe(false);
    });

    it('rejects embedded URL credentials (user:password@host)', () => {
      const result = validateUrlSyntax('http://admin:secret@api.example.com');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('URL credentials');
    });

    it('allows standard web ports and blocks dangerous/internal service ports', () => {
      expect(validateUrlSyntax('http://api.example.com:80/').isValid).toBe(true);
      expect(validateUrlSyntax('https://api.example.com:443/').isValid).toBe(true);
      expect(validateUrlSyntax('http://api.example.com:8080/').isValid).toBe(true);
      expect(validateUrlSyntax('https://api.example.com:8443/').isValid).toBe(true);

      // Block sensitive internal ports (SSH, Redis, Postgres, SMTP, etc.)
      expect(validateUrlSyntax('http://api.example.com:22/').isValid).toBe(false);
      expect(validateUrlSyntax('http://api.example.com:25/').isValid).toBe(false);
      expect(validateUrlSyntax('http://api.example.com:5432/').isValid).toBe(false);
      expect(validateUrlSyntax('http://api.example.com:6379/').isValid).toBe(false);
      expect(validateUrlSyntax('http://api.example.com:27017/').isValid).toBe(false);
    });

    it('blocks forbidden hostnames like localhost and metadata endpoints', () => {
      expect(validateUrlSyntax('http://localhost/api').isValid).toBe(false);
      expect(validateUrlSyntax('http://test.localhost/api').isValid).toBe(false);
      expect(validateUrlSyntax('http://service.local/api').isValid).toBe(false);
      expect(validateUrlSyntax('http://metadata.google.internal/computeMetadata/v1/').isValid).toBe(false);
      expect(validateUrlSyntax('http://instance-data/latest/meta-data/').isValid).toBe(false);
    });

    it('blocks direct private IP literals in URL', () => {
      expect(validateUrlSyntax('http://127.0.0.1/api').isValid).toBe(false);
      expect(validateUrlSyntax('http://169.254.169.254/latest').isValid).toBe(false);
      expect(validateUrlSyntax('http://10.0.0.1:80/').isValid).toBe(false);
    });
  });

  describe('4. DNS Resolution & Rebinding Protection', () => {
    it('blocks host when DNS resolves to a private IP address', async () => {
      const mockDns = vi.fn().mockResolvedValue([
        { address: '127.0.0.1', family: 4 },
      ]);

      await expect(
        resolveAndValidateHost(
          'evil-rebinding.com',
          mockDns as unknown as typeof dns.promises.lookup
        )
      ).rejects.toThrow(/restricted IP "127.0.0.1"/);
    });

    it('blocks host when DNS resolves to any private IP among multiple A/AAAA records', async () => {
      const mockDns = vi.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 }, // public
        { address: '10.0.0.5', family: 4 },      // private
      ]);

      await expect(
        resolveAndValidateHost(
          'dual-ip.com',
          mockDns as unknown as typeof dns.promises.lookup
        )
      ).rejects.toThrow(/restricted IP "10.0.0.5"/);
    });

    it('allows host when all resolved IP addresses are public', async () => {
      const mockDns = vi.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ]);

      const result = await resolveAndValidateHost(
        'safe-api.com',
        mockDns as unknown as typeof dns.promises.lookup
      );
      expect(result.primaryIp).toBe('93.184.216.34');
      expect(result.safeIps).toHaveLength(2);
    });
  });

  describe('5. Redirect, Streaming Response Size & Timeout Protection', () => {
    let server: http.Server;
    let serverPort: number;

    beforeAll(async () => {
      // Create local test server to verify request streaming, redirect blocking, and timeouts
      server = http.createServer((req, res) => {
        const url = req.url || '/';

        if (url === '/redirect-to-private') {
          // Attempt to redirect client to AWS metadata IP
          res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
          res.end();
          return;
        }

        if (url === '/oversized') {
          // Stream a response that exceeds safe limits
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          const chunk = 'A'.repeat(64 * 1024); // 64KB chunks
          for (let i = 0; i < 40; i++) {
            res.write(chunk); // ~2.5 MB total
          }
          res.end();
          return;
        }

        if (url === '/slow') {
          // Never respond to trigger timeout
          return;
        }

        if (url === '/echo') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Hello from safe server', status: 'ok' }));
          return;
        }

        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as net.AddressInfo;
          serverPort = addr.port;
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('blocks redirect attempting to target private cloud metadata IP', async () => {
      // Mock DNS so test-redirect.com points to our test server
      const mockDns = vi.fn().mockResolvedValue([
        { address: '127.0.0.1', family: 4 },
      ]);

      // safeHttpRequest against a URL redirecting to private IP must throw SSRF validation error
      await expect(
        safeHttpRequest(
          `http://test-redirect.com:${serverPort}/redirect-to-private`,
          {
            allowedPorts: [serverPort, ...DEFAULT_ALLOWED_PORTS],
            allowLoopbackForTesting: true,
          },
          mockDns as unknown as typeof dns.promises.lookup
        )
      ).rejects.toThrow(/SSRF validation failed|restricted IP/);
    });

    it('enforces stream-level response size limit and aborts before buffering', async () => {
      // Direct check: mock DNS resolving to local test server, but connect with limit 100KB
      await expect(
        safeHttpRequest(
          `http://safe-domain.com:${serverPort}/oversized`,
          {
            maxResponseBytes: 100 * 1024, // 100KB limit
            allowedPorts: [serverPort, ...DEFAULT_ALLOWED_PORTS],
            allowLoopbackForTesting: true,
          },
          vi.fn().mockResolvedValue([
            { address: '127.0.0.1', family: 4 },
          ]) as unknown as typeof dns.promises.lookup
        )
      ).rejects.toThrow(/Response size limit exceeded/);
    });

    it('enforces request timeout when target is unresponsive', async () => {
      await expect(
        safeHttpRequest(
          `http://slow-service.com:${serverPort}/slow`,
          {
            timeoutMs: 300, // 300ms timeout
            allowedPorts: [serverPort, ...DEFAULT_ALLOWED_PORTS],
            allowLoopbackForTesting: true,
          },
          vi.fn().mockResolvedValue([
            { address: '127.0.0.1', family: 4 },
          ]) as unknown as typeof dns.promises.lookup
        )
      ).rejects.toThrow(/timed out/);
    });
  });
});
