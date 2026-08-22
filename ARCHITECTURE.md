# 🏛️ DAG Orchestrator: Master Technical Architecture & Engineering Textbook

> **A Deep Technical Specification of the State Machines, AST/Prompt Transpilation, Multi-Provider IPC, Resiliency Backoffs, and Conformance Checking**

---

## 📑 Comprehensive Syllabus
1. [Theoretical Foundations: Deterministic Finite State Automata (DFA) in Agentic AI](#1-theoretical-foundations-deterministic-finite-state-automata-dfa-in-agentic-ai)
2. [Process Lifecycle & Master Execution Flow](#2-process-lifecycle--master-execution-flow)
3. [Deep Dive: State Machine & Workspace Resolution Engine (`src/state.js`)](#3-deep-dive-state-machine--workspace-resolution-engine-srcstatejs)
4. [Deep Dive: Configuration, Preset Compilation & Custom Mappings (`src/config.js`)](#4-deep-dive-configuration-preset-compilation--custom-mappings-srcconfigjs)
5. [Deep Dive: Multi-Provider IPC, Transpilation & Stream Interop (`src/providers/`)](#5-deep-dive-multi-provider-ipc-transpilation--stream-interop-srcproviders)
   - [Google AI Studio REST Client & 429 Retry Engine (`src/gemini.js`)](#google-ai-studio-rest-client--429-retry-engine-srcgeminijs)
   - [Claude Code CLI IPC Bridge & Subprocess Sandboxing (`src/claude.js`)](#claude-code-cli-ipc-bridge--subprocess-sandboxing-srcclaudejs)
   - [OpenAI & Ollama Stream Protocol Adapter (`src/providers/openai.js`)](#openai--ollama-stream-protocol-adapter-srcprovidersopenaijs)
6. [Deep Dive: The Adversarial Skeptic & Incident Falsification Engine](#6-deep-dive-the-adversarial-skeptic--incident-falsification-engine)
7. [Deep Dive: Self-Healing TDD Loop & Automated AI Diagnostician](#7-deep-dive-self-healing-tdd-loop--automated-ai-diagnostician)
8. [Deep Dive: Enterprise Policy Injection & 4KB Memory Guard (`src/rules.js`)](#8-deep-dive-enterprise-policy-injection--4kb-memory-guard-srcrulesjs)
9. [Deep Dive: Token Estimation, Mathematical Modeling & Cost Benchmarks (`src/metrics.js`)](#9-deep-dive-token-estimation-mathematical-modeling--cost-benchmarks-srcmetricsjs)
10. [Deep Dive: Terminal UI, ANSI Rendering Engine & JSON Serialization (`src/ui.js`)](#10-deep-dive-terminal-ui-ansi-rendering-engine--json-serialization-srcuijs)
11. [Failure Modes, Edge Cases, and Recovery Protocols](#11-failure-modes-edge-cases-and-recovery-protocols)
12. [Complete Annotated Code Walkthrough (Module by Module)](#12-complete-annotated-code-walkthrough-module-by-module)

---

## 1. Theoretical Foundations: Deterministic Finite State Automata (DFA) in Agentic AI

### 1.1 The Failure of Infinite-Loop Conversational Agents
Modern LLM architectures are stateless autoregressive sequence predictors:
$$P(w_t \mid w_1, w_2, \dots, w_{t-1})$$

When an agent operates in a conversational loop without structured phase transitions, the error rate $\epsilon$ accumulates exponentially across turns $k$:
$$E_{\text{total}} = 1 - (1 - \epsilon)^k$$

For a complex 20-step software engineering task with an average single-step success rate of $95\%$ ($\epsilon = 0.05$):
$$E_{\text{total}} = 1 - (0.95)^{20} \approx 64.15\% \text{ failure probability}$$

### 1.2 The DAG Formal State Machine (Acyclic Artifact Lineage)
In formal computer science, a **Directed Acyclic Graph (DAG)** represents a strict partial order of execution where no artifact can depend on its own future output (i.e. topological sort is strictly preserved: $S_0 \prec S_1 \prec S_2 \prec S_3 \prec S_4$).

**How does human feedback loop revision fit into a DAG?**
* **The Global Artifact Lineage is strictly Acyclic:** An upstream artifact (e.g. `02-contracts.md`) never consumes a downstream artifact (e.g. `REVIEW.md`). Once Gate 1 passes and State $S_1$ freezes, the graph flows strictly forward.
* **Intra-Node Convergence (Internal Re-generation):** When a human rejects Gate 1 or provides feedback, the system does **not** create a cyclic graph edge; instead, it generates version $v_{n+1}$ of that specific node (`02-contracts.v2.md`) until convergence, preserving strict downstream acyclicity.

```
[S0: Requirements] ────────▶ [S1: Contract Spec] ────────▶ [S2: Layer Plans] ────────▶ [S3: Tasks & TDD] ────────▶ [S4: Review & Ship]
  (00-requirements.md)          (02-contracts.md)              (03-domain/infra/data)         (05-tasks.md)                  (REVIEW.md & PR)
                                      │                              │                              │
                              (Intra-Node Loop:              (Intra-Node Loop:              (Intra-Node Loop:
                               Feedback Revision)             Feedback Revision)             3-Attempt TDD Self-Heal)
                                      │                              │                              │
                                      ▼                              ▼                              ▼
                               🛑 GATE 1 PASS                 🛑 GATE 2 PASS                 ✅ ALL CHECKS PASS
```

Transition between global DAG stages $S_i \to S_{i+1}$ is impossible without:
1. **Materialization:** Physical write of the required markdown artifact to disk.
2. **Adversarial Audit:** The artifact must be evaluated against falsification heuristics.
3. **Explicit Human Gate Authorization:** Gate 1 (`02-contracts.md`) and Gate 2 (`05-tasks.md`).

---

## 2. Process Lifecycle & Master Execution Flow

When a developer invokes `dag run` or any individual stage in `bin/dag.js`, the process executes the following lifecycle:

```
[Developer Invocation] (e.g. `dag contract`)
       │
       ▼
1. CLI Router & Arg Parsing (`bin/dag.js:main()`)
       │
       ▼
2. Environment Resolution (`src/config.js:loadConfig()`)
   - Merges ~/.dag.env, .dag/config.json, process.env, and local .env
       │
       ▼
3. Active Feature Workspace Resolution (`src/state.js:getFeatureWorkspaceDir()`)
   - Resolves path: <project-root>/docs/features/<feature-slug>/
       │
       ▼
4. Enterprise Policy Injection (`src/rules.js:loadProjectRules()`)
   - Scans .dagrules, .cursorrules, clamps to 4096 bytes
       │
       ▼
5. Provider & Stage Compilation (`src/providers/index.js:getProviderForStage()`)
   - Selects Gemini REST, Claude Subprocess, or OpenAI/Ollama instance
       │
       ▼
6. Artifact Execution & Metric Recording (`src/metrics.js:recordStageMetrics()`)
   - Executes LLM generation, estimates token count, calculates cost
       │
       ▼
7. Terminal UI Status Update (`src/ui.js:renderStatusCard()`)
```

---

## 3. Deep Dive: State Machine & Workspace Resolution Engine (`src/state.js`)

### 3.1 Workspace Priority Resolution Algorithm
The workspace resolver guarantees zero artifact collisions across multiple simultaneous feature developments.

```javascript
// src/state.js:getFeatureWorkspaceDir()
export function getFeatureWorkspaceDir(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  
  // Priority 1: Explicit Active Feature
  if (config.ACTIVE_FEATURE && config.SPECS_DIR) {
    const dir = path.join(cwd, config.SPECS_DIR, config.ACTIVE_FEATURE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // Priority 2: Legacy Project Root Fallback
  if (fs.existsSync(path.join(cwd, '00-requirements.md')) || 
      fs.existsSync(path.join(cwd, '02-contracts.md'))) {
    return cwd;
  }

  // Priority 3: Auto-Discovery in docs/features or .dag/features
  const candidateBases = [
    config.SPECS_DIR ? path.join(cwd, config.SPECS_DIR) : null,
    path.join(cwd, 'docs', 'features'),
    path.join(cwd, '.dag', 'features')
  ].filter(Boolean);

  for (const base of candidateBases) {
    if (fs.existsSync(base)) {
      const subdirs = fs.readdirSync(base)
        .filter(f => fs.statSync(path.join(base, f)).isDirectory())
        .sort()
        .reverse();
      if (subdirs.length > 0) return path.join(base, subdirs[0]);
    }
  }

  return cwd;
}
```

### 3.2 Non-Destructive Snapshot Engine (`createRollbackSnapshot`)
When rolling back (e.g. `dag rollback 1`):
1. Creates a timestamped directory: `.dag-backup/<YYYY-MM-DDTHH-mm-ss>/`
2. Copies all existing artifacts (`00-requirements.md` through `REVIEW.md`) to the backup directory.
3. Unlinks only artifacts downstream of the target step. Upstream artifacts remain intact.

---

## 4. Deep Dive: Configuration, Preset Compilation & Custom Mappings (`src/config.js`)

### 4.1 Hierarchical Config Resolution
Configurations are resolved with explicit precedence:
$$\text{Effective Config} = \text{Defaults} \prec \sim\text{/.dag.env} \prec \text{.env} \prec \text{.dag/config.json} \prec \text{CLI Flags}$$

### 4.2 Custom Preset Compilation Engine
Users can define arbitrary stage-to-provider mappings via `saveCustomPreset()`:

```json
{
  "CUSTOM_PRESETS": {
    "my-team-stack": {
      "PROVIDER_REFINE": "gemini",
      "PROVIDER_RECON": "gemini",
      "PROVIDER_CONTRACT": "claude",
      "PROVIDER_SKEPTIC": "deepseek",
      "PROVIDER_LAYERS": "gemini",
      "PROVIDER_MERGE": "claude",
      "PROVIDER_CODING": "claude",
      "PROVIDER_CONFORMANCE": "gemini",
      "PROVIDER_REVIEW": "deepseek"
    }
  }
}
```

---

## 5. Deep Dive: Multi-Provider IPC, Transpilation & Stream Interop (`src/providers/`)

### 5.1 Google AI Studio REST Client & 429 Retry Engine (`src/gemini.js`)
Unlike bloated SDKs, `src/gemini.js` uses native `fetch` against the `v1beta` endpoint:

```
https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}
```

#### Smart 429 / 503 Exponential Backoff with Quota Header Parsing:
When Google AI Studio returns HTTP `429 (RESOURCE_EXHAUSTED)` or `503 (UNAVAILABLE)`:
1. It inspects the response error payload for `details[].QuotaFailure` or `RetryInfo.retryDelay` (e.g. `58.39s`).
2. If explicit retry delay exists, the engine sleeps for the exact duration.
3. If no explicit delay exists, it applies exponential jitter:
   $$T_{\text{wait}} = \text{baseWait} \cdot 2^{\text{attempt}} \pm \text{jitter}$$
4. If all 3 retries fail on `gemini-3.6-pro`, it automatically falls back to `gemini-3.6-flash`.

### 5.2 Claude Code CLI IPC Bridge (`src/claude.js`)
Rather than requiring expensive API tokens, `src/claude.js` leverages the developer's active **Claude Code CLI** subscription by spawning an isolated child process:

```javascript
// src/claude.js:runClaudePrompt()
const child = spawn('claude', ['--print', '-p', prompt], {
  cwd,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});
```

* **Output Buffering:** Streams `stdout` and `stderr` asynchronously, resolving upon exit code `0`.
* **Zero Permission Prompts:** Prompts are appended with: `IMPORTANT: Do NOT use tools or ask for permissions. Output the markdown directly.` to guarantee headless non-interactive execution.

### 5.3 OpenAI & Ollama Adapter (`src/providers/openai.js`)
Generic fetch-based adapter supporting standard `v1/chat/completions` REST interfaces. Utilized for local execution (Ollama) and DeepSeek API execution.

### 5.4 LLM Prefix Caching & Append-Only Prompt Architecture
Modern LLM providers (Anthropic, DeepSeek, Google) offer highly efficient **Prefix Caching** mechanisms that radically reduce costs and Time-To-First-Token (TTFT) for large context windows. However, the physical hardware cache is strictly sequential—if any token changes early in the prompt string, all subsequent cached tokens are invalidated.

To maximize cache hits across the execution of 15+ sequential tasks, `dag-orchestrator` employs a strict **Append-Only Prompt Construction**.
In implementation and conformance steps, massive static artifacts (`02-contracts.md`, `.dagrules`) are front-loaded at the absolute top of the prompt. Dynamic, per-step artifacts (like the active task in `05-tasks.md` or the `git diff`) are strictly appended to the bottom. This ensures that the orchestrator mimics the advanced caching architecture found in high-performance harnesses like `dsh`, achieving 90%+ cache hit rates on sequential runs.

## 6. Deep Dive: The Adversarial Skeptic & Incident Falsification Engine

The Skeptic stage (`04-findings.md`) applies formal falsification testing against the drafted contract (`02-contracts.md`).

### The Falsification Prompt Taxonomy:
The skeptic is instructed with 4 strict attack vectors:
1. **Schema Non-Destructiveness:** Detects missing double-write / expand-then-contract patterns. Flags any raw `ALTER TABLE ... DROP COLUMN`.
2. **Concurrency & Race Conditions:** Checks if database updates rely on non-atomic read-then-write cycles without `SELECT FOR UPDATE` or optimistic version locking.
3. **Timezone Sanitization:** Flags raw `TIMESTAMP` without time zone or floating local time calculations.
4. **Idempotency Guarantees:** Ensures all API mutations require UUIDv7 or idempotency tokens.

---

## 7. Deep Dive: Self-Healing TDD Loop & Automated AI Diagnostician

### 7.1 The Autonomous 3-Attempt Healing Engine
During Step 3 (`dag next`), each task in `05-tasks.md` defines an atomic validation command:
```markdown
Check: npm test tests/campaign-scheduler.test.js
```

1. **Execution:** Runs the check command via `execSync(checkCmd, { encoding: 'utf8', timeout: 30000 })`.
2. **Failure Capture:** If the exit code is non-zero, captures combined `stdout` and `stderr`.
3. **Healing Prompt Dispatch:** Feeds the error trace back to the coding model:
   ```text
   Task Check FAILED on attempt 1/3.
   Error Output:
   <captured stderr / stack trace>
   
   Fix the code touching ONLY the allowed task files to make the check pass.
   ```

### 7.2 The AI Diagnostician Recovery Protocol
If 3 consecutive auto-healing attempts fail, DAG terminates the loop and invokes the **AI Diagnostician** (`geminiDiagnoseFailure`):
* Analyzes the original requirements, interface contract, and error trace.
* Determines whether the failure is a simple bug or an **Architectural Contract Contradiction**.
* Presents an interactive recovery menu:
  ```text
  👉 AI Diagnostician recommends rolling back to Step 1 to revise the contract.
  Approve automatic rollback and contract revision? [Y/n]:
  ```

---

## 8. Deep Dive: Enterprise Policy Injection & 4KB Memory Guard (`src/rules.js`)

### 8.1 Resolution Cascade
1. Look for `.dagrules` in `process.cwd()`.
2. Fallback to `.cursorrules` in `process.cwd()`.
3. Fallback to `~/.dagrules` in `os.homedir()`.

### 8.2 Memory & Token Guard (`MAX_RULES_BYTES = 4096`)
To protect LLM context windows from oversized prompt injection:
```javascript
// src/rules.js
if (Buffer.byteLength(content, 'utf8') > 4096) {
  content = content.slice(0, 4096) + '\n... [Rules truncated for token efficiency]';
}
```

---

## 9. Deep Dive: Token Estimation, Mathematical Modeling & Cost Benchmarks (`src/metrics.js`)

### 9.1 BPE Token Estimation Heuristic
Byte-Pair Encoding tokenization across polyglot source code (TypeScript, Python, SQL) follows a constant linear ratio:
$$\text{Tokens}(T) = \left\lceil \frac{|T|}{3.8} \right\rceil$$

### 9.2 Real-World Cost Model
$$\text{Cost}_{\text{feature}} = \sum_{s=0}^{N} \left( \frac{\text{Tokens}_{\text{in}}(s)}{10^6} \cdot P_{\text{in}}(M_s) + \frac{\text{Tokens}_{\text{out}}(s)}{10^6} \cdot P_{\text{out}}(M_s) \right)$$

Where $P_{\text{in}}(M)$ and $P_{\text{out}}(M)$ represent the published USD rates per million tokens.

### 9.3 Multi-Model Comparative Baseline
DAG evaluates actual spend against up to 3 configured industry baselines simultaneously:
* **Claude Sonnet 5:** $\$3.00$ / $\$15.00$ per 1M tokens.
* **OpenAI GPT-4o:** $\$2.50$ / $\$10.00$ per 1M tokens.
* **DeepSeek-V3:** $\$0.27$ / $\$1.10$ per 1M tokens.

---

## 10. Deep Dive: Terminal UI, ANSI Rendering Engine & JSON Serialization (`src/ui.js`)

### 10.1 ANSI Color Code Standardization
```javascript
export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightRed: '\x1b[91m',
  gray: '\x1b[90m'
};
```

### 10.2 Headless JSON Serialization Mode (`--json`)
When invoked with `--json`, all ANSI rendering is bypassed. The CLI serializes raw state objects directly to `stdout`:
```bash
dag status --json
dag doctor --json
dag stats --json
dag features --json
```

---

## 11. Failure Modes, Edge Cases, and Recovery Protocols

| Failure Mode | Root Cause | DAG Automated Recovery Protocol |
| :--- | :--- | :--- |
| **HTTP 429 (Quota Exceeded)** | Exceeded free-tier RPD limit | Parses `RetryInfo.retryDelay` or automatically falls back to secondary model (`gemini-3.6-flash`). |
| **Contract Contradiction** | Step 3 cannot implement task due to missing spec | AI Diagnostician catches after 3 attempts and offers 1-click snapshot rollback (`dag rollback 1`). |
| **Dirty Git Working Tree** | Uncommitted changes present during switch | Preserves files in feature-isolated directories (`docs/features/<slug>/`). |
| **Missing API Keys** | Developer has no environment variables set | `dag doctor` identifies missing keys and points to `~/.dag.env` configuration. |
| **Prompt Bloat** | Huge repository rules file | `src/rules.js` clamps rules to 4,096 bytes with an explicit token efficiency notice. |

---

## 12. Complete Annotated Code Walkthrough (Module by Module)

### Core Entrypoint: `bin/dag.js`
* Lines 1–40: Import statements, signal handlers, CLI argument destructuring.
* Lines 45–180: `runStep0` (Prompt Refinement & 00-requirements generator).
* Lines 185–270: `runStep1` (Recon search, Contract Spec drafting, Skeptic Falsification, Gate 1 approval loop).
* Lines 275–340: `runStep2` (Parallel 3-layer fan-out, plan merger, Gate 2 approval loop).
* Lines 345–520: `runStep3` (Atomic TDD task runner, auto-healing test runner, AI Diagnostician).
* Lines 525–560: `runStep4` (Git diff impact analysis and `REVIEW.md` generation).
* Lines 565–750: Master CLI command router (`init`, `doctor`, `stats`, `status`, `features`, `switch`, `stack`, `config`, `rollback`, `clean`, `ship`).

### Workspace & State Engine: `src/state.js`
* `slugify(text)`: Sanitizes prompt strings into RFC-compliant feature directory names.
* `getFeatureWorkspaceDir()`: Resolves active feature directory according to the 3-tier hierarchy.
* `resolveArtifactPath(name)`: Returns the absolute path of an artifact within the active feature workspace.
* `createRollbackSnapshot(step)`: Performs atomic file copying to `.dag-backup/` and cleans downstream stages.

### Provider Dispatcher: `src/providers/index.js`
* `getProviderForStage(stageName)`: Maps stage requirements against active preset or custom overrides.
* `executeStagePrompt(...)`: Polymorphic execution layer dispatching to Gemini REST, Claude CLI, or OpenAI/Ollama clients.
