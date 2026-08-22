export type WorkspaceResultError =
  | PersistenceReadError
  | PersistenceWriteError
  | ValidationError
  | NotFoundError;

export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PersistenceReadError {
  readonly kind: 'PersistenceReadError';
  readonly path: string;
  readonly cause: unknown;
}

export interface PersistenceWriteError {
  readonly kind: 'PersistenceWriteError';
  readonly path: string;
  readonly cause: unknown;
}

export interface ValidationError {
  readonly kind: 'ValidationError';
  readonly field: string;
  readonly message: string;
}

export interface NotFoundError {
  readonly kind: 'NotFoundError';
  readonly identifier: string;
}
