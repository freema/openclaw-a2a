import { describe, it, expect } from 'vitest';
import { TaskState, Role } from '../../a2a/types/enums.js';
import { Part, Message, Task } from '../../a2a/types/core.js';
import { StreamResponse } from '../../a2a/types/requests.js';

describe('A2A v1.0 Types', () => {
  describe('Part', () => {
    it('creates text part with field presence', () => {
      const part: Part = { text: 'hello' };
      expect(part.text).toBe('hello');
      expect(part.url).toBeUndefined();
      expect(part.data).toBeUndefined();
    });

    it('creates file part with url + mediaType', () => {
      const part: Part = { url: 'https://example.com/file.pdf', mediaType: 'application/pdf' };
      expect(part.url).toBe('https://example.com/file.pdf');
      expect(part.mediaType).toBe('application/pdf');
      expect(part.text).toBeUndefined();
    });

    it('creates data part with object value', () => {
      const part: Part = { data: { key: 'value' } };
      expect(part.data).toEqual({ key: 'value' });
    });

    it('creates data part with array value', () => {
      const part: Part = { data: [1, 2, 3] };
      expect(part.data).toEqual([1, 2, 3]);
    });

    it('creates data part with any JSON value (proto Value, not Struct)', () => {
      const stringPart: Part = { data: 'just a string' };
      expect(stringPart.data).toBe('just a string');

      const numberPart: Part = { data: 42 };
      expect(numberPart.data).toBe(42);

      const nullPart: Part = { data: null };
      expect(nullPart.data).toBeNull();

      const boolPart: Part = { data: true };
      expect(boolPart.data).toBe(true);
    });

    it('discriminates by field presence (not kind)', () => {
      const textPart: Part = { text: 'hello' };
      const filePart: Part = { url: 'https://example.com/file' };
      const dataPart: Part = { data: { x: 1 } };

      // v1.0 discrimination: check which field is present
      expect('text' in textPart && textPart.text !== undefined).toBe(true);
      expect('url' in filePart && filePart.url !== undefined).toBe(true);
      expect('data' in dataPart && dataPart.data !== undefined).toBe(true);

      // No kind field
      expect((textPart as any).kind).toBeUndefined();
    });
  });

  describe('Enums', () => {
    it('TaskState values are SCREAMING_SNAKE_CASE', () => {
      expect(TaskState.SUBMITTED).toBe('TASK_STATE_SUBMITTED');
      expect(TaskState.WORKING).toBe('TASK_STATE_WORKING');
      expect(TaskState.COMPLETED).toBe('TASK_STATE_COMPLETED');
      expect(TaskState.FAILED).toBe('TASK_STATE_FAILED');
      expect(TaskState.CANCELED).toBe('TASK_STATE_CANCELED');
      expect(TaskState.INPUT_REQUIRED).toBe('TASK_STATE_INPUT_REQUIRED');
      expect(TaskState.AUTH_REQUIRED).toBe('TASK_STATE_AUTH_REQUIRED');
      expect(TaskState.PENDING).toBe('TASK_STATE_PENDING');
      expect(TaskState.REJECTED).toBe('TASK_STATE_REJECTED');
    });

    it('Role values are prefixed', () => {
      expect(Role.USER).toBe('ROLE_USER');
      expect(Role.AGENT).toBe('ROLE_AGENT');
    });
  });

  describe('Message', () => {
    it('has v1.0 structure with contextId and taskId on message', () => {
      const msg: Message = {
        messageId: 'msg-1',
        contextId: 'ctx-1',
        taskId: 'task-1',
        role: Role.USER,
        parts: [{ text: 'hello' }],
      };
      expect(msg.contextId).toBe('ctx-1');
      expect(msg.taskId).toBe('task-1');
      expect(msg.role).toBe('ROLE_USER');
    });
  });

  describe('Task', () => {
    it('uses id field (not taskId)', () => {
      const task: Task = {
        id: 'task-123',
        contextId: 'ctx-1',
        status: { state: TaskState.SUBMITTED },
      };
      expect(task.id).toBe('task-123');
      expect((task as any).taskId).toBeUndefined();
    });
  });

  describe('StreamResponse', () => {
    it('discriminates by field presence (not kind)', () => {
      const statusEvent: StreamResponse = {
        statusUpdate: {
          taskId: 't1',
          contextId: 'c1',
          status: { state: TaskState.WORKING },
        },
      };
      const artifactEvent: StreamResponse = {
        artifactUpdate: {
          taskId: 't1',
          contextId: 'c1',
          artifact: { artifactId: 'a1', parts: [{ text: 'chunk' }] },
          append: true,
        },
      };

      expect(statusEvent.statusUpdate).toBeDefined();
      expect(statusEvent.artifactUpdate).toBeUndefined();
      expect(artifactEvent.artifactUpdate).toBeDefined();
      expect(artifactEvent.statusUpdate).toBeUndefined();
      expect((statusEvent as any).kind).toBeUndefined();
    });
  });
});
