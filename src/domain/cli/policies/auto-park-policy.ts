/** Outcome of evaluating whether Auto-Park must intervene before workspace creation/planning. */
export interface AutoParkEvaluation {
  readonly requiresPrompt: boolean;
  readonly canProceedDirectly: boolean;
}

/** Pure domain policy determining whether workspace creation or planning can proceed given active workspace presence (see 03-domain.md §4). */
export class AutoParkPolicy {
  /**
   * Evaluates if an Auto-Park intervention is required before creating/planning a new workspace.
   * @param hasActiveWorkspace - Whether an active workspace currently exists.
   * @param activeWorkspaceName - The name of the current active workspace, if present.
   * @param targetWorkspaceName - The requested new workspace name.
   * @returns Whether a prompt is required and whether the caller can proceed directly.
   */
  public static evaluate(
    hasActiveWorkspace: boolean,
    activeWorkspaceName: string | null,
    targetWorkspaceName: string
  ): AutoParkEvaluation {
    if (!hasActiveWorkspace) {
      return { requiresPrompt: false, canProceedDirectly: true };
    }

    if (activeWorkspaceName === targetWorkspaceName) {
      return { requiresPrompt: false, canProceedDirectly: true };
    }

    return { requiresPrompt: true, canProceedDirectly: false };
  }
}
