# Development

## Setup

```bash
git clone https://github.com/freema/openclaw-a2a.git
cd openclaw-a2a
npm install
cp .env.example .env
```

## Dev Workflow

```bash
# Dev server with hot reload
npm run dev

# Run tests (watch mode)
npm run test

# Run tests once
npm run test:run

# Full quality check (lint + typecheck + test + build)
npm run check:all

# Lint & format
npm run lint:fix
npm run format
```

## Task Runner

If you have [Task](https://taskfile.dev/) installed:

```bash
task dev          # Dev server
task test         # Watch mode
task test:run     # Single run
task check:all    # Full pipeline
task build        # Production build
task docker:build # Docker build
```

## Testing

### Test pyramid

```
         /  E2E (TS) \       <- optional, needs real gateway
        / Integration  \      <- supertest, in-process server
       /   Unit Tests    \    <- mock fetch, isolated functions
      ────────────────────
```

### Unit + Integration (no gateway needed)

```bash
npm run test:run
# 84 tests, 11 suites
```

### E2E (requires OpenClaw Gateway)

```bash
export OPENCLAW_URL=http://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=your-token
npm run test:e2e
```

E2E tests automatically start the A2A server on port 3199.

## Project Structure

```
src/
├── index.ts                 # CLI entrypoint (yargs)
├── config/
│   └── index.ts             # Env parsing, validation, multi-instance
├── utils/
│   └── logger.ts            # Structured JSON logger
├── openclaw/
│   ├── client.ts            # HTTP client (sync + streaming)
│   └── types.ts             # OpenClaw response types
├── a2a/
│   ├── types/               # A2A v1.0 type system
│   │   ├── enums.ts         # TaskState, Role (SCREAMING_SNAKE)
│   │   ├── core.ts          # Part, Message, Task, Artifact
│   │   ├── agent-card.ts    # AgentCard, AgentInterface
│   │   ├── requests.ts      # All 11 method types + StreamResponse
│   │   ├── jsonrpc.ts       # JSON-RPC 2.0 wrapper
│   │   └── index.ts         # Re-exports
│   ├── errors.ts            # A2A error codes
│   ├── sse.ts               # SSE utilities
│   ├── agent-card.ts        # Agent Card builder
│   ├── task-store.ts        # In-memory task store
│   ├── event-bus.ts         # Execution event bus
│   ├── executor.ts          # OpenClaw executor (sync + streaming)
│   ├── request-handler.ts   # JSON-RPC dispatch
│   └── router.ts            # Express routes
└── server/
    └── index.ts             # Express app, health, shutdown
```

## CI

GitHub Actions runs on every push/PR:
- **Node 20 + 22** matrix
- lint, format:check, typecheck, build, test
- Artifacts uploaded for Node 20

## Build

```bash
npm run build    # tsup → dist/index.js (single bundled ESM file)
npm run start    # Run production build
```
