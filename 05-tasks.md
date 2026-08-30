## Conflicts

- Domain plan never creates `src/domain/orchestration/agents/planner-agent.ts` — the exact path the frozen contract fixes for the `SubAgentBase`/`PlannerAgent` declaration. Domain plan instead places `SubAgentBase` in `ports/sub-agent-base.ts`, while the app-infra adapter imports `SubAgentBase` from `../../../domain/orchestration/agents/planner-agent`, a file no plan actually creates. Resolved per contract: the contract-shaped `SubAgentBase`/`PlannerAgent` interface pairing must exist at `src/domain/orchestration/agents/planner-agent.ts`, re-exporting/aliasing the `ports/sub-agent-base.ts` definition so both paths resolve to the same type.
- `AgentExecutionError` per domain plan requires `(featureId, runId, message, code?)`, but app-infra plan repeatedly constructs it as `new AgentExecutionError(message)` (single string arg) in `plan-task-execution-use-case.ts` and `parallel-layer-planning-service.ts`. Domain plan wins (it owns the error type); every app-infra call site must be corrected to pass `featureId` and `runId`.
- Domain plan's pre-flight verifier is the `PreFlightVerifier` class (`validation/pre-flight-verifier.ts`, method `.verify()`), but app-infra plan imports a non-existent function `verifyTaskChecklist` from `validation/task-checklist-verifier.ts`. Domain plan wins; app-infra must call `new PreFlightVerifier().verify(content)` and adapt to its `PreFlightVerificationResult` shape.
- App-infra plan imports `LayerPlanType` from `domain/orchestration/value-objects/layer-plan-type.ts`, a module no plan defines and which is unused in that file. Domain plan has no `value-objects/` directory — `LayerType` in `models/artifact-path.ts` is the real type. The import must be dropped.
- Domain plan's `workspace-file-system-port.ts` defines `WorkspaceFileNotFoundError`/`WorkspaceWriteError` inline in the port file itself, while data plan's port excerpt imports them from separate `errors/workspace-file-not-found-error.ts` / `errors/workspace-write-error.ts` modules. Resolved in favor of domain plan's own `errors/` directory convention: both classes move to `src/domain/orchestration/errors/`, and the port file imports them from there.

---

### [ ] T-1 Add PlanningRunId and ArtifactPath value objects
Depends on: none
Lane: change
Files: src/domain/orchestration/models/planning-run-id.ts, src/domain/orchestration/models/artifact-path.ts
Done when: `PlanningRunId.create` rejects empty featureId/runId and exposes `toString`/`equals`; `ArtifactPath`/`StageName`/`LayerType` types and their two mapping functions compile and cover all five artifacts.
Check: npm test -- src/domain/orchestration/models/__tests__/planning-run-id.test.ts src/domain/orchestration/models/__tests__/artifact-path.test.ts

### [ ] T-2 Add LayerPlan, LayerFindings, TaskItem, TaskChecklist models
Depends on: T-1
Lane: change
Files: src/domain/orchestration/models/layer-plan.ts, src/domain/orchestration/models/layer-findings.ts, src/domain/orchestration/models/task-item.ts, src/domain/orchestration/models/task-checklist.ts
Done when: `LayerPlan.create`/`LayerFindings.create` throw on empty content; `TaskItem.isValid()` is true iff both `hasFiles()` and `hasCheckCommand()`; `TaskChecklist.isFullyValid()` is false for an empty task list.
Check: npm test -- src/domain/orchestration/models/__tests__/task-checklist.test.ts

