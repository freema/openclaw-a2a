import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';
import { createMockFetchResponse } from '../helpers/mock-sse-fetch.js';

describe('Request Handler — JSON-RPC Dispatch', () => {
  let app: express.Express;

  const config: AppConfig = {
    port: 0,
    host: '127.0.0.1',
    debug: false,
    publicUrl: 'http://localhost:3100',
    model: 'openclaw',
    instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
  };

  beforeAll(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => createMockFetchResponse('OK'))
    );
    ({ app } = createApp(config));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  function sendRpc(method: string, params: unknown = {}) {
    return request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .send({ jsonrpc: '2.0', id: '1', method, params });
  }

  function sendMessage(text = 'Hi') {
    return sendRpc('SendMessage', {
      message: { messageId: 'msg-1', role: 'ROLE_USER', parts: [{ text }] },
    });
  }

  describe('Core method dispatch', () => {
    it('dispatches SendMessage to correct handler', async () => {
      const res = await sendMessage();
      expect(res.body.result).toBeDefined();
      expect(res.body.result.status.state).toBe('TASK_STATE_COMPLETED');
    });

    it('dispatches SendStreamingMessage', async () => {
      const res = await sendRpc('SendStreamingMessage', {
        message: { messageId: 'msg-1', role: 'ROLE_USER', parts: [{ text: 'Hi' }] },
      });
      expect(res.status).toBe(200);
      // Streaming returns SSE, not JSON — check content-type
      expect(res.headers['content-type']).toMatch(/event-stream/);
    });

    it('dispatches GetTask', async () => {
      const res = await sendRpc('GetTask', { id: 'nonexistent' });
      expect(res.body.error.code).toBe(-32001); // TASK_NOT_FOUND
    });

    it('dispatches ListTasks', async () => {
      const res = await sendRpc('ListTasks', {});
      expect(res.body.result).toBeDefined();
      expect(res.body.result.tasks).toBeDefined();
    });

    it('dispatches CancelTask', async () => {
      const res = await sendRpc('CancelTask', { id: 'nonexistent' });
      expect(res.body.error.code).toBe(-32001); // TASK_NOT_FOUND
    });

    it('dispatches SubscribeToTask', async () => {
      const res = await sendRpc('SubscribeToTask', { id: 'task-1' });
      expect(res.body.error.code).toBe(-32004); // UNSUPPORTED_OPERATION
    });
  });

  describe('Push notification methods', () => {
    it('dispatches CreateTaskPushNotificationConfig', async () => {
      const res = await sendRpc('CreateTaskPushNotificationConfig', {
        taskId: 't1',
        pushNotificationConfig: { taskId: 't1', url: 'http://x' },
      });
      expect(res.body.error.code).toBe(-32003); // PUSH_NOTIFICATION_NOT_SUPPORTED
    });

    it('dispatches GetTaskPushNotificationConfig', async () => {
      const res = await sendRpc('GetTaskPushNotificationConfig', { id: 'c1', taskId: 't1' });
      expect(res.body.error.code).toBe(-32003);
    });

    it('dispatches ListTaskPushNotificationConfigs', async () => {
      const res = await sendRpc('ListTaskPushNotificationConfigs', { taskId: 't1' });
      expect(res.body.error.code).toBe(-32003);
    });

    it('dispatches DeleteTaskPushNotificationConfig', async () => {
      const res = await sendRpc('DeleteTaskPushNotificationConfig', { id: 'c1', taskId: 't1' });
      expect(res.body.error.code).toBe(-32003);
    });
  });

  describe('Extended Agent Card', () => {
    it('dispatches GetExtendedAgentCard', async () => {
      const res = await sendRpc('GetExtendedAgentCard', {});
      expect(res.body.error.code).toBe(-32004); // UNSUPPORTED_OPERATION
    });
  });

  describe('Error handling', () => {
    it('returns METHOD_NOT_FOUND for unknown method', async () => {
      const res = await sendRpc('UnknownMethod');
      expect(res.body.error.code).toBe(-32601);
    });

    it('returns METHOD_NOT_FOUND for v0.3 method names', async () => {
      const res = await sendRpc('message/send');
      expect(res.body.error.code).toBe(-32601);
    });

    it('validates A2A-Version: 1.0 header', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({ jsonrpc: '2.0', id: '1', method: 'ListTasks', params: {} });
      expect(res.body.error).toBeUndefined();
    });

    it('returns VERSION_NOT_SUPPORTED for A2A-Version: 0.5', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '0.5')
        .send({ jsonrpc: '2.0', id: '1', method: 'SendMessage', params: {} });
      expect(res.body.error.code).toBe(-32009);
    });

    it('returns VERSION_NOT_SUPPORTED for missing header (empty → 0.3)', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: '1', method: 'SendMessage', params: {} });
      expect(res.body.error.code).toBe(-32009);
    });

    it('accepts A2A-Version as query param', async () => {
      const res = await request(app)
        .post('/a2a?A2A-Version=1.0')
        .send({ jsonrpc: '2.0', id: '1', method: 'ListTasks', params: {} });
      expect(res.body.error).toBeUndefined();
    });

    it('validates JSON-RPC structure', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({ id: '1', method: 'SendMessage', params: {} });
      expect(res.body.error.code).toBe(-32600);
    });

    it('returns INVALID_PARAMS for missing message in SendMessage', async () => {
      const res = await sendRpc('SendMessage', {});
      expect(res.body.error.code).toBe(-32602);
    });
  });
});
