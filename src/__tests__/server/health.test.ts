import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';

describe('Health & Info (Integration)', () => {
  let app: express.Express;

  const config: AppConfig = {
    port: 0,
    host: '127.0.0.1',
    debug: false,
    publicUrl: 'http://localhost:3100',
    instances: [
      { name: 'prod', url: 'http://prod:18789', token: 'secret-token', default: true },
      { name: 'staging', url: 'http://staging:18789', token: 'other-secret' },
    ],
  };

  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn());
    ({ app } = createApp(config));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health returns a2aVersion', async () => {
    const res = await request(app).get('/health');
    expect(res.body.a2aVersion).toBe('1.0');
  });

  it('GET /instances returns instance list', async () => {
    const res = await request(app).get('/instances');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('prod');
    expect(res.body[1].name).toBe('staging');
  });

  it('GET /instances does not expose tokens', async () => {
    const res = await request(app).get('/instances');
    for (const inst of res.body) {
      expect(inst.token).toBeUndefined();
    }
  });
});
