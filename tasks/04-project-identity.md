# Project Identity: openclaw-a2a

> Datum: 2026-03-27
> Status: DRAFT v1

---

## Status: BETA

Projekt je oznaceny jako **beta** vsude:
- package.json: `"version": "0.1.0-beta.1"`
- README: badge "beta", disclaimer
- Agent Card: `"version": "0.1.0-beta.1"`
- npm publish: `npm publish --tag beta`
- Docker tag: `ghcr.io/freema/openclaw-a2a:beta`

---

## README Ton & Vibes

README by mel byt **vtipny, uprimny, experimentalni**. Tohle neni enterprise produkt —
je to fun projekt kde testujeme jak by to fungovalo, kdyz si dva agenti povidaji.

### Navrh README struktury

```markdown
# openclaw-a2a

> What happens when AI agents start talking to each other?
> Let's find out.

**openclaw-a2a** is a bridge that lets any A2A-compatible agent chat with your
self-hosted [OpenClaw](https://openclaw.ai) assistant. Think of it as giving your
OpenClaw a phone number that other agents can call.

This is a **beta experiment**. We're exploring the bleeding edge of agent-to-agent
communication using Google's [A2A protocol](https://a2a-protocol.org) v1.0.
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

## Status: Beta

> **NOTE**: This section is a DRAFT of the future README after implementation.
> The repo is currently empty — see 01-research-analysis.md.

This is experimental software. Planned features:
- [ ] Agent Card discovery (/.well-known/agent-card.json)
- [ ] Sync chat (SendMessage)
- [ ] Real-time streaming (SendStreamingMessage → SSE)
- [ ] Task lifecycle (GetTask, ListTasks, CancelTask)
- [ ] Multi-instance routing
- [ ] Multi-turn conversations (INPUT_REQUIRED)
- [ ] Docker deployment

Won't be in first release:
- [ ] Push notifications (handlers return UNSUPPORTED_OPERATION)
- [ ] Authentication (OAuth/mTLS)
- [ ] The SDK catching up to v1.0 so we can stop hand-writing types

## Quick Start
...

## Wait, Can Claude Talk to OpenClaw Through This?

Sort of! Claude.ai doesn't speak A2A natively (it speaks MCP). But there's
a bridge for that:

1. You run `openclaw-a2a` (this project) — gives OpenClaw an A2A interface
2. You add an [A2A-MCP bridge](https://github.com/GongRzhe/A2A-MCP-Server) to Claude
3. Claude can now discover and chat with your OpenClaw through A2A

Is this useful? Maybe. Is it cool? Definitely.

## Sister Project

This is the A2A sibling of [openclaw-mcp](https://github.com/freema/openclaw-mcp),
which bridges OpenClaw to Claude.ai via MCP. Different protocols, same OpenClaw.

| | openclaw-mcp | openclaw-a2a |
|---|---|---|
| Protocol | MCP (Anthropic) | A2A (Google/Linux Foundation) |
| For | Claude.ai, Claude Desktop | Any A2A agent |
| Port | 3000 | 3100 |
| Status | Stable | Beta |
```

---

## Kdo muze mluvit s nasim A2A serverem

### Nativni A2A klienti
| Klient | Typ | Poznamka |
|--------|-----|----------|
| Google ADK | Native | `RemoteA2aAgent`, nejzralejsi |
| CrewAI >= v1.10.1 | Native | Built-in A2A support |
| Microsoft Agent Framework | Native | .NET + Python |
| BeeAI | Adapter | A2AServer/A2AAgent |
| LangGraph | Compatible | Server i client |
| OpenAgents | Native | A2A + MCP |
| Swival | CLI | Go-based, A2A v1.0 |
| curl / custom HTTP | Manual | JSON-RPC over HTTP |

### Pres A2A-MCP bridge (neprimo)
| Klient | Bridge | Poznamka |
|--------|--------|----------|
| Claude.ai | GongRzhe/A2A-MCP-Server | MCP → A2A |
| Claude Desktop | GongRzhe/A2A-MCP-Server | MCP → A2A |
| Claude Code | GongRzhe/A2A-MCP-Server | MCP → A2A |
| Cursor | A2A-MCP bridge | MCP → A2A |

### Vizualizace
```
                    ┌─── Google ADK Agent
                    ├─── CrewAI Agent
A2A Protocol ──────>├─── Microsoft Agent
                    ├─── BeeAI / LangGraph
                    ├─── curl / custom client
                    │
                    │    ┌─── Claude.ai
MCP → A2A Bridge ──>────├─── Claude Desktop
                    │    └─── Claude Code
                    ▼
              openclaw-a2a:3100
                    │
                    ▼
              OpenClaw Gateway:18789
```

---

## Relationship: MCP vs A2A

```
MCP  = jak agent mluvi s NASTROJI (vertical: agent → tools)
A2A  = jak AGENTI mluvi SPOLU (horizontal: agent ↔ agent)
```

openclaw-mcp dava Claude pristup k OpenClaw nastrojum.
openclaw-a2a dava jinym agentum pristup k OpenClaw jako agentovi.

Jsou komplementarni, ne konkurencni.

---

## Fun Experiment Ideas (pro README / docs)

1. **Agent Telephone**: Chain agenty — Agent A ptá se Agent B (OpenClaw) přes A2A, ten zase může volat tools přes MCP
2. **Claude vs OpenClaw**: Přes A2A-MCP bridge nechat Claude.ai mluvit s OpenClaw instancí — same brain, different personality
3. **Multi-agent Orchestra**: CrewAI orchestrátor koordinuje 3 A2A agenty, jeden z nich je OpenClaw
4. **Self-talk**: OpenClaw instance A mluví s OpenClaw instance B přes A2A (existenční krize AI included)
