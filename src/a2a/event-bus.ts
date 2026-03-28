// Execution event bus — pattern from SDK, adapted for v1.0

import { StreamResponse } from './types/requests.js';

type EventListener = (event: StreamResponse) => void;
type FinishListener = () => void;

export class ExecutionEventBus {
  private listeners: EventListener[] = [];
  private finishListeners: FinishListener[] = [];
  private _finished = false;

  get finished(): boolean {
    return this._finished;
  }

  on(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  onFinish(listener: FinishListener): () => void {
    if (this._finished) {
      listener();
      return () => {};
    }
    this.finishListeners.push(listener);
    return () => {
      this.finishListeners = this.finishListeners.filter((l) => l !== listener);
    };
  }

  publish(event: StreamResponse): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  finish(): void {
    this._finished = true;
    for (const listener of this.finishListeners) {
      listener();
    }
    this.listeners = [];
    this.finishListeners = [];
  }
}
