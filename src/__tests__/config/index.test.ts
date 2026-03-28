import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getDefaultInstance, getInstanceByName } from '../../config/index.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads single instance from OPENCLAW_URL', () => {
    process.env.OPENCLAW_URL = 'http://localhost:18789';
    process.env.OPENCLAW_GATEWAY_TOKEN = 'test-token';
    const config = loadConfig();
    expect(config.instances).toHaveLength(1);
    expect(config.instances[0].url).toBe('http://localhost:18789');
    expect(config.instances[0].token).toBe('test-token');
    expect(config.instances[0].default).toBe(true);
  });

  it('strips trailing slash from URL', () => {
    process.env.OPENCLAW_URL = 'http://localhost:18789///';
    const config = loadConfig();
    expect(config.instances[0].url).toBe('http://localhost:18789');
  });

  it('loads multi-instance from OPENCLAW_INSTANCES', () => {
    process.env.OPENCLAW_INSTANCES = JSON.stringify([
      { name: 'prod', url: 'http://prod:18789', token: 't1', default: true },
      { name: 'staging', url: 'http://staging:18789', token: 't2' },
    ]);
    const config = loadConfig();
    expect(config.instances).toHaveLength(2);
    expect(config.instances[0].name).toBe('prod');
  });

  it('defaults first instance when no default specified', () => {
    process.env.OPENCLAW_INSTANCES = JSON.stringify([
      { name: 'a', url: 'http://a:18789', token: 't1' },
      { name: 'b', url: 'http://b:18789', token: 't2' },
    ]);
    const config = loadConfig();
    expect(config.instances[0].default).toBe(true);
  });

  it('throws when neither OPENCLAW_URL nor OPENCLAW_INSTANCES set', () => {
    delete process.env.OPENCLAW_URL;
    delete process.env.OPENCLAW_INSTANCES;
    expect(() => loadConfig()).toThrow('OPENCLAW_URL or OPENCLAW_INSTANCES must be set');
  });

  it('throws on invalid OPENCLAW_INSTANCES JSON', () => {
    process.env.OPENCLAW_INSTANCES = 'not json';
    expect(() => loadConfig()).toThrow('Failed to parse OPENCLAW_INSTANCES');
  });

  it('throws on empty OPENCLAW_INSTANCES array', () => {
    process.env.OPENCLAW_INSTANCES = '[]';
    expect(() => loadConfig()).toThrow('non-empty JSON array');
  });

  it('uses default port 3100', () => {
    process.env.OPENCLAW_URL = 'http://localhost:18789';
    const config = loadConfig();
    expect(config.port).toBe(3100);
  });

  it('parses PORT env var', () => {
    process.env.OPENCLAW_URL = 'http://localhost:18789';
    process.env.PORT = '4000';
    const config = loadConfig();
    expect(config.port).toBe(4000);
  });

  it('parses DEBUG env var', () => {
    process.env.OPENCLAW_URL = 'http://localhost:18789';
    process.env.DEBUG = 'true';
    const config = loadConfig();
    expect(config.debug).toBe(true);
  });

  it('getDefaultInstance returns the default', () => {
    process.env.OPENCLAW_URL = 'http://localhost:18789';
    const config = loadConfig();
    const inst = getDefaultInstance(config);
    expect(inst.default).toBe(true);
  });

  it('getInstanceByName finds instance', () => {
    process.env.OPENCLAW_INSTANCES = JSON.stringify([
      { name: 'prod', url: 'http://prod:18789', token: 't1', default: true },
      { name: 'staging', url: 'http://staging:18789', token: 't2' },
    ]);
    const config = loadConfig();
    const inst = getInstanceByName(config, 'staging');
    expect(inst?.name).toBe('staging');
  });

  it('getInstanceByName returns undefined for unknown', () => {
    process.env.OPENCLAW_URL = 'http://localhost:18789';
    const config = loadConfig();
    expect(getInstanceByName(config, 'nonexistent')).toBeUndefined();
  });
});
