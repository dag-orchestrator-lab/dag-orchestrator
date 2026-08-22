export type DomainError =
  | PersistenceReadError
  | PersistenceWriteError
  | ValidationError
  | NotFoundError;

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
