import { Result } from '../../common/result.js';
import { WorkspaceResultError } from '../../common/errors.js';

/** Value object representing the unique identity of a feature workspace. */
export class FeatureSlug {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
    Object.freeze(this);
  }

  public get value(): string {
    return this._value;
  }

  /**
   * @param input Raw feature name or slug candidate.
   * @returns A validated, slugified `FeatureSlug`, or a `ValidationError` if input is empty.
   */
  public static create(input: string): Result<FeatureSlug, WorkspaceResultError> {
    if (!input || input.trim().length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'slug',
        message: 'Feature slug cannot be empty',
      });
    }

    const slugified = FeatureSlug.slugify(input);
    if (slugified.length === 0) {
      return Result.err({
        kind: 'ValidationError',
        field: 'slug',
        message: 'Feature slug cannot be empty',
      });
    }

    return Result.ok(new FeatureSlug(slugified));
  }

  public static slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  public equals(other: FeatureSlug): boolean {
    return this._value === other._value;
  }
}
