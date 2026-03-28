# Deployment

## Docker

### Quick start

```bash
docker run --rm -p 3100:3100 \
  -e OPENCLAW_URL=http://host.docker.internal:18789 \
  -e OPENCLAW_GATEWAY_TOKEN=your-token \
  ghcr.io/freema/openclaw-a2a:beta
```

### Docker Compose

```bash
cp .env.example .env
# Edit .env with your settings
docker compose up -d
```

The default `docker-compose.yml` includes:
- Read-only filesystem
- Non-root user
- Memory limit (256M)
- Health check
- `host.docker.internal` for gateway access

### Build locally

```bash
docker build -t openclaw-a2a .
docker run --rm -p 3100:3100 \
  -e OPENCLAW_URL=http://host.docker.internal:18789 \
  openclaw-a2a
```

## Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name a2a.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;  # Important for SSE streaming
    }
}
```

When behind a reverse proxy, set `PUBLIC_URL` to your external URL:

```bash
PUBLIC_URL=https://a2a.yourdomain.com
```

## Health Check

```bash
curl http://localhost:3100/health
# {"status":"ok","version":"0.1.0-beta.1","a2aVersion":"1.0","uptime":123.45}
```

## Ports

| Service | Default Port |
|---|---|
| openclaw-a2a | 3100 |
| openclaw-mcp | 3000 |
| OpenClaw Gateway | 18789 |

Both openclaw-a2a and openclaw-mcp can run side by side on the same machine.
