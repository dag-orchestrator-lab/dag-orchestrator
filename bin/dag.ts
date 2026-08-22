#!/usr/bin/env node

import { Result } from '../src/domain/common/result.js';
import type { WorkspaceResultError } from '../src/domain/common/errors.js';
import { ExitCode } from '../src/domain/cli/value-objects/exit-code.js';
import { CliParser, type ParsedCommand } from '../src/infrastructure/cli/cli-parser.js';
import { ReadlinePrompter, type Prompter } from '../src/infrastructure/cli/readline-prompter.js';
import { NodeGitAdapter } from '../src/infrastructure/process/git-adapter.js';
import { resolveConfiguration, loadConfig } from '../src/infrastructure/config.js';
import { FileSystemFeatureWorkspaceRepository } from '../src/infrastructure/file-system-repository.js';
import { DagConfigRepository, type DagCliConfig } from '../src/infrastructure/config/dag-config-repository.js';
import { ProviderFactory } from '../src/infrastructure/llm/provider-factory.js';
import { FeatureWorkspaceService } from '../src/application/feature-workspace-service.js';
import {
  FeatureWorkspaceGuard,
  type ActiveWorkspaceSummary,
  type FeatureWorkspaceGuardService,
} from '../src/application/feature-workspace-guard.js';
import { DefaultPipelineAdvancer } from '../src/application/pipeline/pipeline-advancer.js';
import { ExecuteStagePromptUseCase } from '../src/application/llm/execute-stage-prompt-use-case.js';

/** Default `.dag/config.json` version stamped by `dag init` on a fresh repository. */
const DEFAULT_CONFIG_VERSION = '1.0.0';

/** Default LLM provider offered by `dag init` when the user declines to type one. */
const DEFAULT_LLM_PROVIDER = 'gemini';

/** Sentinel thrown once usage text has already been printed, so the top-level handler exits without re-logging. */
class UsageAlreadyPrintedError extends Error {}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalizes any thrown/`Result`-carried error shape into a loggable `Error`, per contract Failure semantics (message only, no stack). */
function toDisplayError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (isPlainRecord(error) && typeof error.message === 'string') {
    return new Error(error.message);
  }
  if (isPlainRecord(error) && typeof error.kind === 'string') {
    return new Error(`${error.kind}: ${JSON.stringify(error)}`);
  }
  return new Error(String(error));
}

function unwrapOrThrow<T>(result: Result<T, WorkspaceResultError>): T {
  if (result.isErr) {
    throw toDisplayError(result.error);
  }
  return result.value;
}

function printUsage(): void {
  console.log(`Usage: dag <command> [args]

Commands:
  init                 Initialize .dag/config.json for this repository
  doctor                Run diagnostics on the current workspace
  features, list        List known feature workspaces
  plan <name>           Auto-Park check, then plan/resume workspace <name>
  new <name>            Auto-Park check, then create/resume workspace <name>
  archive [name]        Archive a workspace (defaults to the active one)
  rollback [name]       Create a rollback snapshot (defaults to the active one)
  config [get|set k v]  Read or write .dag/config.json
  step0..step4          Run a pipeline stage with dirty-tree guard and auto-heal
`);
}

const cwd = process.cwd();
const configuration = resolveConfiguration();
const prompter: Prompter = new ReadlinePrompter();
const gitAdapter = new NodeGitAdapter();
const workspaceRepository = new FileSystemFeatureWorkspaceRepository(configuration);
const workspaceService = new FeatureWorkspaceService(workspaceRepository);
const dagConfigRepository = new DagConfigRepository(configuration);
const executeStageUseCase = new ExecuteStagePromptUseCase(new ProviderFactory());

const stackedBaseBranchRaw = (loadConfig(cwd) as Record<string, unknown>).STACKED_BASE_BRANCH;
const pipelineAdvancer = new DefaultPipelineAdvancer(gitAdapter, prompter, executeStageUseCase, cwd, {
  STACKED_BASE_BRANCH: typeof stackedBaseBranchRaw === 'string' ? stackedBaseBranchRaw : undefined,
});

