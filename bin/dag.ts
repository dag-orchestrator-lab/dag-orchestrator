#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
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

/** `.dag/config.json` stage key `dag commit`/`dag ship` use to resolve their LLM provider. */
const COMMIT_STAGE_NAME = 'commit';

/** Base branch `dag ship`/`dag stack` target when `.dag/config.json` omits `STACKED_BASE_BRANCH`. */
const DEFAULT_BASE_BRANCH = 'develop';

/** Pipeline artifact filenames `dag next` inspects in the working directory, mirroring legacy `getPipelineStatus`. */
const REQUIREMENTS_ARTIFACT = '00-requirements.md';
const CONTRACTS_ARTIFACT = '02-contracts.md';
const TASKS_ARTIFACT = '05-tasks.md';
const REVIEW_ARTIFACT = 'REVIEW.md';

/** Matches a completed/incomplete atomic task heading line in `05-tasks.md`, per 05-tasks.md's own `### [ ] T-N` convention. */
const INCOMPLETE_TASK_HEADING = /^###\s+\[\s\]\s+T-\d+/;
const COMPLETE_TASK_HEADING = /^###\s+\[x\]\s+T-\d+/i;

/** Legacy `.dagrules` team-wide and repository-local architecture rules filenames, resolved from `cwd`. */
const RULES_FILENAME = '.dagrules';
const RULES_LOCAL_FILENAME = '.dagrules.local';

/** Filename of the linked-service registry, relative to `.dag/`, mirroring legacy `dag service link/unlink`. */
const SERVICES_REGISTRY_FILENAME = 'services.json';

/** Package `dag web`/`dag dsh` launches to serve the DeepSeek Harness dashboard, per legacy `bin/dag.js`. */
const DSH_WEB_PACKAGE = '@deepseek-ai/dsh';

const execFileAsync = promisify(execFile);

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
  commit                 Generate an AI commit message for the working tree diff and commit locally
  ship                   Commit (AI message), push, and open a Pull Request
  stack <base> [new]     Fetch base branch and create a stacked feature branch
  next                   Evaluate pipeline state and auto-advance to the next step
  step0..step4          Run a pipeline stage with dirty-tree guard and auto-heal
  rules, rule            Show active .dagrules / .dagrules.local
  service, services      Link/unlink/list microservice workspaces
  verify, audit          Report which pipeline artifacts exist
  switch, activate, restore <name>  Activate a stored feature workspace
  unarchive <name>       Restore an archived workspace to active features
  clean                  Remove pipeline artifacts for the active workspace
  status                 Show the active workspace's pipeline status
  stats, benchmark       Show cost/token telemetry
  all, run               Run the entire pipeline end-to-end
  web, dsh               Launch the DeepSeek Harness web dashboard
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

function resolveStackedBaseBranch(): string | undefined {
  const raw = (loadConfig(cwd) as Record<string, unknown>).STACKED_BASE_BRANCH;
  return typeof raw === 'string' ? raw : undefined;
}

const pipelineAdvancer = new DefaultPipelineAdvancer(gitAdapter, prompter, executeStageUseCase, cwd, {
  STACKED_BASE_BRANCH: resolveStackedBaseBranch(),
});

/**
 * Merges `updates` into `.dag/config.json`'s raw JSON, mirroring legacy `saveLocalConfig`.
 * Bypasses `DagConfigRepository`'s strict schema so passthrough fields (`STACKED_BASE_BRANCH`,
 * `ACTIVE_BRANCH`) survive, matching `ConfigSchema`'s `.passthrough()` read side.
 */
function saveLocalConfigUpdates(updates: Record<string, string>): void {
  const configPath = path.join(configuration.dagDir, 'config.json');
  let current: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      current = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }
  fs.mkdirSync(configuration.dagDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ ...current, ...updates }, null, 2), 'utf-8');
}

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
    saveLocalConfigUpdates({ ACTIVE_FEATURE: targetName });
    console.log(`Resuming existing workspace "${targetName}".`);
    return;
  }

  unwrapOrThrow(workspaceService.saveFeatureContextMeta(targetName, {}));
  saveLocalConfigUpdates({ ACTIVE_FEATURE: targetName });
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

/** @returns The full working-tree diff (staged + unstaged) against `HEAD`, or `''` if it could not be computed. */
async function extractWorkingTreeDiff(): Promise<string> {
  try {
    await execFileAsync('git', ['add', '-N', '.'], { cwd });
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], { cwd });
    return stdout;
  } catch {
    return '';
  }
}

