import { describe, it, expect, vi } from 'vitest';
import { ExecutionEventBus } from '../../a2a/event-bus.js';
import { TaskState } from '../../a2a/types/enums.js';

describe('ExecutionEventBus', () => {
  it('publishes events to listeners', () => {
    const bus = new ExecutionEventBus();
    const listener = vi.fn();
    bus.on(listener);

    const event = {
      statusUpdate: { taskId: 't1', contextId: 'c1', status: { state: TaskState.WORKING } },
    };
    bus.publish(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('supports multiple listeners', () => {
    const bus = new ExecutionEventBus();
    const l1 = vi.fn();
    const l2 = vi.fn();
    bus.on(l1);
    bus.on(l2);

    bus.publish({
      statusUpdate: { taskId: 't1', contextId: 'c1', status: { state: TaskState.WORKING } },
    });
    expect(l1).toHaveBeenCalled();
    expect(l2).toHaveBeenCalled();
  });

  it('unsubscribes listener', () => {
    const bus = new ExecutionEventBus();
    const listener = vi.fn();
    const unsub = bus.on(listener);
    unsub();

    bus.publish({
      statusUpdate: { taskId: 't1', contextId: 'c1', status: { state: TaskState.WORKING } },
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('calls finish listeners on finish()', () => {
    const bus = new ExecutionEventBus();
    const onFinish = vi.fn();
    bus.onFinish(onFinish);

    expect(bus.finished).toBe(false);
    bus.finish();
    expect(bus.finished).toBe(true);
    expect(onFinish).toHaveBeenCalled();
  });

  it('calls finish listener immediately if already finished', () => {
    const bus = new ExecutionEventBus();
    bus.finish();

    const onFinish = vi.fn();
    bus.onFinish(onFinish);
    expect(onFinish).toHaveBeenCalled();
  });

  it('clears listeners after finish', () => {
    const bus = new ExecutionEventBus();
    const listener = vi.fn();
    bus.on(listener);
    bus.finish();

    bus.publish({
      statusUpdate: { taskId: 't1', contextId: 'c1', status: { state: TaskState.COMPLETED } },
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
