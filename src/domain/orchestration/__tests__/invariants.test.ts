import { describe, expect, it } from 'vitest';
import { isAbsolutePath, validateStageCompleteEvent } from '../validation/invariants.js';
import type { IpcBusPort } from '../ports/ipc-bus-port.js';
import type { StageCompleteEvent } from '../events/stage-complete-event.js';

describe('isAbsolutePath', () => {
  it('accepts POSIX absolute paths', () => {
    expect(isAbsolutePath('/tmp/foo.md')).toBe(true);
  });

  it('accepts Windows-drive absolute paths regardless of host OS', () => {
    expect(isAbsolutePath('C:\\Users\\foo\\bar.md')).toBe(true);
    expect(isAbsolutePath('C:/Users/foo/bar.md')).toBe(true);
  });

  it('accepts UNC absolute paths regardless of host OS', () => {
    expect(isAbsolutePath('\\\\server\\share\\file.md')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(isAbsolutePath('foo/bar.md')).toBe(false);
    expect(isAbsolutePath('./foo.md')).toBe(false);
    expect(isAbsolutePath('')).toBe(false);
  });
});

describe('validateStageCompleteEvent', () => {
  const baseEvent: StageCompleteEvent = {
    role: 'recon',
    workspaceSlug: 'epic-2-agents',
    artifactPath: '/tmp/workdir/01-recon.md',
    timestamp: new Date().toISOString(),
  };

  it('rejects an empty artifactPath', () => {
    const result = validateStageCompleteEvent({ ...baseEvent, artifactPath: '' });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('EMPTY_PATH');
    }
  });

  it('rejects a relative artifactPath', () => {
    const result = validateStageCompleteEvent({
      ...baseEvent,
      artifactPath: 'relative/01-recon.md',
    });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('RELATIVE_PATH');
    }
  });

  it('accepts a Windows-style absolute artifactPath regardless of host OS', () => {
    const result = validateStageCompleteEvent({
      ...baseEvent,
      artifactPath: 'C:\\Users\\foo\\01-recon.md',
    });

    expect(result.isOk).toBe(true);
  });

  it('accepts a POSIX absolute artifactPath', () => {
    const result = validateStageCompleteEvent(baseEvent);

    expect(result.isOk).toBe(true);
  });
});

describe('IpcBusPort subscribe type-safety', () => {
  it('rejects subscribing to an unknown event name at compile time', () => {
    // Type-only check, never invoked at runtime — a compile failure here means Invariant 5's type hole reopened.
    function assertSubscribeIsTypeSafe(bus: IpcBusPort): void {
      // @ts-expect-error — 'NOT_A_REAL_EVENT' is not a key of OrchestrationEventMap, so this must not compile.
      bus.subscribe('NOT_A_REAL_EVENT', () => {});
    }
    void assertSubscribeIsTypeSafe;

    expect(true).toBe(true);
  });
});
