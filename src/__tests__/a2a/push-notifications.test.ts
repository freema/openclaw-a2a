import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';
import { createMockFetchResponse, createMockSSEResponse } from '../helpers/mock-sse-fetch.js';

const config: AppConfig = {
  port: 0,
  host: '127.0.0.1',
  debug: false,
  publicUrl: 'http://localhost:3100',
  model: 'openclaw',
  instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
};

const WEBHOOK = 'http://callback.example.com/hook';

function flush() {
  return new Promise((r) => setTimeout(r, 20));
}

describe('Push Notification Handlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function sendRpc(app: any, method: string, params: unknown) {
    return request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .send({ jsonrpc: '2.0', id: '1', method, params });
  }

  describe('Config CRUD', () => {
    it('CreateTaskPushNotificationConfig stores a config with a generated id', async () => {
      vi.stubGlobal('fetch', vi.fn());
      const { app } = createApp(config);
      const res = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId: 't1',
        pushNotificationConfig: { taskId: 't1', url: WEBHOOK },
      });
      expect(res.body.error).toBeUndefined();
      expect(res.body.result.id).toBeDefined();
      expect(res.body.result.url).toBe(WEBHOOK);
      expect(res.body.result.taskId).toBe('t1');
    });

    it('Get/List/Delete round-trip works', async () => {
      vi.stubGlobal('fetch', vi.fn());
      const { app } = createApp(config);

      const created = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId: 't1',
        pushNotificationConfig: { taskId: 't1', url: WEBHOOK },
      });
      const id = created.body.result.id;

      const got = await sendRpc(app, 'GetTaskPushNotificationConfig', { id, taskId: 't1' });
      expect(got.body.result.id).toBe(id);

      const listed = await sendRpc(app, 'ListTaskPushNotificationConfigs', { taskId: 't1' });
      expect(listed.body.result.configs).toHaveLength(1);

      const deleted = await sendRpc(app, 'DeleteTaskPushNotificationConfig', { id, taskId: 't1' });
      expect(deleted.body.error).toBeUndefined();

      const after = await sendRpc(app, 'ListTaskPushNotificationConfigs', { taskId: 't1' });
      expect(after.body.result.configs).toHaveLength(0);
    });

    it('Get returns TASK_NOT_FOUND for unknown config', async () => {
      vi.stubGlobal('fetch', vi.fn());
      const { app } = createApp(config);
      const res = await sendRpc(app, 'GetTaskPushNotificationConfig', { id: 'nope', taskId: 't1' });
      expect(res.body.error.code).toBe(-32001);
    });

    it('Create requires a webhook url', async () => {
      vi.stubGlobal('fetch', vi.fn());
      const { app } = createApp(config);
      const res = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId: 't1',
        pushNotificationConfig: { taskId: 't1' },
      });
      expect(res.body.error.code).toBe(-32602);
    });
  });

  describe('Agent Card', () => {
    it('declares pushNotifications: true', async () => {
      vi.stubGlobal('fetch', vi.fn());
      const { app } = createApp(config);
      const res = await request(app).get('/.well-known/agent-card.json');
      expect(res.body.capabilities.pushNotifications).toBe(true);
    });
  });

  describe('Webhook delivery', () => {
    it('delivers status + artifact events to the inline webhook with the token header', async () => {
      const webhookCalls: Array<{ headers: any; body: any }> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string, init: any) => {
          if (typeof url === 'string' && url.startsWith(WEBHOOK)) {
            webhookCalls.push({ headers: init.headers, body: JSON.parse(init.body) });
            return Promise.resolve(new Response('{}', { status: 200 }));
          }
          return Promise.resolve(createMockFetchResponse('Hello back'));
        })
      );
      const { app } = createApp(config);

      await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({
          jsonrpc: '2.0',
          id: '1',
          method: 'SendMessage',
          params: {
            message: { messageId: 'm1', role: 'ROLE_USER', parts: [{ text: 'Hi' }] },
            configuration: { pushNotificationConfig: { url: WEBHOOK, token: 'secret-tok' } },
          },
        });
      await flush();

      expect(webhookCalls.length).toBeGreaterThan(0);
      expect(webhookCalls[0].headers['X-A2A-Notification-Token']).toBe('secret-tok');
      const hasStatus = webhookCalls.some((c) => c.body.statusUpdate);
      const hasArtifact = webhookCalls.some((c) => c.body.artifactUpdate);
      expect(hasStatus).toBe(true);
      expect(hasArtifact).toBe(true);
    });

    it('does NOT deliver one webhook per stream chunk (append chunks are skipped)', async () => {
      const webhookBodies: any[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string, init: any) => {
          if (typeof url === 'string' && url.startsWith(WEBHOOK)) {
            webhookBodies.push(JSON.parse(init.body));
            return Promise.resolve(new Response('{}', { status: 200 }));
          }
          // OpenClaw streaming response — 3 chunks
          return Promise.resolve(createMockSSEResponse(['Mock ', 'streaming ', 'response']));
        })
      );
      const { app } = createApp(config);

      await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({
          jsonrpc: '2.0',
          id: '1',
          method: 'SendStreamingMessage',
          params: {
            message: { messageId: 'm1', role: 'ROLE_USER', parts: [{ text: 'Hi' }] },
            configuration: { pushNotificationConfig: { url: WEBHOOK } },
          },
        });
      await flush();

      // No delivered artifact event should be an append-chunk
      const appendChunks = webhookBodies.filter((b) => b.artifactUpdate?.append === true);
      expect(appendChunks).toHaveLength(0);
      // At most one artifact webhook (the final lastChunk marker)
      const artifactCalls = webhookBodies.filter((b) => b.artifactUpdate);
      expect(artifactCalls.length).toBeLessThanOrEqual(1);
    });
  });
});
