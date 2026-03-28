// SSE utilities for A2A streaming

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

export function formatSSEEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}
