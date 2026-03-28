// A2A v1.0 — Request/Response types

import { Artifact, Message, Task, TaskStatus } from './core.js';

// v1.0 PascalCase method names — ALL 11 methods
export type A2AMethod =
  // Core (6)
  | 'SendMessage'
  | 'SendStreamingMessage'
  | 'GetTask'
  | 'ListTasks'
  | 'CancelTask'
  | 'SubscribeToTask'
  // Push Notifications (4)
  | 'CreateTaskPushNotificationConfig'
  | 'GetTaskPushNotificationConfig'
  | 'ListTaskPushNotificationConfigs'
  | 'DeleteTaskPushNotificationConfig'
  // Extended Agent Card (1)
  | 'GetExtendedAgentCard';

// --- Send Message ---

export interface SendMessageRequest {
  tenant?: string;
  message: Message; // contains contextId/taskId for multi-turn
  configuration?: SendMessageConfiguration;
  metadata?: Record<string, unknown>;
}

export interface SendMessageConfiguration {
  acceptedOutputModes?: string[];
  returnImmediately?: boolean; // v1.0: replaces `blocking` (inverted)
  pushNotificationConfig?: TaskPushNotificationConfig;
}

// --- Get Task ---

export interface GetTaskRequest {
  id: string;
  historyLength?: number;
}

// --- List Tasks ---

export interface ListTasksRequest {
  contextId?: string;
  taskStates?: string[];
  cursor?: string; // v1.0: cursor-based pagination
  pageSize?: number;
}

export interface ListTasksResponse {
  tasks: Task[];
  nextCursor?: string;
}

// --- Cancel Task ---

export interface CancelTaskRequest {
  id: string;
}

// --- Subscribe To Task ---

export interface SubscribeToTaskRequest {
  id: string;
}

// --- Push Notification Config ---

export interface TaskPushNotificationConfig {
  id?: string;
  taskId: string;
  url: string;
  token?: string;
  authentication?: PushNotificationAuthentication;
}

export interface PushNotificationAuthentication {
  schemes: string[];
  credentials?: string;
}

export interface CreateTaskPushNotificationConfigRequest {
  taskId: string;
  pushNotificationConfig: TaskPushNotificationConfig;
}

export interface GetTaskPushNotificationConfigRequest {
  id: string;
  taskId: string;
}

export interface ListTaskPushNotificationConfigsRequest {
  taskId: string;
}

export interface DeleteTaskPushNotificationConfigRequest {
  id: string;
  taskId: string;
}

// --- Stream Response ---

export interface StreamResponse {
  task?: Task;
  message?: Message;
  statusUpdate?: TaskStatusUpdateEvent;
  artifactUpdate?: TaskArtifactUpdateEvent;
}

export interface TaskStatusUpdateEvent {
  taskId: string;
  contextId: string;
  status: TaskStatus;
}

export interface TaskArtifactUpdateEvent {
  taskId: string;
  contextId: string;
  artifact: Artifact;
  append?: boolean; // v1.0: chunked delivery
  lastChunk?: boolean; // v1.0: final chunk marker
}

// --- Extended Agent Card ---

export interface GetExtendedAgentCardRequest {
  extensions?: string[];
}
