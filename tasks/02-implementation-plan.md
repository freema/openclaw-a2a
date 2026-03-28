# Implementation Plan: openclaw-a2a

> Datum: 2026-03-27
> Status: DRAFT v4 — opraveny protokolove chyby z review
> Zavislost: [01-research-analysis.md](./01-research-analysis.md)

---

## Klicova rozhodnuti

| Otazka | Rozhodnuti |
|--------|-----------|
| A2A verze | **v1.0 spec primo** — SDK v0.3.13 je zastarale |
| Build tool | **tsup** (konzistentni s openclaw-mcp) |
| OpenClaw streaming | **ANO** — Gateway podporuje `stream: true` |
| Publish | **npm + GHCR** (oboje) |
| Vlastni domena docs | **Ne** — pouzijeme GitHub Pages bez custom domeny |
| E2E testy | **TypeScript** s realnym OpenClaw Gateway |
| Taskfile.yml | **Ano** |
| Port | **3100** (ne 3000, koexistence s MCP) |
| v1.0 scope | **Vsechny operace**: 6 core (SendMessage, SendStreamingMessage, GetTask, ListTasks, CancelTask, SubscribeToTask) + 4 push notif (Create/Get/List/DeleteTaskPushNotificationConfig) + GetExtendedAgentCard = **11 metod** |
| Multi-turn | **Ano** — INPUT_REQUIRED state |
| a2a-inspector | **Ano** — official validace v1.0 |
| Typy | **Hand-write** z proto (ne buf generate) |

---

## Prehled fazi

| Faze | Nazev | Popis | Zavislost |
|------|-------|-------|-----------|
| 0 | Project Scaffold | Zakladni struktura, tooling | — |
| 1 | A2A v1.0 Types | Vlastni typovy system z proto spec | Faze 0 |
| 2 | Core A2A Server | Agent Card + executor + OpenClaw client | Faze 1 |
| 3 | Streaming | SSE streaming (OpenClaw → A2A) + heartbeat | Faze 2 |
| 4 | Multi-instance | Routing, instance metadata | Faze 2 |
| 5 | Testing & Quality | Unit + integration + E2E (TS) | Faze 2-4 |
| 6 | Docker & CI/CD | Dockerfile, GitHub Actions, GHCR + npm | Faze 5 |
| 7 | Documentation | Docs, GitHub Pages (bez custom domeny), README | Faze 6 |

---

## Faze 0: Project Scaffold

### Cil
Identicky tooling jako openclaw-mcp pro konzistenci.

### Ukoly

#### 0.1 package.json
```json
{
  "name": "openclaw-a2a",
  "version": "0.1.0",
  "type": "module",
  "bin": { "openclaw-a2a": "./dist/index.js" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup",
    "start": "node dist/index.js",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "check": "npm run lint:fix && npm run typecheck",
    "check:all": "npm run check && npm run test:run && npm run build",
    "test": "vitest",
    "test:run": "vitest run",
    "prepublishOnly": "npm run clean && npm run build"
  }
}
```

**Runtime deps**:
- `express` ^4.21.2
- `yargs` ^17.7.2
- `uuid` ^11.1.0

**POZOR**: `@a2a-js/sdk` NENI runtime dependency. Implementujeme v1.0 protocol sami.
Reusable SDK utility (sse_utils pattern) budeme mit jako vlastni kod.

**Dev deps** (mirror openclaw-mcp):
- `typescript` ^5.3.3
- `tsup` ^8.0.0
- `tsx` ^4.7.0
- `vitest` ^2.0.0
- `eslint` ^8.57.1 + `@typescript-eslint/*` + `eslint-plugin-prettier`
- `prettier` ^3.3.3
- `@types/node` ^20.11.0
- `@types/express` ^4.17.21
- `@types/yargs` ^17.0.32
- `supertest` ^7.1.4

#### 0.2 tsconfig.json
- Mirror openclaw-mcp: target ES2022, module ESNext, strict false, outDir dist

#### 0.3 tsup.config.ts
- Entry: `src/index.ts`, format ESM, target node20, bundle true, shebang header

