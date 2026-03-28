# Testing Strategy: openclaw-a2a

> Datum: 2026-03-27
> Status: DRAFT v4 — opraveny protokolove chyby z review
> Zavislost: [02-implementation-plan.md](./02-implementation-plan.md)

---

## Rozhodnuti

| Otazka | Rozhodnuti |
|--------|-----------|
| A2A verze v testech | **v1.0** — PascalCase metody, SCREAMING_SNAKE enums, Part field presence |
| E2E jazyk | **TypeScript** s realnym OpenClaw Gateway |
| Mock strategy | **vi.stubGlobal('fetch')** (konzistentni s openclaw-mcp) |
| v1.0 scope | **Vsechny operace** |
| Multi-turn | **Ano** — INPUT_REQUIRED testy |
| a2a-inspector | **Ano** — official validace |
| Coverage report | K rozhodnuti pozdeji |

### Poznamka k openclaw-mcp
openclaw-mcp nema automatizovane E2E testy s realnym gateway — jen manual testy pres MCP Inspector a curl.
My udelame vic: automatizovane TS E2E testy + a2a-inspector validaci.

---

## Princip #1: Vsechno MUSI byt testovatelne na localhostu BEZ realneho OpenClaw Gateway

- Unit testy mockuji HTTP (`vi.stubGlobal('fetch', ...)`)
- Integration testy pouzivaji supertest (in-process Express)
- E2E testy (TypeScript) jsou **optional** a vyzaduji realny gateway

---

## Test Pyramid

```
         /  E2E (TS) \       ← optional, realny OpenClaw Gateway
        / Integration  \      ← supertest, in-process server, mock OpenClaw
       /   Unit Tests    \    ← mock fetch, isolated functions
      ──────────────────────
```

| Vrstva | Pocet | OpenClaw | Spusteni | Kde |
|--------|-------|----------|----------|-----|
| Unit | ~20-25 | Mock fetch | `npm run test` | `src/__tests__/` |
| Integration | ~8-12 | Mock fetch | `npm run test` | `src/__tests__/server/` |
| E2E | ~5-7 | Realny | `npm run test:e2e` | `tests/e2e/` |

---

## Unit Testy

### U1: OpenClawClient (`src/__tests__/openclaw/client.test.ts`)
Mirror openclaw-mcp pattern s `vi.stubGlobal('fetch', fetchSpy)`.

| Test | Co overuje |
|------|-----------|
| strips trailing slash from baseUrl | URL normalization |
| sends correct headers (Authorization, Content-Type) | Auth header s bearer token |
| sends correct body format | OpenAI-compat request format |
| parses successful response | Response extraction |
| handles timeout | AbortController + timeout |
| handles network error | fetch rejection → OpenClawConnectionError |
| handles 401 response | API error mapping |
| handles 500 response | Server error mapping |
| handles empty response | Edge case |
| handles response > 10MB | Size limit |
| chat() sends message correctly | Happy path |
| health() calls correct endpoint | Health check |

### U1b: OpenClawClient Streaming (`src/__tests__/openclaw/client-stream.test.ts`)

| Test | Co overuje |
|------|-----------|
| chatStream sends stream: true | Request format |
| chatStream yields content deltas | SSE parsing |
| chatStream handles [DONE] terminator | Stream end |
| chatStream handles empty data lines | Issue #52679 workaround |
| chatStream handles network error mid-stream | Error resilience |
| chatStream supports AbortController cancellation | Cancellation |

### U2: A2A v1.0 Types (`src/__tests__/a2a/types.test.ts`)

| Test | Co overuje |
|------|-----------|
| Part with text field only | Text part creation |
| Part with url + mediaType | File part creation |
| Part with data field (object) | Data part: object value |
| Part with data field (array) | Data part: array value |
| Part with data field (string/number/null) | Data part: any JSON value (proto Value, not Struct) |
| Part discrimination by field presence | v1.0 pattern (ne kind) |
| TaskState enum values are SCREAMING_SNAKE | v1.0 format |
| Role enum values are prefixed | ROLE_USER, ROLE_AGENT |
| Message with v1.0 structure | No kind field |
| StreamResponse discrimination by field presence | statusUpdate vs artifactUpdate |

