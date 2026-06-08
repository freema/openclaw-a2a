import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';
import { createMockFetchResponse } from '../helpers/mock-sse-fetch.js';

const config: AppConfig = {
  port: 0,
  host: '127.0.0.1',
  debug: false,
  publicUrl: 'http://localhost:3100',
  model: 'openclaw',
  instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
};

describe('SubscribeToTask (resubscribe)', () => {
  let app: any;

  beforeAll(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => createMockFetchResponse('done'))
    );
    ({ app } = createApp(config));
  });

  afterAll(() => vi.restoreAllMocks());

  function sendRpc(method: string, params: unknown) {
    return request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .send({ jsonrpc: '2.0', id: '1', method, params });
  }

  it('returns TASK_NOT_FOUND for an unknown task', async () => {
    const res = await sendRpc('SubscribeToTask', { id: 'unknown' });
    expect(res.body.error.code).toBe(-32001);
  });

  it('returns INVALID_PARAMS when id is missing', async () => {
    const res = await sendRpc('SubscribeToTask', {});
    expect(res.body.error.code).toBe(-32602);
  });

  it('emits the current task as the first SSE event then closes for a terminal task', async () => {
    // Create + complete a task synchronously.
    const created = await sendRpc('SendMessage', {
      message: { messageId: 'm1', role: 'ROLE_USER', parts: [{ text: 'Hi' }] },
    });
    const taskId = created.body.result.id;
    expect(created.body.result.status.state).toBe('TASK_STATE_COMPLETED');

    const sub = await sendRpc('SubscribeToTask', { id: taskId });
    expect(sub.headers['content-type']).toMatch(/event-stream/);
    expect(sub.text).toContain(taskId);
    expect(sub.text).toContain('TASK_STATE_COMPLETED');
  });
});
