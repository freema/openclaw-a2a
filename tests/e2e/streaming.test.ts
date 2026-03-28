import { describe, it, expect } from 'vitest';
import { streamMessage } from './helpers.js';

describe('E2E: SendStreamingMessage', () => {
  it('stream contains statusUpdate WORKING event', async () => {
    const events: any[] = [];
    for await (const event of streamMessage('Stream me something')) {
      events.push(event);
    }
    const working = events.find(
      (e) => e.result?.statusUpdate?.status?.state === 'TASK_STATE_WORKING'
    );
    expect(working).toBeDefined();
  });

  it('stream contains artifactUpdate events', async () => {
    const events: any[] = [];
    for await (const event of streamMessage('Tell me a story')) {
      events.push(event);
    }
    const artifacts = events.filter((e) => e.result?.artifactUpdate);
    expect(artifacts.length).toBeGreaterThan(0);
  });

  it('last event is statusUpdate COMPLETED', async () => {
    const events: any[] = [];
    for await (const event of streamMessage('Quick answer')) {
      events.push(event);
    }
    const statusEvents = events.filter((e) => e.result?.statusUpdate);
    const last = statusEvents[statusEvents.length - 1];
    expect(last.result.statusUpdate.status.state).toBe('TASK_STATE_COMPLETED');
  });

  it('all events are valid JSON-RPC responses', async () => {
    for await (const event of streamMessage('Validate me')) {
      expect(event.jsonrpc).toBe('2.0');
      expect(event.id).toBeDefined();
    }
  });

  it('events use v1.0 field presence (no kind)', async () => {
    for await (const event of streamMessage('No kind please')) {
      if (event.result) {
        expect(event.result.kind).toBeUndefined();
      }
    }
  });
});
