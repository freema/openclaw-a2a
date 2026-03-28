# Research Analysis: openclaw-a2a

> Datum: 2026-03-27
> Status: DRAFT v4 — opraveny protokolove chyby z review

---

## 1. Stav projektu openclaw-a2a

Repo je **prazdne** — obsahuje pouze `.gitignore` + `LICENSE` (MIT). Veskery kod popsany v handoff dokumentu zatim **neexistuje** v repu. Plan pocita s implementaci od nuly.

---

## 2. Reference: openclaw-mcp (sestersky projekt)

### Architektura
- **Runtime**: Node.js 20, TypeScript ES2022, ESM only
- **Build**: `tsup` (single bundled `dist/index.js` se shebang)
- **Test**: Vitest (9 test suites), `src/__tests__/`
- **Lint**: ESLint + Prettier (semi, singleQuote, tabWidth 2, printWidth 100)
- **CLI**: yargs
- **Transport**: stdio + SSE (Express)

### CI/CD (4 workflows)
| Workflow | Trigger | Co dela |
|----------|---------|---------|
| `ci.yml` | push main/develop, PR | lint, format:check, typecheck, build, test (matrix Node 20+22) |
| `publish.yml` | release event | npm publish --provenance |
| `release.yml` | tag push | vytvoreni GitHub release |
| `code-review.yml` | PR | automaticky code review |

### Docker
- Multi-stage build (builder + runtime)
- `node:20-slim`, tini (PID 1 signal handling)
- Non-root user, HEALTHCHECK, read_only filesystem
- GHCR: `ghcr.io/freema/openclaw-mcp`

### Testovani na localhostu
```bash
npm run dev          # tsx watch src/index.ts
npm run mcp:dev      # SSE transport na localhost:3000
npm run inspector    # MCP Inspector (stdio)
npm run test         # vitest watch
npm run test:run     # vitest single run (CI)
npm run check:all    # lint:fix + typecheck + test:run + build
```

### Taskfile.yml
Pouziva `task` runner s prikazy: dev, test, build, docker:build, docker:up, inspector, inspector:sse, mcp:dev

### GitHub Pages
- Domena: `openclaw-mcp.cloud` (CNAME v `/docs/`)
- Source: `/docs/` (6 markdown souboru + index.html)
- Docs: installation, configuration, deployment, development, logging, threat-model

