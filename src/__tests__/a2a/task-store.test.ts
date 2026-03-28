import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTaskStore } from '../../a2a/task-store.js';
import { Task } from '../../a2a/types/core.js';
import { TaskState } from '../../a2a/types/enums.js';

describe('InMemoryTaskStore', () => {
  let store: InMemoryTaskStore;

  beforeEach(() => {
    store = new InMemoryTaskStore();
  });

  function makeTask(id: string, contextId = 'ctx-1'): Task {
    return {
      id,
      contextId,
      status: { state: TaskState.SUBMITTED, timestamp: new Date().toISOString() },
      createdAt: new Date().toISOString(),
    };
  }

  it('stores and retrieves a task', () => {
    const task = makeTask('t1');
    store.set(task);
    expect(store.get('t1')).toEqual(task);
  });

  it('returns undefined for unknown task', () => {
    expect(store.get('unknown')).toBeUndefined();
  });

  it('updates lastModified on set', () => {
    const task = makeTask('t1');
    store.set(task);
    expect(task.lastModified).toBeDefined();
  });

  it('deletes a task', () => {
    const task = makeTask('t1');
    store.set(task);
    expect(store.delete('t1')).toBe(true);
    expect(store.get('t1')).toBeUndefined();
  });

  it('returns false when deleting non-existent task', () => {
    expect(store.delete('unknown')).toBe(false);
  });

  it('lists all tasks', () => {
    store.set(makeTask('t1'));
    store.set(makeTask('t2'));
    store.set(makeTask('t3'));
    const result = store.list();
    expect(result.tasks).toHaveLength(3);
  });

  it('filters by contextId', () => {
    store.set(makeTask('t1', 'ctx-a'));
    store.set(makeTask('t2', 'ctx-b'));
    store.set(makeTask('t3', 'ctx-a'));
    const result = store.list({ contextId: 'ctx-a' });
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((t) => t.contextId === 'ctx-a')).toBe(true);
  });

  it('filters by taskStates', () => {
    const t1 = makeTask('t1');
    t1.status.state = TaskState.COMPLETED;
    store.set(t1);

    const t2 = makeTask('t2');
    t2.status.state = TaskState.FAILED;
    store.set(t2);

    const t3 = makeTask('t3');
    t3.status.state = TaskState.COMPLETED;
    store.set(t3);

    const result = store.list({ taskStates: ['TASK_STATE_COMPLETED'] });
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((t) => t.status.state === TaskState.COMPLETED)).toBe(true);
  });

  it('filters by taskStates with multiple states', () => {
    const t1 = makeTask('t1');
    t1.status.state = TaskState.COMPLETED;
    store.set(t1);

    const t2 = makeTask('t2');
    t2.status.state = TaskState.FAILED;
    store.set(t2);

    const t3 = makeTask('t3');
    t3.status.state = TaskState.WORKING;
    store.set(t3);

    const result = store.list({
      taskStates: ['TASK_STATE_COMPLETED', 'TASK_STATE_FAILED'],
    });
    expect(result.tasks).toHaveLength(2);
  });

  it('supports cursor-based pagination', () => {
    for (let i = 0; i < 5; i++) {
      const task = makeTask(`t${i}`, 'ctx-1');
      task.createdAt = new Date(2026, 0, i + 1).toISOString();
      store.set(task);
    }
    const page1 = store.list({ pageSize: 2 });
    expect(page1.tasks).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();
  });
});
