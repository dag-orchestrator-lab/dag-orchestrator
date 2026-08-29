import { describe, expect, it, beforeEach } from 'vitest';
import { getIpcBus, resetIpcBus } from '../orchestration-factory.js';
import { InProcessIpcBus } from '../in-process-ipc-bus.js';

describe('OrchestrationFactory', () => {
  beforeEach(() => {
    resetIpcBus();
  });

  it('returns the same IpcBus instance across repeated calls', () => {
    const first = getIpcBus();
    const second = getIpcBus();

    expect(first).toBe(second);
    expect(first).toBeInstanceOf(InProcessIpcBus);
  });

  it('constructs a fresh instance after resetIpcBus', () => {
    const before = getIpcBus();

    resetIpcBus();
    const after = getIpcBus();

    expect(after).not.toBe(before);
  });
});
