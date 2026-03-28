# openclaw-a2a

> What happens when AI agents start talking to each other?
> Let's find out.

[![CI](https://github.com/freema/openclaw-a2a/actions/workflows/ci.yml/badge.svg)](https://github.com/freema/openclaw-a2a/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/openclaw-a2a)](https://www.npmjs.com/package/openclaw-a2a)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Status: Beta](https://img.shields.io/badge/status-beta-orange)
![A2A: v1.0](https://img.shields.io/badge/A2A-v1.0-blue)

**openclaw-a2a** is a bridge that lets any A2A-compatible agent chat with your
self-hosted [OpenClaw](https://openclaw.ai) assistant. Think of it as giving your
OpenClaw a phone number that other agents can call.

This is a **beta experiment**. We're exploring the bleeding edge of agent-to-agent
communication using Google's [A2A protocol](https://google.github.io/A2A/) v1.0.
The JS SDK is still on v0.3, so we implemented v1.0 from scratch. YOLO.

## The Idea

You already have OpenClaw running. Maybe on your laptop, maybe on a server.
It's smart, it has access to your tools, and it talks to your LLM.

Now imagine another agent — running somewhere else, built by someone else —
wants to ask your OpenClaw something. That's what A2A is for.

```
   Google ADK Agent ──┐
   CrewAI Agent ──────┤── A2A Protocol ──> openclaw-a2a ──> OpenClaw Gateway
   Your Custom Agent ─┤                         |
   Claude.ai* ────────┘                    (yes, streaming!)

   * via A2A-MCP bridge (because Claude speaks MCP, not A2A... yet)
```

## Quick Start

### npm

```bash
npm install -g openclaw-a2a@beta

# Start the bridge
openclaw-a2a --openclaw-url http://127.0.0.1:18789 --token your-token
```

### Docker

```bash
docker run --rm -p 3100:3100 \
  -e OPENCLAW_URL=http://host.docker.internal:18789 \
  -e OPENCLAW_GATEWAY_TOKEN=your-token \
  ghcr.io/freema/openclaw-a2a:beta
```

### From source

```bash
git clone https://github.com/freema/openclaw-a2a.git
cd openclaw-a2a
npm install
cp .env.example .env  # edit with your settings
npm run dev
```

## Try It

```bash
# Discover the agent
curl http://localhost:3100/.well-known/agent-card.json | jq .

# Send a message (A2A v1.0)
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

# Stream a response
curl -N -X POST http://localhost:3100/a2a \
  -H "Content-Type: application/json" \
  -H "A2A-Version: 1.0" \
  -d '{
    "jsonrpc": "2.0", "id": "2", "method": "SendStreamingMessage",
    "params": {
      "message": {
        "messageId": "test-2",
        "role": "ROLE_USER",
        "parts": [{ "text": "Stream me something cool!" }]
      }
    }
  }'
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `OPENCLAW_URL` | — | OpenClaw Gateway URL (required) |
| `OPENCLAW_GATEWAY_TOKEN` | — | Bearer token for gateway auth |
| `OPENCLAW_INSTANCES` | — | JSON array for multi-instance routing |
| `PORT` | `3100` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `PUBLIC_URL` | `http://localhost:3100` | Public URL for Agent Card |
| `DEBUG` | `false` | Enable debug logging |

### Multi-instance

Route requests to different OpenClaw instances based on message metadata:

```bash
export OPENCLAW_INSTANCES='[
  {"name":"prod","url":"http://prod:18789","token":"t1","default":true},
  {"name":"staging","url":"http://staging:18789","token":"t2"}
]'
```

Then send with `"metadata": { "instance": "staging" }` in your A2A message.

### CLI Options

```bash
openclaw-a2a --help

Options:
  --port, -p        Server port                    [number]
  --host            Server host                    [string]
  --openclaw-url    OpenClaw Gateway URL           [string]
  --token           OpenClaw Gateway token         [string]
  --debug           Enable debug logging           [boolean]
```

## What's Inside

This implements the **A2A v1.0 specification** — the full protocol, not a subset:

| Feature | Status |
|---|---|
| Agent Card discovery (`.well-known/agent-card.json`) | Done |
| SendMessage (sync) | Done |
| SendStreamingMessage (SSE) | Done |
| GetTask / ListTasks | Done |
| CancelTask | Done |
| Multi-turn conversations (INPUT_REQUIRED) | Done |
| Multi-instance routing | Done |
| A2A-Version header validation | Done |
| Push notifications | Stub (returns UNSUPPORTED) |
| Extended Agent Card | Stub (returns UNSUPPORTED) |
| SubscribeToTask | Stub (returns UNSUPPORTED) |

### v1.0 Spec Compliance

We implement A2A v1.0 directly from the [proto spec](https://github.com/a2aproject/A2A):

- PascalCase method names (`SendMessage`, not `message/send`)
- SCREAMING_SNAKE enum values (`TASK_STATE_COMPLETED`, not `completed`)
- Part discrimination by field presence (not `kind`)
- `Task.id` (not `taskId`)
- `A2A-Version` header with fallback to `0.3` (rejected — we only support 1.0)
- Cursor-based pagination for ListTasks
- `supportedInterfaces[]` in Agent Card (not top-level `url`)

## Who Can Talk To This?

### Native A2A clients

| Client | Notes |
|---|---|
| [Google ADK](https://google.github.io/adk-docs/) | `RemoteA2aAgent` — most mature |
| [CrewAI](https://crewai.com/) >= v1.10 | Built-in A2A support |
| [Microsoft Agent Framework](https://github.com/microsoft/agents) | .NET + Python |
| [BeeAI](https://beeai.dev/) | A2A adapter |
| [LangGraph](https://langchain-ai.github.io/langgraph/) | Server + client |
| curl / any HTTP client | JSON-RPC over HTTP |

### Via A2A-MCP bridge (for Claude)

Claude doesn't speak A2A natively (it speaks MCP). But there's a bridge:

1. Run `openclaw-a2a` (this project) — gives OpenClaw an A2A interface
2. Add an [A2A-MCP bridge](https://github.com/GongRzhe/A2A-MCP-Server) to Claude
3. Claude discovers and chats with your OpenClaw through A2A

Is this useful? Maybe. Is it cool? Definitely.

## Development

```bash
# Dev server (hot reload)
npm run dev

# Run tests (watch mode)
npm run test

# Full quality check
npm run check:all    # lint + typecheck + test + build

# Format
npm run format
```

### Testing

- **84 unit + integration tests** — run without external dependencies
- **E2E tests** — require a real OpenClaw Gateway (optional)

```bash
# Unit + integration (no gateway needed)
npm run test:run

# E2E (requires gateway on localhost:18789)
export OPENCLAW_URL=http://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=your-token
npm run test:e2e
```

## Docker Deployment

```bash
# Build locally
docker build -t openclaw-a2a .

# Or use Docker Compose
cp .env.example .env
docker compose up -d

# Dev mode (build from source)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Sister Project

This is the A2A sibling of [openclaw-mcp](https://github.com/freema/openclaw-mcp),
which bridges OpenClaw to Claude via MCP. Different protocols, same OpenClaw.

| | openclaw-mcp | openclaw-a2a |
|---|---|---|
| Protocol | MCP (Anthropic) | A2A v1.0 (Google/Linux Foundation) |
| For | Claude.ai, Claude Desktop | Any A2A agent |
| Port | 3000 | 3100 |
| Status | Stable | Beta |

```
MCP  = how an agent talks to TOOLS    (vertical: agent → tools)
A2A  = how AGENTS talk to EACH OTHER  (horizontal: agent ↔ agent)
```

They're complementary, not competing.

## License

MIT
