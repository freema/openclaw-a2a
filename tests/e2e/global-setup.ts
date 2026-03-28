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
    if (e.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNREFUSED') {
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
      PORT: '3199', // E2E port — avoid conflict with dev server on 3100
      OPENCLAW_URL: gatewayUrl,
      OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN ?? '',
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
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('A2A server failed to start within 15s');
}

export async function teardown() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    // Wait for graceful shutdown
    await new Promise((r) => setTimeout(r, 1000));
  }
}
