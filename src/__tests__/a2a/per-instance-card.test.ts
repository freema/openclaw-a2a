import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';

const config: AppConfig = {
  port: 0,
  host: '127.0.0.1',
  debug: false,
  publicUrl: 'http://localhost:3100',
  model: 'openclaw',
  instances: [
    { name: 'prod', url: 'http://prod:18789', token: 't1', default: true },
    { name: 'staging', url: 'http://staging:18789', token: 't2' },
  ],
};

describe('Per-instance (multi-tenant) Agent Cards', () => {
  let app: any;

  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn());
    ({ app } = createApp(config));
  });

  afterAll(() => vi.restoreAllMocks());

  it('serves a tenant-scoped card with the instance tenant', async () => {
    const res = await request(app).get('/.well-known/staging/agent-card.json');
    expect(res.status).toBe(200);
    expect(res.body.supportedInterfaces[0].tenant).toBe('staging');
    expect(res.body.name).toContain('staging');
    expect(res.body.skills[0].id).toBe('openclaw-chat-staging');
    expect(res.body.signatures).toHaveLength(1);
  });

  it('returns 404 for an unknown instance', async () => {
    const res = await request(app).get('/.well-known/nope/agent-card.json');
    expect(res.status).toBe(404);
  });

  it('global card advertises instances as tenant interfaces and skills', async () => {
    const res = await request(app).get('/.well-known/agent-card.json');
    const tenants = res.body.supportedInterfaces.map((i: any) => i.tenant).filter(Boolean);
    expect(tenants).toContain('prod');
    expect(tenants).toContain('staging');
    const skillIds = res.body.skills.map((s: any) => s.id);
    expect(skillIds).toContain('openclaw-chat-prod');
    expect(skillIds).toContain('openclaw-chat-staging');
  });
});
