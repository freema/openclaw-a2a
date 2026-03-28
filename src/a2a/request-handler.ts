// JSON-RPC request handler — v1.0 method dispatch

import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { AppConfig } from '../config/index.js';
import { logDebug, logError } from '../utils/logger.js';
import { A2AError, A2A_ERROR_CODES } from './errors.js';
import { ExecutionEventBus } from './event-bus.js';
import { OpenClawExecutor, RequestContext } from './executor.js';
import { formatSSEEvent, SSE_HEADERS } from './sse.js';
import { InMemoryTaskStore } from './task-store.js';
import { Task } from './types/core.js';
import { TaskState } from './types/enums.js';
import { TERMINAL_STATES } from './types/enums.js';
import {
  A2AMethod,
  CancelTaskRequest,
  GetTaskRequest,
  ListTasksRequest,
  SendMessageRequest,
} from './types/requests.js';
import { JSONRPCRequest, JSONRPCResponse } from './types/jsonrpc.js';

export function createRequestHandler(
  config: AppConfig,
  taskStore: InMemoryTaskStore,
  executor: OpenClawExecutor
) {
  return async (req: Request, res: Response) => {
    try {
      // Validate A2A-Version
      resolveAndValidateVersion(req);

      // Parse JSON-RPC
      const rpcReq = parseJsonRpcRequest(req.body);
      logDebug('JSON-RPC request', { method: rpcReq.method, id: rpcReq.id });

      // Dispatch
      const method = rpcReq.method as A2AMethod;

      switch (method) {
        case 'SendMessage':
          return await handleSendMessage(rpcReq, res, config, taskStore, executor);

        case 'SendStreamingMessage':
          return await handleSendStreamingMessage(rpcReq, res, config, taskStore, executor);

        case 'GetTask':
          return handleGetTask(rpcReq, res, taskStore);

        case 'ListTasks':
          return handleListTasks(rpcReq, res, taskStore);

        case 'CancelTask':
          return handleCancelTask(rpcReq, res, taskStore, executor);

        case 'SubscribeToTask':
          return handleSubscribeToTask(rpcReq, res);

        case 'CreateTaskPushNotificationConfig':
        case 'GetTaskPushNotificationConfig':
        case 'ListTaskPushNotificationConfigs':
        case 'DeleteTaskPushNotificationConfig':
          return sendJsonRpcError(
            res,
            rpcReq.id,
            A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED,
            'Push notifications are not supported'
          );

        case 'GetExtendedAgentCard':
          return sendJsonRpcError(
            res,
            rpcReq.id,
            A2A_ERROR_CODES.UNSUPPORTED_OPERATION,
            'Extended agent card is not supported'
          );

        default:
          return sendJsonRpcError(
            res,
            rpcReq.id,
            A2A_ERROR_CODES.METHOD_NOT_FOUND,
            `Unknown method: ${method}`
          );
      }
    } catch (e: any) {
      if (e instanceof A2AError) {
        return sendJsonRpcError(res, req.body?.id ?? null, e.code, e.message, e.data);
      }
      logError('Unhandled request error', e);
      return sendJsonRpcError(
        res,
        req.body?.id ?? null,
        A2A_ERROR_CODES.INTERNAL_ERROR,
        'Internal server error'
      );
    }
  };
}

// --- Version validation ---

function resolveAndValidateVersion(req: Request): string {
  const raw = req.header('A2A-Version')?.trim() || (req.query['A2A-Version'] as string);
  const version = raw || '0.3'; // spec: empty/missing → 0.3

  if (version !== '1.0') {
    throw new A2AError(
      A2A_ERROR_CODES.VERSION_NOT_SUPPORTED,
      `A2A version "${version}" is not supported. Supported versions: ["1.0"]`,
      { supportedVersions: ['1.0'] }
    );
  }
  return version;
}

// --- JSON-RPC parsing ---

function parseJsonRpcRequest(body: any): JSONRPCRequest {
  if (!body || typeof body !== 'object') {
    throw new A2AError(A2A_ERROR_CODES.PARSE_ERROR, 'Invalid JSON');
  }
  if (body.jsonrpc !== '2.0') {
    throw new A2AError(
      A2A_ERROR_CODES.INVALID_REQUEST,
      'Missing or invalid jsonrpc version (must be "2.0")'
    );
  }
  if (!body.method || typeof body.method !== 'string') {
    throw new A2AError(A2A_ERROR_CODES.INVALID_REQUEST, 'Missing or invalid method');
  }
  return body as JSONRPCRequest;
}

// --- Handlers ---

async function handleSendMessage(
  rpcReq: JSONRPCRequest,
  res: Response,
  config: AppConfig,
  taskStore: InMemoryTaskStore,
  executor: OpenClawExecutor
) {
  const params = rpcReq.params as SendMessageRequest;
  if (!params?.message) {
    return sendJsonRpcError(
      res,
      rpcReq.id,
      A2A_ERROR_CODES.INVALID_PARAMS,
      'Missing message in params'
    );
  }

  const context = createTaskContext(params, taskStore);
  const eventBus = new ExecutionEventBus();

  // Execute synchronously — wait for completion
  await executor.execute(context, eventBus);

  // Return the final task state
  const task = taskStore.get(context.task.id) ?? context.task;
  return sendJsonRpcResult(res, rpcReq.id, task);
}

