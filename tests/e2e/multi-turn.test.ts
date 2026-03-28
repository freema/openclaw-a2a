import { describe, it, expect } from 'vitest';
import { sendMessage } from './helpers.js';

describe('E2E: Multi-turn Conversations', () => {
  it('follow-up with message.contextId maintains session', async () => {
    const first = await sendMessage('Remember: my name is Test');
    const contextId = first.result.contextId;
    expect(contextId).toBeDefined();

    const second = await sendMessage('What is my name?', { contextId });
    expect(second.result).toBeDefined();
    expect(second.result.contextId).toBe(contextId);
  });

  it('follow-up with message.taskId continues same task context', async () => {
    const first = await sendMessage('First message');
    const taskId = first.result.id;

    const second = await sendMessage('Follow up', { taskId });
    expect(second.result).toBeDefined();
  });

  it('response Task.id is stable format', async () => {
    const result = await sendMessage('Check ID format');
    expect(result.result.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });
});
