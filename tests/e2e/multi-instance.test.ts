import { describe, it, expect } from 'vitest';
import { sendMessage, sendA2A } from './helpers.js';

const BASE_URL = () => process.env.A2A_SERVER_URL ?? 'http://localhost:3199';

describe('E2E: Multi-instance Routing', () => {
  it('message without metadata uses default instance', async () => {
    const result = await sendMessage('Default instance test');
    expect(result.result).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('non-existent instance returns error', async () => {
    const result = await sendMessage('Route me', {
      metadata: { instance: 'nonexistent-instance-xyz' },
    });
    // Should fail — task will be in FAILED state with error message
    expect(result.result?.status?.state).toBe('TASK_STATE_FAILED');
  });

  it('instances endpoint lists available instances', async () => {
    const res = await fetch(`${BASE_URL()}/instances`);
    const instances = (await res.json()) as any[];
    expect(instances.length).toBeGreaterThan(0);
    expect(instances[0].name).toBeDefined();
    expect(instances[0].url).toBeDefined();
  });

  it('instances endpoint does not expose tokens', async () => {
    const res = await fetch(`${BASE_URL()}/instances`);
    const instances = (await res.json()) as any[];
    for (const inst of instances) {
      expect(inst.token).toBeUndefined();
    }
  });
});
