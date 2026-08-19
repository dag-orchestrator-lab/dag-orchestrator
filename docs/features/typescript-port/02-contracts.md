# Contracts — Strict TypeScript Port for DAG Orchestrator

Frozen at Gate 1. Layer plans conform to this document or raise a conflict.

## In one paragraph

The DAG Orchestrator CLI (`dag`) is being rewritten file-for-file from JavaScript into strict TypeScript, with no new commands, no behavior changes, and no visual changes — the only observable difference after this feature ships is that the codebase now type-checks with zero `any` and ships `.d.ts` declarations. If a user runs any of the 12 existing commands before and after the port, the terminal output must be byte-for-byte identical.

## Ubiquitous language

_Plain: the words this feature uses and what they actually mean here — especially any word that already means something different elsewhere in the system._

* **Port** — a mechanical, behavior-preserving rewrite of a `.js` file into a `.ts` file with equivalent runtime semantics. Not a rewrite in the DDD "port/adapter" sense elsewhere in this template (see the Ports section below, which is unrelated and uses the word in its usual hexagonal-architecture sense — flagged here to avoid confusion between the two uses).
* **Leaf module** — a source file with no internal dependencies on other `src/` modules (Phase 1: `ui`, `metrics`, `rules`).
* **Core engine module** — a source file that depends on leaf modules but not on the CLI entrypoint (Phase 2: `config`, `services`, `verifier`, `ui-design`, `state`).
* **SDK adapter** — a thin module wrapping an external LLM vendor SDK (`gemini`, `claude`) behind an internal interface; distinct from the third `provider` adapter (`src/providers/openai.js`) which recon found but requirements do not mention migrating explicitly — see Non-goals.
* **Zero explicit `any` policy** — no token `any` may appear as a type annotation, cast, or generic parameter anywhere in `src/`, `bin/`, or `dagrules`; `unknown` with a narrowing guard is the only escape hatch.
* **Behavior parity / logic parity** — the property that a Vitest run against the ported module produces identical outputs to the same scenario run against the pre-port JS module.

## Bounded context

_Plain: which team's territory this lives in, and who else it touches._

This entire feature lives inside a single bounded context: the DAG Orchestrator CLI Engine (`dag`), covering `bin/` and `src/`. Per recon, there are no internal shared packages and no other services in this repository — it is a monolithic single-package CLI. No other bounded context is affected; the boundary crossed is external, not internal: the `gemini` and `claude` SDK adapters cross into third-party vendor SDKs, which is why those two modules get dedicated `.d.ts` treatment in Phase 4 rather than being ported inline with Phase 2.

## Aggregates and invariants

_Plain: the rules this feature must never break, stated as things that would be visibly wrong if they broke — not as formal invariants._

There are no new business-domain aggregates — this feature ports existing modules, it does not introduce new persistent entities or new domain identities. The invariants that matter here are migration invariants, each testable via Vitest + `tsc`:

* **Compile invariant:** `npm run typecheck` (`tsc --noEmit`) exits `0` under `strict: true` and `noImplicitAny: true`, for every commit after a module's Phase is complete. Assertion: `tsc --noEmit` exit code === 0.
* **No-`any` invariant:** grepping `src/`, `bin/`, and `dagrules` for the literal token `any` used as a type (not as part of another identifier or a comment) returns zero matches at every commit boundary after a file is ported. Assertion: `grep -rn '\bany\b' <ported files>` matches only comments/strings, never a type position.
* **Build invariant:** `npm run build` emits both `.js` and `.d.ts` for every ported file into `dist/`, and `dist/bin/dag.d.ts` exists and is non-empty. Assertion: file exists at `dist/bin/dag.d.ts`, `dist/**/*.js` count matches ported source count.
* **Behavior-parity invariant:** for every one of the 12 commands (`refine`, `contract`, `layers`, `next`, `review`, `doctor`, `stats`, `status`, `service`, `stack`, `config`, `verify`), a captured baseline stdout/stderr/exit-code from the JS version equals the ported TS version's output for the same input. Assertion: string equality of captured terminal output, byte-for-byte, including ANSI escape codes.
* **Migration-order invariant:** a module is never ported before its dependencies (per the Phase 1→4 ordering in Requirements §3). Assertion: at the commit where module X is converted to `.ts`, every module X imports is already `.ts` or is untouched-and-still-`.js`-and-not-yet-in-scope — TS is not allowed to import a partially-typed sibling out of order.

## Ports

_Plain: what this feature needs from the outside world, and what it promises back — described as a conversation, not a signature list._

The codebase talks to two external LLM vendor SDKs (Gemini, Claude/Anthropic) and to the local filesystem/process environment (config files, `dagrules`, stdin/stdout, process exit codes). This feature does not change what is asked of those SDKs — it only wraps the existing untyped calls in typed adapter interfaces so the compiler can verify call shapes instead of trusting them at runtime.

```typescript
// src/providers/types.d.ts (new — no existing precedent per recon §5)

/** Narrow, adapter-owned shape — not the full vendor SDK surface. */
export interface LLMRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  raw: unknown; // vendor payload, narrowed by the adapter before use — never cast to any
}

export interface LLMAdapter {
  readonly name: "gemini" | "claude";
  send(request: LLMRequest): Promise<LLMResponse>;
}

// src/gemini.ts and src/claude.ts each export a concrete LLMAdapter implementation.
// src/providers/index.ts continues to select/compose adapters; its exact selection
// logic is preserved as-is from src/providers/index.js (Non-goals: no new providers).
```

