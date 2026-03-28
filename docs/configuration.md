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
| `DEBUG` | `false` | No | Enable debug logging |

*Either `OPENCLAW_URL` or `OPENCLAW_INSTANCES` must be set.

## CLI Options

```bash
openclaw-a2a [options]

Options:
  --port, -p        Server port                    [number]
  --host            Server host                    [string]
  --openclaw-url    OpenClaw Gateway URL           [string]
  --token           OpenClaw Gateway token         [string]
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
