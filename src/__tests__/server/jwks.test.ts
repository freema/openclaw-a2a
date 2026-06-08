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
};

describe('JWKS + signed Agent Card', () => {
  let app: any;

  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn());
    ({ app } = createApp(config));
  });

  afterAll(() => vi.restoreAllMocks());

  it('serves a JWKS with an OKP Ed25519 key', async () => {
    const res = await request(app).get('/.well-known/jwks.json');
    expect(res.status).toBe(200);
    expect(res.body.keys).toHaveLength(1);
    expect(res.body.keys[0].kty).toBe('OKP');
    expect(res.body.keys[0].crv).toBe('Ed25519');
    expect(res.body.keys[0].kid).toBeDefined();
    expect(res.body.keys[0].x).toBeDefined();
  });

  it('signs the agent card with a kid matching the JWKS', async () => {
    const card = await request(app).get('/.well-known/agent-card.json');
    const jwks = await request(app).get('/.well-known/jwks.json');

    expect(card.body.signatures).toHaveLength(1);
    const header = JSON.parse(
      Buffer.from(card.body.signatures[0].protected, 'base64url').toString('utf8')
    );
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe(jwks.body.keys[0].kid);
  });
});
