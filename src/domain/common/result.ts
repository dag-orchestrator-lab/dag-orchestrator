export type Result<T, E> = Ok<T, E> | Err<T, E>;

export interface Ok<T, E> {
  readonly isOk: true;
  readonly isErr: false;
  readonly value: T;
}

export interface Err<T, E> {
  readonly isOk: false;
  readonly isErr: true;
  readonly error: E;
}

export const Result = {
  ok<T, E = never>(value: T): Result<T, E> {
    return { isOk: true, isErr: false, value };
  },
  err<E, T = never>(error: E): Result<T, E> {
    return { isOk: false, isErr: true, error };
  },
};