Recon found no existing type precedent for these SDK boundaries (recon §5, §6) — the shapes above are the first typed contract for them and must be validated against each adapter's actual runtime payloads during Phase 4, since exact third-party type coverage is "undetermined from code alone" per recon §6.

## Events

_Plain: what announcement this feature makes when something happens, and who else is listening for it._

None. This is a single-process CLI with no event bus, message queue, or pub/sub mechanism — recon confirms no internal shared packages or cross-service integration exist (recon §3). Nothing here changes that.

## Data

_Plain: what's being stored, and what would go wrong if a row were missing, duplicated, or malformed._

None in the database sense — there are no tables, stored procedures, or migrations. The only persistent artifacts are: local config/rule files read by `src/config.ts` and `src/rules.ts` (format unchanged by this port — Requirements §4 requires "configuration parsing... identical"), and the build output directory `dist/` (JS + `.d.ts`, regenerated on every `npm run build`, never hand-edited or checked in as source of truth).

## API surface

_Plain: what a caller sends and what they get back, walked through as an example request and response — not just the schema._

There is no HTTP/RPC API — the "surface" here is the CLI command surface, and per Requirements §4/§7 it is a preservation contract, not a design one: every one of the 12 commands takes the same arguments and produces the same stdout/stderr/exit code after the port as before.

Example: a caller runs `dag status` today (pre-port, JS) and gets some ANSI-formatted status card plus exit code `0`. After the port, running `dag status` (now executing compiled output from `dag.ts` → `dist/bin/dag.js`) with the same working directory and config must print the identical card, byte-for-byte, and exit `0`. No flag, subcommand, prompt wording, or error message may be added, removed, or reworded (Requirements §2 Out of Scope: "New CLI commands, subcommands, or options" is explicitly excluded).

```typescript
// bin/dag.ts — entrypoint shape is preserved, only types are added
export type Command =
  | "refine" | "contract" | "layers"
  | "next" | "review" | "doctor"
  | "stats" | "status" | "service"
  | "stack" | "config" | "verify";
```

## UI/UX & Visual Contract (Frontend Features)

_Plain: how the user visually perceives and interacts with this interface across all states and screen sizes._

Not applicable in the web-frontend sense — there is no browser UI, no components, no responsive breakpoints, no ARIA. The equivalent contract here is the **terminal contract**: ANSI cards, box-drawing characters, colors, and prompt text rendered by `src/ui.ts` and `src/ui-design.ts` must be pixel-for-pixel (character-for-character) identical to the JS baseline (Requirements §2 Out of Scope: "Altering ANSI terminal cards, formatting, or console output styles"; §4: "String rendering, colors, box drawings, and CLI prompts must match byte-for-byte"). There are no component states (Idle/Loading/Error/Empty/Disabled) to define beyond what the existing JS already renders — the port must not introduce or remove any of them. No `data-testid`-equivalent instrumentation exists or is required for a CLI.

## Failure semantics

_Plain: what happens when this goes wrong — retried automatically, retried by a human, or silently dropped — and how would you notice._

Existing failure behavior (error messages, exit codes, retry logic inside `src/verifier.ts`, `src/services.ts`, and the provider adapters) is preserved exactly as-is — this port must not add, remove, or alter any retry, timeout, or error-reporting logic (Requirements §2 Out of Scope: "Refactoring business logic"). What's new is a second, migration-specific failure mode:

* **Type-check failure:** if `tsc --noEmit` fails on a module after conversion, that module's Phase is not complete — this is caught at build/CI time, not at runtime, and is not user-visible in the shipped CLI. Logged as a build error (non-negotiable, blocks merge), not WARN/ERROR at the application-log level since there is no application logger involved.
* **Behavior-parity failure:** if a Vitest baseline comparison diverges after a file is ported (see Aggregates invariant), that is a regression bug in the port, not a legitimate runtime error — it must be fixed before the module's Phase is considered done, and is caught by CI (Vitest run), not by a human watching logs.
* **SDK adapter failure (Phase 4):** unchanged from current behavior — whatever `src/gemini.js`/`src/claude.js` currently do on a failed vendor call (error propagation, message shown to user) must do the identical thing after typing, since `unknown`-narrowing is only a compile-time discipline and must not alter the runtime error path.

## Non-goals

_Plain: what people might reasonably expect this to do that it deliberately does not._

* Does not add, remove, or change any CLI command, subcommand, flag, or prompt (Requirements §2).
* Does not refactor business logic, visual design, performance, or code style beyond what's mechanically required to satisfy the type checker (Requirements §2).
* Does not run JS and TS side-by-side — there is no dual/hybrid transition phase; each module is atomically converted (Requirements §2).
* Does not introduce a test framework beyond Vitest, and does not backfill exhaustive test coverage beyond what's needed to establish behavior-parity baselines — recon confirms no test fixtures or baseline payloads currently exist (recon §6), so Phase 1 work includes authoring minimal baseline fixtures, not a full test suite.
* Does not commit to migrating `src/providers/openai.js` or `src/providers/index.js` on a stated schedule — Requirements §3's four phases enumerate `gemini` and `claude` explicitly for Phase 4 but are silent on `openai`/`providers/index`; treat those as deferred until a follow-up requirements pass explicitly schedules them, and do not block Phase 4 completion on them.
* Does not change `package.json`'s public npm metadata (name, version, license) beyond the additions explicitly listed in Requirements §6.