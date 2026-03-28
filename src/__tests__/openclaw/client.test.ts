import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenClawClient, OpenClawError } from '../../openclaw/client.js';
import { createMockFetchResponse, createMockSSEResponse } from '../helpers/mock-sse-fetch.js';

describe('OpenClawClient', () => {
  const instance = { name: 'test', url: 'http://localhost:18789', token: 'test-token' };
  let client: OpenClawClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new OpenClawClient(instance);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('chat()', () => {
    it('sends correct headers and body', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse('Hello!'));

      await client.chat('Hi');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('http://localhost:18789/v1/chat/completions');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer test-token');
      expect(opts.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(opts.body);
      expect(body.stream).toBe(false);
      expect(body.messages[0].content).toBe('Hi');
    });

    it('parses successful response', async () => {
      fetchSpy.mockResolvedValue(createMockFetchResponse('World'));

      const result = await client.chat('Hello');
      expect(result.choices[0].message.content).toBe('World');
    });

    it('handles 401 response', async () => {
      fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      await expect(client.chat('Hi')).rejects.toThrow(OpenClawError);
      await expect(client.chat('Hi')).rejects.toThrow(/401/);
    });

    it('handles 500 response', async () => {
      fetchSpy.mockResolvedValue(new Response('Server Error', { status: 500 }));

      await expect(client.chat('Hi')).rejects.toThrow(OpenClawError);
    });

    it('handles network error', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(client.chat('Hi')).rejects.toThrow(OpenClawError);
      await expect(client.chat('Hi')).rejects.toThrow(/Connection error/);
    });

    it('strips trailing slash from baseUrl', () => {
      const c = new OpenClawClient({ name: 'test', url: 'http://localhost:18789/', token: '' });
      fetchSpy.mockResolvedValue(createMockFetchResponse('OK'));
      c.chat('Hi');
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe('http://localhost:18789/v1/chat/completions');
    });

    it('handles empty token (no Authorization header)', async () => {
      const c = new OpenClawClient({ name: 'test', url: 'http://localhost:18789', token: '' });
      fetchSpy.mockResolvedValue(createMockFetchResponse('OK'));

      await c.chat('Hi');
      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers['Authorization']).toBeUndefined();
    });
  });

  describe('chatStream()', () => {
    it('sends stream: true in body', async () => {
      fetchSpy.mockResolvedValue(createMockSSEResponse(['Hello']));

      const gen = client.chatStream('Hi');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const chunk of gen) {
        /* consume */
      }

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.stream).toBe(true);
    });

    it('yields content deltas', async () => {
      fetchSpy.mockResolvedValue(createMockSSEResponse(['Hello', ' World']));

      const chunks: string[] = [];
      for await (const chunk of client.chatStream('Hi')) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(['Hello', ' World']);
    });

    it('handles [DONE] terminator', async () => {
      fetchSpy.mockResolvedValue(createMockSSEResponse(['Only chunk']));

      const chunks: string[] = [];
      for await (const chunk of client.chatStream('Hi')) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(['Only chunk']);
    });

    it('handles API error in streaming', async () => {
      fetchSpy.mockResolvedValue(new Response('Bad Request', { status: 400 }));

      const gen = client.chatStream('Hi');
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const chunk of gen) {
          /* consume */
        }
      }).rejects.toThrow(OpenClawError);
    });
  });
});