/** Bridges `FeatureWorkspaceService`'s confirmed (T-8) surface to the `FeatureWorkspaceGuardService` port the guard depends on. */
const workspaceGuardService: FeatureWorkspaceGuardService = {
  getActiveWorkspace(): Result<ActiveWorkspaceSummary | null, WorkspaceResultError> {
    const listResult = workspaceService.listAllFeatures();
    if (listResult.isErr) {
      return listResult;
    }
    for (const entry of listResult.value) {
      if (isPlainRecord(entry) && entry.status === 'ACTIVE' && typeof entry.slug === 'string') {
        return Result.ok({ name: entry.slug });
      }
    }
    return Result.ok(null);
  },
  archiveWorkspace(name: string): Result<void, WorkspaceResultError> {
    return workspaceService.archiveFeatureWorkspace(name);
  },
};

const workspaceGuard = new FeatureWorkspaceGuard(workspaceGuardService, prompter);

function workspaceExists(targetName: string): boolean {
  const entries = unwrapOrThrow(workspaceService.listAllFeatures());
  return entries.some((entry) => isPlainRecord(entry) && entry.slug === targetName);
}

/**
 * Auto-Parks any colliding active workspace, then creates `targetName` unless it already
 * exists (same-name re-entry resumes in place per 05-tasks.md T-10's BLOCKER fix, so
 * `createWorkspace`-equivalent side effects never fire twice for one logical workspace).
 */
async function handlePlanOrNew(targetName: string): Promise<void> {
  const guardResult = await workspaceGuard.ensureNoActiveWorkspace(targetName);
  if (guardResult.isErr) {
    throw toDisplayError(guardResult.error);
  }

  if (workspaceExists(targetName)) {
    console.log(`Resuming existing workspace "${targetName}".`);
    return;
  }

  unwrapOrThrow(workspaceService.saveFeatureContextMeta(targetName, {}));
  console.log(`Created workspace "${targetName}".`);
}

function resolveActiveWorkspaceName(): string | null {
  const active = unwrapOrThrow(workspaceGuardService.getActiveWorkspace());
  return active?.name ?? null;
}

async function handleArchive(name: string | undefined): Promise<void> {
  const targetName = name ?? resolveActiveWorkspaceName();
  if (!targetName) {
    throw new Error('No active workspace to archive and no name provided.');
  }
  unwrapOrThrow(workspaceService.archiveFeatureWorkspace(targetName));
  console.log(`Archived workspace "${targetName}".`);
}

async function handleRollback(name: string | undefined): Promise<void> {
  const targetName = name ?? resolveActiveWorkspaceName();
  if (!targetName) {
    throw new Error('No active workspace to snapshot and no name provided.');
  }
  unwrapOrThrow(workspaceService.createRollbackSnapshot(targetName));
  console.log(`Created rollback snapshot for "${targetName}".`);
}

function handleFeatures(): void {
  const entries = unwrapOrThrow(workspaceService.listAllFeatures());
  if (entries.length === 0) {
    console.log('No feature workspaces found.');
    return;
  }
  for (const entry of entries) {
    if (isPlainRecord(entry)) {
      console.log(`- ${String(entry.slug)} [${String(entry.status)}]`);
    }
  }
}

async function handleDoctor(): Promise<void> {
  console.log('Running diagnostics...');
  const isClean = await gitAdapter.isWorkingTreeClean(cwd);
  console.log(`Git working tree: ${isClean ? 'clean' : 'dirty'}`);
  const configResult = dagConfigRepository.read();
  console.log(`.dag/config.json: ${configResult.isOk ? 'present' : 'missing/invalid'}`);
}

