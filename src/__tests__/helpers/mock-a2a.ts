// Mock A2A request helpers — v1.0 format

import { A2AMethod } from '../../a2a/types/requests.js';

export function createA2ARequest(
  method: A2AMethod,
  text: string,
  options?: {
    metadata?: Record<string, unknown>;
    contextId?: string;
    taskId?: string;
  }
) {
  return {
    jsonrpc: '2.0',
    id: '1',
    method,
    params: {
      message: {
        messageId: `test-${Date.now()}`,
        ...(options?.contextId ? { contextId: options.contextId } : {}),
        ...(options?.taskId ? { taskId: options.taskId } : {}),
        role: 'ROLE_USER',
        parts: [{ text }],
        ...(options?.metadata ? { metadata: options.metadata } : {}),
      },
    },
  };
}

export function createGetTaskRequest(id: string) {
  return {
    jsonrpc: '2.0',
    id: '1',
    method: 'GetTask',
    params: { id },
  };
}

export function createListTasksRequest(options?: {
  contextId?: string;
  cursor?: string;
  pageSize?: number;
}) {
  return {
    jsonrpc: '2.0',
    id: '1',
    method: 'ListTasks',
    params: options ?? {},
  };
}

export function createCancelTaskRequest(id: string) {
  return {
    jsonrpc: '2.0',
    id: '1',
    method: 'CancelTask',
    params: { id },
  };
}
