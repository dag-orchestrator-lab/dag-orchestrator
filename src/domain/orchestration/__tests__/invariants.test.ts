import { describe, expect, it } from 'vitest';
import {
  createAgentContext,
  isAbsolutePath,
  validateStageCompleteEvent,
} from '../validation/invariants.js';
import { PipelineStage } from '../../feature-workspace/entities/pipeline-stage.js';
import type { FilePresenceCheckerPort } from '../ports/file-presence-checker-port.js';
import type { IpcBusPort } from '../ports/ipc-bus-port.js';
import type { StageCompleteEvent } from '../events/stage-complete-event.js';

class StubFilePresenceChecker implements FilePresenceCheckerPort {
  constructor(private readonly existingPaths: ReadonlySet<string>) {}

  existsSync(absolutePath: string): boolean {
    return this.existingPaths.has(absolutePath);
  }
}

function requireOk(stage: ReturnType<typeof PipelineStage.create>): PipelineStage {
  if (stage.isErr) {
    throw new Error('expected PipelineStage.create to succeed');
  }
  return stage.value;
}

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

describe('createAgentContext', () => {
  const pipelineState = requireOk(PipelineStage.create({ name: 'recon', requiredGates: [] }));

  it('rejects a relative workingDirectory', () => {
    const checker = new StubFilePresenceChecker(new Set());

    const result = createAgentContext(
      {
        pipelineState,
        workingDirectory: 'relative/dir',
        artifactRefs: [],
      },
      checker
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('RELATIVE_WORKING_DIRECTORY');
    }
  });

  it('rejects an artifact reference missing on disk', () => {
    const checker = new StubFilePresenceChecker(new Set());

    const result = createAgentContext(
      {
        pipelineState,
        workingDirectory: '/tmp/workdir',
        artifactRefs: [{ stageId: 'recon', absolutePath: '/tmp/workdir/01-recon.md' }],
      },
      checker
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('INVALID_ARTIFACT_REF');
    }
  });

  it('accepts an absolute workingDirectory and existing artifact refs', () => {
    const artifactPath = '/tmp/workdir/01-recon.md';
    const checker = new StubFilePresenceChecker(new Set([artifactPath]));

    const result = createAgentContext(
      {
        pipelineState,
        workingDirectory: '/tmp/workdir',
        artifactRefs: [{ stageId: 'recon', absolutePath: artifactPath }],
      },
      checker
    );

    expect(result.isOk).toBe(true);
  });
});

describe('validateStageCompleteEvent', () => {
  const baseEvent: StageCompleteEvent = {
    detailType: 'STAGE_COMPLETE',
    source: 'recon',
    artifactAbsolutePath: '/tmp/workdir/01-recon.md',
    occurredAt: new Date().toISOString(),
  };

  it('rejects an empty artifactAbsolutePath', () => {
    const result = validateStageCompleteEvent({ ...baseEvent, artifactAbsolutePath: '' });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('EMPTY_PATH');
    }
  });

  it('rejects a relative artifactAbsolutePath', () => {
    const result = validateStageCompleteEvent({
      ...baseEvent,
      artifactAbsolutePath: 'relative/01-recon.md',
    });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('RELATIVE_PATH');
    }
  });

  it('accepts a Windows-style absolute artifactAbsolutePath regardless of host OS', () => {
    const result = validateStageCompleteEvent({
      ...baseEvent,
      artifactAbsolutePath: 'C:\\Users\\foo\\01-recon.md',
    });

    expect(result.isOk).toBe(true);
  });

  it('accepts a POSIX absolute artifactAbsolutePath', () => {
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
