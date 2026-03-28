// E2E utility functions

const BASE_URL = () => process.env.A2A_SERVER_URL ?? 'http://localhost:3199';

export async function sendA2A(method: string, params: unknown) {
  const res = await fetch(`${BASE_URL()}/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'A2A-Version': '1.0',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `e2e-${Date.now()}`,
      method,
      params,
    }),
  });
  return (await res.json()) as any;
}

export async function sendMessage(
  text: string,
  options?: { metadata?: Record<string, unknown>; contextId?: string; taskId?: string }
) {
  return sendA2A('SendMessage', {
    message: {
      messageId: `e2e-msg-${Date.now()}`,
      ...(options?.contextId ? { contextId: options.contextId } : {}),
      ...(options?.taskId ? { taskId: options.taskId } : {}),
      role: 'ROLE_USER',
      parts: [{ text }],
      ...(options?.metadata ? { metadata: options.metadata } : {}),
    },
  });
}

export async function* streamMessage(text: string): AsyncGenerator<any> {
  const res = await fetch(`${BASE_URL()}/a2a`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'A2A-Version': '1.0',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `e2e-stream-${Date.now()}`,
      method: 'SendStreamingMessage',
      params: {
        message: {
          messageId: `e2e-msg-${Date.now()}`,
          role: 'ROLE_USER',
          parts: [{ text }],
        },
      },
    }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      yield JSON.parse(data);
    }
  }
}

export async function getAgentCard() {
  const res = await fetch(`${BASE_URL()}/.well-known/agent-card.json`);
  return (await res.json()) as any;
}

export async function getHealth() {
  const res = await fetch(`${BASE_URL()}/health`);
  return (await res.json()) as any;
}
