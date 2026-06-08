// Registry of live task event buses — enables SubscribeToTask (resubscribe).
//
// A bus is registered when execution starts and self-removes when it finishes,
// so terminated tasks never leak. A late subscriber looks up the live bus here
// and attaches to the ongoing stream.

import { ExecutionEventBus } from './event-bus.js';

export class TaskEventRegistry {
  private buses = new Map<string, ExecutionEventBus>();

  register(taskId: string, bus: ExecutionEventBus): void {
    this.buses.set(taskId, bus);
    // onFinish fires immediately if the bus already finished — safe either way.
    bus.onFinish(() => this.unregister(taskId));
  }

  get(taskId: string): ExecutionEventBus | undefined {
    return this.buses.get(taskId);
  }

  unregister(taskId: string): void {
    this.buses.delete(taskId);
  }
}
