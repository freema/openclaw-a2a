import { describe, it, expect, vi, afterAll } from 'vitest';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';
import http from 'http';

describe('Server Lifecycle', () => {
  const config: AppConfig = {
    port: 0,
    host: '127.0.0.1',
    debug: false,
    publicUrl: 'http://localhost:3100',
    model: 'openclaw',
    instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
  };

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('server starts on configured port', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { app } = createApp(config);

    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    const address = server.address() as { port: number };
    expect(address.port).toBeGreaterThan(0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('server handles graceful shutdown', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { app } = createApp(config);

    const server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    // Verify server is listening
    expect(server.listening).toBe(true);

    // Close server
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Verify server is closed
    expect(server.listening).toBe(false);
  });
});
