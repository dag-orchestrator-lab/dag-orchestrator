# 📘 DAG Orchestrator: Product & Domain Guide

> **An Intuitive Guide to Multi-Agent Assembly Lines, Human-in-the-Loop Gates, Adversarial Incident Prevention, and Asymmetric Routing**

---

## 📑 Table of Contents
1. [The Vision: Why Software Needs Assembly Lines](#1-the-vision-why-software-needs-assembly-lines)
2. [The Core Philosophy: Zero Conversational Memory](#2-the-core-philosophy-zero-conversational-memory)
3. [The 5-Stage Assembly Line Explained](#3-the-5-stage-assembly-line-explained)
4. [The Role of the Skeptic: Pre-Mortem Incident Prevention](#4-the-role-of-the-skeptic-pre-mortem-incident-prevention)
5. [The Economics: Asymmetric Model Routing](#5-the-economics-asymmetric-model-routing)
6. [Human-in-the-Loop: Gates 1 & 2](#6-human-in-the-loop-gates-1--2)
7. [Enterprise Alignment: `.dagrules`](#7-enterprise-alignment-dagrules)
8. [End-to-End Product Lifecycle Walkthrough](#8-end-to-end-product-lifecycle-walkthrough)

---

## 1. The Vision: Why Software Needs Assembly Lines

When cars were first built, individual craftsmen built them from scratch. Every car was slightly different, parts didn't fit reliably, and mistakes were discovered only after the car broke down.

Henry Ford changed manufacturing by introducing the **Assembly Line**:
1. Work is broken into specialized, sequential stations.
2. Parts are standardized with frozen blueprints.
3. Every station verifies quality before passing parts to the next station.

**DAG Orchestrator applies this exact manufacturing principle to AI-assisted software engineering.**

---

## 2. The Core Philosophy: Zero Conversational Memory

### Why AI Chatbots Fail at Coding
Most AI coding assistants operate like a never-ending chat. As you chat, the conversation gets longer and longer.
* **The Problem:** AI models lose focus when conversations become cluttered. They forget earlier instructions, invent database columns that don't exist, and write code that causes regressions.
* **The DAG Solution:** **Conversation memory is zero.** The AI does not remember previous chats. Instead, all context is stored in structured **Markdown artifacts** saved to disk. Each stage reads only the specific files it needs to do its job.

---

## 3. The 5-Stage Assembly Line Explained

```
[Raw Request] ──────▶ [Step 0: Refine] ──────▶ [Step 1: Contract & Skeptic] ──────▶ [Step 2: Layers & Tasks]
                                                        │                                   │
                                                 🛑 Gate 1 Stop                      🛑 Gate 2 Stop
                                                        │                                   │
[dag ship / PR] ◀─── [Step 4: Review] ◀────── [Step 3: Implement & Auto-Heal] ◀──────────────┘
```

### 1. Step 0: Prompt Refinement (`00-requirements.md`)
Takes a raw feature idea and clarifies ambiguous requirements before anything is designed.

### 2. Step 1: Interface Contract (`02-contracts.md`)
Freezes all TypeScript interfaces, SQL migrations, and API routes **before any implementation begins**. 

### 3. Step 2: Layer Decomposition (`03-domain`, `03-app-infra`, `03-data`, `05-tasks.md`)
Splits the contract into 3 architectural layers running in parallel, then merges them into a single, dependency-ordered task checklist.

### 4. Step 3: Implement with Auto-Healing (`dag next`)
Picks up tasks one by one, writes tests first (TDD), implements the code, and automatically verifies that tests pass.

### 5. Step 4: Final Impact Review (`REVIEW.md`)
Scans the entire repository diff to verify that no regressions or side-effects were introduced.

---

## 4. The Role of the Skeptic: Pre-Mortem Incident Prevention

In traditional software teams, critical bugs are often caught in production post-mortems.

DAG introduces the **Adversarial Skeptic**:
* An AI persona explicitly instructed **not** to be helpful, but to act as a cynical, battle-hardened Staff Engineer trying to break the design.
* The Skeptic searches for:
  - Destructive database migrations (e.g. dropping columns without expand-and-contract).
  - Race conditions and missing idempotency tokens.
  - Timezone ambiguities and missing database indexes.
* All skeptic warnings are saved in `04-findings.md` and presented to the developer at **Gate 1**.

---

## 5. The Economics: Asymmetric Model Routing

Not all engineering tasks require expensive frontier reasoning models.

* **Heavy Reading & Scanning (Reconnaissance):** Scanning 100,000+ lines of codebase context requires high token throughput. DAG routes this to ultra-fast, free/cheap models (e.g., Gemini 3.6 Flash / Pro).
* **Precision Coding & Architecture:** Drafting contracts and writing implementation code is routed to top-tier reasoning models (e.g., Claude Sonnet 5, DeepSeek-R1).

This asymmetric routing yields **75% to 95% cost savings** compared to monolithic single-model workflows.

---

## 6. Human-in-the-Loop: Gates 1 & 2

DAG keeps the human developer firmly in the driver's seat via two non-negotiable inspection gates:

* **🛑 Gate 1 (Contract Approval):** Developer verifies `02-contracts.md` and `04-findings.md`. The developer can approve (`Y`) or type feedback to instantly revise the contract.
* **🛑 Gate 2 (Task List Approval):** Developer verifies `05-tasks.md` to ensure the implementation order makes sense.

---

## 7. Enterprise Alignment: `.dagrules`

Place a `.dagrules` file in the project root to enforce team-wide engineering policies across all generated code:
* Standard timestamp conventions (e.g. UTC+8 Manila Time).
* Migration rules (e.g. never drop a table without a deprecation window).
* Architecture standards (e.g. Hexagonal Architecture / Clean Architecture).

---

## 8. End-to-End Product Lifecycle Walkthrough

```bash
# 1. Start a new feature
dag stack develop feature/user-notifications

# 2. Refine requirements
dag refine "Send email notifications when an invoice is paid"

# 3. Freeze the contract spec & audit with Skeptic
dag contract

# 4. Generate implementation tasks
dag layers

# 5. Build tasks with automated testing
dag next

# 6. Final review & benchmark savings
dag review
dag stats

# 7. Open Pull Request on GitHub
dag ship "feat: invoice payment notifications"
```