### U3: Agent Card Builder (`src/__tests__/a2a/agent-card.test.ts`)

| Test | Co overuje |
|------|-----------|
| builds valid v1.0 agent card | supportedInterfaces present |
| includes protocolVersion "1.0" | v1.0 marker |
| includes protocolBinding "JSONRPC" | Binding type |
| includes streaming capability | capabilities.streaming: true |
| includes correct URL in supportedInterfaces | PUBLIC_URL mapping |
| includes skills | Skills array |
| does NOT include deprecated fields | No url/additionalInterfaces at top level |
| produces JSON-serializable output | JSON.stringify doesn't throw |

### U4: Executor (`src/__tests__/a2a/executor.test.ts`)
Mock OpenClawClient (ne fetch — vyssi abstrakce).

| Test | Co overuje |
|------|-----------|
| publishes TASK_STATE_WORKING with task.id (not taskId) | v1.0 field naming |
| calls OpenClawClient.chat with correct text | Part.text extraction |
| extracts content from response.choices[0].message.content | OpenAI-compat format |
| publishes artifact with response | TaskArtifactUpdate |
| publishes TASK_STATE_COMPLETED on success | v1.0 terminal state |
| calls eventBus.finished() | Cleanup |
| publishes TASK_STATE_FAILED on OpenClaw error | Error handling |
| publishes TASK_STATE_INPUT_REQUIRED when detected | Multi-turn flow |
| handles cancellation before API call | Cancel check #1 |
| handles cancellation after API call | Cancel check #2 |
| extracts text from multiple parts | Multi-part message |
| resolves correct instance from message metadata | Multi-instance routing |
| uses default instance when no metadata | Fallback behavior |
| handles empty message parts | Edge case |
| includes ISO 8601 UTC timestamp in status updates | Timestamp format |
| resolves contextId from message.contextId | Multi-turn context |
| resolves contextId from message.taskId via task store | taskId → contextId lookup |

### U5: Request Handler (`src/__tests__/a2a/request-handler.test.ts`)

| Test | Co overuje |
|------|-----------|
| dispatches SendMessage to correct handler | PascalCase routing |
| dispatches SendStreamingMessage | Streaming route |
| dispatches GetTask | Task retrieval |
| dispatches ListTasks | Task listing |
| dispatches CancelTask | Cancellation |
| dispatches SubscribeToTask | Task subscription |
| dispatches CreateTaskPushNotificationConfig | Push notif create |
| dispatches GetTaskPushNotificationConfig | Push notif get |
| dispatches ListTaskPushNotificationConfigs | Push notif list |
| dispatches DeleteTaskPushNotificationConfig | Push notif delete |
| dispatches GetExtendedAgentCard | Extended card |
| returns METHOD_NOT_FOUND for unknown method | Error handling |
| returns METHOD_NOT_FOUND for v0.3 method names | Rejects message/send |
| validates A2A-Version: 1.0 header | Version check |
| returns VERSION_NOT_SUPPORTED for A2A-Version: 0.5 | Unsupported version |
| returns VERSION_NOT_SUPPORTED for missing header | Empty → 0.3 → reject (we only support 1.0) |
| returns VERSION_NOT_SUPPORTED for empty header | Same: empty → 0.3 → reject |
| accepts A2A-Version as query param | `?A2A-Version=1.0` alternative |
| validates JSON-RPC structure | jsonrpc: "2.0" required |
| returns PARSE_ERROR for invalid JSON | Malformed request |
| returns INVALID_PARAMS for missing params | Validation |

### U6: Push Notification Handlers (`src/__tests__/a2a/push-notifications.test.ts`)

