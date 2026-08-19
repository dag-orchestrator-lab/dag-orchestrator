There are no open questions or unconfirmed assumptions. All architectural constraints, module migration order, SDK handling, testing tools, and boundary conditions have been fully clarified.

Here is the complete requirements document:

---

# Feature: Strict TypeScript Port for DAG Orchestrator

## 1. Executive Summary & Objectives
Port the DAG Orchestrator codebase from JavaScript (v0.1.0-alpha) to 100% strict TypeScript. The goal is to achieve total type safety, compile-time validation, and full definition generation (`.d.ts`) with **zero functional or runtime behavior regressions**.

## 2. Scope & Target Architecture

### In Scope
* **Language & Compiler:** Target Node.js 20+ using ES Modules (`ESNext` / `NodeNext`).
* **Compiler Configuration:** Strict TypeScript (`tsconfig.json` with `"strict": true`, `"noImplicitAny": true`, `"declaration": true`, `"outDir": "dist"`).
* **Source File Conversion:** Rename and port all `.js` source files under `src/` and `bin/` directly to `.ts`.
* **Zero Explicit `any` Policy:** Explicit `any` casts are strictly prohibited across all modules and `dagrules`. Strong types, interfaces, generics, or `unknown` with narrowers must be used instead.
* **SDK Adapters:** Custom type declaration files (`.d.ts`) and adapter interfaces for external LLM SDKs (`gemini` and `claude`).
* **Test Suite Configuration:** Set up and configure `Vitest` as the standard test runner to establish baseline functional checks and verify logic parity.
* **Package Scripts & Exports:** Update `package.json` with `"build"`, `"typecheck"`, `"test"`, and set `"types": "dist/bin/dag.d.ts"`.

### Out of Scope
* Dual JS/TS co-existence or hybrid transition phase.
* New CLI commands, subcommands, or options.
* Refactoring business logic for visual design, performance, or code style cleanup.
* Altering ANSI terminal cards, formatting, or console output styles.

---

## 3. Ordered Migration Strategy

Migration must proceed in strict dependency order, validating logic at each phase:

1. **Phase 1 — Leaf Modules:**
   * `src/ui.ts`
   * `src/metrics.ts`
   * `src/rules.ts`
2. **Phase 2 — Core Engine Modules:**
   * `src/config.ts`
   * `src/services.ts`
   * `src/verifier.ts`
   * `src/ui-design.ts`
   * `src/state.ts`
3. **Phase 3 — CLI Entrypoint:**
   * `bin/dag.ts`
4. **Phase 4 — Integration & Third-Party SDK Adapters:**
   * Custom `.d.ts` definitions and adapters for `gemini` and `claude` modules.

---

## 4. Functional & Command Preservation Matrix

All existing CLI commands and runtime behaviors must perform identically to JS v0.1.0-alpha:

| Command / Component | Functional Preservation Requirement |
| :--- | :--- |
| `refine`, `contract`, `layers` | Core DAG definition parsing, structural validation, and output formats intact. |
| `next`, `review`, `doctor` | Traversal state machine logic, condition checks, and error reports identical. |
| `stats`, `status`, `service` | Aggregation computations, telemetry processing, and service orchestration logic identical. |
| `stack`, `config`, `verify` | Configuration parsing, rule verification engine, and runtime checks identical. |
| Terminal Output & ANSI Cards | String rendering, colors, box drawings, and CLI prompts must match byte-for-byte. |
| Regex Parsers | Exact matching behavior and capture group output preserved without modification. |

---

## 5. Non-Functional Constraints & Build Requirements

* **Node.js Environment:** Target Node.js >= 20.x LTS.
* **Module System:** Pure ES Modules (`"type": "module"` in `package.json`).
* **Type Strictness:**
  * `"strict": true`
  * `"noImplicitAny": true`
  * Zero explicit `any` usage permitted anywhere in `src/`, `bin/`, or `dagrules`.
* **Build Artifacts:**
  * JavaScript output emitted to `dist/`.
  * TypeScript declaration files (`.d.ts`) emitted to `dist/`.

---

## 6. Project Configuration Specifications

### `package.json` Additions
```json
{
  "type": "module",
  "types": "dist/bin/dag.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

### `tsconfig.json` Specification
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "bin/**/*"]
}
```

---

## 7. Acceptance Criteria

1. **Baseline Logic Verification:**
   * Vitest test suite executes and passes baseline functional checks prior to and following file conversions.
2. **Type Checking:**
   * `npm run typecheck` completes with `0` errors under `"strict": true` and `"noImplicitAny": true`.
   * No `any` type overrides exist in application modules or `dagrules`.
3. **Build Success:**
   * `npm run build` compiles successfully, outputting `.js` and `.d.ts` files into `dist/`.
   * Primary entrypoint type definitions are accessible at `dist/bin/dag.d.ts`.
4. **Zero Functional Regressions:**
   * All 12 CLI commands (`refine`, `contract`, `layers`, `next`, `review`, `doctor`, `stats`, `status`, `service`, `stack`, `config`, `verify`) execute with identical behavior, prompt responses, terminal cards, and ANSI formatting as JavaScript v0.1.0-alpha.