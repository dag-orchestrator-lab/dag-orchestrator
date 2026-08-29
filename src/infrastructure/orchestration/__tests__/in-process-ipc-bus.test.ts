import { describe, expect, it, vi } from 'vitest';
import { InProcessIpcBus } from '../in-process-ipc-bus.js';
import { STAGE_COMPLETE_EVENT_NAME, type StageCompleteEvent } from '../../../domain/orchestration/events/stage-complete-event.js';

function makeEvent(overrides: Partial<StageCompleteEvent> = {}): StageCompleteEvent {
  return {
    role: 'recon',
    workspaceSlug: 'epic-2-agents',
    artifactPath: '/tmp/feature/01-recon.md',
    timestamp: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('InProcessIpcBus', () => {
  it('delivers a valid payload to a subscriber', () => {
    const bus = new InProcessIpcBus();
    const handler = vi.fn();
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, handler);

    const result = bus.publish(STAGE_COMPLETE_EVENT_NAME, makeEvent());

    expect(result.isOk).toBe(true);
    expect(handler).toHaveBeenCalledWith(makeEvent());
  });

  it('rejects a relative artifactAbsolutePath without throwing and without dispatching', () => {
    const bus = new InProcessIpcBus();
    const handler = vi.fn();
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, handler);

    const result = bus.publish(STAGE_COMPLETE_EVENT_NAME, makeEvent({ artifactPath: 'relative/path.md' }));

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('RELATIVE_PATH');
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects an empty artifactAbsolutePath without throwing and without dispatching', () => {
    const bus = new InProcessIpcBus();
    const handler = vi.fn();
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, handler);

    const result = bus.publish(STAGE_COMPLETE_EVENT_NAME, makeEvent({ artifactPath: '' }));

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('EMPTY_PATH');
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts a Windows-style absolute path regardless of host OS', () => {
    const bus = new InProcessIpcBus();
    const handler = vi.fn();
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, handler);

    const event = makeEvent({ artifactPath: 'C:\\foo\\bar.md' });
    const result = bus.publish(STAGE_COMPLETE_EVENT_NAME, event);

    expect(result.isOk).toBe(true);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('isolates a synchronously throwing handler from other subscribers', () => {
    const bus = new InProcessIpcBus();
    const throwing = vi.fn(() => {
      throw new Error('sync boom');
    });
    const healthy = vi.fn();
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, throwing);
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, healthy);

    expect(() => bus.publish(STAGE_COMPLETE_EVENT_NAME, makeEvent())).not.toThrow();
    expect(healthy).toHaveBeenCalled();
  });

  it('isolates a rejecting async handler from other subscribers and never surfaces an unhandledRejection', async () => {
    const bus = new InProcessIpcBus();
    const rejecting = vi.fn(async () => {
      throw new Error('async boom');
    });
    const healthy = vi.fn();
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, rejecting);
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, healthy);

    const unhandledRejectionHandler = vi.fn();
    process.on('unhandledRejection', unhandledRejectionHandler);

    try {
      expect(() => bus.publish(STAGE_COMPLETE_EVENT_NAME, makeEvent())).not.toThrow();
      expect(healthy).toHaveBeenCalled();

      // Let the rejected promise's microtask queue (and any unhandledRejection tick) flush.
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(unhandledRejectionHandler).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejectionHandler);
    }
  });

  it('unsubscribe removes only its own handler', () => {
    const bus = new InProcessIpcBus();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = bus.subscribe(STAGE_COMPLETE_EVENT_NAME, first);
    bus.subscribe(STAGE_COMPLETE_EVENT_NAME, second);

    unsubscribeFirst();
    bus.publish(STAGE_COMPLETE_EVENT_NAME, makeEvent());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