| Test | Co overuje |
|------|-----------|
| CreateTaskPushNotificationConfig stores config | Create flow |
| GetTaskPushNotificationConfig retrieves config | Get flow |
| ListTaskPushNotificationConfigs returns all for task | List flow |
| DeleteTaskPushNotificationConfig removes config | Delete flow |
| operations on non-existent task return TASK_NOT_FOUND | Error handling |
| returns PUSH_NOTIFICATION_NOT_SUPPORTED if disabled | Capability check |

**Poznamka**: Push notif handlery mohou byt stub (UNSUPPORTED_OPERATION) v prvni iteraci.
Testy pak overuji spravny error response. Plna implementace pozdeji.

### U7: GetExtendedAgentCard (`src/__tests__/a2a/extended-card.test.ts`)

| Test | Co overuje |
|------|-----------|
| returns extended card when enabled | Happy path |
| returns UNSUPPORTED_OPERATION when disabled | Capability check |
| requires authentication | Auth enforcement |

### U8: Config (`src/__tests__/config/index.test.ts`)
Same as before — env parsing, validation, multi-instance.

### U9: Logger (`src/__tests__/utils/logger.test.ts`)
Mirror z openclaw-mcp.

### U10: SSE Utils (`src/__tests__/a2a/sse.test.ts`)

| Test | Co overuje |
|------|-----------|
| formatSSEEvent produces correct format | data: {json}\n\n |
| SSE_HEADERS contains required headers | Content-Type, Cache-Control |

---

## Integration Testy

Pouzivaji `supertest` — spusti Express app in-process, mock OpenClawClient.

### I1: A2A Endpoints (`src/__tests__/server/a2a-endpoints.test.ts`)

| Test | Co overuje |
|------|-----------|
| GET /.well-known/agent-card.json returns valid v1.0 card | Agent Card discovery |
| Agent Card has correct Content-Type | application/json |
| Agent Card contains supportedInterfaces | v1.0 structure |
| POST /a2a with SendMessage returns task | Sync message flow |
| POST /a2a response contains v1.0 enums | TASK_STATE_COMPLETED |
| POST /a2a with A2A-Version: 1.0 header works | Version handling |
| POST /a2a with A2A-Version: 0.3 returns VERSION_NOT_SUPPORTED | Explicit old version |
| POST /a2a WITHOUT A2A-Version header returns VERSION_NOT_SUPPORTED | Empty → 0.3 → reject |
| response Task has `id` field (not `taskId`) | v1.0 Task structure |
| POST /a2a with invalid method returns error | JSON-RPC error |
| POST /a2a with invalid JSON returns parse error | Malformed request |
| POST /a2a with missing params returns error | Validation |

### I2: Streaming (`src/__tests__/server/streaming.test.ts`)

| Test | Co overuje |
|------|-----------|
| SendStreamingMessage returns text/event-stream | SSE Content-Type |
| SSE stream contains TASK_STATE_WORKING event | First event |
| SSE stream contains TaskArtifactUpdate events | Artifact chunks |
| SSE stream contains TASK_STATE_COMPLETED event | Terminal event |
| SSE events use v1.0 field presence (no kind) | v1.0 format |
| Stream terminates after completed | Clean close |

### I3: Health & Info (`src/__tests__/server/health.test.ts`)

| Test | Co overuje |
|------|-----------|
| GET /health returns 200 | Health check |
| GET /health returns JSON with status | Response format |
| GET /instances returns instance list | Instance info |
| GET /instances does not expose tokens | Security |

### I4: Server Lifecycle (`src/__tests__/server/lifecycle.test.ts`)

| Test | Co overuje |
|------|-----------|
| server starts on configured port | Port binding |
| server handles graceful shutdown | SIGTERM handling |

---

## E2E Testy (TypeScript, localhost, realny OpenClaw Gateway)

### Pozadi
openclaw-mcp nema automatizovane E2E testy — jen manual curl a MCP Inspector.
Pro openclaw-a2a udelame lepsi pristup: **plne automatizovane TypeScript E2E testy**.

