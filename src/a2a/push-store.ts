// In-memory store for task push notification configs (A2A v1.0)

import { randomUUID } from 'node:crypto';
import { TaskPushNotificationConfig } from './types/requests.js';

export class InMemoryPushNotificationStore {
  private configs = new Map<string, TaskPushNotificationConfig[]>();

  /** Store a config for a task, generating an `id` if absent. Returns the stored config. */
  create(taskId: string, config: TaskPushNotificationConfig): TaskPushNotificationConfig {
    const stored: TaskPushNotificationConfig = {
      ...config,
      id: config.id ?? randomUUID(),
      taskId,
    };
    const list = this.configs.get(taskId) ?? [];
    list.push(stored);
    this.configs.set(taskId, list);
    return stored;
  }

  get(taskId: string, configId: string): TaskPushNotificationConfig | undefined {
    return this.configs.get(taskId)?.find((c) => c.id === configId);
  }

  list(taskId: string): TaskPushNotificationConfig[] {
    return this.configs.get(taskId) ?? [];
  }

  /** Alias used by the sender at delivery time. */
  getAllForTask(taskId: string): TaskPushNotificationConfig[] {
    return this.list(taskId);
  }

  delete(taskId: string, configId: string): boolean {
    const list = this.configs.get(taskId);
    if (!list) return false;
    const next = list.filter((c) => c.id !== configId);
    if (next.length === list.length) return false;
    if (next.length === 0) this.configs.delete(taskId);
    else this.configs.set(taskId, next);
    return true;
  }
}
