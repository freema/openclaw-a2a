# Installation

## Prerequisites

- **Node.js** >= 20.0.0
- **OpenClaw Gateway** running and accessible
  - Chat completions enabled: `chatCompletions.enabled: true` in your OpenClaw config
  - Default URL: `http://127.0.0.1:18789`

## npm (global)

```bash
npm install -g openclaw-a2a@beta
openclaw-a2a --openclaw-url http://127.0.0.1:18789 --token your-token
```

## npm (local)

```bash
npm install openclaw-a2a@beta
npx openclaw-a2a --openclaw-url http://127.0.0.1:18789
```

## Docker

```bash
docker pull ghcr.io/freema/openclaw-a2a:beta

docker run --rm -p 3100:3100 \
  -e OPENCLAW_URL=http://host.docker.internal:18789 \
  -e OPENCLAW_GATEWAY_TOKEN=your-token \
  ghcr.io/freema/openclaw-a2a:beta
```

## From source

```bash
git clone https://github.com/freema/openclaw-a2a.git
cd openclaw-a2a
npm install
cp .env.example .env  # edit with your settings
npm run dev
```

## Verify

```bash
# Agent Card (should return JSON with supportedInterfaces)
curl http://localhost:3100/.well-known/agent-card.json | jq .

# Health check
curl http://localhost:3100/health | jq .
```