### Prerekvizity
1. **OpenClaw Gateway** bezici na `localhost:18789`
2. OpenClaw config s `chatCompletions.enabled: true`
3. Env vars nastavene:
   ```bash
   export OPENCLAW_URL=http://127.0.0.1:18789
   export OPENCLAW_GATEWAY_TOKEN=your-token
   ```
4. **A2A server se spusti automaticky** v globalSetup — neni treba manual start!

### Struktura
```
tests/
├── e2e/
│   ├── vitest.config.ts     # Separate vitest config (longer timeouts)
│   ├── global-setup.ts      # Start A2A server + verify OpenClaw Gateway
│   ├── global-teardown.ts   # Stop A2A server
│   ├── helpers.ts           # E2E utility: sendA2A(), streamA2A(), etc.
│   ├── discovery.test.ts    # Agent Card
│   ├── health.test.ts       # Health + instances
│   ├── send-message.test.ts # Sync SendMessage (full v1.0 flow)
│   ├── streaming.test.ts    # SSE SendStreamingMessage
│   ├── task-lifecycle.test.ts  # GetTask, ListTasks, CancelTask
│   ├── multi-turn.test.ts   # INPUT_REQUIRED → follow-up message
│   ├── multi-instance.test.ts  # Instance routing (if configured)
│   └── a2a-inspector.test.ts   # Official a2a-inspector validation
```

### package.json scripts
```json
{
  "test:e2e": "vitest run --config tests/e2e/vitest.config.ts",
  "test:e2e:watch": "vitest --config tests/e2e/vitest.config.ts"
}
```

### Taskfile.yml
```yaml
test:e2e:
  desc: "Run E2E tests (requires OpenClaw Gateway on localhost:18789)"
  env:
    OPENCLAW_URL: "http://127.0.0.1:18789"
    OPENCLAW_GATEWAY_TOKEN: "{{.OPENCLAW_GATEWAY_TOKEN}}"
  cmd: npx vitest run --config tests/e2e/vitest.config.ts
```

### vitest.config.ts (E2E)
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60000,     // 60s — real OpenClaw API calls mohou byt pomale
    hookTimeout: 15000,
    globalSetup: ['tests/e2e/global-setup.ts'],
    // Sequential — E2E testy sdili server state
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

### global-setup.ts — automaticky start A2A serveru
```typescript
import { spawn, ChildProcess } from 'child_process';

let serverProcess: ChildProcess;

export async function setup() {
  // 1. Verify OpenClaw Gateway is accessible
  const gatewayUrl = process.env.OPENCLAW_URL ?? 'http://127.0.0.1:18789';
  try {
    const health = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openclaw', messages: [] }),
    });
    // 4xx is OK (means gateway is running), 5xx or network error is not
    if (health.status >= 500) throw new Error(`Gateway returned ${health.status}`);
  } catch (e: any) {
    if (e.code === 'ECONNREFUSED') {
      throw new Error(
        `OpenClaw Gateway not running at ${gatewayUrl}.\n` +
        `Start it first: openclaw serve\n` +
        `Config: chatCompletions.enabled: true in openclaw.json`
      );
    }
    // Other errors might be OK (e.g., 401 means gateway is running but needs token)
  }

  // 2. Start A2A server as child process
  serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    env: {
      ...process.env,
      PORT: '3199',  // E2E port — avoid conflict with dev server on 3100
      OPENCLAW_URL: gatewayUrl,
      OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN,
      DEBUG: 'true',
    },
    stdio: 'pipe',
  });

  // 3. Wait for server to be ready
  const serverUrl = 'http://localhost:3199';
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${serverUrl}/health`);
      if (res.ok) {
        console.log(`A2A server ready at ${serverUrl}`);
        // Make URL available to tests
        process.env.A2A_SERVER_URL = serverUrl;
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('A2A server failed to start within 15s');
}

