import { Result } from '../../common/result.js';
import { EventValidationError } from '../errors/event-validation-error.js';
import type { StageCompleteEvent } from '../events/stage-complete-event.js';

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
 * Enforces Invariant 4: a `StageCompleteEvent` payload's artifact path must be absolute and non-empty.
 * @param event Event to validate before publish.
 * @returns `Result.ok(undefined)` when valid, or an `EventValidationError` otherwise.
 */
export function validateStageCompleteEvent(
  event: StageCompleteEvent
): Result<void, EventValidationError> {
  if (event.artifactPath.length === 0) {
    return Result.err(
      new EventValidationError(
        'StageCompleteEvent.artifactPath must not be empty',
        'EMPTY_PATH'
      )
    );
  }

  if (!isAbsolutePath(event.artifactPath)) {
    return Result.err(
      new EventValidationError(
        `StageCompleteEvent.artifactPath must be an absolute path, got '${event.artifactPath}'`,
        'RELATIVE_PATH'
      )
    );
  }

  return Result.ok(undefined);
}

/**
 * Placeholder validator for events with no invariant defined yet in this codebase.
 * @param _event Event payload; unused until a real invariant is introduced for it.
 * @returns Always `Result.ok(undefined)`.
 */
export function validateNoOp<T>(_event: T): Result<void, EventValidationError> {
  return Result.ok(undefined);
}
