// OpenClaw Executor — core task logic for A2A v1.0

import { v4 as uuid } from 'uuid';
import {
  AppConfig,
  getDefaultInstance,
  getInstanceByName,
  InstanceConfig,
} from '../config/index.js';
import { OpenClawClient, OpenClawError } from '../openclaw/client.js';
import { logDebug, logError } from '../utils/logger.js';
import { A2AError, A2A_ERROR_CODES } from './errors.js';
import { ExecutionEventBus } from './event-bus.js';
import { InMemoryTaskStore } from './task-store.js';
import { Task, Message, TaskStatus } from './types/core.js';
import { TaskState, Role } from './types/enums.js';

const HEARTBEAT_INTERVAL = 15_000;

export interface RequestContext {
  task: Task;
  contextId: string;
  userMessage: Message;
}

export class OpenClawExecutor {
  private clients = new Map<string, OpenClawClient>();
  private canceledTasks = new Set<string>();

  constructor(
    private config: AppConfig,
    private taskStore: InMemoryTaskStore
  ) {}

  private getClient(instance: InstanceConfig): OpenClawClient {
    let client = this.clients.get(instance.name);
    if (!client) {
      client = new OpenClawClient(instance);
      this.clients.set(instance.name, client);
    }
    return client;
  }

  private resolveInstance(metadata?: Record<string, unknown>): InstanceConfig {
    const instanceName = metadata?.instance as string | undefined;
    if (instanceName) {
      const inst = getInstanceByName(this.config, instanceName);
      if (!inst) {
        throw new A2AError(A2A_ERROR_CODES.INVALID_PARAMS, `Unknown instance: "${instanceName}"`);
      }
      return inst;
    }
    return getDefaultInstance(this.config);
  }

  private extractText(message: Message): string {
    return message.parts
      .filter((p) => p.text !== undefined)
      .map((p) => p.text!)
      .join('\n');
  }

  cancelTask(taskId: string): void {
    this.canceledTasks.add(taskId);
  }

  isCanceled(taskId: string): boolean {
    return this.canceledTasks.has(taskId);
  }

  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { task, contextId, userMessage } = context;
    const text = this.extractText(userMessage);

    if (!text) {
      this.publishFailed(eventBus, task.id, contextId, 'Empty message — no text parts found');
      return;
    }

    if (this.isCanceled(task.id)) {
      this.publishCanceled(eventBus, task.id, contextId);
      return;
    }

