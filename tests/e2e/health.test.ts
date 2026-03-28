import { describe, it, expect } from 'vitest';
import { getHealth } from './helpers.js';

const BASE_URL = () => process.env.A2A_SERVER_URL ?? 'http://localhost:3199';

describe('E2E: Health & Info', () => {
  it('health endpoint returns ok', async () => {
    const health = await getHealth();
    expect(health.status).toBe('ok');
  });

  it('instances endpoint returns list', async () => {
    const res = await fetch(`${BASE_URL()}/instances`);
    const instances = (await res.json()) as any[];
    expect(instances.length).toBeGreaterThan(0);
  });

  it('instances do not expose tokens', async () => {
    const res = await fetch(`${BASE_URL()}/instances`);
    const instances = (await res.json()) as any[];
    for (const inst of instances) {
      expect(inst.token).toBeUndefined();
    }
  });
});
