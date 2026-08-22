import { DomainError } from '../../common/errors.js';

export interface ProviderExecutionErrorOptions {
  readonly stageName?: string;
  readonly providerType?: string;
}

export class ProviderExecutionError extends DomainError {
  public readonly stageName?: string;
  public readonly providerType?: string;

  constructor(message: string, options?: ProviderExecutionErrorOptions) {
    super(message);
    this.name = 'ProviderExecutionError';
    this.stageName = options?.stageName;
    this.providerType = options?.providerType;
  }
}
