import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX_RULES_BYTES = 4096; // 4KB guard against prompt bloat

export const RULE_PRESETS = {
  'typescript': {
    name: 'TypeScript & Node.js Enterprise',
    desc: 'Strict types, no implicit any, ESM loaders, Result<T,E> errors, Vitest/Jest TDD',
    content: `# TypeScript & Node.js Engineering Rules
- [Architecture] Strictly enforce layered architecture: Controller/Handler -> Domain Service -> Repository Port -> DB Adapter.
- [Type Safety] Explicit \`any\` is strictly prohibited. Use strong interfaces, generics, or \`unknown\` with type guards.
- [Error Handling] Handlers must return structured RFC 7807 error envelopes or custom Result<T, Error> types.
- [Testing] Write unit tests first (TDD). Every business rule must have a characterization test before modifying code.
- [DB Safety] Database changes must be non-destructive (expand-and-contract migrations only).
`
  },
  'microservices': {
    name: 'Microservices & Distributed Systems',
    desc: 'Idempotency keys, distributed transaction safety, outbox pattern, async event schemas',
    content: `# Microservices & Distributed Architecture Rules
- [API Contracts] All inter-service calls must use strict schema validation (OpenAPI/Protobuf/JSON Schema).
- [Resilience] Every mutable RPC/HTTP endpoint must accept an Idempotency-Key header.
- [Data Consistency] Cross-service state updates must use the Outbox pattern or Saga orchestration; no distributed 2PC locks.
- [Observability] Propagate OpenTelemetry trace_id and span_id across all asynchronous messages and RPC calls.
- [Deploy Safety] Code changes must be backward-compatible with at least N-1 version of sibling services.
`
  },
  'frontend': {
    name: 'Modern Web & Frontend (React / Next.js / Tailwind)',
    desc: 'Accessible components, state matrices [Idle, Loading, Error, Empty], data-testid',
    content: `# Modern Frontend & UI/UX Rules
- [State Matrix] Every interactive component must explicitly handle 5 states: [Idle, Loading, Error, Empty, Disabled].
- [Accessibility] All form inputs and buttons must include accessible aria-labels and semantic HTML roles.
- [Testing] Every interactive element must carry an explicit \`data-testid\` attribute for automated E2E testing.
- [Styling] Use design system tokens / Tailwind utility classes; avoid hardcoded magic pixel values.
- [Performance] Lazy-load heavy components and prioritize Core Web Vitals (LCP, INP, CLS).
`
  },
  'python': {
    name: 'Python & FastAPI Backend',
    desc: 'Pydantic v2 schemas, type annotations, async SQLAlchemy, Pytest fixtures',
    content: `# Python & FastAPI Engineering Rules
- [Type Checking] Enforce strict typing with Mypy and Pydantic v2 schemas on all request/response boundaries.
- [Layering] Separate FastAPI route handlers from service layer business logic.
- [Database] Use async SQLAlchemy / Alembic migrations with non-destructive column additions.
- [Testing] Use Pytest fixtures with AAA (Arrange-Act-Assert) pattern and parameterized test cases.
`
  }
};

export function applyRulePreset(presetKeys, cwd = process.cwd()) {
  const keys = Array.isArray(presetKeys) ? presetKeys : [presetKeys];
  const rulePath = path.join(cwd, '.dagrules');
  let currentContent = fs.existsSync(rulePath) ? fs.readFileSync(rulePath, 'utf8').trim() : '';

  const appliedNames = [];
  let totalRulesAdded = 0;

  for (const key of keys) {
    const preset = RULE_PRESETS[key];
    if (preset) {
      appliedNames.push(preset.name);
      const newRules = preset.content.trim();
      totalRulesAdded += preset.content.split('\n- ').length - 1;
      
      if (!currentContent.includes(preset.name)) {
        currentContent = currentContent ? `${currentContent}\n\n${newRules}` : newRules;
      }
    }
  }

  if (appliedNames.length === 0) {
    throw new Error(`No valid rule presets specified: ${keys.join(', ')}`);
  }

  // Clamp to MAX_RULES_BYTES
  if (Buffer.byteLength(currentContent, 'utf8') > MAX_RULES_BYTES) {
    currentContent = currentContent.slice(0, MAX_RULES_BYTES);
  }

  fs.writeFileSync(rulePath, currentContent.trim() + '\n');
  return { path: rulePath, preset: appliedNames.join(' + '), count: totalRulesAdded };
}