/** Stages the entire working tree so the committed content matches the diff the user reviewed. */
async function stageAllChanges(): Promise<void> {
  await execFileAsync('git', ['add', '-A'], { cwd });
}

async function createCommit(message: string): Promise<void> {
  await execFileAsync('git', ['commit', '-m', message], { cwd });
}

/**
 * Asks the LLM for a conventional commit message summarizing `diff`.
 * @returns The generated message, trimmed.
 */
async function generateCommitMessage(diff: string): Promise<string> {
  const prompt = `Generate a concise, conventional commit message for the following git diff. Respond with only the commit message, no explanation or code fences.\n\n${diff}`;
  const result = await executeStageUseCase.execute(COMMIT_STAGE_NAME, prompt);
  if (result.isErr) {
    throw toDisplayError(result.error);
  }
  return result.value.trim();
}

/**
 * Generates a commit message for `diff`, shows it to the user, and lets them accept, edit,
 * or abort. Shared by `dag commit` and `dag ship` so both produce consistent AI messages.
 * @returns The user-confirmed final message, or `null` if the user aborted.
 */
async function resolveCommitMessage(diff: string): Promise<string | null> {
  const generatedMessage = await generateCommitMessage(diff);
  console.log('\nProposed commit message:\n');
  console.log(generatedMessage);

  const answer = await prompter.askQuestion('\nCommit with this message? (y/n/edit): ');
  const normalized = answer.trim().toLowerCase();

  if (normalized === 'edit' || normalized === 'e') {
    const edited = (await prompter.askMultiLine('Enter your commit message (blank line or --- to finish):')).trim();
    return edited || null;
  }
  if (normalized !== 'y' && normalized !== 'yes') {
    return null;
  }
  return generatedMessage;
}

/**
 * Extracts the working tree diff, asks the LLM for a conventional commit message, then
 * prompts the user to accept, edit, or abort before committing locally (never pushes).
 */
async function handleCommit(): Promise<void> {
  const diff = await extractWorkingTreeDiff();
  if (!diff.trim()) {
    console.log('No changes to commit.');
    return;
  }

  const finalMessage = await resolveCommitMessage(diff);
  if (!finalMessage) {
    console.log('Commit aborted.');
    return;
  }

  await stageAllChanges();
  await createCommit(finalMessage);
  console.log('✓ Commit created.');
}

/** @returns `true` if the GitHub CLI (`gh`) is on `PATH`. */
async function isGhCliInstalled(): Promise<boolean> {
  try {
    await execFileAsync('which', ['gh']);
    return true;
  } catch {
    return false;
  }
}

