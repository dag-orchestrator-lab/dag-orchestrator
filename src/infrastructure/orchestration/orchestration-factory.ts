import { InProcessIpcBus } from './in-process-ipc-bus.js';
import type { IpcBusPort } from '../../domain/orchestration/ports/ipc-bus-port.js';

let sharedIpcBus: IpcBusPort | undefined;

/**
 * Provides the process-wide shared `IpcBus` instance, constructing it lazily on first access.
 * Exists so a future epic's DI wiring has one place to obtain the shared bus.
 * @returns the shared `IpcBusPort` instance
 */
export function getIpcBus(): IpcBusPort {
  if (!sharedIpcBus) {
    sharedIpcBus = new InProcessIpcBus();
  }
  return sharedIpcBus;
}

/** Clears the shared `IpcBus` instance so the next `getIpcBus()` call constructs a fresh one. */
export function resetIpcBus(): void {
  sharedIpcBus = undefined;
}

export const OrchestrationFactory = {
  getIpcBus,
  resetIpcBus,
};