export function loadProjectRules(cwd = process.cwd()) {
  const candidatePaths = [
    path.join(cwd, '.dagrules'),
    path.join(cwd, '.cursorrules'),
    path.join(os.homedir(), '.dagrules')
  ];

  for (const rulePath of candidatePaths) {
    if (fs.existsSync(rulePath)) {
      try {
        let content = fs.readFileSync(rulePath, 'utf8').trim();
        if (!content) continue;

        // If file contains [DAG_RULES] section, prioritize that block
        const dagSectionMatch = content.match(/\[DAG_RULES\]([\s\S]*?)(?=\n\[|$)/i);
        if (dagSectionMatch && dagSectionMatch[1].trim()) {
          content = dagSectionMatch[1].trim();
        }

        // Clamp to MAX_RULES_BYTES
        if (Buffer.byteLength(content, 'utf8') > MAX_RULES_BYTES) {
          content = content.slice(0, MAX_RULES_BYTES) + '\n... [Rules truncated for token efficiency]';
        }

        return {
          rules: content,
          source: path.basename(rulePath),
          path: rulePath
        };
      } catch (e) {}
    }
  }

  return { rules: '', source: null, path: null };
}

export function formatRulesForPrompt(projectRules) {
  if (!projectRules || !projectRules.rules) return '';
  
  return `
==================== ORGANIZATIONAL RULES & POLICIES (${projectRules.source}) ====================
${projectRules.rules}
=============================================================================================
(Note: Approved contracts strictly override generic rules if a direct contradiction occurs)
`;
}

export function appendLearnedRule(feedbackText, category = 'General', cwd = process.cwd()) {
  const rulePath = path.join(cwd, '.dagrules');
  let currentContent = '';
  
  if (fs.existsSync(rulePath)) {
    try {
      currentContent = fs.readFileSync(rulePath, 'utf8').trim();
    } catch (e) {}
  } else {
    currentContent = '# Team Engineering Policies & Architecture Rules\n';
  }

  // Clean and format feedback into a crisp policy bullet
  const cleanFeedback = feedbackText
    .replace(/^["']|["']$/g, '')
    .replace(/^(please|can you|make sure to|remember to|we need to)\s+/i, '')
    .trim();

  const formattedBullet = `- [${category}] ${cleanFeedback}`;

  // Check if rule already exists
  if (currentContent.includes(cleanFeedback)) {
    return { updated: false, rule: cleanFeedback, path: rulePath };
  }

  let updatedContent = `${currentContent}\n${formattedBullet}\n`;

  // Clamp to MAX_RULES_BYTES
  if (Buffer.byteLength(updatedContent, 'utf8') > MAX_RULES_BYTES) {
    updatedContent = updatedContent.slice(0, MAX_RULES_BYTES);
  }

  fs.writeFileSync(rulePath, updatedContent);
  return { updated: true, rule: formattedBullet, path: rulePath };
}

/**
 * Parses discovered architectural conventions from 01-recon.md (Section 4)
 */
export function extractConventionsFromRecon(reconText = '') {
  if (!reconText) return [];
  const conventionsMatch = reconText.match(/(?:4\.\s*What conventions apply[^\n]*|##\s*Conventions[^\n]*)([\s\S]*?)(?=(?:\n\d+\.|\n##|$))/i);
  if (!conventionsMatch || !conventionsMatch[1]) return [];

  const rawLines = conventionsMatch[1].split('\n')
    .map(l => l.replace(/^[\s\*\-\d\.\)]+/, '').trim())
    .filter(l => l.length > 15 && !l.toLowerCase().startsWith('what conventions') && !l.toLowerCase().includes('every claim carries'));

  // Return up to 4 top unique conventions
  return Array.from(new Set(rawLines)).slice(0, 4);
}
