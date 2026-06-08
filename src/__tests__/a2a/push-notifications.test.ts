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

function sendRpc(app: any, method: string, params: unknown) {
  return request(app)
    .post('/a2a')
    .set('A2A-Version', '1.0')
    .send({ jsonrpc: '2.0', id: '1', method, params });
}

function sendMessage(app: any, body: Record<string, unknown>) {
  return request(app)
    .post('/a2a')
    .set('A2A-Version', '1.0')
    .send({
      jsonrpc: '2.0',
      id: '1',
      method: 'SendMessage',
      params: { message: { messageId: 'm1', role: 'ROLE_USER', parts: [{ text: 'Hi' }] }, ...body },
    });
}

// Stub fetch with a chat response, create a real (completed) task, return its id.
async function appWithTask() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => createMockFetchResponse('ok'))
  );
  const { app } = createApp(config);
  const created = await sendMessage(app, {});
  return { app, taskId: created.body.result.id as string };
}

describe('Push Notification Handlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Config CRUD', () => {
    it('CreateTaskPushNotificationConfig stores a config with a generated id', async () => {
      const { app, taskId } = await appWithTask();
      const res = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId,
        pushNotificationConfig: { taskId, url: WEBHOOK },
      });
      expect(res.body.error).toBeUndefined();
      expect(res.body.result.id).toBeDefined();
      expect(res.body.result.url).toBe(WEBHOOK);
      expect(res.body.result.taskId).toBe(taskId);
    });

    it('Get/List/Delete round-trip works', async () => {
      const { app, taskId } = await appWithTask();

      const created = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId,
        pushNotificationConfig: { taskId, url: WEBHOOK },
      });
      const id = created.body.result.id;

      const got = await sendRpc(app, 'GetTaskPushNotificationConfig', { id, taskId });
      expect(got.body.result.id).toBe(id);

      const listed = await sendRpc(app, 'ListTaskPushNotificationConfigs', { taskId });
      expect(listed.body.result.configs).toHaveLength(1);

      const deleted = await sendRpc(app, 'DeleteTaskPushNotificationConfig', { id, taskId });
      expect(deleted.body.error).toBeUndefined();

      const after = await sendRpc(app, 'ListTaskPushNotificationConfigs', { taskId });
      expect(after.body.result.configs).toHaveLength(0);
    });

    it('Create returns TASK_NOT_FOUND for an unknown task', async () => {
      const { app } = await appWithTask();
      const res = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId: 'does-not-exist',
        pushNotificationConfig: { taskId: 'does-not-exist', url: WEBHOOK },
      });
      expect(res.body.error.code).toBe(-32001);
    });

    it('Get returns TASK_NOT_FOUND for unknown config', async () => {
      const { app, taskId } = await appWithTask();
      const res = await sendRpc(app, 'GetTaskPushNotificationConfig', { id: 'nope', taskId });
      expect(res.body.error.code).toBe(-32001);
    });

    it('Create requires a webhook url', async () => {
      const { app, taskId } = await appWithTask();
      const res = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId,
        pushNotificationConfig: { taskId },
      });
      expect(res.body.error.code).toBe(-32602);
    });
  });

  describe('SSRF protection', () => {
    it('rejects loopback webhook URLs', async () => {
      const { app, taskId } = await appWithTask();
      const res = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId,
        pushNotificationConfig: { taskId, url: 'http://127.0.0.1:9000/hook' },
      });
      expect(res.body.error.code).toBe(-32602);
    });

    it('rejects cloud-metadata / link-local URLs', async () => {
      const { app, taskId } = await appWithTask();
      const res = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId,
        pushNotificationConfig: { taskId, url: 'http://169.254.169.254/latest/meta-data/' },
      });
      expect(res.body.error.code).toBe(-32602);
    });

    it('rejects non-http(s) schemes', async () => {
      const { app, taskId } = await appWithTask();
      const res = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId,
        pushNotificationConfig: { taskId, url: 'file:///etc/passwd' },
      });
      expect(res.body.error.code).toBe(-32602);
    });
  });

  describe('Secret redaction', () => {
    it('Get/List do not echo back token or credentials', async () => {
      const { app, taskId } = await appWithTask();
      const created = await sendRpc(app, 'CreateTaskPushNotificationConfig', {
        taskId,
        pushNotificationConfig: {
          taskId,
          url: WEBHOOK,
          token: 'secret-token',
          authentication: { schemes: ['Bearer'], credentials: 'super-creds' },
        },
      });
      const id = created.body.result.id;

      const got = await sendRpc(app, 'GetTaskPushNotificationConfig', { id, taskId });
      expect(got.body.result.url).toBe(WEBHOOK);
      expect(got.body.result.token).toBeUndefined();
      expect(got.body.result.authentication.credentials).toBeUndefined();
      expect(got.body.result.authentication.schemes).toEqual(['Bearer']);
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

      await sendMessage(app, {
        configuration: { pushNotificationConfig: { url: WEBHOOK, token: 'secret-tok' } },
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

      const appendChunks = webhookBodies.filter((b) => b.artifactUpdate?.append === true);
      expect(appendChunks).toHaveLength(0);
      const artifactCalls = webhookBodies.filter((b) => b.artifactUpdate);
      expect(artifactCalls.length).toBeLessThanOrEqual(1);
    });

    it('de-duplicates the inline config across multi-turn messages', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (typeof url === 'string' && url.startsWith(WEBHOOK)) {
            return Promise.resolve(new Response('{}', { status: 200 }));
          }
          return Promise.resolve(createMockFetchResponse('ok'));
        })
      );
      const { app } = createApp(config);

      const turn1 = await sendMessage(app, {
        configuration: { pushNotificationConfig: { url: WEBHOOK } },
      });
      const taskId = turn1.body.result.id;

      // Turn 2 re-sends the same inline config for the same task.
      await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({
          jsonrpc: '2.0',
          id: '2',
          method: 'SendMessage',
          params: {
            message: { messageId: 'm2', taskId, role: 'ROLE_USER', parts: [{ text: 'more' }] },
            configuration: { pushNotificationConfig: { url: WEBHOOK } },
          },
        });

      const listed = await sendRpc(app, 'ListTaskPushNotificationConfigs', { taskId });
      expect(listed.body.result.configs).toHaveLength(1);
    });
  });
});
