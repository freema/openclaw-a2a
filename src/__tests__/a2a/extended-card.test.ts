import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';

describe('GetExtendedAgentCard', () => {
  let app: express.Express;

  const config: AppConfig = {
    port: 0,
    host: '127.0.0.1',
    debug: false,
    publicUrl: 'http://localhost:3100',
    model: 'openclaw',
    instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
  };

  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn());
    ({ app } = createApp(config));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('returns UNSUPPORTED_OPERATION when disabled', async () => {
    const res = await request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .send({ jsonrpc: '2.0', id: '1', method: 'GetExtendedAgentCard', params: {} });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32004);
    expect(res.body.error.message).toContain('not supported');
  });

  it('Agent Card declares extendedAgentCard: false', async () => {
    const res = await request(app).get('/.well-known/agent-card.json');
    expect(res.body.capabilities.extendedAgentCard).toBe(false);
  });
});
