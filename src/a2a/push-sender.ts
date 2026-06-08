// Push notification delivery — POSTs StreamResponse payloads to configured webhooks.
//
// Subscribes to a task's event bus during execution and delivers only meaningful
// events (status transitions + final/non-append artifacts), never per-chunk.
// Delivery is fire-and-forget: webhook failures never block or break execution.

import { logDebug, logError } from '../utils/logger.js';
import { ExecutionEventBus } from './event-bus.js';
import { InMemoryPushNotificationStore } from './push-store.js';
import { StreamResponse, TaskPushNotificationConfig } from './types/requests.js';

const PUSH_TIMEOUT_MS = 5000;

export class PushNotificationSender {
  constructor(private store: InMemoryPushNotificationStore) {}

  /** Attach a delivery listener to a task's event bus for the lifetime of execution. */
  attach(taskId: string, eventBus: ExecutionEventBus): void {
    // Per-execution dedup so repeated heartbeat WORKING ticks aren't re-delivered.
    let lastState: string | undefined;
    eventBus.on((event) => {
      // Guard: a throw here would break the bus publish loop (and the SSE writer).
      try {
        if (!this.isMeaningful(event, lastState)) return;
        if (event.statusUpdate) lastState = event.statusUpdate.status.state;
        const configs = this.store.getAllForTask(taskId);
        for (const config of configs) {
          void this.deliver(config, event, taskId);
        }
      } catch (e) {
        logError('Push notification listener error', e, { taskId });
      }
    });
  }

  /**
   * Worth a webhook only for genuine status transitions (state differs from the
   * last delivered one — skips heartbeat re-publishes) and final/non-append artifacts.
   */
  private isMeaningful(event: StreamResponse, lastState: string | undefined): boolean {
    if (event.statusUpdate) return event.statusUpdate.status.state !== lastState;
    if (event.artifactUpdate && event.artifactUpdate.append !== true) return true;
    return false;
  }

  private async deliver(
    config: TaskPushNotificationConfig,
    payload: StreamResponse,
    taskId: string
  ): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.token) headers['X-A2A-Notification-Token'] = config.token;
    applyAuthHeaders(headers, config);

    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });
      if (!res.ok) {
        logError('Push notification webhook returned non-2xx', undefined, {
          taskId,
          url: config.url,
          status: res.status,
        });
      } else {
        logDebug('Push notification delivered', { taskId, url: config.url });
      }
    } catch (e) {
      logError('Push notification delivery failed', e, { taskId, url: config.url });
    }
  }
}

function applyAuthHeaders(
  headers: Record<string, string>,
  config: TaskPushNotificationConfig
): void {
  const auth = config.authentication;
  if (!auth?.credentials || !auth.schemes?.length) return;
  const scheme = auth.schemes[0].toLowerCase();
  if (scheme === 'bearer') {
    headers['Authorization'] = `Bearer ${auth.credentials}`;
  } else if (scheme === 'apikey') {
    headers['X-Api-Key'] = auth.credentials;
  }
}