async function handleInit(): Promise<void> {
  const existing = dagConfigRepository.read();
  if (existing.isOk) {
    console.log('DAG is already initialized in this repository.');
    return;
  }

  const llmProviderAnswer = await prompter.askQuestion(`LLM provider [${DEFAULT_LLM_PROVIDER}]: `);
  const config: DagCliConfig = {
    version: DEFAULT_CONFIG_VERSION,
    llmProvider: llmProviderAnswer.trim() || DEFAULT_LLM_PROVIDER,
    autoParkPrompt: true,
  };

  unwrapOrThrow(dagConfigRepository.write(config));
  console.log('Initialized .dag/config.json.');
}

function defaultDagCliConfig(): DagCliConfig {
  return { version: DEFAULT_CONFIG_VERSION, llmProvider: DEFAULT_LLM_PROVIDER, autoParkPrompt: true };
}

async function handleConfig(args: string[]): Promise<void> {
  const [subcommand, key, value] = args;

  if (!subcommand || subcommand === 'get') {
    const readResult = dagConfigRepository.read();
    console.log(JSON.stringify(readResult.isOk ? readResult.value : defaultDagCliConfig(), null, 2));
    return;
  }

  if (subcommand === 'set') {
    if (!key || value === undefined) {
      throw new Error('Usage: dag config set <key> <value>');
    }
    const current = dagConfigRepository.read();
    const base = current.isOk ? current.value : defaultDagCliConfig();

    let updated: DagCliConfig;
    switch (key) {
      case 'version':
        updated = { ...base, version: value };
        break;
      case 'llmProvider':
        updated = { ...base, llmProvider: value };
        break;
      case 'autoParkPrompt':
        updated = { ...base, autoParkPrompt: value === 'true' };
        break;
      default:
        throw new Error(`Unknown config key: "${key}"`);
    }

    unwrapOrThrow(dagConfigRepository.write(updated));
    console.log(`Updated ${key}.`);
    return;
  }

  throw new Error(`Unknown config subcommand: "${subcommand}"`);
}

async function handleStep(type: 'step0' | 'step1' | 'step2' | 'step3' | 'step4'): Promise<void> {
  switch (type) {
    case 'step0':
      return pipelineAdvancer.runStep0();
    case 'step1':
      return pipelineAdvancer.runStep1();
    case 'step2':
      return pipelineAdvancer.runStep2();
    case 'step3':
      return pipelineAdvancer.runStep3();
    case 'step4':
      return pipelineAdvancer.runStep4();
  }
}

async function dispatch(parsed: ParsedCommand): Promise<void> {
  switch (parsed.type) {
    case 'init':
      return handleInit();
    case 'doctor':
      return handleDoctor();
    case 'features':
      return handleFeatures();
    case 'plan':
    case 'new': {
      const targetName = parsed.args[0];
      if (!targetName) {
        throw new Error(`Usage: dag ${parsed.type} <name>`);
      }
      return handlePlanOrNew(targetName);
    }
    case 'archive':
      return handleArchive(parsed.args[0]);
    case 'rollback':
      return handleRollback(parsed.args[0]);
    case 'config':
      return handleConfig(parsed.args);
    case 'step0':
    case 'step1':
    case 'step2':
    case 'step3':
    case 'step4':
      return handleStep(parsed.type);
    case 'unknown':
    default:
      printUsage();
      throw new UsageAlreadyPrintedError(`Unrecognized command: "${parsed.rawCommand}"`);
  }
}

let sigintHandled = false;
process.on('SIGINT', () => {
  if (sigintHandled) {
    return;
  }
  sigintHandled = true;
  prompter.close();
  console.log('\nInterrupted.');
  process.exit(ExitCode.INTERRUPTED.code);
});

async function main(): Promise<void> {
  const parsed = CliParser.parse(process.argv);

  try {
    await dispatch(parsed);
    prompter.close();
    process.exit(ExitCode.SUCCESS.code);
  } catch (error) {
    prompter.close();
    if (!(error instanceof UsageAlreadyPrintedError)) {
      console.error(`Error: ${toDisplayError(error).message}`);
    }
    process.exit(ExitCode.FAILURE.code);
  }
}

void main();