export async function teardown() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    // Wait for graceful shutdown
    await new Promise(r => setTimeout(r, 1000));
  }
}
```

### helpers.ts — E2E utility functions
```typescript
const BASE_URL = () => process.env.A2A_SERVER_URL ?? 'http://localhost:3199';

// Send JSON-RPC request to A2A server
export async function sendA2A(method: string, params: unknown) {
  const res = await fetch(`${BASE_URL()}/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'A2A-Version': '1.0',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `e2e-${Date.now()}`,
      method,
      params,
    }),
  });
  return res.json();
}

// Send A2A message (shorthand)
export async function sendMessage(
  text: string,
  options?: { metadata?: Record<string, unknown>; contextId?: string; taskId?: string }
) {
  return sendA2A('SendMessage', {
    message: {
      messageId: `e2e-msg-${Date.now()}`,
      // Multi-turn linking goes on MESSAGE, not top-level params
      ...(options?.contextId ? { contextId: options.contextId } : {}),
      ...(options?.taskId ? { taskId: options.taskId } : {}),
      role: 'ROLE_USER',
      parts: [{ text }],
      ...(options?.metadata ? { metadata: options.metadata } : {}),
    },
  });
}

// Stream A2A message — returns async generator of SSE events
export async function* streamMessage(text: string): AsyncGenerator<any> {
  const res = await fetch(`${BASE_URL()}/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'A2A-Version': '1.0',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `e2e-stream-${Date.now()}`,
      method: 'SendStreamingMessage',
      params: {
        message: {
          messageId: `e2e-msg-${Date.now()}`,
          role: 'ROLE_USER',
          parts: [{ text }],
        },
      },
    }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      yield JSON.parse(data);
    }
  }
}

// Fetch Agent Card
export async function getAgentCard() {
  const res = await fetch(`${BASE_URL()}/.well-known/agent-card.json`);
  return res.json();
}

