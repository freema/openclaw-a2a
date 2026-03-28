import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenClawExecutor, RequestContext } from '../../a2a/executor.js';
import { InMemoryTaskStore } from '../../a2a/task-store.js';
import { ExecutionEventBus } from '../../a2a/event-bus.js';
import { Task } from '../../a2a/types/core.js';
import { TaskState, Role } from '../../a2a/types/enums.js';
import { AppConfig } from '../../config/index.js';
import { StreamResponse } from '../../a2a/types/requests.js';
import { createMockFetchResponse } from '../helpers/mock-sse-fetch.js';

const config: AppConfig = {
  port: 3100,
  host: '0.0.0.0',
  debug: false,
  publicUrl: 'http://localhost:3100',
  model: 'openclaw',
  instances: [{ name: 'default', url: 'http://mock:18789', token: 'test', default: true }],
};

function makeContext(text: string, overrides?: Partial<RequestContext>): RequestContext {
  const task: Task = {
    id: 'task-1',
    contextId: 'ctx-1',
    status: { state: TaskState.SUBMITTED, timestamp: new Date().toISOString() },
    history: [],
    createdAt: new Date().toISOString(),
  };
  return {
    task,
    contextId: 'ctx-1',
    userMessage: {
      messageId: 'msg-1',
      role: Role.USER,
      parts: [{ text }],
    },
    ...overrides,
  };
}

describe('OpenClawExecutor', () => {
  let taskStore: InMemoryTaskStore;
  let executor: OpenClawExecutor;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    taskStore = new InMemoryTaskStore();
    executor = new OpenClawExecutor(config, taskStore);
    fetchSpy = vi.fn().mockImplementation(() => createMockFetchResponse('Hello from OpenClaw'));
    vi.stubGlobal('fetch', fetchSpy);
  });

  describe('execute() — sync', () => {
    it('publishes TASK_STATE_WORKING with task.id (not taskId)', async () => {
      const context = makeContext('Hi');
      const eventBus = new ExecutionEventBus();
      const events: StreamResponse[] = [];
      eventBus.on((e) => events.push(e));

      await executor.execute(context, eventBus);

      const workingEvent = events.find((e) => e.statusUpdate?.status.state === TaskState.WORKING);
      expect(workingEvent).toBeDefined();
      expect(workingEvent!.statusUpdate!.taskId).toBe('task-1');
    });

    it('calls OpenClawClient.chat with correct text', async () => {
      const context = makeContext('Hello world');
      const eventBus = new ExecutionEventBus();

      await executor.execute(context, eventBus);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages[0].content).toBe('Hello world');
    });

    it('extracts content from response.choices[0].message.content', async () => {
      const context = makeContext('Hi');
      const eventBus = new ExecutionEventBus();
      const events: StreamResponse[] = [];
      eventBus.on((e) => events.push(e));

      await executor.execute(context, eventBus);

      const artifact = events.find((e) => e.artifactUpdate);
      expect(artifact!.artifactUpdate!.artifact.parts[0].text).toBe('Hello from OpenClaw');
    });

    it('publishes TASK_STATE_COMPLETED on success', async () => {
      const context = makeContext('Hi');
      const eventBus = new ExecutionEventBus();
      const events: StreamResponse[] = [];
      eventBus.on((e) => events.push(e));

      await executor.execute(context, eventBus);

      const completed = events.find((e) => e.statusUpdate?.status.state === TaskState.COMPLETED);
      expect(completed).toBeDefined();
    });

    it('calls eventBus.finish()', async () => {
      const context = makeContext('Hi');
      const eventBus = new ExecutionEventBus();

      await executor.execute(context, eventBus);
      expect(eventBus.finished).toBe(true);
    });

    it('publishes TASK_STATE_FAILED on OpenClaw error', async () => {
      fetchSpy.mockRejectedValue(new Error('Connection refused'));
      const context = makeContext('Hi');
      const eventBus = new ExecutionEventBus();
      const events: StreamResponse[] = [];
      eventBus.on((e) => events.push(e));

      await executor.execute(context, eventBus);

      const failed = events.find((e) => e.statusUpdate?.status.state === TaskState.FAILED);
      expect(failed).toBeDefined();
    });

    it('handles cancellation before API call', async () => {
      const context = makeContext('Hi');
      executor.cancelTask('task-1');
      const eventBus = new ExecutionEventBus();
      const events: StreamResponse[] = [];
      eventBus.on((e) => events.push(e));

      await executor.execute(context, eventBus);

      const canceled = events.find((e) => e.statusUpdate?.status.state === TaskState.CANCELED);
      expect(canceled).toBeDefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('handles empty message parts', async () => {
      const context = makeContext('');
      const eventBus = new ExecutionEventBus();
      const events: StreamResponse[] = [];
      eventBus.on((e) => events.push(e));

      await executor.execute(context, eventBus);

      const failed = events.find((e) => e.statusUpdate?.status.state === TaskState.FAILED);
      expect(failed).toBeDefined();
    });

    it('extracts text from multiple parts', async () => {
      const context: RequestContext = {
        task: {
          id: 'task-1',
          contextId: 'ctx-1',
          status: { state: TaskState.SUBMITTED },
          createdAt: new Date().toISOString(),
        },
        contextId: 'ctx-1',
        userMessage: {
          messageId: 'msg-1',
          role: Role.USER,
          parts: [{ text: 'Hello' }, { text: 'World' }, { data: { ignored: true } }],
        },
      };
      const eventBus = new ExecutionEventBus();

      await executor.execute(context, eventBus);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.messages[0].content).toBe('Hello\nWorld');
    });

    it('includes ISO 8601 UTC timestamp in status updates', async () => {
      const context = makeContext('Hi');
      const eventBus = new ExecutionEventBus();
      const events: StreamResponse[] = [];
      eventBus.on((e) => events.push(e));

      await executor.execute(context, eventBus);

      const working = events.find((e) => e.statusUpdate?.status.state === TaskState.WORKING);
      expect(working!.statusUpdate!.status.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it('resolves correct instance from message metadata', async () => {
      const multiConfig: AppConfig = {
        ...config,
        instances: [
          { name: 'prod', url: 'http://prod:18789', token: 'p', default: true },
          { name: 'staging', url: 'http://staging:18789', token: 's' },
        ],
      };
      const exec = new OpenClawExecutor(multiConfig, taskStore);
      const context = makeContext('Hi');
      context.userMessage.metadata = { instance: 'staging' };
      const eventBus = new ExecutionEventBus();

      await exec.execute(context, eventBus);

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('staging');
    });

    it('uses default instance when no metadata', async () => {
      const context = makeContext('Hi');
      const eventBus = new ExecutionEventBus();

      await executor.execute(context, eventBus);

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('mock:18789');
    });

    it('updates task in store after completion', async () => {
      const context = makeContext('Hi');
      taskStore.set(context.task);
      const eventBus = new ExecutionEventBus();

      await executor.execute(context, eventBus);

      const stored = taskStore.get('task-1');
      expect(stored!.status.state).toBe(TaskState.COMPLETED);
    });
  });

  describe('isInputRequired()', () => {
    it('returns false for empty content', () => {
      expect(executor.isInputRequired('')).toBe(false);
    });

    it('returns false for normal response', () => {
      expect(executor.isInputRequired('Here is the answer to your question.')).toBe(false);
    });

    it('returns false by default (conservative)', () => {
      expect(executor.isInputRequired('What would you like to know?')).toBe(false);
    });
  });
});
