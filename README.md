# 🚀 DAG Orchestrator CLI (`dag`)

> **Deterministic Multi-Agent DAG Development Pipeline with Adversarial Verification & Asymmetric Cost-Routing**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)]()
[![Model Agnostic](https://img.shields.io/badge/Providers-Gemini%20%7C%20Claude%20%7C%20DeepSeek%20%7C%20Ollama-orange.svg)]()

---

## ⚡ What is DAG Orchestrator?

Most AI coding assistants rely on unconstrained conversational memory, leading to hallucinations, broken schemas, and subtle race conditions in production.

**DAG Orchestrator** treats software engineering as an **enforced assembly line**:
1. **Freezes Architectural Contracts (`02-contracts.md`)** before a single line of code is written.
2. **Deploys an Adversarial Skeptic Hunter** powered by extended reasoning to intentionally hunt and flag production failure modes in the spec.
3. **Executes Asymmetric Model Routing:** Offloads massive whole-repo context scans (1M+ tokens) and parallel layer fanouts to high-throughput, cost-efficient tiers (e.g. Gemini 3.6 Flash, DeepSeek-V3, Qwen 2.5 Coder, Llama 3) while routing complex contracts, adversarial audits, and implementation to top-tier reasoning engines (e.g. Claude Sonnet/Opus 5, Gemini 3.6 Pro, DeepSeek-R1, GPT-4o).
4. **Auto-Heals Implementation Failures:** Automatically runs task verification checks and feeds error traces back to the active coding model in a 3-turn self-healing loop with 1-click contract rollback.

---

## 🗺️ The 5-Stage Progressive Artifact Pipeline

```
[Raw Request] 
      │
      ▼
[Step 0: Refine] ───────▶ 00-requirements.md (Requirements & Confirmed Assumptions)
      │
      ▼
[Step 1: Contract] ─────▶ 01-recon.md (1M+ Whole-Repo Precedent Search)
      │                   02-contracts.md (Frozen Interface Specification)
      │                   04-findings.md (Adversarial Skeptic Incident Audit)
      │                   🛑 GATE 1: Human Approval / Revision Loop
      ▼
[Step 2: Layers] ───────▶ 03-domain.md, 03-app-infra.md, 03-data.md (Parallel Fanout)
      │                   05-tasks.md (Dependency-Ordered Implementation Checklist)
      │                   🛑 GATE 2: Human Approval / Revision Loop
      ▼
[Step 3: Implement] ────▶ Tests-First TDD Coding + Auto-Healing Verification + Anti-Drift Check
      │
      ▼
[Step 4: Review] ───────▶ REVIEW.md (Whole-Repo Regression & Impact Analysis)
      │
      ▼
[dag ship] ─────────────▶ Automated GitHub Pull Request (`gh pr create`) with Spec Audit Trails
```

---

## 🚀 Quickstart

### 1. Installation
```bash
# Global Install via GitHub:
npm install -g git+https://github.com/dag-orchestrator-lab/dag-orchestrator.git

# Or install from cloned repo:
git clone https://github.com/dag-orchestrator-lab/dag-orchestrator.git
cd dag-orchestrator
npm link
```

### 2. Configure Harness Runner & Model Provider Preset
DAG cleanly decouples the **Execution Harness Runner** from the **Model Provider Preset**:

```bash
# 1. Execution Harness Runner (Default: standalone)
dag config harness standalone   # Lightweight CLI runner with ANSI cards
dag config harness dsh          # DeepSeek Harness process engine & web UI

# 2. Model Provider Preset (Default: hybrid)
dag config preset hybrid        # Gemini 1M+ Context + Claude Coding
dag config preset claude        # 100% Claude Subscription (Zero external API keys)
dag config preset gemini        # 100% Google AI Studio (Free or Enterprise)
dag config preset deepseek      # 100% DeepSeek / OpenAI API endpoint
dag config preset local         # 100% Air-Gapped / Offline via Ollama

# Or build your own custom stage-to-model stack:
dag config preset create my-team-stack
```

### 3. Initialize in Your Repository
```bash
cd /path/to/your/project
dag init
```

---

## 🛠️ CLI Command Reference

| Command | Description |
| :--- | :--- |
| `dag init` | Interactive repository setup (configures `docs/features/` vs `.dag/features/` & `.gitignore`) |
| `dag doctor` | Diagnose environment binaries (`git`, `gh`, `claude`, `ollama`), API keys, and active workspace |
| `dag verify` (or `audit`) | Run Pre-Flight Verifier quality & policy audit on active specs |
| `dag service [link\|list]` | Manage linked microservices & harvest SQL/OpenAPI/Postman schemas JIT |
| `dag stats` | View token usage, cost benchmarks, and multi-model comparative net savings |
| `dag status` | Visual terminal dashboard of all pipeline artifacts and active config |
| `dag features` (or `list`) | List all feature workspaces and their completion status |
| `dag switch <name>` | Switch active feature workspace context |
| `dag stack [base-branch]` | Fetch base/PR branch and create a clean stacked feature branch |
| `dag config [preset]` | Manage providers, models, and API keys (built-ins & custom presets) |
| `dag next` | Smart Pipeline Advancer: Automatically detects state & executes next stage |
| `dag refine "<prompt>"` | Step 0: Decompose prompt into requirements & assumptions (supports `--file` and `--context`) |
| `dag contract` (or `spec`) | Step 1: Whole-repo recon $\to$ draft contract $\to$ skeptic audit (Gate 1) |
| `dag layers` (or `tasks`) | Step 2: Parallel 3-layer fanout $\to$ merge `05-tasks.md` (Gate 2) |
| `dag implement` (or `code`) | Step 3: Implement next task with tests-first TDD & auto-healing test loop |
| `dag review` (or `audit`) | Step 4: Whole-repo impact check & produce `REVIEW.md` |
| `dag run "<prompt>"` | Execute the entire pipeline end-to-end with interactive gate stops |
| `dag ship [title]` | Bundle spec audit trail & open GitHub Pull Request |
| `dag rollback <step>` | Safely rewind to a previous stage with automatic backup snapshot |
| `dag clean` | Reset pipeline and backup all generated artifacts |

---

## 📚 Documentation & Study Guides

- **[`USER_GUIDE.md`](USER_GUIDE.md):** Complete handbook, setup recipes, when to use DAG, and troubleshooting.
- **[`DOMAIN_GUIDE.md`](DOMAIN_GUIDE.md):** Product mental model, assembly line philosophy, and skeptic pre-mortems.
- **[`ARCHITECTURE.md`](ARCHITECTURE.md):** Deep technical textbook on state machines, algorithms, IPC subprocess streaming, and mathematical modeling.
- **[`BENCHMARKING.md`](BENCHMARKING.md):** Mathematical token estimation formulas and public pricing matrix.

---

## 📋 Enterprise Rules Injection (`.dagrules`)

Add a `.dagrules` file in your repository root to enforce team-specific standards across all generated contracts, skeptic audits, and code:

```markdown
# Team Engineering Policies
- All timestamps must default to Manila Time (UTC+8).
- Never remove database columns without an expand-then-contract migration.
- All domain events must be idempotency-keyed with UUIDv7.
```

---

## 🗺️ Planned Improvements & Architecture Milestones

The DAG Orchestrator roadmap is designed around increasing IDE integration, multi-package monorepo intelligence, and enterprise-grade CI/CD automation:

### 🟢 `v0.1.0-alpha` (Current Release — Incubation & Dogfooding)
- [x] Deterministic 5-stage contract-first state machine.
- [x] Asymmetric multi-model routing & benchmark cost engine (`dag stats`).
- [x] Pre-Flight Gate Verifier & adaptive `.dagrules` policy learning loop.
- [x] JIT Cross-Service schema harvester (`dag service`) with Postman/Thunder Client support.
- [x] Frontend / UI-UX Engine: Figma AST, HTML Wireframe & Website Inspiration Harvester.
- [x] Multi-feature isolated workspaces & branch stacking (`dag stack`).

### 🟡 `v0.2.0-beta` (IDE Integration & Strict Type Safety)
- [ ] **TypeScript Porting:** Migrate codebase to 100% strict TypeScript with bundled type definitions (`.d.ts`).
- [ ] **VS Code & Cursor Extension:** Visual sidebar showing real-time DAG state, gate approval buttons, and diff inspector directly in the editor.
- [ ] **Antigravity IDE Plugin & Custom Agent Tooling:** First-class slash command and sidecar agent support for Google Antigravity.
- [ ] **Interactive Terminal UI (TUI):** Rich interactive dashboards powered by Ink/React CLI.

### 🟣 `v0.3.0` (Monorepos & Enterprise Multi-Package Routing)
- [ ] **Monorepo & Workspace Routing:** Native Turborepo, Nx, and Cargo workspace dependency graph traversal.
- [ ] **Semantic Diff & Breaking Change Analyzer:** AST-based schema comparison flagging breaking database/API modifications before PR opening.
- [ ] **Custom Provider Plugin SDK:** Standardized interface for registering proprietary on-prem models and custom vector stores.

### 🔵 `v1.0.0` (Enterprise GA & CI/CD Gatekeeper)
- [ ] **Headless CI/CD GitHub Action:** Enforce contract compliance and run pre-flight gate verifiers on incoming Pull Requests automatically.
- [ ] **Team Policy Cloud Sync:** Centralized synchronization of enterprise `.dagrules` across distributed engineering teams.

## 🤝 Acknowledgments & Open Source Credits

DAG Orchestrator stands on the shoulders of brilliant open-source engineering. Special gratitude to:

* **[Oxlint & The Oxc Project](https://github.com/oxc-project/oxc):** For pioneering sub-30ms Rust-based JavaScript/TypeScript AST linting.
* **[Dan Mulroy (`anti-slop`)](https://github.com/dmmulroy/anti-slop):** For establishing the "Anti-Slop" philosophy and opinionated static guardrails against AI type bluffing and synthetic boilerplate.
* **[ast-grep](https://github.com/ast-grep/ast-grep) & [sloplint](https://github.com/dannote/sloplint):** For structural AST pattern matching against AI generated code artifacts.
* **The Anthropic & Google AI Teams:** For developing the Claude Code CLI and Google Gemini 1M+ Context models that power our asymmetric stage routing.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.
