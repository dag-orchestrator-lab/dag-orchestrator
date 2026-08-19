# 📖 DAG Orchestrator: Comprehensive User Guide & Playbook

> **The Definitive Handbook: Setup, Daily Workflows, Feature Deep Dives, and Practical Recipes**

---

## 📑 Table of Contents
1. [Installation & First-Time Setup](#1-installation--first-time-setup)
2. [Diagnostic & Health Checks (`dag doctor`)](#2-diagnostic--health-checks-dag-doctor)
3. [When to Use DAG (And When Not To)](#3-when-to-use-dag-and-when-not-to)
4. [The 5-Stage Lifecycle & Daily Recipe](#4-the-5-stage-lifecycle--daily-recipe)
5. [The Pre-Flight Gate Verifier (`dag verify`)](#5-the-pre-flight-gate-verifier-dag-verify)
6. [Adaptive Policy Learning (`.dagrules`)](#6-adaptive-policy-learning-dagrules)
7. [Cross-Service Schema Harvesting (`dag service`)](#7-cross-service-schema-harvesting-dag-service)
8. [Multi-Feature Workspaces & Branch Stacking (`dag stack`)](#8-multi-feature-workspaces--branch-stacking-dag-stack)
9. [Token Benchmarking & Cost Analytics (`dag stats`)](#9-token-benchmarking--cost-analytics-dag-stats)
10. [Provider Presets & Custom Configuration](#10-provider-presets--custom-configuration)
11. [Troubleshooting & FAQ](#11-troubleshooting--faq)

---

## 1. Installation & First-Time Setup

### Step 1: Install DAG Globally
```bash
# Option A: Install directly via GitHub:
npm install -g git+https://github.com/dag-orchestrator-lab/dag-orchestrator.git

# Option B: Clone and link locally:
git clone https://github.com/dag-orchestrator-lab/dag-orchestrator.git
cd dag-orchestrator
npm link
```

### Step 2: Choose Your Execution Harness Runner (Optional)
DAG cleanly separates the **Execution Harness Runner** from the **Model Provider Preset**:

```bash
# View available harness runners:
dag config harness

# Option A: Lightweight standalone CLI runner with ANSI cards (Default)
dag config harness standalone

# Option B: DeepSeek Harness process orchestrator & web UI runner
dag config harness dsh

# Option C: Zero-prompt headless JSON runner for CI/CD
dag config harness headless
```

### Step 3: Configure Your Preferred Model Provider Preset
```bash
# Option A: 100% Free Google AI Studio
dag config preset gemini
dag config set GEMINI_API_KEY "your-gemini-key"

# Option B: 100% Claude Subscription (Zero external API costs)
dag config preset claude

# Option C: Hybrid Asymmetric Mode (Gemini 1M+ Context + Claude Coding)
dag config preset hybrid
dag config set GEMINI_API_KEY "your-gemini-key"

# Option D: DeepSeek / OpenAI Endpoint
dag config preset deepseek
dag config set OPENAI_API_KEY "your-deepseek-key"

# Option E: 100% Offline / Local Models via Ollama
dag config preset local
```

### Step 4: Initialize in Your Project Repository
Run `dag init` inside your target project directory:
```bash
cd /path/to/my-project
dag init
```
* Asks where to store specifications (`docs/features/` vs `.dag/features/`).
* Automatically adds `.dag/` to `.gitignore` if private mode is selected.

---

## 2. Diagnostic & Health Checks (`dag doctor`)

Before running your first feature, verify your environment with `dag doctor`:
```bash
dag doctor
```
```text
┌────────────────────────────────────────────────────────────────────┐
│ 🩺 DAG ENVIRONMENT & CONFIGURATION DOCTOR                          │
├────────────────────────────────────────────────────────────────────┤
│ Node.js Version:     v20.12.0             ✓ OK                     │
│ Git CLI:             ✓ Installed                                   │
│ GitHub CLI (gh):     ✓ Installed                                   │
│ Claude Code CLI:     ✓ Installed                                   │
│ Ollama (Local):      ○ Not Found                                   │
├────────────────────────────────────────────────────────────────────┤
│ Active Preset:       hybrid                                        │
│ Google Gemini Key:   ✓ Configured                                  │
│ Anthropic Key:       ○ Not Set                                     │
│ OpenAI/DeepSeek Key: ○ Not Set                                     │
├────────────────────────────────────────────────────────────────────┤
│ Workspace Root:      docs/features/2026-08-campaign-scheduler      │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. When to Use DAG (And When Not To)

### 🟢 Perfect Use Cases (Use DAG):
1. **New Product Features:** Multi-file features spanning database schemas, API routes, and business logic.
2. **Schema & Database Migrations:** Adding columns, changing relations, or modifying primary keys where backward compatibility is critical.
3. **Cross-Service Integrations:** Communicating with sibling microservices, Kafka events, or external REST APIs.
4. **Refactoring & Architectural Shifts:** Clean Architecture, Hexagonal Port-and-Adapter migrations.

### 🔴 Bad Use Cases (Don't Use DAG):
1. **1-line typo fixes or README updates:** Use standard git edits directly.
2. **Quick exploratory scratch scripts:** A simple chat prompt is faster.
3. **One-off regex tweaks:** Don't spin up a full contract for minor string manipulation.

---

## 4. The 5-Stage Lifecycle & Daily Recipe

### The Universal "Smart Next" Recipe (Easiest):
```bash
# You can literally run `dag next` repeatedly from start to finish!
dag next "Add recurring scheduling time windows to campaigns table" # Runs Step 0
dag next                                                            # Runs Step 1 (Contract)
dag next                                                            # Runs Step 2 (Layers & Tasks)
dag next                                                            # Runs Step 3 (Task 1, 2, ...)
dag next                                                            # Runs Step 4 (Review & Ship)
```

### The Explicit Stage Recipe:
```bash
# 2. Step 0: Refine the prompt into requirements
# Basic usage:
dag refine "Add recurring scheduling time windows to campaigns table"

# Advanced: Ingest an existing architecture plan, RFC, or notes:
dag refine "Add recurring scheduler" --file=docs/rfcs/scheduler-v1.md

# Advanced: Pass inline technical constraints:
dag refine "Add recurring scheduler" --context="Use PostgreSQL tsrange, UUIDv7 IDs, and Redis locks"

# 3. Step 1: Draft contract spec & audit with Skeptic (Gate 1)
dag contract

# 4. Step 2: Expand into 3 layer plans and merge tasks (Gate 2)
dag layers

# 5. Step 3: Implement tasks one by one with TDD tests & auto-healing
dag implement   # or `dag code`

# 6. Step 4: Full-repo impact review
dag review

# 7. Check token cost savings & ship PR to GitHub
dag stats
dag ship "feat: add recurring time window scheduling"
```

---

## 5. The Pre-Flight Gate Verifier (`dag verify`)

Before presenting Gate 1 or Gate 2, DAG automatically audits the artifact against a 7-point quality rubric:
* **Interface Contracts:** Checks that strict TypeScript/SQL types are defined.
* **Failure Modes:** Ensures explicit HTTP status codes and error signatures exist.
* **Database Safety:** Validates non-destructive expand-and-contract migrations.
* **Skeptic Resolution:** Ensures zero unresolved `BLOCKER` incidents remain.

You can audit your active workspace anytime via:
```bash
dag verify
```

---

## 6. Adaptive Policy Learning (`.dagrules`)

When you provide feedback at any gate or reject a plan (e.g. *"Always use UTC+8 for timestamps"*), DAG prompts:
```text
👉 Save this feedback as a permanent team policy in .dagrules? [y/N]:
```
* Typing `Y` automatically saves the generalizable rule into `.dagrules`.
* Future contract drafts and skeptic audits will enforce this rule across your entire repository.

---

## 7. Cross-Service Schema Harvesting (`dag service`)

In microservice architectures, link dependency services to prevent cross-boundary breaking changes:

```bash
# Link sibling services or monorepo packages:
dag service link billing ../billing-service
dag service link notifications ../packages/notifications

# View discovered schemas:
dag service
```

### Supported Contract Types (Harvested JIT):
* **SQL DDL Schemas:** `schema.sql`, `migrations/*.sql`
* **API Specs:** `openapi.json`, `openapi.yaml`, `swagger.json`, `schema.graphql`
* **RPC & Events:** `*.proto`
* **E2E Collections:** `*.postman_collection.json`, Thunder Client (`thunder*.json`)

---

## 8. Multi-Feature Workspaces & Branch Stacking (`dag stack`)

### Working with Multiple Features:
```bash
# List all active and historical feature workspaces:
dag features

# Switch between feature contexts:
dag switch 2026-08-campaign-scheduler
```

### Stacking Branches on Active PRs:
```bash
# Stack a new branch on top of PR 1651:
dag stack pr-1651 feature/campaign-part-2
```

---

## 9. Token Benchmarking & Cost Analytics (`dag stats`)

View real-time token counts, actual multi-agent spend, and multi-model comparative savings:

```bash
dag stats
```
```text
┌────────────────────────────────────────────────────────────────────┐
│ 💰 DAG FEATURE COST & TOKEN SAVINGS BENCHMARK                      │
├────────────────────────────────────────────────────────────────────┤
│ Total Tokens Processed:     1,248,500                              │
│ Input Tokens (Context):     1,150,000                              │
│ Output Tokens (Generated):  98,500                                 │
├────────────────────────────────────────────────────────────────────┤
│ Actual Cost (DAG Routed):   $0.3920                                │
├────────────────────────────────────────────────────────────────────┤
│ Comparative Single-Model Baselines (Max 3):                        │
│   vs Anthropic Claude Sonnet 5: $4.9275 → Save 92.0% ($4.54)       │
│   vs OpenAI GPT-4o:             $3.8600 → Save 89.8% ($3.47)       │
│   vs DeepSeek-V3 API:           $0.4188 → Save 6.4%  ($0.03)       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 10. Provider Presets & Custom Configuration

### Built-in Presets:
```bash
dag config preset gemini    # 100% Free Google AI Studio
dag config preset claude    # 100% Claude Subscription
dag config preset deepseek  # 100% DeepSeek API
dag config preset local     # 100% Offline Ollama
dag config preset hybrid    # Gemini 1M+ Context + Claude Coding
```

### Build a Custom Stage-to-Model Preset:
```bash
dag config preset create my-team-stack
```

---

## 11. Troubleshooting & FAQ

### Q: What if I get an HTTP 429 (Resource Exhausted) error?
* DAG automatically detects Google API `RetryInfo.retryDelay` headers and waits, or falls back to secondary models automatically.
* You can switch to the Claude or DeepSeek preset with `dag config preset claude`.

### Q: How do I rollback a broken contract or task list?
* Run `dag rollback 1` to safely rewind to Step 1. All previous files are preserved in timestamped backups under `.dag-backup/`.
