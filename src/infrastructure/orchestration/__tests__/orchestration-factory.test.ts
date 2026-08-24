import { describe, expect, it } from 'vitest';
import { OrchestrationFactory } from '../orchestration-factory.js';
import { InProcessIpcBus } from '../in-process-ipc-bus.js';

describe('OrchestrationFactory', () => {
  it('returns the same IpcBus instance across repeated calls', () => {
    OrchestrationFactory.resetIpcBus();

    const first = OrchestrationFactory.getIpcBus();
    const second = OrchestrationFactory.getIpcBus();

    expect(first).toBe(second);
    expect(first).toBeInstanceOf(InProcessIpcBus);
  });

  it('constructs a fresh instance after resetIpcBus', () => {
    const before = OrchestrationFactory.getIpcBus();

    OrchestrationFactory.resetIpcBus();
    const after = OrchestrationFactory.getIpcBus();

    expect(after).not.toBe(before);
  });
});
