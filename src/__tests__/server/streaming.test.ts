import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../server/index.js';
import { AppConfig } from '../../config/index.js';
import { createMockSSEResponse } from '../helpers/mock-sse-fetch.js';

describe('Streaming Integration', () => {
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
      vi.fn().mockImplementation(() => createMockSSEResponse(['Hello', ' World', '!']))
    );
    ({ app } = createApp(config));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  function sendStreamingMessage(text = 'Hi') {
    return request(app)
      .post('/a2a')
      .set('A2A-Version', '1.0')
      .send({
        jsonrpc: '2.0',
        id: '1',
        method: 'SendStreamingMessage',
        params: {
          message: { messageId: 'msg-1', role: 'ROLE_USER', parts: [{ text }] },
        },
      });
  }

  it('SendStreamingMessage returns text/event-stream', async () => {
    const res = await sendStreamingMessage();
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('SSE stream contains valid JSON-RPC responses', async () => {
    const res = await sendStreamingMessage();
    const events = parseSSEEvents(res.text);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.jsonrpc).toBe('2.0');
      expect(event.id).toBe('1');
    }
  });

  it('SSE stream contains TASK_STATE_WORKING event', async () => {
    const res = await sendStreamingMessage();
    const events = parseSSEEvents(res.text);
    const working = events.find(
      (e) => e.result?.statusUpdate?.status?.state === 'TASK_STATE_WORKING'
    );
    expect(working).toBeDefined();
  });

  it('SSE stream contains TaskArtifactUpdate events', async () => {
    const res = await sendStreamingMessage();
    const events = parseSSEEvents(res.text);
    const artifacts = events.filter((e) => e.result?.artifactUpdate);
    expect(artifacts.length).toBeGreaterThan(0);
  });

  it('SSE stream contains TASK_STATE_COMPLETED event', async () => {
    const res = await sendStreamingMessage();
    const events = parseSSEEvents(res.text);
    const completed = events.find(
      (e) => e.result?.statusUpdate?.status?.state === 'TASK_STATE_COMPLETED'
    );
    expect(completed).toBeDefined();
  });

  it('SSE events use v1.0 field presence (no kind)', async () => {
    const res = await sendStreamingMessage();
    const events = parseSSEEvents(res.text);
    for (const event of events) {
      if (event.result) {
        expect(event.result.kind).toBeUndefined();
      }
    }
  });

  it('artifactUpdate has append: true for chunks', async () => {
    const res = await sendStreamingMessage();
    const events = parseSSEEvents(res.text);
    const chunks = events.filter((e) => e.result?.artifactUpdate?.append === true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('last artifactUpdate has lastChunk: true', async () => {
    const res = await sendStreamingMessage();
    const events = parseSSEEvents(res.text);
    const lastChunk = events.find((e) => e.result?.artifactUpdate?.lastChunk === true);
    expect(lastChunk).toBeDefined();
  });
});

function parseSSEEvents(text: string): any[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
