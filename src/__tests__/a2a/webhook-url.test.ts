import { describe, it, expect } from 'vitest';
import { assertSafeWebhookUrl } from '../../a2a/webhook-url.js';

describe('assertSafeWebhookUrl', () => {
  it('allows public http(s) hosts', () => {
    expect(() => assertSafeWebhookUrl('https://hooks.example.com/x')).not.toThrow();
    expect(() => assertSafeWebhookUrl('http://callback.example.com')).not.toThrow();
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => assertSafeWebhookUrl('file:///etc/passwd')).toThrow();
    expect(() => assertSafeWebhookUrl('ftp://example.com')).toThrow();
  });

  it('rejects loopback and localhost', () => {
    expect(() => assertSafeWebhookUrl('http://127.0.0.1/x')).toThrow();
    expect(() => assertSafeWebhookUrl('http://localhost/x')).toThrow();
    expect(() => assertSafeWebhookUrl('http://[::1]/x')).toThrow();
  });

  it('rejects private and link-local ranges', () => {
    expect(() => assertSafeWebhookUrl('http://10.0.0.5/x')).toThrow();
    expect(() => assertSafeWebhookUrl('http://192.168.1.1/x')).toThrow();
    expect(() => assertSafeWebhookUrl('http://172.16.0.1/x')).toThrow();
    expect(() => assertSafeWebhookUrl('http://169.254.169.254/latest/meta-data/')).toThrow();
  });

  it('rejects invalid URLs', () => {
    expect(() => assertSafeWebhookUrl('not a url')).toThrow();
  });

  it('allowlist permits listed hosts and rejects others (even public ones)', () => {
    const allow = ['hooks.internal'];
    expect(() => assertSafeWebhookUrl('http://hooks.internal/x', allow)).not.toThrow();
    expect(() => assertSafeWebhookUrl('https://hooks.example.com/x', allow)).toThrow();
  });

  it('allowlist can permit an otherwise-blocked internal host', () => {
    expect(() => assertSafeWebhookUrl('http://10.1.2.3/x', ['10.1.2.3'])).not.toThrow();
  });
});
