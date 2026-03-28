// Mock OpenClaw client for testing

import { vi } from 'vitest';

export function createMockOpenClawClient(response?: string) {
  return {
    chat: vi.fn().mockResolvedValue({
      id: 'mock-id',
      object: 'chat.completion',
      created: Date.now(),
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: response ?? 'Mock response' },
          finish_reason: 'stop',
        },
      ],
    }),
    chatStream: vi.fn().mockImplementation(async function* () {
      yield 'Mock ';
      yield 'streaming ';
      yield 'response';
    }),
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
  };
}