// Fetch health
export async function getHealth() {
  const res = await fetch(`${BASE_URL()}/health`);
  return res.json();
}
```

### E1: Discovery (`tests/e2e/discovery.test.ts`)

| Test | Co overuje |
|------|-----------|
| fetches agent card successfully | HTTP 200, valid JSON |
| agent card has v1.0 supportedInterfaces | Neni top-level url, je supportedInterfaces[] |
| supportedInterfaces contains JSONRPC binding | protocolBinding: "JSONRPC" |
| protocolVersion is "1.0" | v1.0 marker |
| agent card name contains OpenClaw | Identity |
| agent card declares streaming capability | capabilities.streaming: true |
| agent card has at least one skill | skills.length > 0 |

### E2: Health (`tests/e2e/health.test.ts`)

| Test | Co overuje |
|------|-----------|
| health endpoint returns ok | Server zdravy |
| instances endpoint returns list | Instance config |
| instances do not expose tokens | Security |

### E3: SendMessage (`tests/e2e/send-message.test.ts`)

| Test | Co overuje |
|------|-----------|
| SendMessage with simple text returns task | Full sync flow pres real OpenClaw |
| response is valid JSON-RPC with result | jsonrpc: "2.0", no error |
| result task state is TASK_STATE_COMPLETED | v1.0 terminal state |
| result contains non-empty artifact | OpenClaw vygeneroval odpoved |
| artifact parts use v1.0 format | { text: "..." } ne { kind: "text" } |
| A2A-Version: 1.0 header accepted | Header handling |
| v0.3 method name message/send returns error | Rejects old format |

### E4: Streaming (`tests/e2e/streaming.test.ts`)

| Test | Co overuje |
|------|-----------|
| SendStreamingMessage returns SSE stream | Content-Type: text/event-stream |
| first event is statusUpdate WORKING | Task lifecycle start |
| stream contains artifactUpdate events | Real OpenClaw streaming chunks |
| last event is statusUpdate COMPLETED | Terminal state |
| all events are valid JSON-RPC responses | No parse errors |
| events use v1.0 field presence (no kind) | v1.0 format |
| artifactUpdate has append: true for chunks | Chunked delivery |

### E5: Task Lifecycle (`tests/e2e/task-lifecycle.test.ts`)

| Test | Co overuje |
|------|-----------|
| SendMessage → GetTask returns same task | Task persistence |
| GetTask with unknown ID returns TASK_NOT_FOUND | Error handling |
| ListTasks returns at least one task | Task listing |
| ListTasks with pagination works | Cursor-based pagination |
| CancelTask on completed task returns error | TASK_NOT_CANCELABLE |

### E6: Multi-turn (`tests/e2e/multi-turn.test.ts`)

| Test | Co overuje |
|------|-----------|
| follow-up with message.contextId maintains session | contextId on MESSAGE (not params) |
| follow-up with message.taskId continues same task | taskId → server infers contextId |
| mismatched contextId + taskId returns error | Spec: reject mismatch |
| response Task.id is stable across multi-turn | Task.id (not taskId) |
| (pokud INPUT_REQUIRED): re-send continues task | Multi-turn flow |

### E7: Multi-instance (`tests/e2e/multi-instance.test.ts`)
(skip pokud jen single instance)

| Test | Co overuje |
|------|-----------|
| message with instance metadata routes correctly | Instance routing |
| message without metadata uses default | Default fallback |
| non-existent instance returns error | Error handling |

### E8: a2a-inspector Validation (`tests/e2e/a2a-inspector.test.ts`)

| Test | Co overuje |
|------|-----------|
| a2a-inspector validates Agent Card | Official v1.0 compliance |
| a2a-inspector validates SendMessage response | Response format |
| a2a-inspector validates streaming response | SSE format |

**Note**: a2a-inspector (https://github.com/a2aproject/a2a-inspector) je official validacni tool.
Bud ho spustime jako subprocess, nebo pouzijeme jeho validation library pokud exportuje funkce.
Toto overime pri implementaci — mozna bude lepsi integrace pres HTTP.

---

## Mock Strategy

### Princip: Mock na spravne urovni

| Vrstva | Co mockujeme | Jak |
|--------|-------------|-----|
| Unit: Client | `global.fetch` | `vi.stubGlobal('fetch', vi.fn())` |
| Unit: Client stream | `global.fetch` + ReadableStream | Mock SSE response |
| Unit: Executor | `OpenClawClient` | Class mock / DI |
| Unit: Config | `process.env` | `vi.stubEnv()` |
| Integration | `OpenClawClient` | Inject mock client do serveru |
| E2E | Nic | Real OpenClaw Gateway + Real server |

### Mock helpers (`src/__tests__/helpers/`)

```typescript
// src/__tests__/helpers/mock-openclaw.ts
// Returns OpenAI-compat format: response.choices[0].message.content
// This MUST match what executor expects (response.choices[0]?.message?.content)
export function createMockOpenClawClient(response?: string) {
  return {
    chat: vi.fn().mockResolvedValue({
      choices: [{ message: { content: response ?? 'Mock response' } }],
    }),
    chatStream: vi.fn().mockImplementation(async function* () {
      yield 'Mock ';
      yield 'streaming ';
      yield 'response';
    }),
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
  };
}
// NOTE: Executor extracts content as: response.choices[0]?.message?.content
// This is consistent with OpenAI chat completions API format.

// src/__tests__/helpers/mock-a2a.ts — v1.0 format!
export function createA2ARequest(
  method: A2AMethod,
  text: string,
  options?: {
    metadata?: Record<string, unknown>;
    contextId?: string;   // goes on MESSAGE, not top-level params!
    taskId?: string;      // goes on MESSAGE, not top-level params!
  }
) {
  return {
    jsonrpc: '2.0',
    id: '1',
    method,  // PascalCase: 'SendMessage', 'SendStreamingMessage', etc.
    params: {
      message: {
        messageId: `test-${Date.now()}`,
        // Multi-turn: contextId and taskId are on MESSAGE per spec
        ...(options?.contextId ? { contextId: options.contextId } : {}),
        ...(options?.taskId ? { taskId: options.taskId } : {}),
        role: 'ROLE_USER',  // v1.0 enum
        parts: [{ text }],  // v1.0 Part: field presence, ne kind
        ...(options?.metadata ? { metadata: options.metadata } : {}),
      },
    },
  };
}

