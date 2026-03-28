import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';
import { createMockFetchResponse } from '../helpers/mock-sse-fetch.js';

describe('A2A Endpoints (Integration)', () => {
  let app: express.Express;
  let fetchSpy: ReturnType<typeof vi.fn>;

  const config: AppConfig = {
    port: 0,
    host: '127.0.0.1',
    debug: false,
    publicUrl: 'http://localhost:3100',
    instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
  };

  beforeAll(() => {
    fetchSpy = vi.fn().mockImplementation(() => createMockFetchResponse('Mock A2A response'));
    vi.stubGlobal('fetch', fetchSpy);
    ({ app } = createApp(config));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Agent Card', () => {
    it('GET /.well-known/agent-card.json returns valid v1.0 card', async () => {
      const res = await request(app).get('/.well-known/agent-card.json');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body.supportedInterfaces).toBeDefined();
      expect(res.body.supportedInterfaces[0].protocolVersion).toBe('1.0');
    });

    it('Agent Card contains capabilities', async () => {
      const res = await request(app).get('/.well-known/agent-card.json');
      expect(res.body.capabilities.streaming).toBe(true);
    });

    it('Agent Card does not have deprecated fields', async () => {
      const res = await request(app).get('/.well-known/agent-card.json');
      expect(res.body.url).toBeUndefined();
      expect(res.body.additionalInterfaces).toBeUndefined();
    });
  });

  describe('SendMessage', () => {
    it('POST /a2a with SendMessage returns task', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({
          jsonrpc: '2.0',
          id: '1',
          method: 'SendMessage',
          params: {
            message: {
              messageId: 'test-1',
              role: 'ROLE_USER',
              parts: [{ text: 'Hello!' }],
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.jsonrpc).toBe('2.0');
      expect(res.body.id).toBe('1');
      expect(res.body.result).toBeDefined();
      expect(res.body.result.id).toBeDefined();
      expect(res.body.result.status.state).toBe('TASK_STATE_COMPLETED');
    });

    it('response Task has id field (not taskId)', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({
          jsonrpc: '2.0',
          id: '2',
          method: 'SendMessage',
          params: {
            message: {
              messageId: 'test-2',
              role: 'ROLE_USER',
              parts: [{ text: 'test' }],
            },
          },
        });

      expect(res.body.result.id).toBeDefined();
      expect(res.body.result.taskId).toBeUndefined();
    });
  });

  describe('Version handling', () => {
    it('POST /a2a without A2A-Version returns VERSION_NOT_SUPPORTED', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: '1', method: 'SendMessage', params: {} });

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32009);
    });

    it('POST /a2a with A2A-Version: 0.3 returns VERSION_NOT_SUPPORTED', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '0.3')
        .send({ jsonrpc: '2.0', id: '1', method: 'SendMessage', params: {} });

      expect(res.body.error.code).toBe(-32009);
    });
  });

  describe('Error handling', () => {
    it('POST /a2a with invalid method returns METHOD_NOT_FOUND', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({ jsonrpc: '2.0', id: '1', method: 'message/send', params: {} });

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(-32601);
    });

    it('POST /a2a with missing jsonrpc returns INVALID_REQUEST', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({ id: '1', method: 'SendMessage', params: {} });

      expect(res.body.error.code).toBe(-32600);
    });

    it('POST /a2a with missing params returns INVALID_PARAMS', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({ jsonrpc: '2.0', id: '1', method: 'SendMessage', params: {} });

      expect(res.body.error.code).toBe(-32602);
    });

    it('GetTask with unknown ID returns TASK_NOT_FOUND', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({ jsonrpc: '2.0', id: '1', method: 'GetTask', params: { id: 'nonexistent' } });

      expect(res.body.error.code).toBe(-32001);
    });
  });

  describe('Push notifications', () => {
    it('returns PUSH_NOTIFICATION_NOT_SUPPORTED', async () => {
      const res = await request(app)
        .post('/a2a')
        .set('A2A-Version', '1.0')
        .send({
          jsonrpc: '2.0',
          id: '1',
          method: 'CreateTaskPushNotificationConfig',
          params: { taskId: 't1', pushNotificationConfig: { taskId: 't1', url: 'http://x' } },
        });

      expect(res.body.error.code).toBe(-32003);
    });
  });
});