#### 0.4 .prettierrc
```json
{ "semi": true, "singleQuote": true, "tabWidth": 2, "trailingComma": "es5", "printWidth": 100 }
```

#### 0.5 .eslintrc.json
- Mirror openclaw-mcp: @typescript-eslint/parser, prettier plugin, no-explicit-any off

#### 0.6 vitest.config.ts
- include: `src/**/*.test.ts`, environment node, testTimeout 10000

#### 0.7 .env.example
```env
# OpenClaw Gateway
OPENCLAW_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=

# Multi-instance (JSON array, has priority over single instance)
# OPENCLAW_INSTANCES=[{"name":"prod","url":"...","token":"...","default":true}]

# Server
PORT=3100
HOST=0.0.0.0
DEBUG=false

# Agent Card
PUBLIC_URL=http://localhost:3100
```

#### 0.8 Taskfile.yml
Mirror openclaw-mcp tasks: dev, test, test:run, build, check:all, docker:build, docker:up

---

## Faze 1: A2A v1.0 Types (NOVA FAZE)

### Cil
Vlastni typovy system implementujici A2A v1.0 spec. Hand-written z `specification/a2a.proto`.

### Struktura
```
src/a2a/
├── types/
│   ├── core.ts              # Part, Message, Artifact, Task, TaskStatus
│   ├── enums.ts             # TaskState, Role (SCREAMING_SNAKE_CASE)
│   ├── agent-card.ts        # AgentCard, AgentInterface, AgentCapabilities, AgentSkill
│   ├── requests.ts          # SendMessageRequest, GetTaskRequest, ListTasksRequest, ...
│   ├── responses.ts         # SendMessageResponse, StreamResponse, ListTasksResponse, ...
│   ├── jsonrpc.ts           # JSONRPCRequest, JSONRPCResponse, JSONRPCError
│   └── index.ts             # Re-export all types
├── errors.ts                # A2AError with all v1.0 error codes
└── sse.ts                   # SSE utilities (formatSSEEvent, parseSSEStream, headers)
```

### 1.1 enums.ts — v1.0 enum values
```typescript
export enum TaskState {
  SUBMITTED = 'TASK_STATE_SUBMITTED',
  PENDING = 'TASK_STATE_PENDING',
  WORKING = 'TASK_STATE_WORKING',
  COMPLETED = 'TASK_STATE_COMPLETED',
  FAILED = 'TASK_STATE_FAILED',
  CANCELED = 'TASK_STATE_CANCELED',
  REJECTED = 'TASK_STATE_REJECTED',
  INPUT_REQUIRED = 'TASK_STATE_INPUT_REQUIRED',
  AUTH_REQUIRED = 'TASK_STATE_AUTH_REQUIRED',
}

export enum Role {
  USER = 'ROLE_USER',
  AGENT = 'ROLE_AGENT',
}
```

### 1.2 core.ts — v1.0 Part structure (field presence, ne kind)
```typescript
// v1.0: Part je single type s optional fields, discriminace pres field presence
// v1.0: Part je single type s oneof content fields, discriminace pres field presence
export interface Part {
  // oneof content — exactly one of these must be present:
  text?: string;                      // text content
  url?: string;                       // file URL
  raw?: string;                       // base64-encoded raw data
  data?: unknown;                     // ANY JSON value: object, array, string, number, boolean, null
                                      // (proto: google.protobuf.Value, NOT Struct)
  // common fields:
  mediaType?: string;                 // MIME type (renamed z mimeType v v0.3)
  filename?: string;                  // original filename
  metadata?: Record<string, unknown>; // metadata IS Struct (object-only), unlike data
}

export interface Message {
  messageId: string;
  contextId?: string;        // Links to conversation context
  taskId?: string;           // Links to existing task (server infers contextId if only taskId)
  role: Role;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
  referenceTaskIds?: string[];
}
// Multi-turn: contextId and taskId on MESSAGE drive conversation linking.
// NOT top-level params — they are INSIDE the message object.

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string;  // ISO 8601 UTC
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];   // URI strings (same as Message.extensions), NOT Extension objects
}

export interface Task {
  id: string;              // NOT taskId! Task uses `id` per spec
  contextId: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: Message[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
  lastModified?: string;
}
// NOTE: `taskId` appears only in events (TaskStatusUpdateEvent, TaskArtifactUpdateEvent)
// and in Message.taskId (for task association), NOT in Task itself.
```

