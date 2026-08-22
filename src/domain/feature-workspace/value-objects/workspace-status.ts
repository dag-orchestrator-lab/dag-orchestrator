export type WorkspaceLifecycleState = 'ACTIVE' | 'ARCHIVED';

/** Value object representing the explicit workspace lifecycle state. */
export class WorkspaceStatus {
  private constructor(public readonly value: WorkspaceLifecycleState) {
    Object.freeze(this);
  }

  public static ACTIVE = new WorkspaceStatus('ACTIVE');
  public static ARCHIVED = new WorkspaceStatus('ARCHIVED');

  public isActive(): boolean {
    return this.value === 'ACTIVE';
  }

  public isArchived(): boolean {
    return this.value === 'ARCHIVED';
  }
}
