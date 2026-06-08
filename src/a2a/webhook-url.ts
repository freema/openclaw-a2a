// Webhook URL safety validation — mitigates SSRF via attacker-supplied push URLs.
//
// By default, http(s) only and loopback/private/link-local/metadata addresses are
// rejected. Operators can instead set an explicit allowlist (A2A_PUSH_ALLOWED_HOSTS)
// to permit specific internal hosts. Note: hostnames that are not IP literals are
// allowed and resolved at delivery time — DNS-rebinding is not fully mitigated; run
// with an egress firewall for hard guarantees.

import { isIP } from 'node:net';
import { A2AError, A2A_ERROR_CODES } from './errors.js';

export function assertSafeWebhookUrl(rawUrl: string, allowedHosts?: string[]): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new A2AError(A2A_ERROR_CODES.INVALID_PARAMS, `Invalid webhook url: "${rawUrl}"`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new A2AError(A2A_ERROR_CODES.INVALID_PARAMS, `Webhook url must use http(s): "${rawUrl}"`);
  }

  // url.hostname keeps brackets around IPv6 literals (e.g. "[::1]") — strip them.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Explicit operator allowlist takes precedence over the default block rules.
  if (allowedHosts && allowedHosts.length > 0) {
    if (!allowedHosts.includes(host)) {
      throw new A2AError(
        A2A_ERROR_CODES.INVALID_PARAMS,
        `Webhook host "${host}" is not in A2A_PUSH_ALLOWED_HOSTS`
      );
    }
    return;
  }

  if (isBlockedHost(host)) {
    throw new A2AError(
      A2A_ERROR_CODES.INVALID_PARAMS,
      `Webhook host "${host}" is not allowed (loopback/private/link-local). ` +
        `Set A2A_PUSH_ALLOWED_HOSTS to permit specific internal hosts.`
    );
  }
}

function isBlockedHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const kind = isIP(host);
  if (kind === 4) return isBlockedIPv4(host);
  if (kind === 6) return isBlockedIPv6(host);
  // Non-IP hostname — allowed (see DNS-rebinding caveat above).
  return false;
}

function isBlockedIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 0 || a === 127) return true; // current network / loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fe80')) return true; // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique local
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}
