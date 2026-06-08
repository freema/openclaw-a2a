# Configuration

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `OPENCLAW_URL` | — | Yes* | OpenClaw Gateway URL |
| `OPENCLAW_GATEWAY_TOKEN` | — | No | Bearer token for gateway auth |
| `OPENCLAW_INSTANCES` | — | No* | JSON array for multi-instance (overrides OPENCLAW_URL) |
| `PORT` | `3100` | No | Server port |
| `HOST` | `0.0.0.0` | No | Server bind address |
| `PUBLIC_URL` | `http://localhost:{PORT}` | No | Public URL (used in Agent Card) |
| `OPENCLAW_MODEL` | `openclaw` | No | Model name for chat completions |
| `DEBUG` | `false` | No | Enable debug logging |
| `A2A_AUTH_TOKEN` | — | No | Bearer token required on `/a2a` (discovery stays public) |
| `A2A_CARD_SIGNING_KEY` | — | No | PEM Ed25519 key to sign the Agent Card (ephemeral if unset) |

*Either `OPENCLAW_URL` or `OPENCLAW_INSTANCES` must be set.

## Authentication (optional)

Set `A2A_AUTH_TOKEN` to require a Bearer token on the JSON-RPC endpoint:

```bash
export A2A_AUTH_TOKEN=super-secret
curl -X POST http://localhost:3100/a2a \
  -H "Authorization: Bearer super-secret" \
  -H "A2A-Version: 1.0" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"ListTasks","params":{}}'
```

Requests without/with a wrong token get `401` + a JSON-RPC error (code `-32000`).
The Agent Card stays public and advertises the requirement via `securitySchemes`/`security`.
Discovery endpoints (`/.well-known/*`, `/health`, `/instances`) are always public.

## Signed Agent Cards (A2A v1.0)

The Agent Card is served with a detached JWS signature (`signatures[]`). Verifiers
fetch the public key from `/.well-known/jwks.json` (an Ed25519 OKP JWK) and check
the signature over the canonicalized card.

```bash
# Generate a stable signing key (otherwise an ephemeral one is used per restart)
openssl genpkey -algorithm ed25519 -out card-key.pem
export A2A_CARD_SIGNING_KEY="$(cat card-key.pem)"

curl -s http://localhost:3100/.well-known/agent-card.json | jq '.signatures'
curl -s http://localhost:3100/.well-known/jwks.json | jq '.keys'
```

## CLI Options

```bash
openclaw-a2a [options]

Options:
  --port, -p        Server port                    [number]
  --host            Server host                    [string]
  --openclaw-url    OpenClaw Gateway URL           [string]
  --token           OpenClaw Gateway token         [string]
  --auth-token      Bearer token required on /a2a  [string]
  --debug           Enable debug logging           [boolean]
  --version         Show version                   [boolean]
  --help            Show help                      [boolean]
```

CLI options override environment variables.

## Multi-Instance Routing

Route A2A requests to different OpenClaw instances:

```bash
export OPENCLAW_INSTANCES='[
  {"name": "prod", "url": "http://prod-gateway:18789", "token": "token-1", "default": true},
  {"name": "staging", "url": "http://staging-gateway:18789", "token": "token-2"}
]'
```

Each instance needs:
- `name` — unique identifier
- `url` — OpenClaw Gateway URL
- `token` — bearer token (optional)
- `default` — mark one as default (first one if none specified)

### Routing via metadata

Include `instance` in the A2A message metadata:

```json
{
  "jsonrpc": "2.0", "id": "1", "method": "SendMessage",
  "params": {
    "message": {
      "messageId": "msg-1",
      "role": "ROLE_USER",
      "parts": [{ "text": "Hello!" }],
      "metadata": { "instance": "staging" }
    }
  }
}
```

### Instance info endpoint

```bash
curl http://localhost:3100/instances | jq .
# Returns instance names and URLs (tokens are NOT exposed)
```

### Per-instance Agent Cards (multi-tenancy)

When more than one instance is configured, each one is exposed as an A2A tenant:

```bash
# Tenant-scoped card (note supportedInterfaces[].tenant)
curl http://localhost:3100/.well-known/staging/agent-card.json | jq '.supportedInterfaces[0].tenant'

# The global card lists every instance as a skill + tenant interface
curl http://localhost:3100/.well-known/agent-card.json | jq '.skills[].id'
```

### Agent-to-agent relay (EXPERIMENTAL)

Chain two instances in one call: the source instance's answer is fed as the prompt
to a target instance, and both replies are returned as a single artifact. Sync-only,
one hop. Add `relay` (and optionally `relayPrompt`) to the message metadata:

```json
{
  "message": {
    "messageId": "msg-1",
    "role": "ROLE_USER",
    "parts": [{ "text": "Draft a summary" }],
    "metadata": { "instance": "prod", "relay": "staging" }
  }
}
```

> ⚠️ Experimental and unstable — semantics may change. Streaming is not supported for relay.
