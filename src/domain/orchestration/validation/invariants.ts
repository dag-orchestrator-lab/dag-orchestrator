import { Result } from '../../common/result.js';
import { ContextValidationError } from '../errors/context-validation-error.js';
import { EventValidationError } from '../errors/event-validation-error.js';
import { AgentContext, type AgentContextProps } from '../models/agent-context.js';
import type { StageCompleteEvent } from '../events/stage-complete-event.js';
import type { FilePresenceCheckerPort } from '../ports/file-presence-checker-port.js';

const WINDOWS_DRIVE_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;
const UNC_ABSOLUTE_PATH = /^\\\\/;
const POSIX_ABSOLUTE_PATH = /^\//;

/**
 * Determines whether `path` is absolute under POSIX, Windows-drive, or UNC conventions,
 * independent of the host OS running this check.
 * @param path Path to test.
 * @returns `true` iff `path` is absolute in any recognized form.
 */
export function isAbsolutePath(path: string): boolean {
  return (
    POSIX_ABSOLUTE_PATH.test(path) ||
    WINDOWS_DRIVE_ABSOLUTE_PATH.test(path) ||
    UNC_ABSOLUTE_PATH.test(path)
  );
}

/**
 * Constructs an `AgentContext`, enforcing Invariants 1 (absolute working directory) and
 * 2 (existing, absolute artifact references) using `isAbsolutePath` as the single source of truth.
 * @param params Context fields.
 * @param fileChecker Port used to verify artifact files exist at construction time.
 * @returns A frozen `AgentContext`, or a `ContextValidationError` on invariant violation.
 */
export function createAgentContext(
  params: AgentContextProps,
  fileChecker: FilePresenceCheckerPort
): Result<AgentContext, ContextValidationError> {
  return AgentContext.create(params, fileChecker);
}

/**
 * Enforces Invariant 4: a `StageCompleteEvent` payload's artifact path must be absolute and non-empty.
 * @param event Event to validate before publish.
 * @returns `Result.ok(undefined)` when valid, or an `EventValidationError` otherwise.
 */
export function validateStageCompleteEvent(
  event: StageCompleteEvent
): Result<void, EventValidationError> {
  if (event.artifactAbsolutePath.length === 0) {
    return Result.err(
      new EventValidationError(
        'StageCompleteEvent.artifactAbsolutePath must not be empty',
        'EMPTY_PATH'
      )
    );
  }

  if (!isAbsolutePath(event.artifactAbsolutePath)) {
    return Result.err(
      new EventValidationError(
        `StageCompleteEvent.artifactAbsolutePath must be an absolute path, got '${event.artifactAbsolutePath}'`,
        'RELATIVE_PATH'
      )
    );
  }

  return Result.ok(undefined);
}
