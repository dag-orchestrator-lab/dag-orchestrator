import type { OrchestrationEventMap, OrchestrationEventName } from '../events/event-map.js';

export type UnsubscribeFn = () => void;

/** The shape of the in-process typed pub/sub bus Sub-Agents publish and subscribe against. */
export interface IpcBusPort {
  /**
   * Publishes a payload for the given event name to all current subscribers.
   * @param eventName - the known event's detail-type key
   * @param payload - the payload matching that event's shape
   */
  publish<K extends OrchestrationEventName>(eventName: K, payload: OrchestrationEventMap[K]): void;

  /**
   * Registers a handler for the given event name.
   * @param eventName - the known event's detail-type key
   * @param handler - invoked with the event's payload on each publish
   * @returns a function that removes this handler when called
   */
  subscribe<K extends OrchestrationEventName>(
    eventName: K,
    handler: (payload: OrchestrationEventMap[K]) => void,
  ): UnsubscribeFn;
}
