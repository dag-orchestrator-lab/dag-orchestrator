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
    { path: path.join(cwd, 'dag', 'rules', 'rules.md'), label: 'Team Rules (dag/rules/rules.md)' },
    { path: path.join(cwd, 'dag', 'rules', 'team-standards.md'), label: 'Team Standards (dag/rules)' },
    { path: path.join(cwd, 'dag', 'rules.md'), label: 'Team Rules (dag/rules.md)' },
    { path: path.join(cwd, '.dag', 'rules', 'rules.md'), label: 'Local Rules (.dag/rules/rules.md)' },
    { path: path.join(cwd, '.dag', 'rules.md'), label: 'Local Rules (.dag/rules.md)' },
    { path: path.join(cwd, '.dagrules'), label: 'Team Rules (.dagrules)' },
    { path: path.join(cwd, '.dagrules.local'), label: 'Local Rules (.dagrules.local)' },
    { path: path.join(cwd, '.cursorrules'), label: 'Cursor Rules (.cursorrules)' },
    { path: path.join(os.homedir(), '.dagrules'), label: 'Global User Rules (~/.dagrules)' }
  ];

  const foundRules = [];
  const foundSources = [];

  for (const item of candidatePaths) {
    if (fs.existsSync(item.path)) {
      try {
        let content = fs.readFileSync(item.path, 'utf8').trim();
        if (!content) continue;

        // If file contains [DAG_RULES] section, prioritize that block
        const dagSectionMatch = content.match(/\[DAG_RULES\]([\s\S]*?)(?=\n\[|$)/i);
        if (dagSectionMatch && dagSectionMatch[1].trim()) {
          content = dagSectionMatch[1].trim();
        }

        // Check if file has substantive rule lines (starts with - or contains rules)
        const substantive = content.split('\n').filter(l => l.trim().startsWith('- '));
        if (substantive.length > 0 || content.length > 20) {
          foundRules.push(content);
          foundSources.push(item.label);
        }
      } catch (e) {}
    }
  }

  if (foundRules.length > 0) {
    let combined = foundRules.join('\n\n');
    if (Buffer.byteLength(combined, 'utf8') > MAX_RULES_BYTES) {
      combined = combined.slice(0, MAX_RULES_BYTES) + '\n... [Rules truncated for token efficiency]';
    }
    return {
      rules: combined,
      source: foundSources.join(' + '),
      path: candidatePaths.find(c => fs.existsSync(c.path))?.path
    };
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

export function appendLearnedRule(feedbackText, category = 'General', isLocal = false, cwd = process.cwd()) {
  const targetDir = isLocal ? path.join(cwd, '.dag', 'rules') : path.join(cwd, 'dag', 'rules');
  const rulePath = isLocal 
    ? path.join(targetDir, 'rules.md') 
    : (fs.existsSync(path.join(cwd, '.dagrules')) ? path.join(cwd, '.dagrules') : path.join(targetDir, 'rules.md'));
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let currentContent = '';
  
  if (fs.existsSync(rulePath)) {
    try {
      currentContent = fs.readFileSync(rulePath, 'utf8').trim();
    } catch (e) {}
  } else {
    currentContent = isLocal ? '# Local Developer Rules (Gitignored)\n' : '# Team Engineering Policies & Architecture Rules\n';
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

/**
 * Syncs rules bidirectionally or unidirectionally without removing from source.
 * Merges and keeps rules present in both locations.
 */
export function syncRules(mode = 'bidirectional', cwd = process.cwd()) {
  const teamPath = fs.existsSync(path.join(cwd, 'dag', 'rules', 'team-standards.md'))
    ? path.join(cwd, 'dag', 'rules', 'team-standards.md')
    : path.join(cwd, '.dagrules');
  const localPath = fs.existsSync(path.join(cwd, '.dag', 'rules.md'))
    ? path.join(cwd, '.dag', 'rules.md')
    : (fs.existsSync(path.join(cwd, '.dagrules.local')) ? path.join(cwd, '.dagrules.local') : path.join(cwd, '.dag', 'rules.md'));

  if (!fs.existsSync(path.join(cwd, '.dag'))) {
    fs.mkdirSync(path.join(cwd, '.dag'), { recursive: true });
  }

  const teamContent = fs.existsSync(teamPath) ? fs.readFileSync(teamPath, 'utf8').trim() : '';
  const localContent = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8').trim() : '';

  const parseBullets = text => text.split('\n').filter(l => l.trim().startsWith('- '));

  const teamBullets = parseBullets(teamContent);
  const localBullets = parseBullets(localContent);

  let mergedTeam = [...teamBullets];
  let mergedLocal = [...localBullets];

  if (mode === 'local-to-team') {
    for (const b of localBullets) {
      if (!mergedTeam.includes(b)) mergedTeam.push(b);
    }
  } else if (mode === 'team-to-local') {
    for (const b of teamBullets) {
      if (!mergedLocal.includes(b)) mergedLocal.push(b);
    }
  } else if (mode === 'bidirectional') {
    const all = Array.from(new Set([...teamBullets, ...localBullets]));
    mergedTeam = [...all];
    mergedLocal = [...all];
  }

  if (mode === 'local-to-team' || mode === 'bidirectional') {
    const teamHeader = teamContent.startsWith('#') ? teamContent.split('\n')[0] : '# Team Engineering Policies & Architecture Rules';
    fs.writeFileSync(teamPath, `${teamHeader}\n${mergedTeam.join('\n')}\n`, 'utf8');
  }

  if (mode === 'team-to-local' || mode === 'bidirectional') {
    const localHeader = localContent.startsWith('#') ? localContent.split('\n')[0] : '# Local Developer Rules (Gitignored)';
    fs.writeFileSync(localPath, `${localHeader}\n${mergedLocal.join('\n')}\n`, 'utf8');
  }

  return {
    mode,
    teamPath: path.basename(teamPath),
    localPath: path.basename(localPath),
    teamCount: mergedTeam.length,
    localCount: mergedLocal.length
  };
}

/**
 * Ports / Moves rules from Source to Destination, clearing transferred rules from the source.
 * Mode: 'local-to-team' (moves local -> team) | 'team-to-local' (moves team -> local)
 */
export function portRules(mode = 'local-to-team', cwd = process.cwd()) {
  const teamPath = fs.existsSync(path.join(cwd, 'dag', 'rules', 'team-standards.md'))
    ? path.join(cwd, 'dag', 'rules', 'team-standards.md')
    : path.join(cwd, '.dagrules');
  const localPath = fs.existsSync(path.join(cwd, '.dag', 'rules.md'))
    ? path.join(cwd, '.dag', 'rules.md')
    : (fs.existsSync(path.join(cwd, '.dagrules.local')) ? path.join(cwd, '.dagrules.local') : path.join(cwd, '.dag', 'rules.md'));

  if (!fs.existsSync(path.join(cwd, '.dag'))) {
    fs.mkdirSync(path.join(cwd, '.dag'), { recursive: true });
  }

  const teamContent = fs.existsSync(teamPath) ? fs.readFileSync(teamPath, 'utf8').trim() : '';
  const localContent = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8').trim() : '';

  const parseBullets = text => text.split('\n').filter(l => l.trim().startsWith('- '));

  const teamBullets = parseBullets(teamContent);
  const localBullets = parseBullets(localContent);

  let portedCount = 0;

  if (mode === 'local-to-team') {
    // Transfer local rules into team rules, then clear local rules
    const newTeam = [...teamBullets];
    for (const b of localBullets) {
      if (!newTeam.includes(b)) {
        newTeam.push(b);
        portedCount++;
      }
    }
    const teamHeader = teamContent.startsWith('#') ? teamContent.split('\n')[0] : '# Team Engineering Policies & Architecture Rules';
    fs.writeFileSync(teamPath, `${teamHeader}\n${newTeam.join('\n')}\n`, 'utf8');

    // Reset local rules to empty template
    fs.writeFileSync(localPath, '# Local Developer Rules (Gitignored)\n', 'utf8');

    return {
      mode,
      from: path.basename(localPath),
      to: path.basename(teamPath),
      portedCount,
      totalAtDest: newTeam.length
    };
  } else if (mode === 'team-to-local') {
    // Transfer team rules into local rules, then clear team rules
    const newLocal = [...localBullets];
    for (const b of teamBullets) {
      if (!newLocal.includes(b)) {
        newLocal.push(b);
        portedCount++;
      }
    }
    const localHeader = localContent.startsWith('#') ? localContent.split('\n')[0] : '# Local Developer Rules (Gitignored)';
    fs.writeFileSync(localPath, `${localHeader}\n${newLocal.join('\n')}\n`, 'utf8');

    // Reset team rules to empty template
    fs.writeFileSync(teamPath, '# Team Engineering Policies & Architecture Rules\n', 'utf8');

    return {
      mode,
      from: path.basename(teamPath),
      to: path.basename(localPath),
      portedCount,
      totalAtDest: newLocal.length
    };
  }
}