### [ ] T-3 Add domain errors: AgentExecutionError, InvalidTaskChecklistError, AutoHealExhaustedError, WorkspaceFileNotFoundError, WorkspaceWriteError
Depends on: T-1
Lane: shared
Files: src/domain/orchestration/errors/agent-execution-error.ts, src/domain/orchestration/errors/invalid-task-checklist-error.ts, src/domain/orchestration/errors/auto-heal-exhausted-error.ts, src/domain/orchestration/errors/workspace-file-not-found-error.ts, src/domain/orchestration/errors/workspace-write-error.ts
Done when: `AgentExecutionError` constructor signature is `(featureId, runId, message, code?)` and all five error classes extend `Error` with correct `.name`; resolves the Conflicts-section item on error constructor shape and error-class file location.
Check: npm test -- src/domain/orchestration/errors/__tests__/*.test.ts

### [ ] T-4 Add ports: SubAgentBase, LlmClientPort, WorkspaceFileSystemPort, IpcBusPort
Depends on: T-2, T-3
Lane: shared
Files: src/domain/orchestration/ports/sub-agent-base.ts, src/domain/orchestration/agents/planner-agent.ts, src/domain/orchestration/ports/llm-client-port.ts, src/domain/orchestration/ports/workspace-file-system-port.ts, src/domain/orchestration/ports/ipc-bus-port.ts
Done when: `src/domain/orchestration/agents/planner-agent.ts` exists and exports the same `SubAgentBase` type as `ports/sub-agent-base.ts` (resolving the Conflicts-section path mismatch); `WorkspaceFileSystemPort` imports its two error types from `errors/` rather than declaring them inline; `LlmClientPort.complete` keeps `options` optional per the contract's backward-compatible-extension rule.
Check: npx tsc --noEmit -p src/domain/orchestration

### [ ] T-5 Add StageCompleteEvent and OrchestrationEventMap
Depends on: T-1
Lane: change
Files: src/domain/orchestration/events/stage-complete-event.ts, src/domain/orchestration/events/event-map.ts
Done when: `StageCompletePayload.stageName` is restricted to the five `StageName` values and `OrchestrationEventMap.STAGE_COMPLETE` types to `StageCompletePayload`.
Check: npx tsc --noEmit -p src/domain/orchestration

### [ ] T-6 Add AgentContext and AgentResult models
Depends on: T-1
Lane: shared
Files: src/domain/orchestration/models/agent-context.ts, src/domain/orchestration/models/agent-result.ts
Done when: `AgentContext` carries at minimum `{ featureId, runId }`; `AgentResult.artifactsProduced` types as `readonly ArtifactPath[]` and `status` is `'COMPLETED' | 'FAILED'`.
Check: npx tsc --noEmit -p src/domain/orchestration

### [ ] T-7 Add PreFlightVerifier domain service
Depends on: T-2, T-3
Lane: change
Files: src/domain/orchestration/validation/pre-flight-verifier.ts
Done when: `PreFlightVerifier.verify(markdown)` parses `- [ ] <id>: <title>` blocks with `Files:`/`Check:` lines, returns `isValid: false` with a `missingFieldsSummary` entry for any task missing either field, and `isValid: true` with an empty summary when every task has both.
Check: npm test -- src/domain/orchestration/validation/__tests__/pre-flight-verifier.test.ts

### [ ] T-8 Add TaskMergerService domain service
Depends on: T-2
Lane: change
Files: src/domain/orchestration/services/task-merger-service.ts
Done when: `buildMergePromptContext` concatenates all three layer plans and the findings content under labeled headers, using empty string for any missing layer (never throwing on a missing layer).
Check: npm test -- src/domain/orchestration/services/__tests__/task-merger-service.test.ts

### [ ] T-9 Add PlanningRun aggregate
Depends on: T-2, T-3, T-6
Lane: change
Files: src/domain/orchestration/aggregates/planning-run.ts
Done when: `recordLayerPlan` transitions to `LAYER_PLANS_GENERATED` only once all three layers are recorded; `requestAutoHeal` throws `AutoHealExhaustedError` and sets state `FAILED` on a second call (enforces contract Invariant 3); `completeRun` throws unless `05-tasks.md` is in `writtenArtifacts` and the checklist `isFullyValid()` (enforces Invariant 1).
Check: npm test -- src/domain/orchestration/aggregates/__tests__/planning-run.test.ts

### [ ] T-10 Add ParallelLayerPlanningService (application)
Depends on: T-4, T-9
Lane: change
Files: src/application/orchestration/services/parallel-layer-planning-service.ts
Done when: the three layer-plan LLM calls run via `Promise.all` with none depending on another's output (contract Invariant 4); every `AgentExecutionError` construction passes `featureId`/`runId` per the Conflicts resolution; **BLOCKER constraint from 04-findings.md**: each per-layer branch (`executeSingleLayer`) checks a per-invocation cancellation/run-identity guard immediately before `workspaceFs.writeFile` and again before `ipcBus.publish`, and no-ops if the guard no longer matches the active `(featureId, runId)` — preventing a Lambda-frozen sibling promise from a rejected `Promise.all` resuming on a later, unrelated invocation and corrupting its S3 writes/EventBridge events.
Check: npm test -- src/application/orchestration/services/__tests__/parallel-layer-planning-service.test.ts

### [ ] T-11 Add TaskChecklistOrchestrator (application)
Depends on: T-4, T-7, T-8
Lane: change
Files: src/application/orchestration/services/task-checklist-orchestrator.ts
Done when: merge/verify/auto-heal calls `new PreFlightVerifier().verify(...)` (not the non-existent `verifyTaskChecklist`, per Conflicts resolution); on first verification failure it fires exactly one auto-heal LLM call and re-verifies; on second failure it returns `Err(AgentExecutionError)` without writing `05-tasks.md` or publishing `STAGE_COMPLETE` (enforces Invariant 1 and Invariant 3); on success it writes then publishes, in that order (enforces Invariant 5).
Check: npm test -- src/application/orchestration/services/__tests__/task-checklist-orchestrator.test.ts

### [ ] T-12 Add PlanTaskExecutionUseCase (application)
Depends on: T-10, T-11
Lane: change
Files: src/application/orchestration/plan-task-execution-use-case.ts, src/application/orchestration/dto/plan-task-execution-command.ts, src/application/orchestration/dto/planning-execution-result.ts
Done when: missing `02-contracts.md` or `01-recon.md` short-circuits with `Err(AgentExecutionError)` before any LLM call (contract API-surface example); on full success returns `Ok(AgentResult)` with all five `artifactsProduced` entries and `status: 'COMPLETED'`; no `value-objects/layer-plan-type` import remains (Conflicts resolution).
Check: npm test -- src/application/orchestration/__tests__/plan-task-execution-use-case.test.ts

### [ ] T-13 Add planner prompt templates (infrastructure)
Depends on: T-4
Lane: change
Files: src/infrastructure/orchestration/prompts/planner-prompts.ts
Done when: `mergeTaskChecklistPrompt` and `autoHealChecklistPrompt` enforce the required USER-FEEDBACK output contract — raw markdown only, no conversational filler, each task formatted as `### [ ] T-<n> <title>` with `Depends on:`, `Lane:`, `Files:`, `Done when:`, and `Check:` lines — and `autoHealChecklistPrompt` instructs fixing only missing `Files:`/`Check:` fields without altering task scope, order, or the `### [ ] T-<n>` ids.
Check: npm test -- src/infrastructure/orchestration/prompts/__tests__/planner-prompts.test.ts

### [ ] T-14 Add PlannerAgent adapter (infrastructure)
Depends on: T-4, T-12
Lane: change
Files: src/infrastructure/orchestration/adapters/planner-agent-adapter.ts
Done when: `PlannerAgent implements SubAgentBase`, imports the interface from `src/domain/orchestration/agents/planner-agent.ts` (the path fixed in T-4, resolving the Conflicts import-path mismatch), and `run()` delegates to `PlanTaskExecutionUseCase.execute` unchanged.
Check: npx tsc --noEmit -p src/infrastructure/orchestration

### [ ] T-15 Add planner-agent-factory DI wiring
Depends on: T-14
Lane: change
Files: src/infrastructure/orchestration/planner-agent-factory.ts
Done when: `createPlannerAgent(deps)` constructs a `PlannerAgent` from the three injected ports with no additional hidden dependencies.
Check: npm test -- src/infrastructure/orchestration/__tests__/planner-agent-factory.test.ts

### [ ] T-16 Add infrastructure index exports
Depends on: T-14, T-15
Lane: change
Files: src/infrastructure/orchestration/index.ts
Done when: `PlannerAgent`, `createPlannerAgent`, and the `PlannerAgentDependencies` type are all importable from `src/infrastructure/orchestration/index.ts`.
Check: npx tsc --noEmit -p src/infrastructure/orchestration

### [ ] T-17 Add S3 workspace adapter and EventBridge IPC adapter
Depends on: T-4
Lane: change
Files: src/infrastructure/orchestration/adapters/s3-workspace-fs-adapter.ts, src/infrastructure/orchestration/adapters/eventbridge-ipc-bus-adapter.ts
Done when: `S3WorkspaceFileSystemAdapter` implements `WorkspaceFileSystemPort` returning `Err(WorkspaceFileNotFoundError)`/`Err(WorkspaceWriteError)` (per T-3's corrected error location) rather than throwing; `EventBridgeIpcBusAdapter` implements `IpcBusPort.publish` against the `orchestration-events` bus with no new bus introduced.
Check: npm test -- src/infrastructure/orchestration/adapters/__tests__/s3-workspace-fs-adapter.test.ts src/infrastructure/orchestration/adapters/__tests__/eventbridge-ipc-bus-adapter.test.ts

### [ ] T-18 Add Lambda entrypoint handler and serverless wiring
Depends on: T-15, T-17
Lane: change
Files: src/infrastructure/orchestration/lambda/planner-handler.ts, serverless.yml
Done when: the handler filters on `event.detail.agentName === 'planner-agent'`, invokes the agent via `createPlannerAgent`, and rethrows on `Err(AgentExecutionError)` so Lambda reports failure; **BLOCKER constraint from 04-findings.md**: the handler establishes a fresh per-invocation run-identity token (passed through to T-10's cancellation guard) at the top of each invocation so that any zombie promise thawed from a prior frozen container reads a stale token and no-ops instead of writing/publishing against the new invocation's `featureId`/`runId`.
Check: npm test -- src/infrastructure/orchestration/lambda/__tests__/planner-handler.test.ts

### [ ] T-19 Add end-to-end PlannerAgent invariant verification test
Depends on: T-16, T-18
Lane: change
Files: src/infrastructure/orchestration/__tests__/planner-agent.e2e.test.ts
Done when: a full run with fake ports asserts, in order: (1) no LLM call happens if `02-contracts.md`/`01-recon.md` is missing, (2) all five `STAGE_COMPLETE` events are published only after their corresponding `writeFile` resolves, (3) a failing one of the three parallel layer calls prevents any findings/checklist generation, (4) a checklist failing verification twice yields `Err(AgentExecutionError)` without ever writing `05-tasks.md`, (5) a successful run's `05-tasks.md` passes `PreFlightVerifier` and every task traces to content in a layer plan or findings file.
Check: npm test -- src/infrastructure/orchestration/__tests__/planner-agent.e2e.test.ts
