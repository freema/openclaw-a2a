import { describe, it, expect } from 'vitest';
import { sendMessage, sendA2A } from './helpers.js';

describe('E2E: SendMessage', () => {
  it('SendMessage with simple text returns task', async () => {
    const result = await sendMessage('Hello from E2E test!');
    expect(result.jsonrpc).toBe('2.0');
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
    expect(result.result.id).toBeDefined();
  });

  it('result task state is TASK_STATE_COMPLETED', async () => {
    const result = await sendMessage('Tell me something');
    expect(result.result.status.state).toBe('TASK_STATE_COMPLETED');
  });

  it('result contains non-empty artifact', async () => {
    const result = await sendMessage('What is 2 + 2?');
    expect(result.result.artifacts).toBeDefined();
    expect(result.result.artifacts.length).toBeGreaterThan(0);
    expect(result.result.artifacts[0].parts[0].text).toBeTruthy();
  });

  it('artifact parts use v1.0 format', async () => {
    const result = await sendMessage('Hi');
    const part = result.result.artifacts[0].parts[0];
    expect(part.text).toBeDefined();
    expect(part.kind).toBeUndefined(); // no kind field in v1.0
  });

  it('A2A-Version: 1.0 header accepted', async () => {
    const result = await sendMessage('Ping');
    expect(result.error).toBeUndefined();
  });

  it('v0.3 method name message/send returns error', async () => {
    const result = await sendA2A('message/send', {
      message: { messageId: 'test', role: 'ROLE_USER', parts: [{ text: 'Hi' }] },
    });
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(-32601);
  });
});
