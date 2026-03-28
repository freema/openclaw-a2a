// Structured JSON logger (mirrors openclaw-mcp)

let debugEnabled = false;

export function setDebug(enabled: boolean) {
  debugEnabled = enabled;
}

function formatLog(level: string, message: string, data?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (data) Object.assign(entry, data);
  return JSON.stringify(entry);
}

export function log(message: string, data?: Record<string, unknown>) {
  console.log(formatLog('info', message, data));
}

export function logError(message: string, error?: unknown, data?: Record<string, unknown>) {
  const extra: Record<string, unknown> = { ...data };
  if (error instanceof Error) {
    extra.error = error.message;
    extra.stack = error.stack;
  } else if (error !== undefined) {
    extra.error = String(error);
  }
  console.error(formatLog('error', message, extra));
}

export function logDebug(message: string, data?: Record<string, unknown>) {
  if (debugEnabled) {
    console.log(formatLog('debug', message, data));
  }
}