/** @returns The current Git branch name, or `''` if it could not be determined. */
async function resolveCurrentBranch(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

/**
 * Commits any pending changes (reusing `dag commit`'s AI message generation), pushes the
 * current branch to origin, and offers to open a Pull Request via the GitHub CLI.
 */
async function handleShip(): Promise<void> {
  const isClean = await gitAdapter.isWorkingTreeClean(cwd);
  if (!isClean) {
    const diff = await extractWorkingTreeDiff();
    const finalMessage = diff.trim() ? await resolveCommitMessage(diff) : null;
    if (!finalMessage) {
      console.log('Ship aborted: uncommitted changes were not committed.');
      return;
    }
    await stageAllChanges();
    await createCommit(finalMessage);
    console.log('✓ Commit created.');
  }

  console.log('Pushing branch to origin...');
  await execFileAsync('git', ['push', 'origin', 'HEAD'], { cwd });
  console.log('✓ Branch pushed to origin.');

  if (!(await isGhCliInstalled())) {
    console.log('GitHub CLI (`gh`) not detected; skipping Pull Request creation.');
    return;
  }

  const doPr = await prompter.askQuestion('Open a GitHub Pull Request now via `gh`? (y/n): ');
  const normalized = doPr.trim().toLowerCase();
  if (normalized !== 'y' && normalized !== 'yes') {
    console.log('Pull Request creation skipped.');
    return;
  }

  const currentBranch = await resolveCurrentBranch();
  const baseBranch = resolveStackedBaseBranch() ?? DEFAULT_BASE_BRANCH;
  const defaultTitle = currentBranch || 'Ship changes';
  const titleAnswer = await prompter.askQuestion(`Pull Request title [${defaultTitle}]: `);
  const title = titleAnswer.trim() || defaultTitle;

  try {
    const { stdout } = await execFileAsync('gh', [
      'pr',
      'create',
      '--title',
      title,
      '--body',
      '',
      '--head',
      currentBranch,
      '--base',
      baseBranch,
    ], { cwd });
    console.log(`✓ Pull Request created:\n${stdout}`);
  } catch (error) {
    console.warn(`⚠ Could not create Pull Request via gh: ${toDisplayError(error).message}`);
  }
}

/**
 * Fetches `baseBranch` from origin and creates+checks out a new branch stacked on top of it,
 * recording the parent relationship in `.dag/config.json` so `dag ship` targets it automatically.
 */
async function handleStack(baseArg: string | undefined, newArg: string | undefined): Promise<void> {
  const baseBranch = (baseArg ?? (await prompter.askQuestion('Enter base branch to stack on: '))).trim();
  if (!baseBranch) {
    throw new Error('Base branch is required.');
  }

  const newBranch = (newArg ?? (await prompter.askQuestion(`Enter new feature branch name (stacked on ${baseBranch}): `))).trim();
  if (!newBranch) {
    throw new Error('New branch name is required.');
  }

  console.log(`Fetching latest changes from origin/${baseBranch}...`);
  await execFileAsync('git', ['fetch', 'origin', baseBranch], { cwd });

  console.log(`Creating and switching to stacked branch "${newBranch}"...`);
  await execFileAsync('git', ['checkout', '-b', newBranch, `origin/${baseBranch}`], { cwd });

  saveLocalConfigUpdates({ STACKED_BASE_BRANCH: baseBranch, ACTIVE_BRANCH: newBranch });
  console.log(`✓ Created and checked out "${newBranch}" stacked on "${baseBranch}".`);
}

/** @returns `true` if `artifactName` exists in the current working directory. */
function hasArtifact(artifactName: string): boolean {
  return fs.existsSync(path.join(cwd, artifactName));
}

/** Counts complete/total atomic tasks in `05-tasks.md` by its `### [ ]`/`### [x]` heading convention. */
function countTasks(): { implementedCount: number; totalTasks: number } {
  let implementedCount = 0;
  let totalTasks = 0;
  const tasksPath = path.join(cwd, TASKS_ARTIFACT);
  if (!fs.existsSync(tasksPath)) {
    return { implementedCount, totalTasks };
  }
  const lines = fs.readFileSync(tasksPath, 'utf-8').split('\n');
  for (const line of lines) {
    if (INCOMPLETE_TASK_HEADING.test(line)) {
      totalTasks++;
    } else if (COMPLETE_TASK_HEADING.test(line)) {
      totalTasks++;
      implementedCount++;
    }
  }
  return { implementedCount, totalTasks };
}

/**
 * Evaluates which pipeline artifacts exist and routes to the next incomplete step,
 * mirroring legacy `dag next`'s `getPipelineStatus`-driven advancer.
 */
async function handleNext(): Promise<void> {
  if (!hasArtifact(REQUIREMENTS_ARTIFACT)) {
    console.log('Next step: Step 0 (Requirements Refinement).');
    return pipelineAdvancer.runStep0();
  }
  if (!hasArtifact(CONTRACTS_ARTIFACT)) {
    console.log('Next step: Step 1 (Contract & Skeptic Audit).');
    return pipelineAdvancer.runStep1();
  }
  if (!hasArtifact(TASKS_ARTIFACT)) {
    console.log('Next step: Step 2 (Layer Decomposition & Merge).');
    return pipelineAdvancer.runStep2();
  }

  const { implementedCount, totalTasks } = countTasks();
  if (totalTasks === 0 || implementedCount < totalTasks) {
    console.log(`Next step: Step 3 (Task Implementation ${implementedCount + 1}/${Math.max(totalTasks, 1)}).`);
    return pipelineAdvancer.runStep3();
  }
  if (!hasArtifact(REVIEW_ARTIFACT)) {
    console.log('Next step: Step 4 (Full-Repo Impact Review).');
    return pipelineAdvancer.runStep4();
  }

  console.log('✓ All pipeline stages are complete.');
  const shipAnswer = await prompter.askQuestion('Ship Pull Request now (`dag ship`)? (y/n): ');
  const normalized = shipAnswer.trim().toLowerCase();
  if (!normalized || normalized === 'y' || normalized === 'yes') {
    return handleShip();
  }
}

/** Prints `.dagrules` (team-wide) and `.dagrules.local` (repository-local) contents, mirroring legacy `dag rules`. */
function handleRules(args: string[]): void {
  const [subcommand] = args;
  if (subcommand !== undefined) {
    console.log(`Rule management subcommand "${subcommand}" is not available in this CLI; showing active rules instead.`);
  }

  const teamRulesPath = path.join(cwd, RULES_FILENAME);
  const localRulesPath = path.join(cwd, RULES_LOCAL_FILENAME);

  if (fs.existsSync(teamRulesPath)) {
    console.log(`--- ${RULES_FILENAME} ---`);
    console.log(fs.readFileSync(teamRulesPath, 'utf-8'));
  } else {
    console.log(`No ${RULES_FILENAME} file found.`);
  }

  if (fs.existsSync(localRulesPath)) {
    console.log(`--- ${RULES_LOCAL_FILENAME} ---`);
    console.log(fs.readFileSync(localRulesPath, 'utf-8'));
  }
}

interface ServiceRegistryEntry {
  readonly name: string;
  readonly path: string;
}

function isServiceRegistryEntry(value: unknown): value is ServiceRegistryEntry {
  return isPlainRecord(value) && typeof value.name === 'string' && typeof value.path === 'string';
}

function readServiceRegistry(): ServiceRegistryEntry[] {
  const registryPath = path.join(configuration.dagDir, SERVICES_REGISTRY_FILENAME);
  if (!fs.existsSync(registryPath)) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    return Array.isArray(parsed) ? parsed.filter(isServiceRegistryEntry) : [];
  } catch {
    return [];
  }
}