    try {
      const instance = this.resolveInstance(userMessage.metadata);
      const client = this.getClient(instance);

      // Publish WORKING
      this.publishStatus(eventBus, task.id, contextId, TaskState.WORKING);

      // Call OpenClaw (sync)
      const response = await client.chat(text);
      const content = response.choices[0]?.message?.content ?? '';

      if (this.isCanceled(task.id)) {
        this.publishCanceled(eventBus, task.id, contextId);
        return;
      }

      // Publish artifact
      eventBus.publish({
        artifactUpdate: {
          taskId: task.id,
          contextId,
          artifact: {
            artifactId: uuid(),
            parts: [{ text: content }],
          },
        },
      });

      // Update task in store
      task.artifacts = [{ artifactId: uuid(), parts: [{ text: content }] }];

      // Multi-turn: detect if input is required
      if (this.isInputRequired(content)) {
        this.publishStatus(eventBus, task.id, contextId, TaskState.INPUT_REQUIRED, {
          messageId: uuid(),
          role: Role.AGENT,
          parts: [{ text: content }],
        });
        task.status = { state: TaskState.INPUT_REQUIRED, timestamp: new Date().toISOString() };
        this.taskStore.set(task);
        return;
      }

      // Publish COMPLETED
      this.publishStatus(eventBus, task.id, contextId, TaskState.COMPLETED);
      task.status = { state: TaskState.COMPLETED, timestamp: new Date().toISOString() };
      this.taskStore.set(task);
    } catch (e: any) {
      logError('Executor error', e, { taskId: task.id });
      const msg = e instanceof OpenClawError ? e.message : 'Internal execution error';
      this.publishFailed(eventBus, task.id, contextId, msg);
      task.status = { state: TaskState.FAILED, timestamp: new Date().toISOString() };
      this.taskStore.set(task);
    } finally {
      eventBus.finish();
    }
  }

  async executeStreaming(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { task, contextId, userMessage } = context;
    const text = this.extractText(userMessage);

    if (!text) {
      this.publishFailed(eventBus, task.id, contextId, 'Empty message — no text parts found');
      eventBus.finish();
      return;
    }

    if (this.isCanceled(task.id)) {
      this.publishCanceled(eventBus, task.id, contextId);
      eventBus.finish();
      return;
    }

    const abortController = new AbortController();

    // Heartbeat — keep SSE alive
    const heartbeat = setInterval(() => {
      if (!eventBus.finished) {
        this.publishStatus(eventBus, task.id, contextId, TaskState.WORKING);
      }
    }, HEARTBEAT_INTERVAL);

    try {
      const instance = this.resolveInstance(userMessage.metadata);
      const client = this.getClient(instance);

      // Publish WORKING
      this.publishStatus(eventBus, task.id, contextId, TaskState.WORKING);

      const artifactId = uuid();
      let fullContent = '';

      for await (const chunk of client.chatStream(text, abortController.signal)) {
        if (this.isCanceled(task.id)) {
          abortController.abort();
          this.publishCanceled(eventBus, task.id, contextId);
          break;
        }

        fullContent += chunk;
        eventBus.publish({
          artifactUpdate: {
            taskId: task.id,
            contextId,
            artifact: { artifactId, parts: [{ text: chunk }] },
            append: true,
          },
        });
      }

      if (!this.isCanceled(task.id)) {
        // Final chunk marker
        eventBus.publish({
          artifactUpdate: {
            taskId: task.id,
            contextId,
            artifact: { artifactId, parts: [{ text: '' }] },
            lastChunk: true,
          },
        });

        // Update task
        task.artifacts = [{ artifactId, parts: [{ text: fullContent }] }];

        // Multi-turn: detect if input is required
        if (this.isInputRequired(fullContent)) {
          this.publishStatus(eventBus, task.id, contextId, TaskState.INPUT_REQUIRED, {
            messageId: uuid(),
            role: Role.AGENT,
            parts: [{ text: fullContent }],
          });
          task.status = { state: TaskState.INPUT_REQUIRED, timestamp: new Date().toISOString() };
          this.taskStore.set(task);
        } else {
          this.publishStatus(eventBus, task.id, contextId, TaskState.COMPLETED);
          task.status = { state: TaskState.COMPLETED, timestamp: new Date().toISOString() };
          this.taskStore.set(task);
        }
      }
    } catch (e: any) {
      logError('Streaming executor error', e, { taskId: task.id });
      const msg = e instanceof OpenClawError ? e.message : 'Internal execution error';
      this.publishFailed(eventBus, task.id, contextId, msg);
      task.status = { state: TaskState.FAILED, timestamp: new Date().toISOString() };
      this.taskStore.set(task);
    } finally {
      clearInterval(heartbeat);
      eventBus.finish();
    }
  }

  // Multi-turn detection heuristic
  // Returns true if the response indicates more user input is needed
  isInputRequired(content: string): boolean {
    if (!content) return false;

    // Check for explicit markers (can be set by OpenClaw prompt engineering)
    if (content.includes('[INPUT_REQUIRED]') || content.includes('[NEEDS_INPUT]')) {
      return false; // placeholder — enable when OpenClaw supports markers
    }

    // Question-mark heuristic: if response ends with a question
    const trimmed = content.trim();
    const lastSentence =
      trimmed
        .split(/[.!]\s/)
        .pop()
        ?.trim() ?? '';
    if (lastSentence.endsWith('?') && trimmed.length < 500) {
      // Short responses ending with a question likely need input
      // Long responses (>500 chars) with a trailing question are likely just conversational
      return false; // conservative default — enable via env var in future
    }

    return false;
  }

  private publishStatus(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    state: TaskState,
    message?: Message
  ) {
    const status: TaskStatus = {
      state,
      timestamp: new Date().toISOString(),
      ...(message ? { message } : {}),
    };
    eventBus.publish({ statusUpdate: { taskId, contextId, status } });
    logDebug('Status update', { taskId, state });
  }

  private publishFailed(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    errorMsg: string
  ) {
    this.publishStatus(eventBus, taskId, contextId, TaskState.FAILED, {
      messageId: uuid(),
      role: Role.AGENT,
      parts: [{ text: errorMsg }],
    });
  }

  private publishCanceled(eventBus: ExecutionEventBus, taskId: string, contextId: string) {
    this.publishStatus(eventBus, taskId, contextId, TaskState.CANCELED);
    const task = this.taskStore.get(taskId);
    if (task) {
      task.status = { state: TaskState.CANCELED, timestamp: new Date().toISOString() };
      this.taskStore.set(task);
    }
    this.canceledTasks.delete(taskId);
  }
}
