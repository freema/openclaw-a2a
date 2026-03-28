// Mock streaming fetch response for testing

export function createMockSSEResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id: 'mock',
              object: 'chat.completion.chunk',
              created: Date.now(),
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
            })}\n\n`
          )
        );
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

export function createMockFetchResponse(content: string, status = 200) {
  return new Response(
    JSON.stringify({
      id: 'mock-id',
      object: 'chat.completion',
      created: Date.now(),
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
