# Contributing to DAG Orchestrator

Thank you for contributing to DAG Orchestrator! We welcome contributions from developers across organizations to make AI-driven software engineering robust, deterministic, and cost-efficient.

---

## 🏛️ Governance & Incubation

This project is in active incubation under the **MIT License**. We follow the **Developer Certificate of Origin (DCO)** for all contributions.

By contributing, you certify that:
- You authored the code or have the legal right to submit it under the MIT License.
- The contribution does not violate any employer IP agreements or confidentiality terms.

---

## 🛠️ Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/dag-harness.git
   cd dag-harness
   ```

2. **Link globally for local testing:**
   ```bash
   npm link
   ```

3. **Verify the command works:**
   ```bash
   dag --help
   dag status
   ```

---

## 🧪 Architecture & Testing

- `bin/dag.js`: CLI Command router, gate revision loops, and interactive terminal interface.
- `src/state.js`: Multi-feature workspace manager, snapshot backup engine, and artifact path resolver.
- `src/rules.js`: Enterprise `.dagrules` / `.cursorrules` policy loader and prompt injector.
- `src/providers/`: Pluggable model providers (Google AI Studio, Claude Code CLI, DeepSeek/OpenAI, Ollama).

---

## 📬 Submitting a Pull Request

1. Create a feature branch: `git checkout -b feature/my-cool-addition`
2. Ensure clean code and test with `dag run` on a sample feature.
3. Sign-off your commit:
   ```bash
   git commit -s -m "feat: add Mistral AI provider adapter"
   ```
4. Open a Pull Request on GitHub.
