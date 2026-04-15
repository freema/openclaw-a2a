// HTTP client for OpenClaw Gateway (OpenAI-compatible API)

import { InstanceConfig } from '../config/index.js';
import { logDebug, logError } from '../utils/logger.js';
import { OpenClawChatResponse } from './types.js';

const DEFAULT_TIMEOUT = 120_000; // 2 minutes
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB

export class OpenClawError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'OpenClawError';
    this.statusCode = statusCode;
  }
}

export class OpenClawClient {
  private baseUrl: string;
  private token: string;
  private timeout: number;
  private model: string;

  constructor(instance: InstanceConfig, timeout = DEFAULT_TIMEOUT, model = 'openclaw') {
    this.baseUrl = instance.url.replace(/\/+$/, '');
    this.token = instance.token;
    this.timeout = timeout;
    this.model = model;
  }

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new OpenClawError(`Health check failed: ${res.status}`, res.status);
    }
    return (await res.json()) as { status: string };
  }

  async chat(message: string): Promise<OpenClawChatResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model: this.model,
      messages: [{ role: 'user', content: message }],
      stream: false,
    };

    logDebug('OpenClaw chat request', { url, messageLength: message.length });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new OpenClawError(
          `OpenClaw API error: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`,
          res.status
        );
      }

      // Size check
      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        throw new OpenClawError(
          `Response too large: ${contentLength} bytes (max ${MAX_RESPONSE_SIZE})`
        );
      }

      const data = (await res.json()) as OpenClawChatResponse;
      logDebug('OpenClaw chat response', { id: data.id, choices: data.choices?.length });
      return data;
    } catch (e: any) {
      if (e instanceof OpenClawError) throw e;
      if (e.name === 'AbortError') {
        throw new OpenClawError(`Request timeout after ${this.timeout}ms`);
      }
      throw new OpenClawError(`Connection error: ${e.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *chatStream(
    message: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<string, void, undefined> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model: this.model,
      messages: [{ role: 'user', content: message }],
      stream: true,
    };

    logDebug('OpenClaw stream request', { url, messageLength: message.length });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Link external abort signal
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new OpenClawError(
          `OpenClaw API error: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`,
          res.status
        );
      }

      if (!res.body) {
        throw new OpenClawError('Response body is null — streaming not supported?');
      }

      const reader = res.body.getReader();
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
          if (data === '[DONE]') return;
          if (!data) continue; // handle empty data lines (issue #52679)

          try {
            const chunk = JSON.parse(data);
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            logError('Failed to parse SSE chunk', undefined, { data });
          }
        }
      }
    } catch (e: any) {
      if (e instanceof OpenClawError) throw e;
      if (e.name === 'AbortError') {
        logDebug('Stream aborted');
        return;
      }
      throw new OpenClawError(`Stream error: ${e.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