### 1.3 agent-card.ts — v1.0 Agent Card (supportedInterfaces)
```typescript
export interface AgentCard {
  name: string;
  description: string;
  version: string;
  provider?: AgentProvider;
  iconUrl?: string;
  documentationUrl?: string;
  supportedInterfaces: AgentInterface[];  // v1.0: nahrazuje url + additionalInterfaces
  capabilities: AgentCapabilities;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills: AgentSkill[];
  securitySchemes?: Record<string, SecurityScheme>;
  security?: SecurityRequirement[];
  extensions?: AgentExtension[];
}

export interface AgentInterface {
  url: string;
  protocolBinding: 'JSONRPC' | 'REST' | 'GRPC';
  protocolVersion: string;  // "1.0"
  tenant?: string;
}
```

### 1.4 requests.ts + responses.ts — v1.0 method signatures
```typescript
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

export interface SendMessageRequest {
  tenant?: string;           // Multi-tenancy (optional)
  message: Message;          // Contains contextId/taskId for multi-turn!
  configuration?: SendMessageConfiguration;
  metadata?: Record<string, unknown>;
}
// IMPORTANT: contextId and taskId are on Message, NOT here.
// Multi-turn: client sets message.contextId or message.taskId to continue conversation.

export interface SendMessageConfiguration {
  acceptedOutputModes?: string[];
  returnImmediately?: boolean;  // v1.0: nahrazuje `blocking` (inverted)
  pushNotificationConfig?: TaskPushNotificationConfig;
}

// Stream events — v1.0: field presence discriminace (ne kind)
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
  append?: boolean;     // v1.0: chunked delivery
  lastChunk?: boolean;  // v1.0: final chunk marker
}
```

### 1.5 jsonrpc.ts — JSON-RPC 2.0 wrapper
```typescript
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: A2AMethod;
  params: unknown;
}

export interface JSONRPCResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: JSONRPCError;
}
```

### 1.6 errors.ts — v1.0 error codes
```typescript
// Standard JSON-RPC + A2A specific
export const A2A_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  CONTENT_TYPE_NOT_SUPPORTED: -32005,
  EXTENSION_SUPPORT_REQUIRED: -32008,  // NEW v1.0
  VERSION_NOT_SUPPORTED: -32009,       // NEW v1.0
} as const;
```

### 1.7 sse.ts — SSE utilities (inspirovano SDK)
```typescript
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export function formatSSEEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
```

### Rozhodnuto (Faze 1)
- **Hand-write** typy z proto (ne buf generate) — plna kontrola, mene tooling complexity
- **Vsech 11 metod**: 6 core + 4 push notif + GetExtendedAgentCard
- Typy pro push notif pripravime hned, implementace handler muze byt stub (UNSUPPORTED_OPERATION) do dalsi iterace
- **Task.id** (ne taskId!), **Message.contextId/taskId** pro multi-turn, **Part.data: unknown** (ne Record)

---

## Faze 2: Core A2A Server

### Cil
Funkcni A2A v1.0 server — sync `SendMessage`, Agent Card discovery, JSON-RPC dispatch.

### Struktura souboru
```
src/
├── index.ts                 # CLI entrypoint (yargs)
├── config/
│   └── index.ts             # Env parsing, validation
├── utils/
│   └── logger.ts            # Structured JSON logger
├── openclaw/
│   ├── client.ts            # HTTP client → OpenClaw Gateway
│   └── types.ts             # OpenClaw response types
├── a2a/
│   ├── types/               # (z Faze 1)
│   ├── errors.ts            # (z Faze 1)
│   ├── sse.ts               # (z Faze 1)
│   ├── agent-card.ts        # buildAgentCard() — v1.0 Agent Card builder
│   ├── executor.ts          # OpenClawExecutor — core task logic
│   ├── task-store.ts        # InMemoryTaskStore
│   ├── event-bus.ts         # ExecutionEventBus (pattern ze SDK)
│   ├── request-handler.ts   # JSON-RPC method dispatch (v1.0 PascalCase)
│   └── router.ts            # Express router: Agent Card + JSON-RPC endpoint
└── server/
    └── index.ts             # Express app: /health, /instances, A2A routes
```