### Klicove patterny k prevzeti
1. **tsup** bundler (ne tsc) — single output file
2. **Vitest** s `vi.stubGlobal('fetch', ...)` pro mock HTTP
3. **Prettier/ESLint** config identicky
4. **Taskfile.yml** pro dev workflow
5. **Docker**: multi-stage, tini, non-root, healthcheck
6. **CI matrix**: Node 20 + 22
7. **docs/** struktura s GitHub Pages

---

## 3. Analyza: win4r/openclaw-a2a-gateway

### Zakladni info
- **Verze**: 1.2.0, TypeScript, 360 testu
- **SDK**: `@a2a-js/sdk` v0.3.13
- **OpenClaw komunikace**: WebSocket RPC (NE HTTP REST)

### Klicove architekturni rozdily

| Aspekt | win4r/openclaw-a2a-gateway | Nas plan |
|--------|---------------------------|----------|
| OpenClaw komunikace | WebSocket RPC + Ed25519 device identity | HTTP REST (OpenAI-compat `/v1/chat/completions`) |
| Transport | JSON-RPC + REST + gRPC s fallback | JSON-RPC (primary), REST jako nice-to-have |
| Discovery | DNS-SD + mDNS + static | Static Agent Card only |
| Task persistence | File-based durable store + TTL | In-memory (pro MVP) |
| Security | Multi-token rotation, SSRF protection, HMAC | Single bearer token (pro MVP) |
| Plugin system | OpenClaw plugin (openclaw.plugin.json) | Standalone service |
| Testy | node:test (built-in), WS mocking | Vitest (konzistentni s openclaw-mcp) |

### Co se da prevzit
1. **Transport fallback pattern** — klasifikace retryable vs non-retryable chyb
2. **Session continuity** — deterministicky session key `agent:{agentId}:a2a:{contextId}`
3. **Part type serialization** — graceful degradation FilePart/DataPart na text
4. **URL extraction** — markdown linky v odpovedi → FilePart
5. **Circuit breaker** — 3-state (closed/open/half-open) per peer
6. **SSRF protection** — hostname allowlisting, scheme validation
7. **Heartbeat** — 15s working heartbeat pro SSE keep-alive

### Co NEPREVZIMAT
- WebSocket RPC — my pouzivame HTTP REST (OpenAI-compat), je to jednodussi
- gRPC transport — prilis slozite pro MVP
- mDNS discovery — overkill pro nase use-case
- Ed25519 device identity — specificke pro OpenClaw plugin system
- File-based task store — in-memory staci pro zacatek

---

## 4. A2A Protocol — Current State

### Verze
| | Verze | Status |
|-|-------|--------|
| **A2A Spec** | v1.0 | Released, production-ready |
| **@a2a-js/sdk** | v0.3.13 | Implements v0.3.0 (!) |

**ROZHODNUTI**: Cilime na A2A v1.0 spec primo. SDK v0.3.13 je zastarale — pouzijeme ho pouze pro reusable patterny (EventBus, SSE utils, TaskStore interface), ale typy a protocol handling implementujeme sami podle v1.0 spec.

### Kriticke protokolove detaily (overeno proti spec)

1. **Task.id** (ne Task.taskId!) — Task objekt pouziva `id`. `taskId` je jen v events a Message.
2. **Message.contextId / Message.taskId** — multi-turn linking je na Message, ne na top-level params.
3. **A2A-Version header**: empty/missing → server MUSI interpretovat jako "0.3". Pokud nepodporujeme 0.3, MUSIME vratit VersionNotSupportedError (-32009).
4. **Part.data**: `google.protobuf.Value` (any JSON), ne `Struct` (object-only). Metadata je Struct.
5. **11 metod celkem**: 6 core + 4 push notif + GetExtendedAgentCard.
6. **ProtoJSON**: camelCase pro wire format, SCREAMING_SNAKE pro enums.

### v1.0 Spec — co musime implementovat sami

#### Operation renames
```
message/send        → SendMessage
message/stream      → SendStreamingMessage
tasks/get           → GetTask
tasks/cancel        → CancelTask
tasks/resubscribe   → SubscribeToTask
```

#### Enum values (kebab-case → SCREAMING_SNAKE_CASE)
```
submitted       → TASK_STATE_SUBMITTED
working         → TASK_STATE_WORKING
completed       → TASK_STATE_COMPLETED
failed          → TASK_STATE_FAILED
canceled        → TASK_STATE_CANCELED
input-required  → TASK_STATE_INPUT_REQUIRED
user/agent      → ROLE_USER/ROLE_AGENT
```

#### Part structure redesign
- `TextPart`, `FilePart`, `DataPart` → single `Part` s `oneof content`
- Discriminace pres JSON member presence (ne `kind` field)

#### Agent Card restructuring
- Removed: `protocolVersion`, `preferredTransport`, `additionalInterfaces`, top-level `url`
- Added: `supportedInterfaces[]` array s `url`, `protocolBinding`, `protocolVersion`
- Moved: `supportsAuthenticatedExtendedCard` → `capabilities.extendedAgentCard`

#### Dalsí zmeny
- Pagination: page-based → cursor-based
- HTTP paths: removed `/v1/` prefix
- Error format: RFC 9457 → google.rpc.Status
- OAuth: removed Implicit/Password flows, added DeviceCode + PKCE
- New: `A2A-Version` header (required), multi-tenancy, agent card signatures

### Build vs Reuse z SDK

| Komponenta | Reuse ze SDK? | Build sami? | Effort |
|---|---|---|---|
| **Type definitions** | Ne (v0.3 only) | Ano — hand-write z proto | Medium |
| **JSON-RPC dispatch** | Pattern only | Ano — PascalCase metody | Low |
| **SSE streaming utils** | Ano (sse_utils.ts) | Ne | Zero |
| **AgentExecutor interface** | Ano (pattern) | Adapt | Low |
| **ExecutionEventBus** | Ano (pattern) | Adapt typy | Low |
| **TaskStore interface** | Ano (pattern) | Pridat list() | Low |
| **InMemoryTaskStore** | Ano (pattern) | Pridat list() | Low |
| **Agent Card builder** | Ne (v0.3 struktura) | Ano — supportedInterfaces[] | Low |
| **A2A-Version header** | Ne (neni v SDK) | Ano | Low |
| **Error handling** | Ano (vetsina kodu) | Pridat 2 nove kody | Low |

**Zdroj pro typy**: `specification/a2a.proto` v https://github.com/a2aproject/A2A — kanonicky, kompletni v1.0 spec.
**SDK v1.0 WIP**: PR #375 + branch `epic/1.0_breaking_changes` — zatim nemerged.
**Community v1.0 TS implementace**: ZADNE neexistuji. Budeme prvni.

### Task Lifecycle (v1.0)
```
TASK_STATE_SUBMITTED → TASK_STATE_WORKING → TASK_STATE_COMPLETED (terminal)
                                          → TASK_STATE_FAILED (terminal)
                                          → TASK_STATE_CANCELED (terminal)
                                          → TASK_STATE_REJECTED (terminal)
                                          → TASK_STATE_INPUT_REQUIRED (interrupted)
                                          → TASK_STATE_AUTH_REQUIRED (interrupted)
                     → TASK_STATE_PENDING (waiting to start)
```

### SSE Streaming (v1.0)
- Agent Card: `capabilities.streaming: true`
- Client: `SendStreamingMessage` (JSON-RPC)
- Server: `200 OK`, `Content-Type: text/event-stream`
- Events: StreamResponse s `task`, `message`, `statusUpdate`, nebo `artifactUpdate` (field presence, NE `kind`)
- Terminace: terminal/interrupted state
- Removed: `kind` discriminator, `final` boolean
- New: `append` a `lastChunk` fields pro chunked artifacts

### OpenClaw Gateway Streaming
- **POTVRZENO**: Gateway podporuje `stream: true` na `/v1/chat/completions`
- Format: standard OpenAI SSE (`data: <json>`, terminated by `data: [DONE]`)
- openclaw-mcp ho NEPOUZIVA (jen sync requesty)
- **Gotchas**: prazdne SSE eventy (issue #52679), streaming + tool calling (#5769)
- **Plan**: Implementovat real streaming — forwardovat OpenClaw SSE chunky jako A2A TaskArtifactUpdate

### Dalsi JS/TS nastroje v ekosystemu
- **a2a-ai-provider** — Vercel AI SDK provider wrapping A2A agents
- **a2anet-js** — A2A executor pro OpenAI Agents JS SDK
- **a2a-inspector** — validacni nastroj (official)
- **a2a-samples** — priklady (official)

---

## 5. Rizika a omezeni

### R1: Vlastni v1.0 implementace bez SDK podpory
Cilime na v1.0 spec primo, ale SDK je na v0.3. Zadna community v1.0 TS implementace neexistuje.
**Mitigace**: Hand-write typy z proto, reuse SDK patterny (ne typy), sledovat SDK PR #375 pro budouci migraci na oficialni SDK.

### R2: OpenClaw Gateway dependency
Testy i dev vyzaduji bezici OpenClaw Gateway na localhost:18789.
**Mitigace**: Mock HTTP client pro unit testy, real gateway jen pro integration/e2e.

### R3: A2A ekosystem je mlady
Malo production deploymentu, SDK muze mit bugy.
**Mitigace**: Pinned SDK verze, defensivni coding, vlastni error handling nad SDK.

### R4: Dual-project maintenance
openclaw-mcp a openclaw-a2a sdili patterns ale ne kod.
**Mitigace**: Konzistentni tooling (tsup, vitest, prettier, eslint), mozna shared config repo v budoucnu.
