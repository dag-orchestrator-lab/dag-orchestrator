import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function resolveApiKey() {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  // Check ~/.dag.env
  try {
    const homeDagEnv = path.join(os.homedir(), '.dag.env');
    if (fs.existsSync(homeDagEnv)) {
      const content = fs.readFileSync(homeDagEnv, 'utf8');
      const match = content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
      if (match && match[1]) return match[1].trim();
    }
  } catch (e) {}

  // Check .env in current directory
  try {
    const cwdEnv = path.join(process.cwd(), '.env');
    if (fs.existsSync(cwdEnv)) {
      const content = fs.readFileSync(cwdEnv, 'utf8');
      const match = content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
      if (match && match[1]) return match[1].trim();
    }
  } catch (e) {}

  // Check ~/.zshrc
  try {
    const zshrcPath = path.join(os.homedir(), '.zshrc');
    if (fs.existsSync(zshrcPath)) {
      const content = fs.readFileSync(zshrcPath, 'utf8');
      const match = content.match(/export\s+GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
      if (match && match[1]) return match[1].trim();
    }
  } catch (e) {}

  return null;
}

export const FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-3.6-flash';
export const PRO_MODEL = process.env.GEMINI_PRO_MODEL || 'gemini-3.6-pro';

async function callGemini(model, systemInstruction, prompt, options = {}) {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set.\n' +
      'Please run:\n' +
      '  echo \'export GEMINI_API_KEY="your-key-here"\' >> ~/.zshrc && source ~/.zshrc\n' +
      'Or save it in ~/.dag.env:\n' +
      '  echo \'GEMINI_API_KEY="your-key-here"\' > ~/.dag.env'
    );
  }

  // Fetch available models once if needed
  let candidateModels = [model];
  if (model.includes('flash')) {
    candidateModels = ['gemini-3.6-flash'];
  } else if (model.includes('pro')) {
    candidateModels = ['gemini-3.6-pro', 'gemini-3.6-flash'];
  }

  let lastError = null;

  for (const currentModel of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    if (options.thinkingBudget !== undefined) {
      requestBody.generationConfig = {
        thinkingConfig: {
          thinkingBudget: options.thinkingBudget
        }
      };
    }

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (response.status === 404) {
          const errText = await response.text();
          lastError = new Error(`Model ${currentModel} returned 404: ${errText}`);
          break; // Move to next candidate model
        }

        if (response.status === 503 || response.status === 429) {
          const errText = await response.text();
          let serverDelaySec = 0;
          try {
            const errJson = JSON.parse(errText);
            const retryInfo = errJson.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
            if (retryInfo && retryInfo.retryDelay) {
              serverDelaySec = parseFloat(retryInfo.retryDelay.replace('s', '')) || 0;
            }
          } catch (e) {}

          const taskLabel = options.label ? `[${options.label}] ` : '';
          if (attempt < 4) {
            const delayMs = serverDelaySec > 0 ? Math.ceil(serverDelaySec * 1000) + 1000 : attempt * 3000;
            console.log(`⚠️  ${taskLabel}${currentModel} rate limit (429). Waiting ${Math.round(delayMs / 1000)}s before retry ${attempt}/3...`);
            await new Promise(r => setTimeout(r, delayMs));
            continue;
          } else {
            console.log(`⚠️  ${taskLabel}${currentModel} quota exhausted after retries. Switching to fallback...`);
            lastError = new Error(`Model ${currentModel} unavailable (${response.status}): ${errText}`);
            break;
          }
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Google AI Studio API Error (${response.status}): ${errorText}`);
        }

        if (attempt > 1) {
          console.log(`✅  Connected successfully to ${currentModel} on retry attempt ${attempt}!`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        return text;
      } catch (e) {
        if (e.message.includes('404') || e.message.includes('503') || e.message.includes('429')) {
          lastError = e;
          break;
        }
        throw e;
      }
    }
  }

  throw lastError || new Error(`All candidate models failed for ${model}. Please verify your network or GEMINI_API_KEY.`);
}

/**
 * Step 0: Decompose raw prompt into requirements, questions, and assumptions
 */
export async function geminiPromptRefine(rawAsk) {
  const systemPrompt = `You are running the Prompt Refiner process on a software feature request.
Follow this process exactly:
1. Decompose the request into structural dimensions: Trigger, Inputs, Core behavior, Outputs, Error/edge cases, Data/schema impact, Integration points, Non-functional constraints, Acceptance criteria, Out of scope.
2. Classify each as Stated, Assumed, or Unknown.
3. Every gap becomes a question. Every inference becomes a stated assumption requiring yes/no confirmation.
4. Output in this exact format:

## Questions (need your answer)
1. ...

## Assumptions (please confirm or correct)
1. I'm assuming X — correct? [Y/N]

If both lists are empty, say so explicitly and provide the full # Feature: <name> requirements doc directly.`;

  return await callGemini(FLASH_MODEL, systemPrompt, rawAsk);
}

/**
 * Step 0 Helper: On-demand Staff Architect consultation for inline question answering
 */
export async function geminiConsultArchitect(questionText, userInquiry) {
  const systemPrompt = `You are a Senior Principal Software Architect.
The user is answering a specific architectural question for an upcoming feature and needs a concise, direct recommendation.
Respond in this exact, compact structure:
• Option A: [Name] → 1-sentence trade-off
• Option B: [Name] → 1-sentence trade-off
• Recommendation: State exactly which option to choose and why in 1 sentence.

Do NOT output '## Questions' or '## Assumptions' headers. Keep it under 6 lines total.`;

  const prompt = `QUESTION BEING ANSWERED: "${questionText}"\nUSER INQUIRY: "${userInquiry}"`;
  return await callGemini(FLASH_MODEL, systemPrompt, prompt);
}

/**
 * Step 1: Whole-Repo Reconnaissance (1M+ context ingestion)
 */
export async function geminiRecon(featureDescription, repoContextText) {
  const systemPrompt = `You map existing territory. You do not design anything.

Given a feature description and the full codebase context, produce a reconnaissance report answering only:

1. Which bounded context owns this? Name the service and the directory.
2. What is the closest existing feature in this repo? Give the file paths for its domain types, its handler, its adapter, and its tests.
3. Which shared packages already solve part of this? Name them and the exact exported symbols.
4. What conventions apply? Naming, error handling, logging, validation, event payload shape — with a file path as evidence for each claim.
5. What is genuinely absent? Anything this feature needs that has no precedent in the repo.
6. What could not be determined from the code alone?

Rules:
- Every claim carries a file path. A claim without one is a guess and does not belong in the report.
- Do not propose an approach, an architecture, or a task list.
- Section 5 is the most valuable part of your report. Be exact about what is new, because everything new is where the design risk lives.
- Report absence plainly. "No existing precedent" is a useful finding, not a failure to search hard enough.`;

  const userPrompt = `FEATURE DESCRIPTION:\n${featureDescription}\n\n==================== CODEBASE CONTEXT ====================\n${repoContextText}`;
  return await callGemini(PRO_MODEL, systemPrompt, userPrompt);
}

/**
 * Step 1 & Step 2: Adversarial Skeptic Falsification
 */
export async function geminiSkeptic(contractOrPlanContent) {
  const systemPrompt = `You are trying to cause a production incident.

Read the plan/contract document. You are not reviewing style, naming, completeness, or documentation. You are looking for the specific runtime conditions under which this plan fails.

Interrogate at minimum:
- Concurrent invocation. Two Lambdas execute this path at the same instant.
- Retry. The caller retries after a timeout, with no idempotency key.
- Partial failure. The write succeeded, the event publish did not. Or the reverse.
- Transaction scope. Which statements share a transaction, and what happens if the boundary is drawn one statement too early or too late.
- Lock contention. Does this path take a lock a slow legacy call sits inside?
- Deploy ordering. Code ships before schema, or schema before code.
- Event replay and out-of-order delivery.
- Cold start and connection pool exhaustion under a concurrency spike.
- Time. Day boundaries, timezone, clock skew, scheduled triggers firing twice.

Output findings only, each in this shape:

    SEVERITY — one-line summary
    Trigger: the exact conditions
    Consequence: what the user or the data experiences
    Fix: the smallest change to the plan that removes it

Severities:
    BLOCKER  the plan is wrong; implementing it as written produces a defect
    MAJOR    correct under light load, fails under real conditions
    MINOR    worth recording, not worth blocking on

Do not use any other severity. Do not report style, naming, or missing documentation.
Zero blockers is an expected and correct outcome. If the plan holds up, say "NO BLOCKERS DETECTED" and stop.`;

  return await callGemini(PRO_MODEL, systemPrompt, contractOrPlanContent, { thinkingBudget: 4096 });
}

/**
 * Step 2: Parallel Layer Fan-out (Domain, App-Infra, Data)
 */
export async function geminiLayerFanout(layerType, contractContent, reconContent) {
  let instructions = '';
  if (layerType === 'domain') {
    instructions = 'Produce 03-domain.md: entities, value objects, aggregates, domain services, invariant enforcement, port declarations, domain events. No framework or AWS types appear here.';
  } else if (layerType === 'app-infra') {
    instructions = 'Produce 03-app-infra.md: application handlers, orchestration, transaction boundaries, port implementations, AWS wiring, configuration, the serverless definition.';
  } else if (layerType === 'data') {
    instructions = 'Produce 03-data.md: DDL, stored procedures, indexes, migration files in expand-then-contract order, and the rollback path for each.';
  }

  const prompt = `${instructions}

Requirements/Contract:
${contractContent}

Recon Precedent:
${reconContent}`;

  return await callGemini(FLASH_MODEL, 'You are an expert system architect creating a subsystem layer plan.', prompt, { label: layerType });
}

/**
 * Step 3: Plan Conformance & Drift Checker
 */
export async function geminiPlanConformance(contractContent, tasksContent, gitDiff) {
  const systemPrompt = `You check for drift between the approved plan and the code currently modified in the diff.
You are evaluating the PROGRESS of atomic task implementation.

CRITICAL RULES:
1. Scope your audit ONLY to tasks that are marked [x] / completed in 05-tasks.md, or files present in the GIT DIFF.
2. DO NOT flag upcoming, pending, or unstarted tasks as "drift" or "unsatisfied". They are expected to be pending until their turn in the pipeline.
3. Only report ACTUAL drift:
   - Contract Drift: If modified code contradicts the technical contract interface.
   - Plan Drift: If a task marked [x] is missing from the diff, or if the diff contains completely unrelated modified files.
   - Operational Checklist: Security, SQL safety, transaction boundaries in the modified lines.

If the current diff satisfies the implemented tasks with zero violations, simply respond: "✅ All active tasks in diff conform strictly to contracts. No drift detected."`;

  const userPrompt = `02-contracts.md:\n${contractContent}\n\n05-tasks.md:\n${tasksContent}\n\nCURRENT GIT DIFF:\n${gitDiff}`;
  return await callGemini(FLASH_MODEL, systemPrompt, userPrompt);
}

/**
 * Step 4: Full-Repo Impact & Regression Review
 */
export async function geminiRepoImpactReview(gitDiff, fullRepoSummary) {
  const systemPrompt = `You analyze code changes for subtle, distant regressions across the whole repository.
Look for:
1. Callers or consumers in other modules/services that relied on previous behavior or interfaces.
2. Shared utility or package modifications that could affect unrelated services.
3. Database query changes that affect shared tables or background workers.
4. Exported symbol removals, renaming, or signature shifts.

Output findings cleanly with specific file references and potential breaking impact.`;

  const userPrompt = `GIT DIFF:\n${gitDiff}\n\nREPOSITORY OVERVIEW & CONSUMERS:\n${fullRepoSummary}`;
  return await callGemini(PRO_MODEL, systemPrompt, userPrompt);
}
