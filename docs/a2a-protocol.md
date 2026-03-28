# A2A Protocol — v1.0

This project implements the [A2A (Agent-to-Agent) protocol](https://google.github.io/A2A/) v1.0.

## Overview

A2A enables communication between AI agents. Unlike MCP (which connects agents to tools), A2A connects agents to other agents — horizontal communication.

```
MCP  = agent → tools     (vertical)
A2A  = agent ↔ agent     (horizontal)
```

## Discovery

Agents advertise themselves via an Agent Card at `/.well-known/agent-card.json`:

```bash
curl http://localhost:3100/.well-known/agent-card.json | jq .
```

The v1.0 Agent Card uses `supportedInterfaces[]` (not top-level `url`):

```json
{
  "name": "OpenClaw A2A Bridge",
  "supportedInterfaces": [{
    "url": "http://localhost:3100",
    "protocolBinding": "JSONRPC",
    "protocolVersion": "1.0"
  }],
  "capabilities": {
    "streaming": true
  },
  "skills": [...]
}
```

## Operations

All operations use JSON-RPC 2.0 over HTTP POST to `/a2a`.

### Core (6)

| Method | Description |
|---|---|
| `SendMessage` | Send a message, get task result (sync) |
| `SendStreamingMessage` | Send a message, get SSE stream |
| `GetTask` | Retrieve a task by ID |
| `ListTasks` | List tasks (cursor-based pagination) |
| `CancelTask` | Cancel a running task |
| `SubscribeToTask` | Re-subscribe to task events |

### Push Notifications (4)

| Method | Description |
|---|---|
| `CreateTaskPushNotificationConfig` | Configure push notifications |
| `GetTaskPushNotificationConfig` | Get push config |
| `ListTaskPushNotificationConfigs` | List push configs |
| `DeleteTaskPushNotificationConfig` | Delete push config |

### Extended (1)

| Method | Description |
|---|---|
| `GetExtendedAgentCard` | Get authenticated agent card |

## Task Lifecycle

```
SUBMITTED → WORKING → COMPLETED (terminal)
                    → FAILED (terminal)
                    → CANCELED (terminal)
                    → REJECTED (terminal)
                    → INPUT_REQUIRED (interrupted — waiting for user input)
                    → AUTH_REQUIRED (interrupted — waiting for auth)
          → PENDING (waiting to start)
```

Terminal states end the task. Interrupted states pause execution — the client must send a follow-up message to continue.

## v1.0 Key Differences from v0.3

| Aspect | v0.3 | v1.0 |
|---|---|---|
| Method names | `message/send` | `SendMessage` (PascalCase) |
| Enum values | `completed` | `TASK_STATE_COMPLETED` (SCREAMING_SNAKE) |
| Part types | `TextPart`, `FilePart` with `kind` | Single `Part` with field presence |
| Task identifier | `taskId` on Task | `id` on Task (`taskId` only in events) |
| Agent Card URL | Top-level `url` | `supportedInterfaces[].url` |
| Pagination | Page-based | Cursor-based |
| Version header | Not required | `A2A-Version: 1.0` required |

## Streaming

SSE streaming via `SendStreamingMessage`:

1. Client sends `SendStreamingMessage` with `A2A-Version: 1.0`
2. Server responds with `Content-Type: text/event-stream`
3. Events flow as JSON-RPC responses:
   - `statusUpdate` — task state changes (WORKING, COMPLETED, etc.)
   - `artifactUpdate` — content chunks (`append: true`, `lastChunk: true`)

```
Client ──SendStreamingMessage──> Server
       <──StatusUpdate(WORKING)──
       <──ArtifactUpdate(chunk1, append)──
       <──ArtifactUpdate(chunk2, append)──
       <──ArtifactUpdate(empty, lastChunk)──
       <──StatusUpdate(COMPLETED)──
       [stream ends]
```

## Multi-turn Conversations

Multi-turn linking is done via `contextId` and `taskId` **on the Message object** (not top-level params):

```json
{
  "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "msg-2",
      "contextId": "ctx-from-first-response",
      "role": "ROLE_USER",
      "parts": [{ "text": "Tell me more" }]
    }
  }
}
```

If only `taskId` is provided, the server infers `contextId` from the stored task.

## A2A-Version Header

The `A2A-Version` header is required for v1.0:

```
A2A-Version: 1.0
```

Per spec: if the header is missing or empty, it's interpreted as version `0.3`. Since this server only supports v1.0, requests without the header receive a `VersionNotSupportedError` (-32009).