async function handleSendStreamingMessage(
  rpcReq: JSONRPCRequest,
  res: Response,
  config: AppConfig,
  taskStore: InMemoryTaskStore,
  executor: OpenClawExecutor
) {
  const params = rpcReq.params as SendMessageRequest;
  if (!params?.message) {
    return sendJsonRpcError(
      res,
      rpcReq.id,
      A2A_ERROR_CODES.INVALID_PARAMS,
      'Missing message in params'
    );
  }

  const context = createTaskContext(params, taskStore);
  const eventBus = new ExecutionEventBus();

  // Set SSE headers
  res.writeHead(200, SSE_HEADERS);

  // Subscribe to events and forward as SSE
  eventBus.on((event) => {
    const rpcResponse: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: rpcReq.id,
      result: event,
    };
    res.write(formatSSEEvent(rpcResponse));
  });

  eventBus.onFinish(() => {
    res.end();
  });

  // Execute streaming (fire and forget — events are pushed via SSE)
  executor.executeStreaming(context, eventBus).catch((e) => {
    logError('Streaming execution error', e);
    if (!res.writableEnded) {
      res.end();
    }
  });
}

function handleGetTask(rpcReq: JSONRPCRequest, res: Response, taskStore: InMemoryTaskStore) {
  const params = rpcReq.params as GetTaskRequest;
  if (!params?.id) {
    return sendJsonRpcError(res, rpcReq.id, A2A_ERROR_CODES.INVALID_PARAMS, 'Missing task id');
  }

  const task = taskStore.get(params.id);
  if (!task) {
    return sendJsonRpcError(
      res,
      rpcReq.id,
      A2A_ERROR_CODES.TASK_NOT_FOUND,
      `Task not found: ${params.id}`
    );
  }

  // Optionally trim history
  if (params.historyLength !== undefined && task.history) {
    task.history = task.history.slice(-params.historyLength);
  }

  return sendJsonRpcResult(res, rpcReq.id, task);
}

function handleListTasks(rpcReq: JSONRPCRequest, res: Response, taskStore: InMemoryTaskStore) {
  const params = (rpcReq.params as ListTasksRequest) ?? {};
  const result = taskStore.list({
    contextId: params.contextId,
    taskStates: params.taskStates,
    cursor: params.cursor,
    pageSize: params.pageSize,
  });
  return sendJsonRpcResult(res, rpcReq.id, result);
}

function handleCancelTask(
  rpcReq: JSONRPCRequest,
  res: Response,
  taskStore: InMemoryTaskStore,
  executor: OpenClawExecutor
) {
  const params = rpcReq.params as CancelTaskRequest;
  if (!params?.id) {
    return sendJsonRpcError(res, rpcReq.id, A2A_ERROR_CODES.INVALID_PARAMS, 'Missing task id');
  }

  const task = taskStore.get(params.id);
  if (!task) {
    return sendJsonRpcError(
      res,
      rpcReq.id,
      A2A_ERROR_CODES.TASK_NOT_FOUND,
      `Task not found: ${params.id}`
    );
  }

  if (TERMINAL_STATES.has(task.status.state)) {
    return sendJsonRpcError(
      res,
      rpcReq.id,
      A2A_ERROR_CODES.TASK_NOT_CANCELABLE,
      `Task is in terminal state: ${task.status.state}`
    );
  }

  executor.cancelTask(params.id);
  task.status = { state: TaskState.CANCELED, timestamp: new Date().toISOString() };
  taskStore.set(task);
  return sendJsonRpcResult(res, rpcReq.id, task);
}

function handleSubscribeToTask(rpcReq: JSONRPCRequest, res: Response) {
  return sendJsonRpcError(
    res,
    rpcReq.id,
    A2A_ERROR_CODES.UNSUPPORTED_OPERATION,
    'SubscribeToTask is not yet supported'
  );
}

// --- Task context creation ---

function createTaskContext(
  params: SendMessageRequest,
  taskStore: InMemoryTaskStore
): RequestContext {
  const message = params.message;

  // Multi-turn: resolve contextId
  let contextId: string;
  let existingTask: Task | undefined;

  if (message.taskId) {
    existingTask = taskStore.get(message.taskId);
    if (existingTask) {
      contextId = message.contextId ?? existingTask.contextId;
    } else {
      contextId = message.contextId ?? uuid();
    }
  } else {
    contextId = message.contextId ?? uuid();
  }

  // Create or reuse task
  const task: Task = existingTask ?? {
    id: uuid(),
    contextId,
    status: { state: TaskState.SUBMITTED, timestamp: new Date().toISOString() },
    history: [],
    createdAt: new Date().toISOString(),
  };

  // Append user message to history
  if (!task.history) task.history = [];
  task.history.push(message);
  taskStore.set(task);

  return { task, contextId, userMessage: message };
}

// --- Response helpers ---

function sendJsonRpcResult(res: Response, id: string | number, result: unknown) {
  const response: JSONRPCResponse = { jsonrpc: '2.0', id, result };
  res.json(response);
}

function sendJsonRpcError(
  res: Response,
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
) {
  const response: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: id ?? 0,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
  res.json(response);
}
