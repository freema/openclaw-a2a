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
  instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
  authToken: 'super-secret',
};

describe('Bearer auth on /a2a', () => {
  let app: any;

  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn());
    ({ app } = createApp(config));
  });

  afterAll(() => vi.restoreAllMocks());

  function rpc() {
    return { jsonrpc: '2.0', id: '1', method: 'ListTasks', params: {} };
  }

  it('rejects /a2a without a bearer token', async () => {
    const res = await request(app).post('/a2a').set('A2A-Version', '1.0').send(rpc());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(-32000);
  });

  it('rejects /a2a with the wrong token', async () => {
    const res = await request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .set('Authorization', 'Bearer nope')
      .send(rpc());
    expect(res.status).toBe(401);
  });

  it('accepts /a2a with the correct token', async () => {
    const res = await request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .set('Authorization', 'Bearer super-secret')
      .send(rpc());
    expect(res.status).toBe(200);
    expect(res.body.result.tasks).toBeDefined();
  });

  it('advertises the bearer security scheme on the (public) agent card', async () => {
    const res = await request(app).get('/.well-known/agent-card.json');
    expect(res.status).toBe(200);
    expect(res.body.securitySchemes.bearer).toEqual({ type: 'http', scheme: 'bearer' });
    expect(res.body.security).toEqual([{ bearer: [] }]);
  });

  it('keeps discovery + health endpoints public', async () => {
    expect((await request(app).get('/.well-known/agent-card.json')).status).toBe(200);
    expect((await request(app).get('/.well-known/jwks.json')).status).toBe(200);
    expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('No auth configured', () => {
  it('leaves /a2a public and omits security from the card', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { app } = createApp({ ...config, authToken: undefined });
    const res = await request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .send({ jsonrpc: '2.0', id: '1', method: 'ListTasks', params: {} });
    expect(res.status).toBe(200);
    const card = await request(app).get('/.well-known/agent-card.json');
    expect(card.body.securitySchemes).toBeUndefined();
    vi.restoreAllMocks();
  });
});
