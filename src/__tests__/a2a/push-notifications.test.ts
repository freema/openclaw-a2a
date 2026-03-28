import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';

describe('Push Notification Handlers', () => {
  let app: express.Express;

  const config: AppConfig = {
    port: 0,
    host: '127.0.0.1',
    debug: false,
    publicUrl: 'http://localhost:3100',
    instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
  };

  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn());
    ({ app } = createApp(config));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  function sendRpc(method: string, params: unknown) {
    return request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .send({ jsonrpc: '2.0', id: '1', method, params });
  }

  it('CreateTaskPushNotificationConfig returns PUSH_NOTIFICATION_NOT_SUPPORTED', async () => {
    const res = await sendRpc('CreateTaskPushNotificationConfig', {
      taskId: 't1',
      pushNotificationConfig: { taskId: 't1', url: 'http://callback.example.com' },
    });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32003);
    expect(res.body.error.message).toContain('not supported');
  });

  it('GetTaskPushNotificationConfig returns PUSH_NOTIFICATION_NOT_SUPPORTED', async () => {
    const res = await sendRpc('GetTaskPushNotificationConfig', { id: 'c1', taskId: 't1' });
    expect(res.body.error.code).toBe(-32003);
  });

  it('ListTaskPushNotificationConfigs returns PUSH_NOTIFICATION_NOT_SUPPORTED', async () => {
    const res = await sendRpc('ListTaskPushNotificationConfigs', { taskId: 't1' });
    expect(res.body.error.code).toBe(-32003);
  });

  it('DeleteTaskPushNotificationConfig returns PUSH_NOTIFICATION_NOT_SUPPORTED', async () => {
    const res = await sendRpc('DeleteTaskPushNotificationConfig', { id: 'c1', taskId: 't1' });
    expect(res.body.error.code).toBe(-32003);
  });

  it('Agent Card declares pushNotifications: false', async () => {
    const res = await request(app).get('/.well-known/agent-card.json');
    expect(res.body.capabilities.pushNotifications).toBe(false);
  });
});