function writeServiceRegistry(entries: ServiceRegistryEntry[]): void {
  const registryPath = path.join(configuration.dagDir, SERVICES_REGISTRY_FILENAME);
  fs.mkdirSync(configuration.dagDir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(entries, null, 2), 'utf-8');
}

/** Links, unlinks, or lists linked microservices/monorepo packages, mirroring legacy `dag service`. */
async function handleService(args: string[]): Promise<void> {
  const [subcommand, nameArg, pathArg] = args;

  if (subcommand === 'link') {
    const name = (nameArg ?? (await prompter.askQuestion('Enter service name: '))).trim();
    const targetPath = (pathArg ?? (await prompter.askQuestion('Enter path to service folder: '))).trim();
    if (!name || !targetPath) {
      throw new Error('Usage: dag service link <name> <path>');
    }
    const registry = readServiceRegistry().filter((entry) => entry.name !== name);
    registry.push({ name, path: targetPath });
    writeServiceRegistry(registry);
    console.log(`Linked service "${name}" -> ${targetPath}`);
    return;
  }

  if (subcommand === 'unlink') {
    const name = (nameArg ?? (await prompter.askQuestion('Enter service name to unlink: '))).trim();
    const registry = readServiceRegistry();
    const remaining = registry.filter((entry) => entry.name !== name);
    if (remaining.length === registry.length) {
      console.log(`Service "${name}" was not linked.`);
      return;
    }
    writeServiceRegistry(remaining);
    console.log(`Unlinked service "${name}".`);
    return;
  }

  const registry = readServiceRegistry();
  if (registry.length === 0) {
    console.log('No linked services found.');
  } else {
    for (const entry of registry) {
      console.log(`- ${entry.name} -> ${entry.path}`);
    }
  }
  console.log('Usage:\n  dag service link <name> <path>\n  dag service unlink <name>');
}

/** Reports which pipeline artifacts exist for the active workspace, mirroring legacy `dag verify`/`dag audit`. */
async function handleVerify(): Promise<void> {
  console.log('Verifying pipeline artifacts...');
  const artifacts: ReadonlyArray<[string, string]> = [
    [REQUIREMENTS_ARTIFACT, 'Requirements'],
    [CONTRACTS_ARTIFACT, 'Contracts'],
    [TASKS_ARTIFACT, 'Tasks'],
    [REVIEW_ARTIFACT, 'Review'],
  ];
  for (const [artifact, label] of artifacts) {
    console.log(`${hasArtifact(artifact) ? '✓' : '○'} ${label} (${artifact})`);
  }
  const { implementedCount, totalTasks } = countTasks();
  console.log(`Tasks: ${implementedCount}/${totalTasks} implemented.`);
}

