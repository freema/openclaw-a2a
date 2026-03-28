import { describe, it, expect } from 'vitest';
import { formatSSEEvent, SSE_HEADERS } from '../../a2a/sse.js';

describe('SSE Utils', () => {
  it('formatSSEEvent produces correct format', () => {
    const result = formatSSEEvent({ type: 'test', value: 42 });
    expect(result).toBe('data: {"type":"test","value":42}\n\n');
  });

  it('formatSSEEvent handles strings', () => {
    const result = formatSSEEvent('hello');
    expect(result).toBe('data: "hello"\n\n');
  });

  it('SSE_HEADERS contains required headers', () => {
    expect(SSE_HEADERS['Content-Type']).toBe('text/event-stream');
    expect(SSE_HEADERS['Cache-Control']).toBe('no-cache');
    expect(SSE_HEADERS['Connection']).toBe('keep-alive');
    expect(SSE_HEADERS['X-Accel-Buffering']).toBe('no');
  });
});
