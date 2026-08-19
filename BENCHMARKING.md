# 📊 Benchmark & Cost Estimation Methodology

This document outlines how DAG Orchestrator calculates token counts, cost estimations, and benchmark comparisons.

---

## 🎯 1. How Tokens Are Estimated
Because DAG is model-agnostic and interacts with multiple provider APIs, local CLIs, and offline models, token counts are estimated using the standard industry BPE (Byte-Pair Encoding) heuristic:

$$\text{Tokens} = \left\lceil \frac{\text{Character Count}}{3.8} \right\rceil$$

* For English and codebase text (TypeScript, Python, SQL, Markdown), $3.8$ characters per token provides an accuracy within $\pm 3\%$ of native provider tokenizers.
* Token metrics are recorded per stage into `.dag-metrics.json` inside each feature workspace.

---

## 💰 2. Provider Pricing Matrix (USD per 1M Tokens)

| Model Tier / Provider | Input ($/1M) | Output ($/1M) | Description |
| :--- | :--- | :--- | :--- |
| **Google Gemini 3.6 Flash** | **$0.00** | **$0.00** | Free Tier / Enterprise Subscription |
| **Google Gemini 3.6 Pro** | **$0.00** | **$0.00** | Free Tier / Enterprise Subscription |
| **Anthropic Claude Sonnet 5** | **$3.00** | **$15.00** | Standard Frontier Commercial API |
| **Anthropic Claude Opus 5** | **$15.00** | **$75.00** | Deep Reasoning Frontier API |
| **DeepSeek-V3** | **$0.27** | **$1.10** | High-Efficiency Pay-per-token API |
| **DeepSeek-R1** | **$0.55** | **$2.19** | Extended Reasoning Pay-per-token API |
| **OpenAI GPT-4o** | **$2.50** | **$10.00** | OpenAI Frontier Commercial API |
| **Local Models (Ollama)** | **$0.00** | **$0.00** | Self-Hosted / Offline Hardware |

---

## 🎛️ 3. Configuring Multi-Model Benchmark Comparisons

By default, DAG calculates comparative savings simultaneously against the top three industry frontier baselines: **Claude Sonnet 5**, **OpenAI GPT-4o**, and **DeepSeek-V3**.

You can easily customize or toggle which models appear in your report (capped at a maximum of 3 models for clarity):

```bash
# Compare against Claude Sonnet 5, GPT-4o, and DeepSeek-V3:
dag config set BENCHMARK_MODELS "claude-sonnet-5,gpt-4o,deepseek-chat"

# Compare against Claude Opus 5, GPT-4o, and DeepSeek-R1:
dag config set BENCHMARK_MODELS "claude-opus-5,gpt-4o,deepseek-reasoner"
```

---

## 🔍 4. How Savings Are Calculated

$$\text{Actual Cost} = \sum_{\text{stages}} (\text{Input Tokens} \times \text{Price}_{\text{model}} + \text{Output Tokens} \times \text{Price}_{\text{model}})$$

$$\text{Baseline Cost} = \sum_{\text{stages}} (\text{Input Tokens} \times \text{Price}_{\text{baseline}} + \text{Output Tokens} \times \text{Price}_{\text{baseline}})$$

$$\text{Savings \%} = \frac{\text{Baseline Cost} - \text{Actual Cost}}{\text{Baseline Cost}} \times 100$$

When using the **Hybrid Mode** (offloading 1M+ whole-repo context scans to Gemini Free/Enterprise while using Claude for coding), savings typically exceed **75% to 95%** compared to sending the entire repo through monolithic frontier models.
