// A2A v1.0 — Core types (hand-written from a2a.proto)

import { Role, TaskState } from './enums.js';

// v1.0: Part is a single type with oneof content fields
// Discrimination via field presence (NOT a `kind` field)
export interface Part {
  // oneof content — exactly one must be present:
  text?: string;
  url?: string;
  raw?: string; // base64-encoded
  data?: unknown; // google.protobuf.Value — ANY JSON value (not just object)

  // common fields:
  mediaType?: string;
  filename?: string;
  metadata?: Record<string, unknown>; // Struct (object-only, unlike data)
}

export interface Message {
  messageId: string;
  contextId?: string; // links to conversation context
  taskId?: string; // links to existing task (server infers contextId if only taskId)
  role: Role;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
  referenceTaskIds?: string[];
}

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string; // ISO 8601 UTC
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[]; // URI strings
}

export interface Task {
  id: string; // NOT taskId! Task uses `id` per spec
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
  lastModified?: string;
}
