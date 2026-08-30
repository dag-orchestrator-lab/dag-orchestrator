import { EventEmitter } from 'node:events';
import { Result } from '../../domain/common/result.js';
import { EventValidationError } from '../../domain/orchestration/errors/event-validation-error.js';
import { validateNoOp, validateStageCompleteEvent } from '../../domain/orchestration/validation/invariants.js';
import { STAGE_COMPLETE_EVENT_NAME } from '../../domain/orchestration/events/stage-complete-event.js';
import { CODER_TASK_STARTED_EVENT_NAME, CODER_TASK_VERIFIED_EVENT_NAME } from '../../domain/orchestration/events/coder-events.js';
import { FIXER_PATCH_APPLIED_EVENT_NAME, FIXER_RETRIES_EXHAUSTED_EVENT_NAME } from '../../domain/orchestration/events/fixer-events.js';
import { REVIEW_COMPLETED_EVENT_NAME, CONTRACT_ADDENDUM_CREATED_EVENT_NAME } from '../../domain/orchestration/events/reviewer-events.js';
import { GATE4_PAUSED_EVENT_NAME } from '../../domain/orchestration/events/pipeline-events.js';
import type { OrchestrationEventMap, OrchestrationEventName } from '../../domain/orchestration/events/event-map.js';
import type { IpcBusPort, UnsubscribeFn } from '../../domain/orchestration/ports/ipc-bus-port.js';

/**
 * Maps each known event name to its payload's own validator, so `publish()` can enforce
 * Invariant 4 (and any future per-event invariant) before dispatching to subscribers.
 */
const EVENT_VALIDATORS: {
  readonly [K in OrchestrationEventName]: (
    payload: OrchestrationEventMap[K]
  ) => Result<void, EventValidationError>;
} = {
  [STAGE_COMPLETE_EVENT_NAME]: validateStageCompleteEvent,
  [CODER_TASK_STARTED_EVENT_NAME]: validateNoOp,
  [CODER_TASK_VERIFIED_EVENT_NAME]: validateNoOp,
  [FIXER_PATCH_APPLIED_EVENT_NAME]: validateNoOp,
  [FIXER_RETRIES_EXHAUSTED_EVENT_NAME]: validateNoOp,
  [REVIEW_COMPLETED_EVENT_NAME]: validateNoOp,
  [CONTRACT_ADDENDUM_CREATED_EVENT_NAME]: validateNoOp,
  [GATE4_PAUSED_EVENT_NAME]: validateNoOp,
};

/** In-process, in-memory typed pub/sub bus. No cross-process transport — see contract. */
export class InProcessIpcBus implements IpcBusPort {
  private readonly emitter = new EventEmitter();

  /**
   * Validates the payload and, if valid, dispatches it to all current subscribers of `eventName`.
   * Each subscriber is invoked in isolation so a throwing or rejecting handler cannot stop
   * delivery to the rest, nor propagate back into the caller (Invariant 6).
   * @param eventName - the known event's detail-type key
   * @param payload - the payload matching that event's shape
   * @returns `Result.ok(undefined)` when dispatched, or an `EventValidationError` when the payload is invalid.
   */
  publish<K extends OrchestrationEventName>(
    eventName: K,
    payload: OrchestrationEventMap[K]
  ): Result<void, EventValidationError> {
    const validation = EVENT_VALIDATORS[eventName](payload);
    if (validation.isErr) {
      return validation;
    }

    for (const handler of this.emitter.listeners(eventName)) {
      try {
        Promise.resolve((handler as (payload: OrchestrationEventMap[K]) => unknown)(payload)).catch(() => {});
      } catch {
        // Synchronous throws are caught here; rejected Promises are caught above via .catch().
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Registers a handler for the given event name.
   * @param eventName - the known event's detail-type key
   * @param handler - invoked with the event's payload on each publish
   * @returns a function that removes this handler when called
   */
  subscribe<K extends OrchestrationEventName>(
    eventName: K,
    handler: (payload: OrchestrationEventMap[K]) => void
  ): UnsubscribeFn {
    this.emitter.on(eventName, handler);
    return () => {
      this.emitter.off(eventName, handler);
    };
  }
}
