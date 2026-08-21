# 🏛️ DAG Orchestrator TypeScript & Architecture Rules

## 1. Type Safety & TypeScript Standards
- **No \`any\`**: Explicit \`any\` is strictly prohibited. Use strong interfaces, generics, or \`unknown\` with explicit type narrowing guards.
- **No Type Forcing**: Do NOT use \`as unknown as T\` or loose assertions to bypass the compiler; properly model types and handle nullish states.
- **Enums vs Unions**: Prefer string union types (\`type Status = 'ACTIVE' | 'PAUSED' | 'SHIPPED'\`) or \`as const\` object maps over TypeScript \`enum\`.
- **Strict NodeNext ESM**: All relative internal imports must include explicit \`.js\` extensions (e.g. \`import { slugify } from './state.js';\`) to adhere to TypeScript \`NodeNext\` ESM module resolution.

## 2. Naming & Constants (Zero Magic Literals)
- **No Magic Strings or Numbers**: All default timeouts, retry counts, artifact filenames, and state keys must be declared as uppercase exported constants in \`src/types/\` or module heads.
- **Descriptive Naming**:
  - Functions must be verb-first (\`archiveFeatureWorkspace\`, \`extractConventionsFromRecon\`, \`verifyContractSpec\`).
  - Types and Interfaces must be PascalCase nouns (\`PipelineStatus\`, \`FeatureContextMeta\`, \`VerificationResult\`).
  - Boolean variables must use prefixes like \`is\`, \`has\`, \`should\`, or \`can\` (\`isCurrent\`, \`hasContracts\`, \`gate1Approved\`).

## 3. Comments & Documentation Standards
- **Inline Comments**: Strictly 1 sentence/line maximum, reserved only for non-obvious algorithms or critical edge-case rationale. Never explain *what* the code does (code must be self-explanatory); only explain *why* a non-standard choice was made.
- **Reusable / Exported Utilities**: All exported module functions must carry concise TSDoc / JSDoc comments defining \`@param\`, \`@returns\`, and \`@throws\` if applicable.

## 4. Architecture & Testability
- **Pure Core, Impure Shell**: Separate pure logic (parsing, regex audits, state transitions, metric cost formulas) from impure side-effects (disk IO, child process execution, console prompts) to enable clean unit testing.
- **TDD Requirement**: Every pure module function in \`src/state.ts\`, \`src/verifier.ts\`, \`src/rules.ts\`, and \`src/metrics.ts\` must have a corresponding Vitest test suite (\`__tests__/*.test.ts\`) covering normal paths, error cases, and boundary conditions.
- **Subprocess Safety**: Never perform unescaped string interpolation into shell commands; pass arguments as arrays to \`spawn\` / safe exec helpers.
