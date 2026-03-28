// In-memory task store

import { Task } from './types/core.js';

export interface TaskStore {
  get(id: string): Task | undefined;
  set(task: Task): void;
  list(options?: {
    contextId?: string;
    taskStates?: string[];
    cursor?: string;
    pageSize?: number;
  }): {
    tasks: Task[];
    nextCursor?: string;
  };
  delete(id: string): boolean;
}

export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>();

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  set(task: Task): void {
    task.lastModified = new Date().toISOString();
    this.tasks.set(task.id, task);
  }

  list(options?: {
    contextId?: string;
    taskStates?: string[];
    cursor?: string;
    pageSize?: number;
  }) {
    let all = Array.from(this.tasks.values());

    if (options?.contextId) {
      all = all.filter((t) => t.contextId === options.contextId);
    }

    if (options?.taskStates && options.taskStates.length > 0) {
      const states = new Set(options.taskStates);
      all = all.filter((t) => states.has(t.status.state));
    }

    // Sort by creation time descending
    all.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    const pageSize = options?.pageSize ?? 50;
    let startIndex = 0;

    if (options?.cursor) {
      const cursorIndex = all.findIndex((t) => t.id === options.cursor);
      if (cursorIndex >= 0) startIndex = cursorIndex + 1;
    }

    const page = all.slice(startIndex, startIndex + pageSize);
    const nextCursor =
      startIndex + pageSize < all.length ? all[startIndex + pageSize - 1]?.id : undefined;

    return { tasks: page, nextCursor };
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }
}