/** Activates a stored feature workspace as current, mirroring legacy `dag switch`/`dag activate`/`dag restore`. */
async function handleSwitch(nameArg: string | undefined): Promise<void> {
  const targetName = (nameArg ?? (await prompter.askQuestion('Enter feature name to activate: '))).trim();
  if (!targetName) {
    throw new Error('No feature specified.');
  }
  unwrapOrThrow(workspaceService.activateFeatureWorkspace(targetName));
  console.log(`Workspace "${targetName}" is now active.`);
}

/** Restores an archived feature workspace to the active features folder, mirroring legacy `dag unarchive`. */
async function handleUnarchive(nameArg: string | undefined): Promise<void> {
  const targetName = (nameArg ?? (await prompter.askQuestion('Enter archived feature name to unarchive: '))).trim();
  if (!targetName) {
    throw new Error('No feature specified.');
  }
  unwrapOrThrow(workspaceService.unarchiveFeatureWorkspace(targetName));
  console.log(`Feature "${targetName}" restored to active features.`);
}

/** Clears pipeline artifacts for the active workspace after confirmation, mirroring legacy `dag clean`. */
async function handleClean(): Promise<void> {
  const targetName = resolveActiveWorkspaceName();
  if (!targetName) {
    throw new Error('No active workspace to clean.');
  }
  const confirmation = await prompter.askQuestion('Are you sure you want to remove all pipeline artifacts? (y/N): ');
  if (confirmation.trim().toLowerCase() !== 'y') {
    console.log('Clean aborted.');
    return;
  }
  unwrapOrThrow(workspaceService.cleanArtifacts(targetName));
  console.log(`Cleaned pipeline artifacts for "${targetName}".`);
}

/** Prints the active workspace's pipeline status, mirroring legacy `dag status`. */
async function handleStatus(): Promise<void> {
  const targetName = resolveActiveWorkspaceName();
  if (!targetName) {
    console.log('No active workspace.');
    return;
  }
  const status = unwrapOrThrow(workspaceService.getPipelineStatus(targetName));
  console.log(JSON.stringify(status, null, 2));
}

/** Prints available cost/token telemetry, mirroring legacy `dag stats`/`dag benchmark` (no telemetry Use Case exists yet). */
async function handleStats(): Promise<void> {
  console.log('No cost/token telemetry recorded yet.');
}

/** Runs the full pipeline end-to-end, reusing existing artifacts when present, mirroring legacy `dag all`/`dag run`. */
async function handleAll(args: string[]): Promise<void> {
  if (!hasArtifact(REQUIREMENTS_ARTIFACT)) {
    await pipelineAdvancer.runStep0();
  } else {
    console.log(`Found existing ${REQUIREMENTS_ARTIFACT}; reusing it and skipping Step 0.`);
  }

  if (!hasArtifact(CONTRACTS_ARTIFACT)) {
    await pipelineAdvancer.runStep1();
  } else {
    console.log(`Found existing ${CONTRACTS_ARTIFACT}; reusing it and skipping Step 1.`);
  }

  if (!hasArtifact(TASKS_ARTIFACT)) {
    await pipelineAdvancer.runStep2();
  } else {
    console.log(`Found existing ${TASKS_ARTIFACT}; reusing it and skipping Step 2.`);
  }

  void args;
  await pipelineAdvancer.runStep3();
  await pipelineAdvancer.runStep4();
}

/** Launches the DeepSeek Harness web dashboard, mirroring legacy `dag web`/`dag dsh`. */
function handleWeb(): void {
  console.log('Launching DeepSeek Harness Web Dashboard...');
  const dshProcess = spawn('npx', [DSH_WEB_PACKAGE, 'web'], { stdio: 'inherit', cwd });
  dshProcess.on('error', (error) => {
    console.error(`Failed to launch dsh: ${toDisplayError(error).message}`);
  });
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
    case 'commit':
      return handleCommit();
    case 'ship':
      return handleShip();
    case 'stack':
      return handleStack(parsed.args[0], parsed.args[1]);
    case 'next':
      return handleNext();
    case 'step0':
    case 'step1':
    case 'step2':
    case 'step3':
    case 'step4':
      return handleStep(parsed.type);
    case 'rules':
      return handleRules(parsed.args);
    case 'service':
      return handleService(parsed.args);
    case 'verify':
      return handleVerify();
    case 'switch':
      return handleSwitch(parsed.args[0]);
    case 'unarchive':
      return handleUnarchive(parsed.args[0]);
    case 'clean':
      return handleClean();
    case 'status':
      return handleStatus();
    case 'stats':
      return handleStats();
    case 'all':
      return handleAll(parsed.args);
    case 'web':
      return handleWeb();
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
