import { describe, it, expect } from 'vitest';
import { sendMessage, sendA2A } from './helpers.js';

describe('E2E: Task Lifecycle', () => {
  it('SendMessage → GetTask returns same task', async () => {
    const result = await sendMessage('Save this task');
    const taskId = result.result.id;

    const getResult = await sendA2A('GetTask', { id: taskId });
    expect(getResult.result.id).toBe(taskId);
    expect(getResult.result.status.state).toBe('TASK_STATE_COMPLETED');
  });

  it('GetTask with unknown ID returns TASK_NOT_FOUND', async () => {
    const result = await sendA2A('GetTask', { id: 'nonexistent-id' });
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(-32001);
  });

  it('ListTasks returns at least one task', async () => {
    await sendMessage('Ensure task exists');
    const result = await sendA2A('ListTasks', {});
    expect(result.result.tasks.length).toBeGreaterThan(0);
  });

  it('CancelTask on completed task returns TASK_NOT_CANCELABLE', async () => {
    const sendResult = await sendMessage('Complete this');
    const taskId = sendResult.result.id;

    const cancelResult = await sendA2A('CancelTask', { id: taskId });
    expect(cancelResult.error).toBeDefined();
    expect(cancelResult.error.code).toBe(-32002);
  });
});