### 2.1 config/index.ts
- Env parsing: OPENCLAW_URL, OPENCLAW_GATEWAY_TOKEN, OPENCLAW_INSTANCES (JSON), PORT, HOST, DEBUG, PUBLIC_URL
- Validace: URL format, token presence, JSON parse pro instances
- Single vs multi-instance detection

### 2.2 utils/logger.ts
- Structured JSON logger (mirror openclaw-mcp)
- `log()`, `logError()`, DEBUG env var

### 2.3 openclaw/client.ts
- `OpenClawClient` class
- `health()` → health probe
- `chat(message, instanceConfig?)` → POST /v1/chat/completions (sync, `stream: false`)
- `chatStream(message, instanceConfig?)` → POST /v1/chat/completions (`stream: true`) → returns AsyncGenerator<string>
- Native `fetch`, timeout support (120s default), bearer token auth
- Response size validation (max 10MB pro sync)
- **chatStream**: parsuje OpenAI SSE format, yieldi content delty, handle prazdne eventy (issue #52679)

### 2.4 a2a/agent-card.ts — v1.0 format
```typescript
export function buildAgentCard(config: AgentCardConfig): AgentCard {
  return {
    name: 'OpenClaw A2A Bridge',
    description: 'A2A bridge to OpenClaw AI assistant gateway',
    version: '1.0.0',
    supportedInterfaces: [{
      url: config.publicUrl,
      protocolBinding: 'JSONRPC',
      protocolVersion: '1.0',
    }],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{
      id: 'openclaw-chat',
      name: 'OpenClaw Chat',
      description: 'Chat with OpenClaw AI assistant',
      tags: ['chat', 'ai', 'assistant'],
    }],
  };
}
```

### 2.5 a2a/request-handler.ts — v1.0 JSON-RPC dispatch (all 11 methods)
```typescript
// Dispatch tabulka — VSECH 11 v1.0 PascalCase metod
const HANDLERS: Record<A2AMethod, Handler> = {
  // Core (6)
  'SendMessage': handleSendMessage,
  'SendStreamingMessage': handleSendStreamingMessage,
  'GetTask': handleGetTask,
  'ListTasks': handleListTasks,
  'CancelTask': handleCancelTask,
  'SubscribeToTask': handleSubscribe,
  // Push Notifications (4)
  'CreateTaskPushNotificationConfig': handleCreatePushConfig,
  'GetTaskPushNotificationConfig': handleGetPushConfig,
  'ListTaskPushNotificationConfigs': handleListPushConfigs,
  'DeleteTaskPushNotificationConfig': handleDeletePushConfig,
  // Extended Agent Card (1)
  'GetExtendedAgentCard': handleGetExtendedCard,
};

// A2A-Version header validace — spec-compliant!
// Per spec 3.6.2: empty/missing header MUST be interpreted as "0.3"
// If we only support 1.0, we MUST return VersionNotSupportedError for 0.3
function resolveAndValidateVersion(req: Request): string {
  const raw = req.header('A2A-Version')?.trim() || req.query['A2A-Version'] as string;
  const version = raw || '0.3';  // spec: empty → 0.3

  if (version !== '1.0') {
    throw new A2AError(
      A2A_ERROR_CODES.VERSION_NOT_SUPPORTED,
      `A2A version "${version}" is not supported. Supported versions: ["1.0"]`,
      { supportedVersions: ['1.0'] }
    );
  }
  return version;
}
```

### 2.6 a2a/executor.ts — v1.0 task lifecycle
```typescript
class OpenClawExecutor {
  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    // 1. Extract text z v1.0 Part (field presence: part.text)
    const text = context.userMessage.parts
      .filter(p => p.text !== undefined)
      .map(p => p.text)
      .join('\n');

    // 2. Resolve instance from message metadata
    const instance = resolveInstance(context.userMessage.metadata);

    // 3. Determine contextId — multi-turn linking
    //    context.userMessage.contextId and/or context.userMessage.taskId
    //    If taskId provided, server infers contextId from stored task
    const contextId = context.contextId; // resolved by request handler

    // 4. Publish TASK_STATE_WORKING
    eventBus.publish({ statusUpdate: {
      taskId: context.task.id,   // Task uses `id`, NOT `taskId`!
      contextId,
      status: { state: TaskState.WORKING, timestamp: new Date().toISOString() },
    }});

    // 5. Call OpenClaw (sync pro SendMessage)
    const response = await this.client.chat(text, instance);
    // response je OpenAI-compat: response.choices[0].message.content
    const content = response.choices[0]?.message?.content ?? '';

    // 6. Publish artifact
    eventBus.publish({ artifactUpdate: {
      taskId: context.task.id,
      contextId,
      artifact: {
        artifactId: uuid(),
        parts: [{ text: content }],
      },
    }});

    // 7. Detect multi-turn: pokud OpenClaw odpoved vyzaduje dalsi vstup
    //    → publish TASK_STATE_INPUT_REQUIRED (interrupted state)
    //    klient musi poslat dalsi SendMessage se message.contextId nebo message.taskId
    if (this.isInputRequired(content)) {
      eventBus.publish({ statusUpdate: {
        taskId: context.task.id,
        contextId,
        status: {
          state: TaskState.INPUT_REQUIRED,
          message: { messageId: uuid(), role: Role.AGENT, parts: [{ text: content }] },
          timestamp: new Date().toISOString(),
        },
      }});
      eventBus.finished();  // stream closes, client re-sends with message.taskId
      return;
    }

    // 8. Publish TASK_STATE_COMPLETED
    eventBus.publish({ statusUpdate: {
      taskId: context.task.id,
      contextId,
      status: { state: TaskState.COMPLETED, timestamp: new Date().toISOString() },
    }});

    eventBus.finished();
  }

  // Multi-turn detection heuristic
  private isInputRequired(content: string): boolean {
    // Configurable via MULTI_TURN_DETECTION env var
    // Strategies: question-mark detection, explicit prompt markers, metadata flags
    return false; // default: single-turn, override per config
  }
}
```

### 2.7 a2a/router.ts — Express routes
```typescript
router.get('/.well-known/agent-card.json', (req, res) => {
  res.json(buildAgentCard(config));
});

router.post('/a2a', jsonRpcHandler);  // v1.0: single JSON-RPC endpoint, no /v1/ prefix
```

### 2.8 server/index.ts
- Express app, /health, /instances, mount A2A router
- Graceful shutdown (SIGTERM, SIGINT)

### 2.9 index.ts (CLI)
- yargs: --port, --host, --openclaw-url, --token
- Env vars jako fallback
- Start server

---

## Faze 3: Streaming

### Cil
Real SSE streaming — proxy OpenClaw streaming response pres A2A protocol.

### 3.1 SendStreamingMessage flow
```
A2A Client --SSE--> openclaw-a2a --SSE--> OpenClaw Gateway
                                          stream: true
                                          ↓
                    <--TaskStatusUpdate--- TASK_STATE_WORKING
                    <--TaskArtifactUpdate- delta chunk 1 (append: true)
                    <--TaskArtifactUpdate- delta chunk 2 (append: true)
                    <--TaskArtifactUpdate- delta chunk N (lastChunk: true)
                    <--TaskStatusUpdate--- TASK_STATE_COMPLETED
```

### 3.2 OpenClaw SSE parsing v client.ts
```typescript
async *chatStream(message: string, instance?: InstanceConfig): AsyncGenerator<string> {
  const response = await fetch(url, {
    body: JSON.stringify({ ...body, stream: true }),
    // ...
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';  // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      if (!data) continue;  // handle empty data (issue #52679)

      const chunk = JSON.parse(data);
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
```

### 3.3 Heartbeat
- 15s interval: publish TaskStatusUpdate WORKING
- Drzi SSE connection alive
- clearInterval po completed/failed/canceled

### 3.4 Executor streaming mode
```typescript
async executeStreaming(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
  // ... extract text, resolve instance, publish WORKING (same as sync) ...

  const artifactId = uuid();
  for await (const chunk of this.client.chatStream(text, instance)) {
    if (this.isCanceled(context.task.id)) { /* cancel flow */ break; }

    eventBus.publish({ artifactUpdate: {
      taskId: context.task.id,   // events use taskId (referencing Task.id)
      contextId: context.contextId,
      artifact: { artifactId, parts: [{ text: chunk }] },
      append: true,
    }});
  }

  // Final chunk marker
  eventBus.publish({ artifactUpdate: {
    taskId: context.task.id,
    contextId: context.contextId,
    artifact: { artifactId, parts: [{ text: '' }] },
    lastChunk: true,
  }});

  // ... publish COMPLETED or INPUT_REQUIRED ...
  eventBus.finished();
}
```

### 3.5 Cancellation
- `cancelTask(taskId)` → add to canceled Set
- AbortController pro fetch cancellation (prerusi streaming)
- Check v streaming loop

### 3.6 Multi-turn streaming
- Streaming + INPUT_REQUIRED: stream ends, client reconnects via SubscribeToTask nebo novy SendStreamingMessage
- contextId zachovava session kontinuitu

### Rozhodnuto (Faze 3)
- Multi-turn: **ANO** — TASK_STATE_INPUT_REQUIRED
- Heartbeat: 15s

---

## Faze 4: Multi-instance

### Cil
Routing requestu na ruzne OpenClaw instance.

### 4.1 Instance config
- `OPENCLAW_INSTANCES` env var (JSON array)
- Kazda instance: name, url, token, default (boolean)
- Single instance fallback: OPENCLAW_URL + OPENCLAW_GATEWAY_TOKEN

### 4.2 Routing logika
- A2A message metadata: `{ "instance": "staging" }`
- Lookup instance by name, fallback na default
- Error pokud instance neexistuje

### 4.3 Per-instance OpenClawClient
- Client pool — jeden client per instance, lazy init

### 4.4 /instances endpoint
- GET /instances → JSON array of { name, url (no token!), default }

---

## Faze 5: Testing & Quality

### Cil
Komplexni test suite testovatelna na localhostu BEZ realneho OpenClaw Gateway.

> Detailni testing strategie viz [03-testing-strategy.md](./03-testing-strategy.md)

### 5.1 Unit testy (Vitest, mock fetch)
- `src/__tests__/openclaw/client.test.ts` — sync + streaming
- `src/__tests__/a2a/agent-card.test.ts` — v1.0 Agent Card validation
- `src/__tests__/a2a/executor.test.ts` — task lifecycle, v1.0 enums
- `src/__tests__/a2a/request-handler.test.ts` — JSON-RPC dispatch, PascalCase metody, A2A-Version header
- `src/__tests__/a2a/types.test.ts` — v1.0 Part creation, field presence discriminace
- `src/__tests__/config/index.test.ts` — env parsing
- `src/__tests__/utils/logger.test.ts` — logging

### 5.2 Integration testy (supertest)
- `src/__tests__/server/a2a-endpoints.test.ts` — full HTTP flow, Agent Card, JSON-RPC
- `src/__tests__/server/streaming.test.ts` — SSE streaming integration
- `src/__tests__/server/health.test.ts` — health + instances

### 5.3 E2E testy (TypeScript, optional, real gateway)
- `tests/e2e/discovery.test.ts` — Agent Card fetch + validate
- `tests/e2e/sync-chat.test.ts` — SendMessage flow
- `tests/e2e/streaming.test.ts` — SendStreamingMessage flow
- `tests/e2e/health.test.ts` — health + instances
- Runner: separate vitest config nebo tsx script

### 5.4 Quality gates
- `npm run check:all` = lint:fix + typecheck + test:run + build
- CI: vsechny quality gates, matrix Node 20 + 22
- E2E: manual na localhostu, ne v CI

---

## Faze 6: Docker & CI/CD

### 6.1 Dockerfile
Multi-stage, mirror openclaw-mcp: node:20-slim, tini, non-root, HEALTHCHECK, port 3100.

### 6.2 docker-compose.yml + docker-compose.dev.yml
Production + dev (bind mount, hot reload).

### 6.3 CI workflow (.github/workflows/ci.yml)
- Trigger: push main/develop, PR to main
- Matrix: Node 20 + 22
- Steps: checkout, npm ci, lint, format:check, typecheck, build, test:run
- Upload dist artifacts

### 6.4 Docker build + GHCR push workflow
- Trigger: push main, release
- Multi-arch: linux/amd64 + linux/arm64
- Push to `ghcr.io/freema/openclaw-a2a`
- Tags: latest, sha, semver

### 6.5 npm publish workflow
- Trigger: release event
- npm publish --provenance (mirror openclaw-mcp)

### 6.6 Code review workflow
- PR trigger, automated review

---

## Faze 7: Documentation

### 7.1 README.md
- Quick start, configuration, curl examples (v1.0 format!)
- Docker deployment, development guide

### 7.2 docs/ folder
| Soubor | Obsah |
|--------|-------|
| `installation.md` | Setup, prerequisites, OpenClaw Gateway config |
| `configuration.md` | Env vars, CLI options, multi-instance |
| `deployment.md` | Docker, Kubernetes, reverse proxy |
| `development.md` | Local dev, adding features, testing |
| `a2a-protocol.md` | A2A v1.0 spec overview, task lifecycle, streaming |

### 7.3 GitHub Pages
- Source: /docs/, bez custom domeny
- index.html s prehledem

---

## Implementacni priorita

```
Faze 0 (scaffold) → Faze 1 (v1.0 types) → Faze 2 (core) → Faze 5 (testy)
                                                           → Faze 3 (streaming)
                                                           → Faze 4 (multi-instance)
                                            Faze 5 done    → Faze 6 (docker/CI)
                                            Faze 6 done    → Faze 7 (docs)
```

**MVP (testovatelny na localhostu)**: Faze 0 + 1 + 2 + 5 = scaffold + v1.0 types + core server + testy

---

## curl priklady (v1.0 format!)

### Agent Card discovery
```bash
curl http://localhost:3100/.well-known/agent-card.json | jq .
```

### Health check
```bash
curl http://localhost:3100/health | jq .
```

### Sync SendMessage (v1.0)
```bash
curl -X POST http://localhost:3100/a2a \
  -H "Content-Type: application/json" \
  -H "A2A-Version: 1.0" \
  -d '{
    "jsonrpc": "2.0", "id": "1", "method": "SendMessage",
    "params": {
      "message": {
        "messageId": "test-1",
        "role": "ROLE_USER",
        "parts": [{ "text": "Hello from A2A v1.0!" }]
      }
    }
  }'
```

### SSE Streaming — SendStreamingMessage (v1.0)
```bash
curl -N -X POST http://localhost:3100/a2a \
  -H "Content-Type: application/json" \
  -H "A2A-Version: 1.0" \
  -H "Accept: text/event-stream" \
  -d '{
    "jsonrpc": "2.0", "id": "2", "method": "SendStreamingMessage",
    "params": {
      "message": {
        "messageId": "test-2",
        "role": "ROLE_USER",
        "parts": [{ "text": "Stream this!" }]
      }
    }
  }'
```

### Multi-turn follow-up (v1.0) — uses message.contextId
```bash
# After getting a response with contextId from first message:
curl -X POST http://localhost:3100/a2a \
  -H "Content-Type: application/json" \
  -H "A2A-Version: 1.0" \
  -d '{
    "jsonrpc": "2.0", "id": "3", "method": "SendMessage",
    "params": {
      "message": {
        "messageId": "test-3",
        "contextId": "<contextId-from-previous-response>",
        "role": "ROLE_USER",
        "parts": [{ "text": "Tell me more about that." }]
      }
    }
  }'
```

### GetTask (v1.0) — uses Task.id (not taskId!)
```bash
curl -X POST http://localhost:3100/a2a \
  -H "Content-Type: application/json" \
  -H "A2A-Version: 1.0" \
  -d '{
    "jsonrpc": "2.0", "id": "4", "method": "GetTask",
    "params": { "id": "<task-id-from-response>" }
  }'
```

### Instances info
```bash
curl http://localhost:3100/instances | jq .
```
