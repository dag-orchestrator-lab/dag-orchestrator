import { Result } from '../domain/common/result.js';
import { WorkspaceResultError } from '../domain/common/errors.js';
import { AutoParkPolicy } from '../domain/cli/policies/auto-park-policy.js';
import { WorkspaceCollisionError } from '../domain/cli/errors.js';
import type { Prompter } from '../infrastructure/cli/readline-prompter.js';

const AUTO_PARK_CONFIRM_ANSWERS: ReadonlySet<string> = new Set(['y', 'yes']);

function buildAutoParkPrompt(activeWorkspaceName: string, targetWorkspaceName: string): string {
  return `⚠ An active workspace "${activeWorkspaceName}" already exists.\nPark it now before creating "${targetWorkspaceName}"? (y/n): `;
}

/** Minimal active-workspace shape the guard needs, decoupled from the concrete `FeatureWorkspaceService`. */
export interface ActiveWorkspaceSummary {
  readonly name: string;
}

/** Port describing the workspace-service capabilities `FeatureWorkspaceGuard` depends on. */
export interface FeatureWorkspaceGuardService {
  getActiveWorkspace(): Result<ActiveWorkspaceSummary | null, WorkspaceResultError>;
  archiveWorkspace(name: string): Result<void, WorkspaceResultError>;
}

/**
 * Application-layer guard enforcing Auto-Park before a new workspace may be created
 * (see 02-contracts.md invariant 1, 04-findings.md BLOCKER #1, 05-tasks.md T-10).
 */
export class FeatureWorkspaceGuard {
  constructor(
    private readonly workspaceService: FeatureWorkspaceGuardService,
    private readonly prompter: Prompter
  ) {}

  /**
   * Ensures no colliding active workspace blocks creating/planning `targetName`.
   * Delegates the collision decision to `AutoParkPolicy.evaluate` so that same-name
   * re-entry (resuming the active workspace) never prompts or archives.
   * @param targetName - The workspace name the caller wants to create/plan.
   * @returns `Result.ok()` when the caller may proceed; `Result.err()` when the user declined to park
   * or the underlying workspace lookup/archive failed.
   */
  public async ensureNoActiveWorkspace(
    targetName: string
  ): Promise<Result<void, WorkspaceCollisionError | WorkspaceResultError>> {
    const activeResult = this.workspaceService.getActiveWorkspace();
    if (activeResult.isErr) {
      return activeResult;
    }

    const activeWorkspace = activeResult.value;
    const evaluation = AutoParkPolicy.evaluate(
      activeWorkspace !== null,
      activeWorkspace?.name ?? null,
      targetName
    );

    if (evaluation.canProceedDirectly) {
      return Result.ok(undefined);
    }

    const active = activeWorkspace as ActiveWorkspaceSummary;
    const answer = await this.prompter.askQuestion(buildAutoParkPrompt(active.name, targetName));

    if (!AUTO_PARK_CONFIRM_ANSWERS.has(answer.trim().toLowerCase())) {
      return Result.err(new WorkspaceCollisionError(active.name, targetName));
    }

    const archiveResult = this.workspaceService.archiveWorkspace(active.name);
    if (archiveResult.isErr) {
      return archiveResult;
    }

    return Result.ok(undefined);
  }
}