// Helper pro multi-turn: continue by contextId
export function createFollowUpByContext(text: string, contextId: string) {
  return createA2ARequest('SendMessage', text, { contextId });
}

// Helper pro multi-turn: continue by taskId (server infers contextId)
export function createFollowUpByTask(text: string, taskId: string) {
  return createA2ARequest('SendMessage', text, { taskId });
}

// src/__tests__/helpers/mock-sse-fetch.ts — mock streaming fetch response
export function createMockSSEResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          choices: [{ delta: { content: chunk } }],
        })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

---

## CI Integration

### npm run test:run (Vitest single run)
- Spusti vsechny unit + integration testy
- NEMA zadne externi zavislosti
- Bezi v CI matrix (Node 20 + 22)
- Exit code 0 = vsechno proslo

### npm run check:all
```
lint:fix → typecheck → test:run → build
```
Quality gate — musi projit pred merge do main.

### npm run test:e2e (manual, ne v CI)
- Vyzaduje bezici OpenClaw Gateway na localhost:18789
- A2A server se **spusti automaticky** v globalSetup (port 3199)
- Manual run na localhostu pres `npm run test:e2e` nebo `task test:e2e`
- Mozno pridat do CI pozdeji s Docker Compose

---

## Dev Workflow pro localhost testovani

```bash
# 1. Unit + integration testy (watch mode)
npm run test

# 2. Overit vse pred commitem
npm run check:all         # lint + typecheck + test + build

# 3. Spustit server lokalne
npm run dev               # tsx watch — auto-reload

# 4. Manual test (jiny terminal)
curl http://localhost:3100/.well-known/agent-card.json | jq .
curl http://localhost:3100/health | jq .

# 5. Sync A2A request (v1.0)
curl -X POST http://localhost:3100/a2a \
  -H "Content-Type: application/json" \
  -H "A2A-Version: 1.0" \
  -d '{"jsonrpc":"2.0","id":"1","method":"SendMessage","params":{"message":{"messageId":"t1","role":"ROLE_USER","parts":[{"text":"Hello!"}]}}}'

# 6. E2E testy (s realnym gateway)
export OPENCLAW_URL=http://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=your-token
npm run dev &              # server na pozadi
npm run test:e2e           # TypeScript E2E testy

# 7. Docker build test
docker build -t openclaw-a2a .
docker run --rm -p 3100:3100 \
  -e OPENCLAW_URL=http://host.docker.internal:18789 \
  -e OPENCLAW_GATEWAY_TOKEN=your-token \
  openclaw-a2a
```

---

## Pokryti (Coverage targets)

| Metrika | Target | Poznamka |
|---------|--------|----------|
| Unit test count | 45+ | Pokryt vsechny moduly vcetne v1.0 types, push notif, extended card |
| Integration test count | 12+ | Pokryt vsechny endpointy + streaming |
| E2E test count | 8+ | Full flow: discovery, send, stream, lifecycle, multi-turn, inspector |
| Line coverage | 80%+ | Merime az pozdeji, ne blocker |
| CI pass rate | 100% | Zadne flaky testy |

---

## Otevtene otazky

- [ ] Chceme coverage report v CI? (istanbul/c8 via vitest)
- [ ] Chceme snapshot testy pro Agent Card JSON?
- [ ] Chceme testovat Docker build v CI? (`docker build` step)
- [x] ~~Chceme a2a-inspector?~~ → **ANO** — integrovano do E2E (tests/e2e/a2a-inspector.test.ts)
- [x] ~~E2E bash nebo TS?~~ → **TypeScript** s automatickym server start
- [x] ~~Multi-turn testy?~~ → **ANO** — tests/e2e/multi-turn.test.ts
