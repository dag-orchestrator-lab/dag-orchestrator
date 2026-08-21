#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execSync, spawn } from 'node:child_process';

import { 
  loadConfig, 
  saveConfig, 
  saveLocalConfig, 
  applyPreset, 
  listPresets, 
  saveCustomPreset,
  setHarnessRunner,
  listHarnesses 
} from '../src/config.js';
import { 
  getPipelineStatus, 
  createRollbackSnapshot, 
  cleanArtifacts, 
  archiveFeatureWorkspace,
  unarchiveFeatureWorkspace,
  activateFeatureWorkspace,
  listArchivedFeatures,
  getFeatureContextMeta,
  saveFeatureContextMeta,
  recordGateApproval, 
  resolveArtifactPath, 
  getFeatureWorkspaceDir, 
  listAllFeatures, 
  slugify 
} from '../src/state.js';
import { recordStageMetrics, getFeatureBenchmark } from '../src/metrics.js';
import { loadProjectRules, formatRulesForPrompt, appendLearnedRule, extractConventionsFromRecon, RULE_PRESETS, applyRulePreset, syncRules, portRules } from '../src/rules.js';
import { verifyContractSpec, verifyTaskList, renderVerificationReport, verifyFullPipeline } from '../src/verifier.js';
import { linkService, unlinkService, harvestAllLinkedServices, renderServicesList } from '../src/services.js';
import { isFrontendTask, processUIDesignReference, formatUIContractSection } from '../src/ui-design.js';
import { banner, logStep, logSuccess, logWarning, logError, logGate, renderStatusCard, ANSI } from '../src/ui.js';
import { getProviderForStage, executeStagePrompt } from '../src/providers/index.js';
import { geminiPromptRefine, geminiConsultArchitect } from '../src/gemini.js';
import { claudeGeneratePrDescription } from '../src/claude.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = query => new Promise(resolve => rl.question(query, resolve));

function askMultiLine(promptText) {
  return new Promise((resolve) => {
    console.log(promptText);
    console.log(`${ANSI.dim}(Paste multi-line text. Press Enter on an empty line when finished, or type 'EOF'):${ANSI.reset}`);
    const lines = [];
    const onLine = (line) => {
      if (line.trim() === 'EOF' || (line === '' && lines.length > 0)) {
        rl.removeListener('line', onLine);
        resolve(lines.join('\n').trim());
      } else {
        lines.push(line);
      }
    };
    rl.on('line', onLine);
  });
}

async function ensureRepoInit(cwd = process.cwd(), force = false) {
  const config = loadConfig(cwd);
  const localConfigPath = path.join(cwd, '.dag', 'config.json');

  // Check if project has already been initialized (unless force is true)
  if (!force && fs.existsSync(localConfigPath) && config.SPECS_DIR) {
    return config;
  }

  // First run in this repo: prompt interactive setup
  console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
  console.log(`│ 🚀 WELCOME TO DAG ORCHESTRATOR - REPOSITORY SETUP                 │`);
  console.log(`└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);
  console.log(`This is the first time running DAG in this repository.`);

  console.log(`\n👉 Where should DAG store feature specification documents?`);
  console.log(`   ${ANSI.bold}[1] Committed team specs${ANSI.reset} → ${ANSI.cyan}dag/features/<feature-name>/${ANSI.reset} (Default - Shared living ADRs)`);
  console.log(`   ${ANSI.bold}[2] Gitignored local workspace${ANSI.reset} → ${ANSI.cyan}.dag/features/<feature-name>/${ANSI.reset} (Private / local-only)`);

  const choice = await askQuestion('\nSelection [1/2] (Default: 1): ');
  const trimmed = choice.trim();

  let specsDir = 'dag/features';
  let shouldGitignore = false;

  if (trimmed === '2') {
    specsDir = '.dag/features';
    shouldGitignore = true;
  } else {
    specsDir = 'dag/features';
    shouldGitignore = false;
  }

  // Step 2: Choose Execution Harness
  console.log(`\n👉 Select Execution Harness runner:`);
  console.log(`   ${ANSI.bold}[1] standalone${ANSI.reset} → Lightweight CLI mode with native ANSI status cards (Default)`);
  console.log(`   ${ANSI.bold}[2] dsh${ANSI.reset}        → Orchestrate via DeepSeek Harness (Process supervisor & Web UI)`);
  console.log(`   ${ANSI.bold}[3] headless${ANSI.reset}   → Zero-prompt JSON runner for CI/CD pipelines`);

  const harnessChoice = await askQuestion('\nSelection [1/2/3] (Default: 1): ');
  const hTrimmed = harnessChoice.trim();
  let chosenHarness = 'standalone';
  if (hTrimmed === '2') chosenHarness = 'dsh';
  else if (hTrimmed === '3') chosenHarness = 'headless';

  // Step 3: Choose Model Provider Preset
  console.log(`\n👉 Select AI Model Stack Preset:`);
  console.log(`   ${ANSI.bold}[1] hybrid${ANSI.reset}   → Gemini 1M+ Context & Audits + Claude Sonnet Coding (Recommended)`);
  console.log(`   ${ANSI.bold}[2] claude${ANSI.reset}   → 100% Claude Code CLI (No external API keys required)`);
  console.log(`   ${ANSI.bold}[3] gemini${ANSI.reset}   → 100% Google AI Studio`);
  console.log(`   ${ANSI.bold}[4] deepseek${ANSI.reset} → 100% DeepSeek-V3 / R1`);
  console.log(`   ${ANSI.bold}[5] local${ANSI.reset}    → 100% Offline / Air-Gapped via Ollama`);

  const presetChoice = await askQuestion('\nSelection [1/2/3/4/5] (Default: 1): ');
  const pTrimmed = presetChoice.trim();
  let chosenPreset = 'hybrid';
  if (pTrimmed === '2') chosenPreset = 'claude';
  else if (pTrimmed === '3') chosenPreset = 'gemini';
  else if (pTrimmed === '4') chosenPreset = 'deepseek';
  else if (pTrimmed === '5') chosenPreset = 'local';

  // Always ensure .dag/ (local cache/backups) and local overrides are in .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    let gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    let added = false;
    if (!gitignoreContent.includes('.dag/')) {
      gitignoreContent += '\n# DAG Orchestrator local cache, gates, and snapshots\n.dag/\n';
      added = true;
    }
    if (!gitignoreContent.includes('.dagrules.local')) {
      gitignoreContent += '.dagrules.local\n';
      added = true;
    }
    if (added) {
      fs.writeFileSync(gitignorePath, gitignoreContent);
      logSuccess('Ensured .dag/ and .dagrules.local are in .gitignore');
    }
  }

  // Only create dsh.config.yaml if user explicitly selects DeepSeek Harness (dsh)
  if (chosenHarness === 'dsh') {
    const dshConfigPath = path.join(cwd, '.dag', 'dsh.config.yaml');
    if (!fs.existsSync(dshConfigPath)) {
      const defaultDshYaml = `# DeepSeek Harness (dsh) Multi-Agent Configuration
version: "1.0"

models:
  gemini-flash:
    provider: google-ai-studio
    model: gemini-3.6-flash
  gemini-pro:
    provider: google-ai-studio
    model: gemini-3.6-pro
    api_key: "\${GEMINI_API_KEY}"
    thinking_budget: 4096
  claude-code:
    provider: cli
    command: "claude -p"

workflow:
  step_0_refine:
    model: gemini-flash
    artifact: "00-requirements.md"
  step_1_contract:
    recon_model: gemini-pro
    spec_model: claude-code
    skeptic_model: gemini-pro
    gate: "Gate 1 (Human Approval)"
    artifact: "02-contracts.md"
  step_2_layers:
    fanout_model: gemini-flash
    merger_model: claude-code
    gate: "Gate 2 (Conflict Resolution)"
    artifact: "05-tasks.md"
  step_3_implement:
    coding_model: claude-code
    conformance_model: gemini-flash
    artifact: "DIFF.patch"
  step_4_review:
    impact_model: gemini-pro
    review_model: claude-code
`;
      fs.writeFileSync(dshConfigPath, defaultDshYaml);
      logSuccess('Created .dag/dsh.config.yaml (DeepSeek Harness)');
    }
  }

  saveLocalConfig({
    SPECS_DIR: specsDir,
    DEFAULT_HARNESS: chosenHarness,
    DEFAULT_PROVIDER_PRESET: chosenPreset
  }, cwd);

  logSuccess(`Saved repository configuration!`);
  console.log(`   • Specs Directory: ${ANSI.bold}${specsDir}${ANSI.reset}`);
  console.log(`   • Harness Runner:  ${ANSI.bold}${chosenHarness}${ANSI.reset}`);
  console.log(`   • Model Preset:    ${ANSI.bold}${chosenPreset}${ANSI.reset}\n`);

  // Step 4 (Optional): Auto-Harvest Repository Conventions into .dagrules
  const rulePath = path.join(cwd, '.dagrules');
  if (!fs.existsSync(rulePath)) {
    const scanRules = await askQuestion('👉 Scan codebase to discover conventions & generate initial .dagrules? [Y/n] (Default: Y): ');
    const sTrimmed = scanRules.trim().toLowerCase();
    if (!sTrimmed || sTrimmed === 'y' || sTrimmed === 'yes') {
      try {
        logStep('Scanning repository conventions (1M+ Context)...', 'Google AI Studio', 'gemini-3.6-pro');
        const repoSummary = getRepoContextSummary(cwd);
        const reconReport = await executeStagePrompt('recon', 'Analyze repo conventions', '', { repoContext: repoSummary });
        const discovered = extractConventionsFromRecon(reconReport);

        if (discovered.length > 0) {
          console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
          console.log(`│ 💡 DISCOVERED REPOSITORY CONVENTIONS                               │`);
          console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
          for (let i = 0; i < discovered.length; i++) {
            console.log(`  [${i + 1}] ${discovered[i]}`);
          }
          console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);
          const pChoice = await askQuestion('\n👉 Select conventions to save into .dagrules [e.g. 1,2 / all / none] (Default: all): ');
          const pTrim = pChoice.trim();
          if (pTrim.toLowerCase() !== 'none' && pTrim.toLowerCase() !== 'n') {
            let toSave = discovered;
            if (pTrim && pTrim.toLowerCase() !== 'all') {
              const indices = pTrim.split(/[\s,]+/).map(n => parseInt(n, 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < discovered.length);
              toSave = indices.map(i => discovered[i]);
            }
            for (const rule of toSave) {
              appendLearnedRule(rule, 'Harvested Convention', cwd);
            }
            logSuccess(`Saved ${toSave.length} permanent policy rules to .dagrules!\n`);
          }
        } else {
          console.log('\n💡 Codebase scanned: No explicit unique conventions found to extract.');
          console.log('👉 Would you like to seed `.dagrules` with an industry standard preset?');
          console.log(`   ${ANSI.bold}[1] TypeScript & Node.js Enterprise${ANSI.reset} (Strict types, Result<T,E>, TDD)`);
          console.log(`   ${ANSI.bold}[2] Microservices & Distributed${ANSI.reset}     (Idempotency, Outbox, OpenTelemetry)`);
          console.log(`   ${ANSI.bold}[3] Modern Frontend / Fullstack${ANSI.reset}     (React/Next.js, 5-state matrix, A11y)`);
          console.log(`   ${ANSI.bold}[4] Python & FastAPI Backend${ANSI.reset}        (Pydantic v2, async DB, Mypy)`);
          console.log(`   ${ANSI.bold}[5] ⏩ Skip (Start with empty rules)${ANSI.reset}\n`);

          const presetChoice = await askQuestion('Selection [e.g. 1,3 / all / 5 to skip] (Default: 1): ');
          const pTrim = presetChoice.trim() || '1';
          if (pTrim !== '5' && pTrim.toLowerCase() !== 'skip') {
            const presetMap = { '1': 'typescript', '2': 'microservices', '3': 'frontend', '4': 'python' };
            let selectedKeys = [];
            if (pTrim.toLowerCase() === 'all') {
              selectedKeys = ['typescript', 'microservices', 'frontend', 'python'];
            } else {
              const tokens = pTrim.split(/[\s,]+/).map(t => t.trim());
              for (const token of tokens) {
                if (presetMap[token]) selectedKeys.push(presetMap[token]);
                else if (RULE_PRESETS[token.toLowerCase()]) selectedKeys.push(token.toLowerCase());
              }
            }

            if (selectedKeys.length > 0) {
              const res = applyRulePreset(selectedKeys, cwd);
              logSuccess(`Seeded .dagrules with "${res.preset}" (${res.count} rules)!\n`);
            } else {
              console.log('⏩ Skipped rule preset seeding.\n');
            }
          } else {
            console.log('⏩ Skipped rule preset seeding.\n');
          }
        }
      } catch (err) {
        logWarning(`Could not auto-harvest rules: ${err.message}\n`);
      }
    }
  }

  return loadConfig(cwd);
}

function getRepoContextSummary(cwd = process.cwd()) {
  try {
    const gitFiles = execSync('git ls-files | grep -E "\\.(ts|js|sql|json|md)$" | head -n 100', {
      cwd,
      encoding: 'utf8'
    });
    return `Files in repository:\n${gitFiles}`;
  } catch (e) {
    return 'No git repository detected or unable to list files.';
  }
}

function parseRefinementItems(text) {
  const questions = [];
  const assumptions = [];

  const questionsMatch = text.match(/## Questions[\s\S]*?(?=## Assumptions|$)/i);
  if (questionsMatch) {
    const lines = questionsMatch[0].split('\n');
    let currentItem = '';
    for (const line of lines) {
      if (/^\s*\d+[\.\)]\s+/.test(line)) {
        if (currentItem) questions.push(currentItem.trim());
        currentItem = line.replace(/^\s*\d+[\.\)]\s+/, '').trim();
      } else if (currentItem && line.trim() && !line.startsWith('##')) {
        currentItem += ' ' + line.trim();
      }
    }
    if (currentItem) questions.push(currentItem.trim());
  }

  const assumptionsMatch = text.match(/## Assumptions[\s\S]*$/i);
  if (assumptionsMatch) {
    const lines = assumptionsMatch[0].split('\n');
    let currentItem = '';
    for (const line of lines) {
      if (/^\s*\d+[\.\)]\s+/.test(line)) {
        if (currentItem) assumptions.push(currentItem.trim());
        currentItem = line.replace(/^\s*\d+[\.\)]\s+/, '').trim();
      } else if (currentItem && line.trim() && !line.startsWith('##')) {
        currentItem += ' ' + line.trim();
      }
    }
    if (currentItem) assumptions.push(currentItem.trim());
  }

  return { questions, assumptions };
}

async function runStep0(featureAsk, options = {}) {
  banner('STEP 0: REFINE THE RAW ASK');
  const provider = getProviderForStage('refine');

  let existingContext = '';

  // 1. Check for --file or --plan flag (supports --file=path or --file path)
  let targetFile = options.file || options.plan || '';
  const fileIdx = process.argv.findIndex(a => a === '--file' || a === '--plan' || a === '-f');
  if (fileIdx !== -1 && process.argv[fileIdx + 1] && !process.argv[fileIdx + 1].startsWith('-')) {
    targetFile = process.argv[fileIdx + 1];
  } else {
    const fileArg = process.argv.find(a => a.startsWith('--file=') || a.startsWith('--plan='));
    if (fileArg) targetFile = fileArg.split('=')[1].trim();
  }

  if (targetFile) {
    const cleanTarget = targetFile.replace(/^["']|["']$/g, '');
    const resolvedTarget = path.isAbsolute(cleanTarget) ? cleanTarget : path.resolve(process.cwd(), cleanTarget);
    if (fs.existsSync(resolvedTarget)) {
      try {
        const fileContent = fs.readFileSync(resolvedTarget, 'utf8').trim();
        existingContext += `\n\n==================== PRE-EXISTING PLAN / RFC (${path.basename(resolvedTarget)}) ====================\n${fileContent}\n================================================================================`;
        logSuccess(`Ingested pre-existing architecture plan from ${resolvedTarget}`);
      } catch (e) {
        logWarning(`Could not read plan file: ${e.message}`);
      }
    } else {
      logWarning(`Could not find specified file at: ${cleanTarget}`);
    }
  }

  // 2. Check for inline --context flag (supports --context=val or --context val)
  let rawCtx = '';
  const ctxIdx = process.argv.findIndex(a => a === '--context' || a === '-c');
  if (ctxIdx !== -1 && process.argv[ctxIdx + 1] && !process.argv[ctxIdx + 1].startsWith('-')) {
    rawCtx = process.argv[ctxIdx + 1];
  } else {
    const contextArg = process.argv.find(a => a.startsWith('--context='));
    if (contextArg) rawCtx = contextArg.slice(10);
  }

  if (rawCtx) {
    const cleanCtx = rawCtx.replace(/^["']|["']$/g, '');
    existingContext += `\n\n==================== USER ARCHITECTURAL CONSTRAINTS ====================\n${cleanCtx}\n========================================================================`;
    logSuccess('Loaded inline architectural constraints');
  }

  // 3. If no flags were provided, ask the user interactively (optional)
  if (!existingContext) {
    console.log(`\n👉 ${ANSI.bold}Do you have existing architectural context, constraints, or a plan? (Optional)${ANSI.reset}`);
    console.log(`   ${ANSI.bold}[1] ✍️ Type / paste multi-line notes & constraints${ANSI.reset}`);
    console.log(`   ${ANSI.bold}[2] 📄 Link an existing file${ANSI.reset} (e.g. ./docs/rfc.md)`);
    console.log(`   ${ANSI.bold}[3] ⏩ None${ANSI.reset} (Let AI decompose the ask from scratch)\n`);

    const planChoice = await askQuestion('Selection [1/2/3] (Default: 3): ');
    const cleanChoice = planChoice.trim();

    if (cleanChoice === '1') {
      const userNotes = await askMultiLine('\n👉 Enter or paste your architectural notes/constraints:');
      if (userNotes.trim()) {
        existingContext += `\n\n==================== USER ARCHITECTURAL CONSTRAINTS ====================\n${userNotes.trim()}\n========================================================================`;
        logSuccess('Loaded architectural notes!');
      }
    } else if (cleanChoice === '2') {
      let fileLoaded = false;
      while (!fileLoaded) {
        const filePath = await askQuestion('👉 Enter absolute or relative path to RFC / plan file (or press Enter to skip): ');
        const cleanPath = filePath.trim().replace(/^["']|["']$/g, '');
        
        if (!cleanPath) {
          console.log('⏩ Skipping pre-existing plan ingestion.');
          break;
        }

        const resolvedPath = path.isAbsolute(cleanPath) ? cleanPath : path.resolve(process.cwd(), cleanPath);
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
          try {
            const fileContent = fs.readFileSync(resolvedPath, 'utf8').trim();
            existingContext += `\n\n==================== PRE-EXISTING PLAN / RFC (${path.basename(resolvedPath)}) ====================\n${fileContent}\n================================================================================`;
            logSuccess(`Ingested pre-existing plan from ${resolvedPath}!`);
            fileLoaded = true;
          } catch (e) {
            logWarning(`Could not read file: ${e.message}. Please try another path or press Enter to skip.`);
          }
        } else {
          logWarning(`Could not find file at: "${cleanPath}". Please make sure you are providing the right relative or absolute path (or press Enter to skip).`);
        }
      }
    }
  }

  // Strip flags from feature ask string
  const cleanAsk = featureAsk
    .replace(/--(file|plan|context)=("[^"]*"|'[^']*'|[^\s]+)/gi, '')
    .trim() || 'Software Engineering Feature';

  const fullRefinePrompt = cleanAsk + existingContext;

  logStep('Step 0 Prompt Refinement', provider.name, provider.model);

  const refinementResult = await executeStagePrompt('refine', fullRefinePrompt);
  const { questions, assumptions } = parseRefinementItems(refinementResult);

  const answeredQA = [];
  if (existingContext) {
    answeredQA.push(`PRE-EXISTING CONSTRAINTS & ARCHITECTURE NOTES:\n${existingContext}`);
  }

  if (questions.length > 0 || assumptions.length > 0) {
    console.log('📋 Let\'s clarify a few details one-by-one before drafting requirements:\n');

    if (questions.length > 0) {
      console.log('--- QUESTIONS NEEDING YOUR INPUT ---');
      const deferredQuestions = [];

      const resolveQuestion = async (qText, qIdx, totalCount, isDeferred = false) => {
        const prefix = isDeferred ? `⏳ [Deferred Question ${qIdx}/${totalCount}]` : `❓ [Question ${qIdx}/${totalCount}]`;
        console.log(`\n${prefix}`);
        console.log(qText);

        while (true) {
          const hint = isDeferred 
            ? '👉 Your answer (or type "?" / "recommend" for options): '
            : '👉 Your answer (or type "?" for recommendation, "skip" to defer): ';
          const ans = await askQuestion(`\n${hint}`);
          const trimmed = ans.trim();

          // 1. Check if user wants to defer
          if (!isDeferred && (trimmed.toLowerCase() === 'skip' || trimmed.toLowerCase() === 'defer')) {
            console.log(`⏳ Postponed. We will resolve this before generating requirements.\n`);
            deferredQuestions.push(qText);
            return;
          }

          // 2. Check if user wants on-demand recommendation / consultation
          if (trimmed === '?' || trimmed.toLowerCase().includes('recommend') || trimmed.endsWith('?') || /what do you/i.test(trimmed)) {
            logStep('Consulting Staff Architect Engine...', provider.name, provider.model);
            try {
              const recommendation = await geminiConsultArchitect(qText, trimmed);
              console.log(`\n💡 ${ANSI.cyan}${ANSI.bold}Staff Architect Recommendation:${ANSI.reset}`);
              console.log(recommendation);
              console.log('');
            } catch (err) {
              logWarning(`Recommendation error: ${err.message}`);
            }
            continue; // Prompt for final answer after giving recommendation
          }

          // 3. User provided concrete answer
          const finalAns = trimmed || 'No specific preference provided';
          answeredQA.push(`Q: ${qText}\nA: ${finalAns}`);
          logSuccess(`Saved decision: "${finalAns}"`);
          return;
        }
      };

      // First pass through questions
      for (let i = 0; i < questions.length; i++) {
        await resolveQuestion(questions[i], i + 1, questions.length, false);
      }

      // Replay deferred questions queue
      if (deferredQuestions.length > 0) {
        console.log(`\n${ANSI.yellow}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
        console.log(`│ ⏳ RESOLVING DEFERRED QUESTIONS (${deferredQuestions.length} remaining)                      │`);
        console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
        console.log(`│ An explicit decision is required before drafting 00-requirements.md│`);
        console.log(`${ANSI.yellow}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);

        for (let j = 0; j < deferredQuestions.length; j++) {
          await resolveQuestion(deferredQuestions[j], j + 1, deferredQuestions.length, true);
        }
      }
    }

    if (assumptions.length > 0) {
      console.log('\n--- ASSUMPTIONS TO CONFIRM ---');
      for (let i = 0; i < assumptions.length; i++) {
        console.log(`\n💡 [Assumption ${i + 1}/${assumptions.length}]`);
        console.log(assumptions[i]);
        const ans = await askQuestion('\n👉 Confirm? [Y/n, type correction, or "Yes and <feedback>"] (Default: Y): ');
        const trimmed = ans.trim();
        
        let confirmation = 'Confirmed (Yes)';
        if (!trimmed || trimmed.toLowerCase() === 'y' || trimmed.toLowerCase() === 'yes') {
          confirmation = 'Confirmed (Yes)';
        } else if (trimmed.toLowerCase() === 'n' || trimmed.toLowerCase() === 'no') {
          confirmation = 'Rejected (No)';
        } else if (/^(yes|y)\b/i.test(trimmed)) {
          const extraConstraints = trimmed.replace(/^(yes|y)[,\s\.\-]+/i, '');
          confirmation = `Confirmed with additional constraints: ${extraConstraints}`;
          
          // Auto-save to .dagrules if user mentions dagrules
          if (/dagrules|\.dagrules|save as rule|team policy/i.test(trimmed)) {
            const ruleText = assumptions[i].replace(/^I'm assuming (that )?/i, '').replace(/ — correct\?.*$/i, '');
            const res = appendLearnedRule(ruleText, 'TypeScript Policy');
            if (res.updated) logSuccess(`Saved permanent policy to ${res.path}`);
          }
        } else if (/^(no|n)\b/i.test(trimmed)) {
          confirmation = `Rejected with reason: ${trimmed.replace(/^(no|n)[,\s\.\-]+/i, '')}`;
        } else {
          confirmation = `User Note / Adjustment: ${trimmed}`;
        }

        answeredQA.push(`Assumption: ${assumptions[i]}\nStatus: ${confirmation}`);
      }
    }

    // Frontend UI/UX Design Detection & Interactive Wizard
    const repoSummary = getRepoContextSummary();
    const fullAskContext = `${featureAsk} ${existingContext} ${answeredQA.join(' ')}`;
    if (isFrontendTask(fullAskContext, repoSummary)) {
      console.log(`\n${ANSI.magenta}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
      console.log(`│ 🎨 FRONTEND WORK DETECTED: Let's align on the UI/UX design reference│`);
      console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
      console.log(`👉 How would you like to provide the UI/UX specification? (Optional)`);
      console.log(`   ${ANSI.bold}[1] 🎨 Figma File / Node URL${ANSI.reset} (Extracts Auto-Layout JSON & exact CSS)`);
      console.log(`   ${ANSI.bold}[2] 📄 HTML / Tailwind / v0 Wireframe${ANSI.reset} (Local file path)`);
      console.log(`   ${ANSI.bold}[3] 🪙 Design System Tokens${ANSI.reset} (Theme JSON / Palette)`);
      console.log(`   ${ANSI.bold}[4] 🤖 Let AI Design It${ANSI.reset} (with custom visual direction / website URL)`);
      console.log(`   ${ANSI.bold}[5] ⏩ Skip${ANSI.reset} (Standard responsive component)\n`);

      const designChoice = await askQuestion('Selection [1/2/3/4/5] (Default: 4): ');
      const cleanChoice = designChoice.trim() || '4';

      if (cleanChoice !== '5') {
        let designInput = '';
        if (cleanChoice === '1') {
          designInput = await askQuestion('👉 Enter Figma file or node URL: ');
        } else if (cleanChoice === '2') {
          designInput = await askQuestion('👉 Enter relative path to HTML/JSX wireframe file: ');
        } else if (cleanChoice === '4') {
          designInput = await askQuestion('👉 Enter visual direction, theme, or reference website URL: ');
        }

        const processedDesign = await processUIDesignReference(cleanChoice, designInput);
        if (processedDesign) {
          answeredQA.push(`UI/UX Design Reference (${processedDesign.source}):\n${processedDesign.spec}`);
          logSuccess(`Harvested design reference from: ${processedDesign.source}`);
        }
      }
    }

    const combinedInput = `ORIGINAL ASK: ${featureAsk}\n\nUSER CLARIFICATIONS & ANSWERS:\n${answeredQA.join('\n\n')}`;
    
    logStep('Generating 00-requirements.md', provider.name, provider.model);
    const finalRequirements = await geminiPromptRefine(
      `Generate the final comprehensive '# Feature: <name>' requirements document based on this original ask and confirmed user answers:\n\n${combinedInput}`
    );
    const reqPath = resolveArtifactPath('00-requirements.md');
    fs.writeFileSync(reqPath, finalRequirements);
    logSuccess(`Created ${reqPath}!`);
  } else {
    const reqPath = resolveArtifactPath('00-requirements.md');
    fs.writeFileSync(reqPath, refinementResult);
    logSuccess(`Created ${reqPath} directly`);
  }
}

async function runStep1() {
  banner('STEP 1: FREEZE CONTRACT & SKEPTIC FALSIFICATION');
  
  const reqPath = resolveArtifactPath('00-requirements.md');
  if (!fs.existsSync(reqPath)) {
    throw new Error('00-requirements.md not found. Run step 0 first.');
  }

  const reqText = fs.readFileSync(reqPath, 'utf8');
  const repoSummary = getRepoContextSummary();
  const projectRules = loadProjectRules();
  const rulesPrompt = formatRulesForPrompt(projectRules);
  if (projectRules.source) {
    logSuccess(`Loaded enterprise rules from ${projectRules.source}`);
  }

  // Harvest Cross-Service Schemas (SQL, OpenAPI, Protobuf, Postman, Thunder Client)
  const harvested = harvestAllLinkedServices();
  if (harvested.services.length > 0) {
    logSuccess(`Harvested contracts from ${harvested.services.length} linked external service(s)`);
  }

  // 1. Recon
  const reconProvider = getProviderForStage('recon');
  logStep('Reconnaissance (Whole-Repo Pattern Search)', reconProvider.name, `${reconProvider.model} (1M+ Context)`);
  const reconReport = await executeStagePrompt('recon', reqText + (harvested.promptText ? `\n\n${harvested.promptText}` : ''), '', { repoContext: repoSummary });
  const reconPath = resolveArtifactPath('01-recon.md');
  fs.writeFileSync(reconPath, reconReport);
  logSuccess(`Created ${reconPath}`);

  // 2. Draft Contract Spec with Feedback Loop
  const contractProvider = getProviderForStage('contract');
  const templatePath = path.join(path.dirname(new URL(import.meta.url).pathname), '../templates/contract-template.md');
  const templateText = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';

  let contractDraft = '';
  let currentFeedback = '';
  let gateApproved = false;

  while (!gateApproved) {
    logStep(currentFeedback ? 'Revising 02-contracts.md with Feedback' : 'Drafting 02-contracts.md Technical Spec', contractProvider.name, contractProvider.model);
    contractDraft = await executeStagePrompt('contract', '', '', {
      reqText: reqText + (rulesPrompt ? `\n\n${rulesPrompt}` : '') + (harvested.promptText ? `\n\n${harvested.promptText}` : ''),
      reconText: reconReport,
      templateText,
      feedback: currentFeedback,
      cwd: process.cwd()
    });
    const contractPath = resolveArtifactPath('02-contracts.md');
    fs.writeFileSync(contractPath, contractDraft);
    logSuccess(`Updated ${contractPath}`);

    // 3. Falsify with Skeptic
    const skepticProvider = getProviderForStage('skeptic');
    logStep('Adversarial Skeptic Falsification', skepticProvider.name, `${skepticProvider.model} (Extended Thinking)`);
    const skepticInput = contractDraft + 
      (rulesPrompt ? `\n\nValidate against team rules:\n${rulesPrompt}` : '') +
      (harvested.promptText ? `\n\nCross-Service Dependencies:\n${harvested.promptText}` : '');
    const findings = await executeStagePrompt('skeptic', skepticInput);
    const findingsPath = resolveArtifactPath('04-findings.md');
    fs.writeFileSync(findingsPath, findings);
    logSuccess(`Updated ${findingsPath}`);

    // 4. Pre-Flight Verifier Audit
    const verifierReport = verifyContractSpec(contractDraft, findings, rulesPrompt);
    renderVerificationReport(verifierReport);

    // Gate 1: Human Approval / Feedback Loop
    const autoGate = process.argv.includes('--auto-gate');
    if (autoGate && verifierReport.isReady) {
      logSuccess('Gate 1 Auto-Approved by Pre-Flight Verifier (--auto-gate)!');
      gateApproved = true;
      recordGateApproval(1, true);
      break;
    }

    // Optional: Discovered Conventions Promotion
    const discoveredConventions = extractConventionsFromRecon(reconReport);
    if (discoveredConventions.length > 0) {
      console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
      console.log(`│ 💡 DISCOVERED ARCHITECTURAL CONVENTIONS (from 01-recon.md)         │`);
      console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
      for (let cIdx = 0; cIdx < discoveredConventions.length; cIdx++) {
        console.log(`  [${cIdx + 1}] ${discoveredConventions[cIdx]}`);
      }
      console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);
      const promoteAns = await askQuestion('👉 Promote any convention to rules? [e.g. 1,2 / none] (Default: none): ');
      const pTrimmed = promoteAns.trim();
      if (pTrimmed && pTrimmed.toLowerCase() !== 'none' && pTrimmed.toLowerCase() !== 'n') {
        const scopeChoice = await askQuestion('   Where to save? [1] Team-wide (.dagrules) [2] Local-only (.dagrules.local) (Default: 1): ');
        const isLocal = scopeChoice.trim() === '2';
        const selectedIndices = pTrimmed.split(/[\s,]+/).map(n => parseInt(n, 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < discoveredConventions.length);
        for (const sIdx of selectedIndices) {
          const res = appendLearnedRule(discoveredConventions[sIdx], 'Learned Convention', isLocal);
          if (res.updated) logSuccess(`Saved ${isLocal ? 'local' : 'team-wide'} policy: "${discoveredConventions[sIdx]}" in ${res.path}`);
        }
      }
    }

    logGate('1', 'Review 02-contracts.md and 04-findings.md');
    const answer = await askQuestion('👉 Approve contract at Gate 1? [Y/n, type feedback, or "Yes and <revisions>"]: ');
    const trimmed = answer.trim();

    if (!trimmed || trimmed.toLowerCase() === 'y' || trimmed.toLowerCase() === 'yes') {
      gateApproved = true;
      recordGateApproval(1, true);
      logSuccess('Gate 1 Approved!');
    } else if (/^(yes|y)\b/i.test(trimmed) && trimmed.length > 3) {
      // "Yes and..." clause! Apply quick inline revision feedback and re-generate contract before freezing
      const extraFeedback = trimmed.replace(/^(yes|y)[,\s\.\-]+/i, '');
      logStep('Applying "Yes and..." revisions to contract', contractProvider.name, contractProvider.model);
      currentFeedback = `USER APPROVED WITH MANDATORY REVISIONS:\n${extraFeedback}`;
      recordGateApproval(1, false);
    } else if (trimmed.toLowerCase() === 'n' || trimmed.toLowerCase() === 'no') {
      recordGateApproval(1, false);
      const fb = await askQuestion('👉 Enter your feedback / required changes: ');
      currentFeedback = fb.trim();
      if (currentFeedback) {
        const learn = await askQuestion('👉 Save this feedback as a permanent policy? [y/N]: ');
        if (learn.toLowerCase() === 'y' || learn.toLowerCase() === 'yes') {
          const scopeChoice = await askQuestion('   Where to save? [1] Team-wide (.dagrules) [2] Local-only (.dagrules.local) (Default: 1): ');
          const isLocal = scopeChoice.trim() === '2';
          const res = appendLearnedRule(currentFeedback, 'Contract Spec', isLocal);
          if (res.updated) logSuccess(`Learned rule saved to ${res.path}`);
        }
      }
    } else {
      // User typed their feedback directly!
      recordGateApproval(1, false);
      currentFeedback = trimmed;
      const learn = await askQuestion('👉 Save this feedback as a permanent policy? [y/N]: ');
      if (learn.toLowerCase() === 'y' || learn.toLowerCase() === 'yes') {
        const scopeChoice = await askQuestion('   Where to save? [1] Team-wide (.dagrules) [2] Local-only (.dagrules.local) (Default: 1): ');
        const isLocal = scopeChoice.trim() === '2';
        const res = appendLearnedRule(currentFeedback, 'Contract Spec', isLocal);
        if (res.updated) logSuccess(`Learned rule saved to ${res.path}`);
      }
    }
  }
}

async function runStep2() {
  banner('STEP 2: EXPAND INTO LAYER PLANS & MERGE');
  
  const contractPath = resolveArtifactPath('02-contracts.md');
  if (!fs.existsSync(contractPath)) {
    throw new Error('02-contracts.md not found or not approved.');
  }

  const contractText = fs.readFileSync(contractPath, 'utf8');
  const reconPath = resolveArtifactPath('01-recon.md');
  const reconText = fs.existsSync(reconPath) ? fs.readFileSync(reconPath, 'utf8') : '';

  const layersProvider = getProviderForStage('layers');
  logStep('Parallel Layer Fan-out (Domain, App-Infra, Data)', layersProvider.name, `${layersProvider.model} (Concurrent)`);
  const [domainPlan, appInfraPlan, dataPlan] = await Promise.all([
    executeStagePrompt('layers', contractText, '', { layerType: 'domain', reconText }),
    executeStagePrompt('layers', contractText, '', { layerType: 'app-infra', reconText }),
    executeStagePrompt('layers', contractText, '', { layerType: 'data', reconText })
  ]);

  fs.writeFileSync(resolveArtifactPath('03-domain.md'), domainPlan);
  fs.writeFileSync(resolveArtifactPath('03-app-infra.md'), appInfraPlan);
  fs.writeFileSync(resolveArtifactPath('03-data.md'), dataPlan);
  logSuccess('Created 03-domain.md, 03-app-infra.md, 03-data.md');

  // Layer Skeptic Falsification
  const skepticProvider = getProviderForStage('skeptic');
  logStep('Skeptic Check on Layer Plans', skepticProvider.name, skepticProvider.model);
  const layerFindings = await executeStagePrompt('skeptic', `Domain Plan:\n${domainPlan}\n\nApp-Infra Plan:\n${appInfraPlan}\n\nData Plan:\n${dataPlan}`);
  fs.writeFileSync(resolveArtifactPath('04-layer-findings.md'), layerFindings);

  // Plan Merger with Feedback Loop
  const mergeProvider = getProviderForStage('merge');
  let currentTasksFeedback = '';
  let gate2Approved = false;

  while (!gate2Approved) {
    logStep(currentTasksFeedback ? 'Revising 05-tasks.md with Feedback' : 'Merging Layer Plans into 05-tasks.md', mergeProvider.name, mergeProvider.model);
    const mergedTasks = await executeStagePrompt('merge', '', '', {
      contractText,
      layerPlans: { domain: domainPlan, appInfra: appInfraPlan, data: dataPlan },
      findingsText: layerFindings + (currentTasksFeedback ? `\n\nUSER FEEDBACK:\n${currentTasksFeedback}` : ''),
      cwd: process.cwd()
    });
    const tasksPath = resolveArtifactPath('05-tasks.md');
    fs.writeFileSync(tasksPath, mergedTasks);
    logSuccess(`Updated ${tasksPath}`);

    // Pre-Flight Verifier Audit (Gate 2)
    let taskVerifierReport = verifyTaskList(mergedTasks, contractText);
    renderVerificationReport(taskVerifierReport);

    // Single-shot deterministic auto-heal (Capped at exactly 1 attempt)
    if (!taskVerifierReport.isReady && !currentTasksFeedback) {
      logStep('Pre-Flight Verifier: Minor checklist omissions detected. Applying 1-shot auto-correction...', mergeProvider.name, mergeProvider.model);
      const failedRules = taskVerifierReport.checks.filter(c => !c.pass).map(c => `- ${c.name}: ${c.details}`).join('\n');
      const healedTasks = await executeStagePrompt('merge', '', '', {
        contractText,
        layerPlans: { domain: domainPlan, appInfra: appInfraPlan, data: dataPlan },
        findingsText: `${layerFindings}\n\nMANDATORY VERIFIER FIX RULES (Every task MUST include explicit Files: and Check: test commands):\n${failedRules}`,
        cwd: process.cwd()
      });
      fs.writeFileSync(tasksPath, healedTasks);
      taskVerifierReport = verifyTaskList(healedTasks, contractText);
      renderVerificationReport(taskVerifierReport);
    }

    const autoGate = process.argv.includes('--auto-gate');
    if (autoGate && taskVerifierReport.isReady) {
      logSuccess('Gate 2 Auto-Approved by Pre-Flight Verifier (--auto-gate)!');
      gate2Approved = true;
      recordGateApproval(2, true);
      break;
    }

    // Gate 2: Human Approval
    logGate('2', 'Review 05-tasks.md for conflicts and dependency order');
    const answer = await askQuestion('👉 Approve task list at Gate 2? [Y/n, type feedback, or "Yes and <revisions>"]: ');
    const trimmed = answer.trim();

    if (!trimmed || trimmed.toLowerCase() === 'y' || trimmed.toLowerCase() === 'yes') {
      gate2Approved = true;
      recordGateApproval(2, true);
      logSuccess('Gate 2 Approved!');
    } else if (/^(yes|y)\b/i.test(trimmed) && trimmed.length > 3) {
      const extraFeedback = trimmed.replace(/^(yes|y)[,\s\.\-]+/i, '');
      logStep('Applying "Yes and..." revisions to task list', mergeProvider.name, mergeProvider.model);
      currentTasksFeedback = `USER APPROVED WITH MANDATORY REVISIONS:\n${extraFeedback}`;
      recordGateApproval(2, false);
    } else if (trimmed.toLowerCase() === 'n' || trimmed.toLowerCase() === 'no') {
      recordGateApproval(2, false);
      const fb = await askQuestion('👉 Enter task feedback / re-ordering changes: ');
      currentTasksFeedback = fb.trim();
      if (currentTasksFeedback) {
        const learn = await askQuestion('👉 Save this feedback as a permanent team policy in .dagrules? [y/N]: ');
        if (learn.toLowerCase() === 'y' || learn.toLowerCase() === 'yes') {
          const res = appendLearnedRule(currentTasksFeedback, 'Task Planning');
          if (res.updated) logSuccess(`Learned rule saved to ${res.path}`);
        }
      }
    } else {
      recordGateApproval(2, false);
      currentTasksFeedback = trimmed;
      const learn = await askQuestion('👉 Save this feedback as a permanent team policy in .dagrules? [y/N]: ');
      if (learn.toLowerCase() === 'y' || learn.toLowerCase() === 'yes') {
        const res = appendLearnedRule(currentTasksFeedback, 'Task Planning');
        if (res.updated) logSuccess(`Learned rule saved to ${res.path}`);
      }
    }
  }
}

async function runStep3() {
  banner('STEP 3: IMPLEMENT NEXT TASK & CONFORMANCE CHECK');

  const tasksPath = resolveArtifactPath('05-tasks.md');
  const contractPath = resolveArtifactPath('02-contracts.md');

  if (!fs.existsSync(tasksPath) || !fs.existsSync(contractPath)) {
    throw new Error('05-tasks.md or 02-contracts.md missing.');
  }

  const tasksText = fs.readFileSync(tasksPath, 'utf8');
  const contractText = fs.readFileSync(contractPath, 'utf8');
  const projectRules = loadProjectRules();
  const rulesPrompt = formatRulesForPrompt(projectRules);

  // 1. Isolate the single next uncompleted task (Strict Task Slicing)
  const taskBlocks = tasksText.split(/(?=###\s+(?:\[[ x]\]\s*)?T-\d+)/gi);
  let activeTaskBlock = '';
  let activeTaskId = '';
  let activeTaskIndex = -1;

  for (let i = 0; i < taskBlocks.length; i++) {
    const block = taskBlocks[i];
    const match = block.match(/###\s+(?:\[([ x])\]\s*)?(T-\d+)/i);
    if (match) {
      const isDone = match[1] === 'x';
      if (!isDone) {
        activeTaskBlock = block.trim();
        activeTaskId = match[2].toUpperCase();
        activeTaskIndex = i;
        break;
      }
    }
  }

  if (!activeTaskBlock) {
    logSuccess('All tasks in 05-tasks.md are already marked as completed!');
    console.log(`\n👉 Run \`dag next\` or \`dag review\` to proceed to Step 4 (Impact Review)!\n`);
    return;
  }

  const codingProvider = getProviderForStage('coding');
  logStep(`Implementing atomic task [${activeTaskId}]`, codingProvider.name, codingProvider.model);
  
  let implResult = await executeStagePrompt('coding', '', '', {
    taskText: `### ACTIVE TASK TO IMPLEMENT (${activeTaskId}):\n${activeTaskBlock}` + (rulesPrompt ? `\n\n${rulesPrompt}` : ''),
    contractText,
    cwd: process.cwd()
  });
  console.log(implResult);

  // Multi-Turn Interactive Clarification & Q&A Loop with Opt-Out
  let clarificationTurn = 0;
  while (clarificationTurn < 4) {
    const isQuestionOrClarification = (
      /\b(how (do|would|should) you|which option|option\s*\(?[1-4a-d]\)?|before I (proceed|start|write|mark)|your (call|preference|decision)|want your call|should I (proceed|create|modify|add)|please (confirm|clarify|choose)|let me know (if|how|which)|do you want me to|would you prefer|stopping here|needs a human decision|want to confirm)\b/i.test(implResult) ||
      /\?\s*(\n|$)/.test(implResult) ||
      /👉/.test(implResult)
    );

    if (!isQuestionOrClarification) break;

    clarificationTurn++;
    console.log(`\n${ANSI.brightYellow}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ 💡 AI ASKING FOR DIRECTION, CLARIFICATION, OR CONFIRMATION         │`);
    console.log(`└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);
    const userDecision = await askMultiLine('👉 Enter or paste your direction / additions (Press Enter on empty line or type EOF to submit, or press Enter immediately to auto-proceed):');
    const trimmedDecision = userDecision.trim();

    if (!trimmedDecision || trimmedDecision.toLowerCase() === 'skip' || trimmedDecision.toLowerCase() === 'proceed') {
      logStep('Proceeding with AI default execution...', codingProvider.name, codingProvider.model);
      break;
    }

    logStep('Applying direction & continuing task execution...', codingProvider.name, codingProvider.model);
    implResult = await executeStagePrompt('coding', '', '', {
      taskText: `${tasksText}\n\nUSER DIRECTION / CLARIFICATION (Turn ${clarificationTurn}):\n${trimmedDecision}`,
      contractText,
      cwd: process.cwd()
    });
    console.log(implResult);
  }

  // Feature 2: Auto-Healing Test & Verification Loop
  const checkMatches = tasksText.match(/Check:\s*`?([^`\r\n]+)`?/i);
  if (checkMatches && checkMatches[1]) {
    const checkCommand = checkMatches[1].trim();
    logStep(`Running Verification Check: "${checkCommand}"`, 'Test Runner', 'Local Shell');

    let isPassing = false;
    const config = loadConfig(process.cwd());
    const antiSlopEnabled = String(config.ENABLE_ANTI_SLOP).toLowerCase() !== 'false';
    const antiSlopCmd = config.ANTI_SLOP_COMMAND || 'npx -y oxlint@latest --deny-warnings';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // 1. Run Task Verification Check
        const testOutput = execSync(checkCommand, {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: 30000 // 30s timeout guard against infinite hangs
        });

        // 2. Run Anti-Slop AST Guardrail (Oxlint) scoped strictly to modified/staged files
        if (antiSlopEnabled) {
          try {
            // Find changed JS/TS files in working tree
            let changedFiles = '';
            try {
              changedFiles = execSync('git diff --name-only HEAD', { encoding: 'utf8', cwd: process.cwd() })
                .split('\n')
                .map(f => f.trim())
                .filter(f => /\.(ts|js|tsx|jsx)$/.test(f) && fs.existsSync(path.join(process.cwd(), f)))
                .join(' ');
            } catch (e) {}

            if (changedFiles) {
              const scopedAntiSlopCmd = `${antiSlopCmd} ${changedFiles}`;
              execSync(scopedAntiSlopCmd, {
                cwd: process.cwd(),
                encoding: 'utf8',
                timeout: 15000
              });
              logSuccess(`Check Passed & Anti-Slop Guardrail Passed on attempt ${attempt}!`);
            } else {
              logSuccess(`Check Passed on attempt ${attempt}!`);
            }
          } catch (slopErr) {
            const slopOutput = (slopErr.stdout || '') + '\n' + (slopErr.stderr || '');
            throw new Error(`Anti-Slop Guardrail (Oxlint) Violation in modified files:\n${slopOutput.slice(0, 400)}`);
          }
        } else {
          logSuccess(`Check Passed on attempt ${attempt}!`);
        }

        isPassing = true;

        // Auto-mark the task as completed [x] in 05-tasks.md
        if (activeTaskId && activeTaskIndex !== -1) {
          const updatedBlock = block.replace(
            /###\s+(?:\[[ x]\]\s*)?(T-\d+)/i,
            '### [x] $1'
          );
          taskBlocks[activeTaskIndex] = updatedBlock;
          const updatedTasksText = taskBlocks.join('');
          fs.writeFileSync(tasksPath, updatedTasksText);
          logSuccess(`Marked ${activeTaskId} as completed [x] in 05-tasks.md!`);
        }
        break;
      } catch (err) {
        const failureTrace = (err.stdout || '') + '\n' + (err.stderr || '') + '\n' + err.message;
        logWarning(`Task verification failed on attempt ${attempt}/3:\n${failureTrace.slice(0, 300)}...`);

        if (attempt < 3) {
          logStep(`Auto-Healing: Feeding error trace to ${codingProvider.name}...`, codingProvider.name, codingProvider.model);
          const healPrompt = `The previous implementation of the task failed the verification check command (${checkCommand}).\n\nERROR OUTPUT:\n${failureTrace}\n\nPlease fix the implementation so the check passes. Modify only approved task files.`;
          
          await executeStagePrompt('coding', '', '', {
            taskText: healPrompt,
            contractText,
            cwd: process.cwd()
          });
        } else {
          logError(`Auto-Healing could not resolve the test failure after 3 attempts.`);
          
          logStep('Diagnosing root cause & synthesizing recommended plan revision...', 'AI Diagnostician', 'Gemini Pro / Claude');
          const diagnosisPrompt = `A coding task failed verification tests after 3 attempts.
Task Context:
${tasksText.slice(0, 1500)}

Contract Context:
${contractText.slice(0, 1500)}

Failure Output / Error Trace:
${failureTrace}

Provide an exact, concise diagnosis:
1. What went wrong / root cause of the failure
2. Recommended revision to 02-contracts.md / 05-tasks.md to resolve it cleanly.
Format your output cleanly.`;

          let recommendation = '';
          try {
            recommendation = await executeStagePrompt('skeptic', diagnosisPrompt);
          } catch (e) {
            recommendation = `The verification check (${checkCommand}) failed with: ${failureTrace.slice(0, 200)}. Recommendation: Revise contract to align with actual codebase reality.`;
          }

          console.log('\n' + '─'.repeat(68));
          console.log('🔍 ROOT CAUSE DIAGNOSIS & RECOMMENDATION:');
          console.log('─'.repeat(68));
          console.log(recommendation);
          console.log('─'.repeat(68) + '\n');

          console.log('💡 You can accept this recommendation to automatically rollback and revise the contract.');
          const action = await askQuestion('👉 Accept recommendation and revise contract? [Y/n or type custom correction] (Default: Y): ');
          const trimmed = action.trim();

          if (!trimmed || trimmed.toLowerCase() === 'y' || trimmed.toLowerCase() === 'yes') {
            const { backupDir } = createRollbackSnapshot(1);
            logSuccess(`Created backup in ${backupDir} and rewound to Step 1.`);
            logStep('Regenerating 02-contracts.md with AI recommendation...', 'DAG Engine', 'Step 1');
            
            // Re-run Step 1 passing the synthesized recommendation as feedback
            const reqText = fs.readFileSync('00-requirements.md', 'utf8');
            const repoSummary = getRepoContextSummary();
            const projectRules = loadProjectRules();
            const rulesPrompt = formatRulesForPrompt(projectRules);
            const templatePath = path.join(path.dirname(new URL(import.meta.url).pathname), '../templates/contract-template.md');
            const templateText = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';

            const revisedContract = await executeStagePrompt('contract', '', '', {
              reqText: reqText + (rulesPrompt ? `\n\n${rulesPrompt}` : ''),
              reconText: fs.existsSync('01-recon.md') ? fs.readFileSync('01-recon.md', 'utf8') : repoSummary,
              templateText,
              feedback: `ROOT CAUSE & REQUIRED FIX:\n${recommendation}`,
              cwd: process.cwd()
            });

            fs.writeFileSync('02-contracts.md', revisedContract);
            logSuccess('Updated 02-contracts.md with fix!');
            
            const skepticProvider = getProviderForStage('skeptic');
            logStep('Auditing revised contract with Adversarial Skeptic...', skepticProvider.name, `${skepticProvider.model} (Extended Thinking)`);
            const findings = await executeStagePrompt('skeptic', revisedContract);
            fs.writeFileSync('04-findings.md', findings);
            logSuccess('Updated 04-findings.md');

            console.log('\n--- SKEPTIC FINDINGS ---');
            console.log(findings);
            console.log('------------------------\n');

            logGate('1', 'Review revised 02-contracts.md');
            const gateApprove = await askQuestion('👉 Approve revised contract at Gate 1? [Y/n]: ');
            if (!gateApprove.trim() || gateApprove.toLowerCase() === 'y' || gateApprove.toLowerCase() === 'yes') {
              recordGateApproval(1, true);
              logSuccess('Gate 1 Approved! Re-running layer fanout...');
              await runStep2();
            }
            return;
          } else if (trimmed.toLowerCase() === 'n' || trimmed.toLowerCase() === 'no') {
            logWarning('Action aborted. You can manually inspect the files.');
            return;
          } else {
            // User typed custom instructions!
            const { backupDir } = createRollbackSnapshot(1);
            logSuccess(`Created backup in ${backupDir} and rewound to Step 1 with your custom instructions.`);
            await runStep1();
            return;
          }
        }
      }
    }
  }

  // Conformance Diff Check
  let gitDiff = '';
  try {
    gitDiff = execSync('git diff HEAD', { encoding: 'utf8' });
  } catch (e) {
    gitDiff = 'Unable to fetch git diff';
  }

  const confProvider = getProviderForStage('conformance');
  logStep('Plan Conformance & Anti-Drift Check', confProvider.name, confProvider.model);
  const conformanceReport = await executeStagePrompt('conformance', '', '', {
    contractText,
    tasksText: `### ACTIVE TASK JUST IMPLEMENTED:\n${activeTaskBlock}`,
    gitDiff
  });
  console.log('\n--- PLAN CONFORMANCE REPORT ---');
  console.log(conformanceReport);
  console.log('-------------------------------\n');

  // Provide explicit, affirmative actionable guidance with live progress bar
  const currentStatus = getPipelineStatus(process.cwd());
  const isAllConforming = !/drift detected|fail/i.test(conformanceReport) || /all active tasks in diff conform/i.test(conformanceReport);
  if (isAllConforming) {
    const pct = currentStatus.totalTasks > 0 ? Math.round((currentStatus.implementedCount / currentStatus.totalTasks) * 100) : 0;
    const barWidth = 20;
    const filled = Math.round((pct / 100) * barWidth);
    const progressBar = `[${'█'.repeat(filled)}${'░'.repeat(barWidth - filled)}] ${currentStatus.implementedCount}/${currentStatus.totalTasks} Tasks (${pct}%)`;

    console.log(`${ANSI.brightGreen}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ 🚀 SAFE TO PROCEED: Active task implementation verified & aligned!  │`);
    console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
    console.log(`  ${ANSI.bold}Progress:${ANSI.reset}  ${ANSI.brightCyan}${progressBar}${ANSI.reset}`);
    if (currentStatus.implementedCount < currentStatus.totalTasks) {
      console.log(`  • Run ${ANSI.bold}dag next${ANSI.reset} (or ${ANSI.bold}dag implement${ANSI.reset}) to implement Task ${currentStatus.implementedCount + 1}/${currentStatus.totalTasks}.`);
    } else {
      console.log(`  • All tasks completed! Ready for Human Acceptance.`);
    }
    console.log(`  • Run ${ANSI.bold}dag status${ANSI.reset} to inspect overall pipeline artifacts.`);
    console.log(`${ANSI.brightGreen}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);
  } else {
    console.log(`${ANSI.brightYellow}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ ⚠️ PLAN DRIFT DETECTED: Action Required!                            │`);
    console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
    console.log(`  The auditor detected a divergence from the strict contract or task.`);
    console.log(`  1. Ignore drift and proceed (if you manually resolved it).`);
    console.log(`  2. Rollback the changes and retry this task.`);
    console.log(`  3. Exit to fix manually.`);
    console.log(`${ANSI.brightYellow}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);

    const driftChoice = await askQuestion(`${ANSI.brightYellow}👉 Select action [1/2/3] (Default: 3): ${ANSI.reset}`);
    const choice = driftChoice.trim();
    if (choice === '1') {
      logSuccess('Drift intentionally ignored by user. Proceeding.');
    } else if (choice === '2') {
      console.log(`${ANSI.brightYellow}⚠️ Rolling back changes (git reset --hard && git clean -fd)...${ANSI.reset}`);
      require('node:child_process').execSync('git reset --hard && git clean -fd', { stdio: 'inherit' });
      // Remove the [x] from the task since we rolled back
      const tasksTextCurrent = fs.readFileSync(tasksPath, 'utf8');
      const taskBlocksCurrent = tasksTextCurrent.split(/(?=###\s+(?:\[[ x]\]\s*)?T-\d+)/gi);
      for (let i = 0; i < taskBlocksCurrent.length; i++) {
        if (taskBlocksCurrent[i].includes(`[x] ${activeTaskId}`) || taskBlocksCurrent[i].includes(`[x] ${activeTaskId.replace('T-','')}`)) {
           taskBlocksCurrent[i] = taskBlocksCurrent[i].replace(/###\s+\[x\]\s*(T-\d+)/i, '### $1');
        }
      }
      fs.writeFileSync(tasksPath, taskBlocksCurrent.join(''));
      console.log(`${ANSI.brightRed}❌ Rollback complete. Run 'dag next' to try again.${ANSI.reset}`);
      process.exit(1);
    } else {
      console.log(`${ANSI.brightRed}❌ Exiting for manual resolution. Run 'dag next' when fixed.${ANSI.reset}`);
      process.exit(1);
    }
  }

  // Gate 3: Human Test Acceptance & Contract Addendum Gate
    if (currentStatus.implementedCount >= currentStatus.totalTasks && currentStatus.totalTasks > 0) {
      console.log(`${ANSI.brightCyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
      console.log(`│ 🛑 GATE 3: HUMAN ACCEPTANCE & LIVE TEST VERIFICATION               │`);
      console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
      console.log(`  All tasks in plan are complete. Test your local app/server now.`);
      console.log(`  • Press ${ANSI.bold}Enter (or type 'Y')${ANSI.reset} to approve live behavior & proceed to Step 4 Review.`);
      console.log(`  • Or ${ANSI.bold}paste bug findings / additions${ANSI.reset} to record an addendum and generate new tasks.`);
      console.log(`${ANSI.brightCyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);

      const gate3Input = await askMultiLine('👉 Your decision / findings:');
      const trimmedGate3 = gate3Input.trim();

      if (trimmedGate3 && trimmedGate3.toLowerCase() !== 'y' && trimmedGate3.toLowerCase() !== 'yes') {
        logStep('Recording Contract Addendum & generating new tasks...', codingProvider.name, codingProvider.model);
        
        // 1. Write or append to 02-contracts.addendum.md
        const addendumPath = resolveArtifactPath('02-contracts.addendum.md');
        const existingAddendum = fs.existsSync(addendumPath) ? fs.readFileSync(addendumPath, 'utf8') : '';
        const newAddendumContent = `${existingAddendum}\n\n## 📝 Human Test Findings & Addendum (${new Date().toLocaleString()})\n${trimmedGate3}\n`.trim();
        fs.writeFileSync(addendumPath, newAddendumContent, 'utf8');
        logSuccess(`Updated ${addendumPath}`);

        // 2. Ask Claude to generate new addendum tasks and append to 05-tasks.md
        const addendumTaskPrompt = `The user conducted manual live testing and provided the following findings/additions:\n\n${trimmedGate3}\n\nCurrent 05-tasks.md:\n${tasksText}\n\nPlease append new sequential tasks (e.g. T-${currentStatus.totalTasks + 1}, T-${currentStatus.totalTasks + 2}) to 05-tasks.md to implement and verify these findings. Follow TDD style and include specific file paths and verification Checks. CRITICAL: Leave new tasks UNMARKED (do NOT mark them [DONE] or (DONE) — they must remain pending for the implementation stage). Return ONLY the complete updated 05-tasks.md markdown.`;
        
        const updatedTasks = await executeStagePrompt('coding', addendumTaskPrompt, '', {
          taskText: addendumTaskPrompt,
          contractText: `${contractText}\n\n${newAddendumContent}`,
          cwd: process.cwd()
        });

        if (updatedTasks && updatedTasks.includes('### T-')) {
          fs.writeFileSync(resolveArtifactPath(ARTIFACT_FILES.tasks), updatedTasks.trim(), 'utf8');
          logSuccess(`Appended new addendum tasks to 05-tasks.md`);
          console.log(`\n${ANSI.brightGreen}${ANSI.bold}🚀 New addendum tasks registered! Run ${ANSI.underline}dag implement${ANSI.reset} (or ${ANSI.underline}dag next${ANSI.reset}) to implement them.${ANSI.reset}\n`);
          return;
        }
      } else {
        recordGateApproval(3, true);
        logSuccess('Gate 3 Approved! Safe to proceed to Step 4 Review.');
      }
    }
  }

async function runStep4() {
  banner('STEP 4: FINAL CODE REVIEW & IMPACT CHECK');

  let gitDiff = '';
  try {
    // 1. Check unstaged + staged diff
    gitDiff = execSync('git diff HEAD', { encoding: 'utf8' }).trim();
    if (!gitDiff) {
      // 2. Check last commit diff
      gitDiff = execSync('git diff HEAD~1', { encoding: 'utf8' }).trim();
    }
    if (!gitDiff) {
      // 3. Fallback to full unstaged diff
      gitDiff = execSync('git diff', { encoding: 'utf8' }).trim();
    }
  } catch (e) {
    try {
      gitDiff = execSync('git diff', { encoding: 'utf8' }).trim();
    } catch (err) {
      gitDiff = 'No working tree changes or diff available.';
    }
  }

  if (!gitDiff) {
    gitDiff = 'No changes detected in working tree or last commit.';
  }

  const repoSummary = getRepoContextSummary();

  const revProvider = getProviderForStage('review');
  logStep('Full-Repo Regression & Impact Analysis', revProvider.name, revProvider.model);
  const impactReport = await executeStagePrompt('review', gitDiff, '', { repoContext: repoSummary });
  console.log('\n--- WHOLE-REPO IMPACT ANALYSIS ---');
  console.log(impactReport);
  console.log('----------------------------------\n');

  const claudeReviewProvider = getProviderForStage('coding');
  logStep('Final REVIEW.md Quality Check', claudeReviewProvider.name, claudeReviewProvider.model);
  const reviewResult = await executeStagePrompt('code-review', gitDiff, '', {
    diffText: gitDiff,
    reviewRulesText: 'Check for correctness, simplicity, and reuse.',
    cwd: process.cwd()
  });

  const reviewPath = resolveArtifactPath('REVIEW.md');
  fs.writeFileSync(reviewPath, `# Final Code Review & Impact Report\n\n## 🔍 Whole-Repo Impact Analysis\n${impactReport}\n\n## 📝 Code Review Summary\n${reviewResult}\n`);
  logSuccess(`Created ${reviewPath}`);

  console.log('\n--- FINAL CODE REVIEW ---');
  console.log(reviewResult);
  console.log('-------------------------\n');
}

async function runShip(args = []) {
  banner('SHIP: BUNDLE CONTRACT & OPEN PULL REQUEST');
  const shipState = getPipelineStatus();
  
  if (!shipState.hasContracts) {
    logError('Cannot ship: 02-contracts.md is missing. Run `dag contract` first.');
    return;
  }
  // 0. Stacked Feature Branch Gate: Check if user is on the intended stacked branch
  const config = loadConfig();
  let currentGitBranch = '';
  try {
    currentGitBranch = execSync('git branch --show-current', { encoding: 'utf8', cwd: process.cwd() }).trim();
  } catch (e) {}

  if (config.ACTIVE_BRANCH && currentGitBranch && config.ACTIVE_BRANCH !== currentGitBranch) {
    console.log(`\n${ANSI.brightYellow}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ ⚠️  STACKED FEATURE BRANCH MISMATCH                                 │`);
    console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
    console.log(`  Current Git Branch:   ${ANSI.bold}${ANSI.red}${currentGitBranch}${ANSI.reset}`);
    console.log(`  Stacked Feature Branch: ${ANSI.bold}${ANSI.green}${config.ACTIVE_BRANCH}${ANSI.reset}`);
    console.log(`${ANSI.brightYellow}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);

    const doSwitch = await askQuestion(`👉 Switch to the intended stacked branch '${config.ACTIVE_BRANCH}' now? [Y/n] (Default: Y): `);
    if (!doSwitch.trim() || doSwitch.toLowerCase() === 'y' || doSwitch.toLowerCase() === 'yes') {
      try {
        logStep(`Switching to stacked branch '${config.ACTIVE_BRANCH}'...`, 'Git', 'git checkout');
        execSync(`git checkout "${config.ACTIVE_BRANCH}"`, { stdio: 'inherit', cwd: process.cwd() });
        currentGitBranch = config.ACTIVE_BRANCH;
        logSuccess(`Checked out to '${currentGitBranch}' successfully!`);
      } catch (switchErr) {
        logError(`Could not switch branch: ${switchErr.message}`);
      }
    }
  }

  // 1. First Check for unstaged / uncommitted changes
  let gitStatus = '';
  try {
    gitStatus = execSync('git status --short', { encoding: 'utf8', cwd: process.cwd() }).trim();
  } catch (e) {}

  let commitTitle = args.join(' ');

  if (gitStatus) {
    console.log(`\n${ANSI.brightYellow}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ 📝 UNCOMMITTED CHANGES DETECTED IN WORKING TREE                     │`);
    console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
    console.log(gitStatus.split('\n').map(l => `  ${l}`).slice(0, 15).join('\n'));
    console.log(`${ANSI.brightYellow}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);

    const doCommit = await askQuestion('👉 Stage all modified feature files, commit, and push branch now? [Y/n] (Default: Y): ');
    if (!doCommit.trim() || doCommit.toLowerCase() === 'y' || doCommit.toLowerCase() === 'yes') {
      if (!commitTitle) {
        // Derive smart default commit message from requirements or feature name
        let defaultMsg = 'feat: implement feature via DAG Orchestrator';
        const reqPath = resolveArtifactPath('00-requirements.md');
        if (fs.existsSync(reqPath)) {
          const reqText = fs.readFileSync(reqPath, 'utf8');
          const titleMatch = reqText.match(/^#\s*([^\n]+)/m) || reqText.match(/Feature:\s*([^\n]+)/i);
          if (titleMatch && titleMatch[1]) {
            const rawTitle = titleMatch[1].replace(/^(Feature\s*Request|Feature\s*Goal|Requirements):\s*/i, '').trim();
            defaultMsg = `feat: ${rawTitle.toLowerCase().slice(0, 65)}`;
          }
        }

        console.log(`\n💡 Suggested Commit Message: ${ANSI.bold}${ANSI.cyan}${defaultMsg}${ANSI.reset}`);
        const userMsg = await askQuestion(`👉 Enter commit message (Press Enter to accept suggestion): `);
        commitTitle = userMsg.trim() || defaultMsg;
      }
      try {
        logStep('Staging and committing feature files...', 'Git', 'git commit');
        execSync('git add -A', { stdio: 'inherit', cwd: process.cwd() });
        execSync(`git commit -m "${commitTitle.replace(/"/g, '\\"')}"`, { stdio: 'inherit', cwd: process.cwd() });
        logSuccess('Commit created successfully!');

        logStep('Pushing branch to origin...', 'Git', 'git push');
        try {
          execSync('git push origin HEAD', { stdio: 'inherit', cwd: process.cwd() });
          logSuccess('Branch pushed to origin successfully!');
        } catch (pushErr) {
          logWarning('Push was rejected because remote branch has new commits.');
          const doPull = await askQuestion('👉 Pull latest changes with rebase (`git pull --rebase origin HEAD`) and retry push? [Y/n] (Default: Y): ');
          if (!doPull.trim() || doPull.toLowerCase() === 'y' || doPull.toLowerCase() === 'yes') {
            try {
              logStep('Rebasing on remote changes...', 'Git', 'git pull --rebase');
              execSync('git pull --rebase origin HEAD', { stdio: 'inherit', cwd: process.cwd() });
              logSuccess('Rebase successful!');

              logStep('Retrying branch push...', 'Git', 'git push');
              execSync('git push origin HEAD', { stdio: 'inherit', cwd: process.cwd() });
              logSuccess('Branch pushed to origin successfully!');
            } catch (rebaseErr) {
              logError(`Rebase/push conflict: ${rebaseErr.message}. Please resolve conflicts manually in git.`);
            }
          }
        }
      } catch (commitErr) {
        logWarning(`Git commit/push encountered a notice: ${commitErr.message}`);
      }
    }
  }

  // 2. Generate PR Description Bundle
  const reqPath = resolveArtifactPath('00-requirements.md');
  const contractPath = resolveArtifactPath('02-contracts.md');
  const addendumPath = resolveArtifactPath('02-contracts.addendum.md');
  const findingsPath = resolveArtifactPath('04-findings.md');
  const tasksPath = resolveArtifactPath('05-tasks.md');
  const reviewPath = resolveArtifactPath('REVIEW.md');

  const reqContent = fs.existsSync(reqPath) ? fs.readFileSync(reqPath, 'utf8') : '';
  const contractContent = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8') : '';
  const addendumContent = fs.existsSync(addendumPath) ? fs.readFileSync(addendumPath, 'utf8') : '';
  const findingsContent = fs.existsSync(findingsPath) ? fs.readFileSync(findingsPath, 'utf8') : '';
  const tasksContent = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, 'utf8') : '';
  const reviewContent = fs.existsSync(reviewPath) ? fs.readFileSync(reviewPath, 'utf8') : '';

  // Get active committed git diff and commit log against base branch
  let gitDiff = '';
  let gitLogSummary = '';
  const baseTarget = config.STACKED_BASE_BRANCH || 'develop';
  try {
    gitDiff = execSync(`git diff origin/${baseTarget}...HEAD || git diff HEAD~1 || git diff`, { encoding: 'utf8', cwd: process.cwd() }).slice(0, 5000);
    gitLogSummary = execSync(`git log origin/${baseTarget}..HEAD --oneline || git log -n 5 --oneline`, { encoding: 'utf8', cwd: process.cwd() });
  } catch (e) {}

  // Check for repository or team PR template
  const candidateTemplates = [
    path.join(process.cwd(), '.github', 'pull_request_template.md'),
    path.join(process.cwd(), '.github', 'PULL_REQUEST_TEMPLATE.md'),
    path.join(process.cwd(), 'pull_request_template.md'),
    path.join(process.cwd(), 'PULL_REQUEST_TEMPLATE.md'),
    path.join(process.cwd(), 'dag', 'templates', 'pr.md'),
    path.join(process.cwd(), '.dag', 'templates', 'pr.md'),
    path.join(process.cwd(), '.dag', 'pr_template.md')
  ];

  let customTemplateText = '';
  for (const tPath of candidateTemplates) {
    if (fs.existsSync(tPath)) {
      try {
        const txt = fs.readFileSync(tPath, 'utf8').trim();
        if (txt) {
          customTemplateText = txt;
          break;
        }
      } catch (e) {}
    }
  }

  let prBody = '';

  console.log(`\n${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
  console.log(`│ 📝 PULL REQUEST DESCRIPTION GENERATOR                              │`);
  console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
  console.log(`  [1] ${ANSI.bold}${ANSI.cyan}AI-Synthesized Concise PR${ANSI.reset} (Human-readable Confluence bullets, clean)`);
  console.log(`  [2] ${ANSI.bold}Direct Spec Bundle${ANSI.reset} (Includes collapsible contracts & audit trails)`);
  console.log(`${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);

  const prStyleChoice = await askQuestion('👉 Select PR description format [1/2] (Default: 1): ');

  if (!prStyleChoice.trim() || prStyleChoice.trim() === '1') {
    logStep('Synthesizing concise, human-readable PR description...', 'AI Synthesizer', 'claudeGeneratePrDescription');
    try {
      prBody = await claudeGeneratePrDescription({
        reqContent,
        contractContent,
        tasksContent,
        gitDiff,
        gitLogSummary,
        templateContent: customTemplateText
      }, process.cwd());
      logSuccess('AI PR description generated successfully!');
    } catch (aiErr) {
      logWarning(`AI generation failed (${aiErr.message}), falling back to standard template.`);
    }
  }

  if (!prBody) {
    // Direct Template or Fallback
    if (customTemplateText) {
      if (customTemplateText.includes('{{REQUIREMENTS}}') || customTemplateText.includes('{{CONTRACTS}}') || customTemplateText.includes('{{TASKS}}')) {
        prBody = customTemplateText
          .replace(/\{\{REQUIREMENTS\}\}/g, reqContent)
          .replace(/\{\{CONTRACTS\}\}/g, contractContent + (addendumContent ? `\n\n### 📝 Addendum\n${addendumContent}` : ''))
          .replace(/\{\{FINDINGS\}\}/g, findingsContent)
          .replace(/\{\{TASKS\}\}/g, tasksContent)
          .replace(/\{\{REVIEW\}\}/g, reviewContent);
      } else {
        prBody = `${customTemplateText}\n\n---\n\n## 🛡️ Verification & Audit Trail\n\n<details>\n<summary>📜 Interface Contract (02-contracts.md)</summary>\n\n${contractContent}\n\n</details>\n\n<details>\n<summary>🧐 Skeptic Audit</summary>\n\n${findingsContent}\n\n</details>\n\n<details>\n<summary>✅ Tasks</summary>\n\n${tasksContent}\n\n</details>\n`;
      }
    } else {
      prBody = `## 🚀 Feature Summary\n${reqContent.slice(0, 1500)}\n\n---\n\n## 📜 Interface Contract\n<details>\n<summary>Click to view Contract</summary>\n\n${contractContent}\n\n</details>\n\n## ✅ Tasks Checklist\n${tasksContent}\n`;
    }
  }

  const featureDir = getFeatureWorkspaceDir();
  const prPath = path.join(featureDir, 'PR_DESCRIPTION.md');

  fs.writeFileSync(prPath, prBody);
  logSuccess(`Generated ${path.relative(process.cwd(), prPath)}`);

  // Extract feature title for PR & Archiving
  let featureGoal = 'Dynamic Campaign Live Dashboard';
  if (fs.existsSync(reqPath)) {
    const reqText = fs.readFileSync(reqPath, 'utf8');
    const titleMatch = reqText.match(/^#\s*([^\n]+)/m) || reqText.match(/Feature:\s*([^\n]+)/i);
    if (titleMatch && titleMatch[1]) {
      featureGoal = titleMatch[1]
        .replace(/^(Feature\s*Request|Feature\s*Goal|Requirements|Feature):\s*/i, '')
        .replace(/^(feat|fix|chore):\s*/i, '')
        .trim();
    }
  }

  // 3. Ask whether to open PR via GitHub CLI
  let ghInstalled = false;
  try {
    execSync('which gh', { stdio: 'ignore' });
    ghInstalled = true;
  } catch (e) {}

  if (ghInstalled) {
    const createPR = await askQuestion('\n👉 Open Pull Request on GitHub now (`gh pr create`)? [Y/n] (Default: Y): ');
    if (!createPR.trim() || createPR.toLowerCase() === 'y' || createPR.toLowerCase() === 'yes') {
      // Derive smart PR title matching <Prefix>/<Ticket Number on Jira> - <Title> (Confluence standard)
      let branchName = '';
      try {
        branchName = execSync('git branch --show-current', { encoding: 'utf8', cwd: process.cwd() }).trim();
      } catch (e) {}

      const ticketMatch = branchName.match(/(?:feat|fix|chore|hotfix)\/([A-Z]+-\d+)/i) || branchName.match(/([A-Z]+-\d+)/i);
      const prefix = branchName.startsWith('fix') ? 'fix' : (branchName.startsWith('chore') ? 'chore' : (branchName.startsWith('hotfix') ? 'hotfix' : 'feat'));
      const ticket = ticketMatch ? ticketMatch[1].toUpperCase() : 'DC-XXX';

      // Format title cleanly
      const defaultPrTitle = `${prefix}/${ticket} - ${featureGoal}`;

      console.log(`\n💡 Suggested PR Title: ${ANSI.bold}${ANSI.cyan}${defaultPrTitle}${ANSI.reset}`);
      const userPrTitle = await askQuestion(`👉 Enter Pull Request Title (Press Enter to accept suggestion): `);
      const prTitle = userPrTitle.trim() || defaultPrTitle;

      let currentBranch = '';
      try {
        currentBranch = execSync('git branch --show-current', { encoding: 'utf8', cwd: process.cwd() }).trim();
      } catch (e) {}

      // Check if user is currently on the default/trunk branch (e.g. develop, main, master)
      const trunkBranches = ['develop', 'main', 'master', 'staging', 'uat'];
      if (trunkBranches.includes(currentBranch)) {
        logWarning(`You are currently on trunk branch '${currentBranch}'. GitHub does not allow opening a PR from '${currentBranch}' into '${currentBranch}'.`);
        
        const suggestedBranch = `feat/${slugify(prTitle.replace(/^[^/]+\/[^-]+-\s*/, '') || 'new-feature')}`;
        const targetBranchAnswer = await askQuestion(`👉 Create and switch to a feature branch first? [branch-name / n] (Default: ${suggestedBranch}): `);
        
        if (targetBranchAnswer.trim().toLowerCase() !== 'n') {
          const newBranch = targetBranchAnswer.trim() || suggestedBranch;
          try {
            logStep(`Creating and switching to feature branch '${newBranch}'...`, 'Git', 'git checkout -b');
            execSync(`git checkout -b "${newBranch}"`, { stdio: 'inherit', cwd: process.cwd() });
            currentBranch = newBranch;
            
            logStep(`Pushing new branch '${currentBranch}' to origin...`, 'Git', 'git push -u origin');
            execSync(`git push -u origin "${currentBranch}"`, { stdio: 'inherit', cwd: process.cwd() });
            logSuccess(`Branch '${currentBranch}' pushed successfully!`);
          } catch (branchErr) {
            logError(`Failed to create feature branch: ${branchErr.message}`);
          }
        }
      }

      // Determine target base branch
      const defaultBaseBranch = config.STACKED_BASE_BRANCH || 'develop';
      console.log(`\n🎯 Target Base Branch: ${ANSI.bold}${ANSI.green}${defaultBaseBranch}${ANSI.reset}`);
      const userBaseAnswer = await askQuestion(`👉 Enter target base branch (Press Enter for '${defaultBaseBranch}'): `);
      const baseBranch = userBaseAnswer.trim() || defaultBaseBranch;

      try {
        logStep(`Creating GitHub Pull Request (${currentBranch} ➔ ${baseBranch})...`, 'GitHub CLI', 'gh pr create');
        
        // Ensure the current branch is pushed to remote with tracking before calling gh pr create
        try {
          execSync('git push -u origin HEAD', { stdio: 'ignore', cwd: process.cwd() });
        } catch (e) {}

        const headFlag = currentBranch ? `--head "${currentBranch}"` : '';
        const baseFlag = baseBranch ? `--base "${baseBranch}"` : '';
        const prCmd = `gh pr create --title "${prTitle.replace(/"/g, '\\"')}" --body-file "${prPath}" ${headFlag} ${baseFlag}`.trim();
        const prOutput = execSync(prCmd, { encoding: 'utf8', cwd: process.cwd() });
        logSuccess(`Pull Request Created:\n${prOutput}`);
      } catch (err) {
        logWarning(`Could not auto-create PR via gh: ${err.message}. You can manually paste ${path.relative(process.cwd(), prPath)} into your PR.`);
      }
    } else {
      console.log(`\n${ANSI.cyan}ℹ️  PR creation skipped. All changes are committed/pushed and documentation saved in ${path.relative(process.cwd(), prPath)}.${ANSI.reset}\n`);
    }
  } else {
    logWarning(`GitHub CLI (\`gh\`) not detected. Your complete PR description is saved in \`${path.relative(process.cwd(), prPath)}\`.`);
  }

  // 4. Post-Ship Feature Promotion to features/<feature-name> (Hot Tier)
  const defaultFeatureName = slugify(featureGoal || 'completed-feature');
  logStep(`Promoting shipped feature to features/${defaultFeatureName}...`, 'Workspace Engine', 'archiveFeatureWorkspace');
  
  const shipPromoteRes = archiveFeatureWorkspace('named_feature', defaultFeatureName, {
    branch: currentBranch,
    baseBranch: baseBranch,
    status: 'SHIPPED'
  }, process.cwd());

  if (shipPromoteRes.success) {
    logSuccess(`Feature promoted to: ${path.relative(process.cwd(), shipPromoteRes.targetDir)}`);
    console.log(`\n✨ Active feature workspace reset. Ready for your next feature (\`dag new\`)!\n`);
  }

  // Check Hot-Tier Capacity Cap (Default: 5)
  const maxHotFeatures = parseInt(config.MAX_ACTIVE_FEATURES || '5', 10);
  const activeFeatures = listAllFeatures(process.cwd()).filter(f => !f.isCurrent);

  if (activeFeatures.length > maxHotFeatures) {
    console.log(`\n${ANSI.brightYellow}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ ⚠️  HOT-TIER FEATURE CAPACITY LIMIT REACHED (${activeFeatures.length}/${maxHotFeatures})                │`);
    console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
    console.log(`  Features in active folder exceed the clean capacity limit.`);
    activeFeatures.forEach((feat, idx) => {
      const stBadge = feat.status === 'SHIPPED' ? `${ANSI.brightGreen}[SHIPPED]${ANSI.reset}` : `${ANSI.brightYellow}[PAUSED]${ANSI.reset}`;
      console.log(`  [${idx + 1}] ${feat.name.padEnd(28)} ${stBadge}`);
    });
    console.log(`  [S] Skip archiving for now`);
    console.log(`${ANSI.brightYellow}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);

    const capChoice = await askQuestion(`👉 Select feature number to archive to cold storage [.dag/archive/]: `);
    const capNum = parseInt(capChoice.trim(), 10);
    if (!isNaN(capNum) && capNum >= 1 && capNum <= activeFeatures.length) {
      const featToArchive = activeFeatures[capNum - 1];
      const archiveRes = archiveFeatureWorkspace('archive', featToArchive.name, featToArchive.meta || {}, process.cwd());
      if (archiveRes.success) {
        logSuccess(`Moved '${featToArchive.name}' to cold storage: ${path.relative(process.cwd(), archiveRes.targetDir)}`);
      }
    }
  }
}

async function main() {
  const [,, command, ...args] = process.argv;
  const config = loadConfig();

  try {
    switch (command) {
      case 'init':
        const localConf = path.join(process.cwd(), '.dag', 'config.json');
        if (fs.existsSync(localConf)) {
          console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
          console.log(`│ ⚙️  DAG REPOSITORY ALREADY INITIALIZED                              │`);
          console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
          console.log(`│ Current SPECS_DIR:  ${ANSI.bold}${config.SPECS_DIR || 'docs/features'}${ANSI.reset}`);
          console.log(`│ Current Harness:    ${ANSI.bold}${config.DEFAULT_HARNESS || 'standalone'}${ANSI.reset}`);
          console.log(`│ Active Feature:     ${ANSI.bold}${config.ACTIVE_FEATURE || '(None active)'}${ANSI.reset}`);
          console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);

          const reinit = await askQuestion('👉 Re-run interactive repository setup? [y/N] (Default: N): ');
          if (reinit.trim().toLowerCase() === 'y' || reinit.trim().toLowerCase() === 'yes') {
            await ensureRepoInit(process.cwd(), true);
          }
        } else {
          await ensureRepoInit(process.cwd(), true);
        }
        break;

      case 'rules':
      case 'rule':
        const [rulesSubCmd] = args;
        const projectRules = loadProjectRules();
        if (rulesSubCmd === 'harvest' || rulesSubCmd === 'scan') {
          banner('WHOLE-REPO ARCHITECTURE & CONVENTIONS HARVESTER');
          logStep('Scanning repository conventions (1M+ Context)...', 'Google AI Studio', 'gemini-3.6-pro');
          const repoSummary = getRepoContextSummary();
          const harvestPrompt = `Analyze this codebase and extract the top 5 most important architectural conventions, layer boundaries, and coding standards currently practiced in the code.\n\n${repoSummary}`;
          const reconReport = await executeStagePrompt('recon', 'Analyze repo conventions', '', { repoContext: repoSummary });
          const discovered = extractConventionsFromRecon(reconReport);

          if (discovered.length === 0) {
            logWarning('No unambiguous conventions extracted. You can manually add rules to .dagrules');
          } else {
            console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
            console.log(`│ 💡 DISCOVERED REPOSITORY CONVENTIONS                               │`);
            console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
            for (let i = 0; i < discovered.length; i++) {
              console.log(`  [${i + 1}] ${discovered[i]}`);
            }
            console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);
            const pChoice = await askQuestion('\n👉 Select conventions to save into .dagrules [e.g. 1,2 / all / none] (Default: all): ');
            const pTrim = pChoice.trim();
            if (pTrim.toLowerCase() !== 'none' && pTrim.toLowerCase() !== 'n') {
              let toSave = discovered;
              if (pTrim && pTrim.toLowerCase() !== 'all') {
                const indices = pTrim.split(/[\s,]+/).map(n => parseInt(n, 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < discovered.length);
                toSave = indices.map(i => discovered[i]);
              }
              for (const rule of toSave) {
                appendLearnedRule(rule, 'Harvested Convention');
              }
              logSuccess(`Saved ${toSave.length} permanent policy rules to .dagrules!`);
            }
          }
        } else if (rulesSubCmd === 'preset' || rulesSubCmd === 'template') {
          const targetPreset = args[1];
          if (!targetPreset) {
            console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
            console.log(`│ 📜 CURATED .DAGRULES PRESETS                                       │`);
            console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
            for (const [pKey, pVal] of Object.entries(RULE_PRESETS)) {
              console.log(`  ${ANSI.bold}${pKey.padEnd(16)}${ANSI.reset} → ${pVal.name}`);
              console.log(`    ${ANSI.dim}${pVal.desc}${ANSI.reset}`);
            }
            console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);
            console.log(`Usage:`);
            console.log(`  dag rules preset <name>          Apply a preset (typescript | microservices | frontend | python)\n`);
          } else {
            try {
              const presetArgs = args.slice(1);
              const res = applyRulePreset(presetArgs);
              logSuccess(`Applied "${res.preset}" preset(s) to .dagrules! (${res.count} rules added)\n`);
            } catch (err) {
              logError(err.message);
            }
          }
        } else if (rulesSubCmd === 'sync') {
          banner('SYNC ENGINEERING RULES (MERGE & KEEP IN BOTH)');
          const direction = args[1] ? args[1].toLowerCase() : '';
          
          let mode = 'bidirectional';
          if (direction === 'to-team' || direction === 'local-to-team') mode = 'local-to-team';
          else if (direction === 'to-local' || direction === 'team-to-local') mode = 'team-to-local';
          else if (!direction) {
            console.log(`👉 Select Rule Sync Mode (Merge without deleting):`);
            console.log(`   ${ANSI.bold}[1] Bidirectional Sync${ANSI.reset}  → Merge .dagrules.local <-> .dagrules (Default)`);
            console.log(`   ${ANSI.bold}[2] Merge Local to Team${ANSI.reset} → Copy .dagrules.local -> .dagrules`);
            console.log(`   ${ANSI.bold}[3] Merge Team to Local${ANSI.reset} → Copy .dagrules -> .dagrules.local`);
            const sChoice = await askQuestion('\nSelection [1/2/3] (Default: 1): ');
            const sTrim = sChoice.trim();
            if (sTrim === '2') mode = 'local-to-team';
            else if (sTrim === '3') mode = 'team-to-local';
            else mode = 'bidirectional';
          }

          const res = syncRules(mode);
          logSuccess(`Synchronized rules successfully! (${res.teamCount} team rules, ${res.localCount} local rules)`);

        } else if (rulesSubCmd === 'port' || rulesSubCmd === 'move') {
          banner('PORT / MOVE ENGINEERING RULES (TRANSFER & REMOVE FROM SOURCE)');
          const direction = args[1] ? args[1].toLowerCase() : '';
          
          let mode = 'local-to-team';
          if (direction === 'to-local' || direction === 'team-to-local') mode = 'team-to-local';
          else if (!direction) {
            console.log(`👉 Select Rule Porting Direction (Moves and clears source):`);
            console.log(`   ${ANSI.bold}[1] Port Local to Team${ANSI.reset}  → Move .dagrules.local -> .dagrules (Clears local) (Default)`);
            console.log(`   ${ANSI.bold}[2] Port Team to Local${ANSI.reset}  → Move .dagrules -> .dagrules.local (Clears team)`);
            const pChoice = await askQuestion('\nSelection [1/2] (Default: 1): ');
            const pTrim = pChoice.trim();
            if (pTrim === '2') mode = 'team-to-local';
            else mode = 'local-to-team';
          }

          const res = portRules(mode);
          logSuccess(`Ported ${res.portedCount} rules from ${res.from} to ${res.to}! (${res.from} is now cleared)`);

        } else {
          console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
          console.log(`│ 📜 ACTIVE TEAM & ARCHITECTURE RULES (.dagrules)                    │`);
          console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
          if (projectRules.rules) {
            console.log(projectRules.rules);
          } else {
            console.log(`│ No .dagrules file found.                                           │`);
            console.log(`│ Run \`dag rules preset\` or \`dag rules harvest\` to generate one!      │`);
          }
          console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);
          console.log(`Usage:`);
          console.log(`  dag rules sync                   Merge rules without deleting (.dagrules <-> .dagrules.local)`);
          console.log(`  dag rules port                   Move rules from local -> team (clearing local after move)`);
          console.log(`  dag rules port team-to-local     Move rules from team -> local (clearing team after move)`);
          console.log(`  dag rules harvest                Scan whole codebase & auto-generate .dagrules`);
          console.log(`  dag rules preset <name>          Apply standard rule preset (typescript | microservices | frontend | python)\n`);
        }
        break;

      case 'service':
      case 'services':
        const [serviceSubCmd, sName, sPath] = args;
        if (serviceSubCmd === 'link') {
          const name = sName || await askQuestion('👉 Enter service name: ');
          const targetPath = sPath || await askQuestion('👉 Enter path to service folder: ');
          if (name && targetPath) {
            try {
              const res = linkService(name.trim(), targetPath.trim());
              logSuccess(`Linked service "${name.trim()}" -> ${res.path}`);
            } catch (e) {
              logError(e.message);
            }
          }
        } else if (serviceSubCmd === 'unlink') {
          const name = sName || await askQuestion('👉 Enter service name to unlink: ');
          if (name) {
            const removed = unlinkService(name.trim());
            if (removed) logSuccess(`Unlinked service "${name.trim()}".`);
            else logWarning(`Service "${name.trim()}" was not linked.`);
          }
        } else {
          renderServicesList();
          console.log(`Usage:`);
          console.log(`  dag service link <name> <path>   Link a microservice or monorepo package`);
          console.log(`  dag service unlink <name>        Unlink a microservice\n`);
        }
        break;

      case 'verify':
      case 'audit':
        const verState = getPipelineStatus();
        const reports = verifyFullPipeline(verState);
        if (reports.length === 0) {
          logWarning('No contracts or task plans found to verify in active workspace.');
        } else {
          for (const rep of reports) {
            renderVerificationReport(rep);
          }
        }
        break;

      case 'features':
      case 'list':
        const allFeats = listAllFeatures();
        console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
        console.log(`│ 📂 DAG FEATURE WORKSPACES                                          │`);
        console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
        if (allFeats.length === 0) {
          console.log(`│ No saved features found in docs/features or .dag/features          │`);
        } else {
          for (const f of allFeats) {
            const currentTag = f.isCurrent ? `${ANSI.brightGreen}* ACTIVE${ANSI.reset}` : '        ';
            const status = f.hasReview ? '✓ DONE' : (f.hasContract ? '⏳ SPEC' : '○ REQS');
            console.log(`│ ${currentTag} ${f.name.padEnd(38)} [${status}] │`);
          }
        }
        console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);
        break;

      case 'switch':
        const targetFeature = args[0] || await askQuestion('👉 Enter feature name to activate: ');
        if (targetFeature) {
          saveLocalConfig({ ACTIVE_FEATURE: targetFeature.trim() });
          logSuccess(`Switched active feature to: ${targetFeature.trim()}`);
        }
        break;

      case 'stack':
        banner('BRANCH STACKING HELPER');
        const baseBranch = args[0] || await askQuestion('👉 Enter base branch or PR branch to stack on (e.g. feature-part-1, main): ');
        if (!baseBranch.trim()) {
          logError('Base branch is required.');
          break;
        }

        const cleanBase = baseBranch.trim();
        const newBranch = args[1] || await askQuestion(`👉 Enter new feature branch name (stacked on ${cleanBase}): `);
        if (!newBranch.trim()) {
          logError('New branch name is required.');
          break;
        }

        const cleanNew = newBranch.trim();
        try {
          logStep(`Fetching latest changes from origin...`, 'Git CLI', `git fetch origin ${cleanBase}`);
          execSync(`git fetch origin ${cleanBase}`, { stdio: 'inherit' });

          logStep(`Creating and switching to stacked branch "${cleanNew}"...`, 'Git CLI', `git checkout -b ${cleanNew} origin/${cleanBase}`);
          execSync(`git checkout -b ${cleanNew} origin/${cleanBase}`, { stdio: 'inherit' });

          // Record stacked parent branch in local config
          saveLocalConfig({ STACKED_BASE_BRANCH: cleanBase, ACTIVE_BRANCH: cleanNew });
          logSuccess(`Successfully created and checked out branch "${cleanNew}" stacked on "${cleanBase}"!`);
        } catch (err) {
          logError(`Branch stacking failed: ${err.message}`);
        }
        break;

      case 'stats':
      case 'benchmark':
        const benchmark = getFeatureBenchmark();
        if (args.includes('--json') || process.argv.includes('--json')) {
          console.log(JSON.stringify(benchmark, null, 2));
          break;
        }

        const bLine = '─'.repeat(68);
        console.log(`\n${ANSI.cyan}${ANSI.bold}┌${bLine}┐`);
        console.log(`│ 💰 DAG FEATURE COST & TOKEN SAVINGS BENCHMARK                      │`);
        console.log(`├${bLine}┤${ANSI.reset}`);
        console.log(`│ ${ANSI.bold}Total Tokens Processed:${ANSI.reset}     ${benchmark.totalTokens.toLocaleString().padEnd(38)} │`);
        console.log(`│ ${ANSI.bold}Input Tokens (Context):${ANSI.reset}     ${benchmark.totalInputTokens.toLocaleString().padEnd(38)} │`);
        console.log(`│ ${ANSI.bold}Output Tokens (Generated):${ANSI.reset}  ${benchmark.totalOutputTokens.toLocaleString().padEnd(38)} │`);
        console.log(`├${bLine}┤`);
        console.log(`│ ${ANSI.bold}Actual Cost (DAG Routed):${ANSI.reset}   ${ANSI.brightGreen}$${benchmark.actualCost.toFixed(4)}${ANSI.reset}${' '.repeat(36 - benchmark.actualCost.toFixed(4).length)} │`);
        console.log(`├${bLine}┤`);
        console.log(`│ ${ANSI.bold}Comparative Single-Model Baselines (Max 3):${ANSI.reset}${' '.repeat(26)} │`);

        for (const comp of benchmark.comparisons) {
          const nameStr = `vs ${comp.name.slice(0, 24)}:`;
          const costStr = `$${comp.baselineCost.toFixed(4)} → Save ${comp.savingsPct} ($${comp.savingsUSD.toFixed(2)})`;
          console.log(`│   ${nameStr.padEnd(28)} ${ANSI.dim}${costStr.padEnd(34)}${ANSI.reset} │`);
        }

        console.log(`${ANSI.cyan}${ANSI.bold}└${bLine}┘${ANSI.reset}`);
        console.log(`${ANSI.dim}Toggle models via: \`dag config set BENCHMARK_MODELS "claude-sonnet-5,gpt-4o,deepseek-chat"\`${ANSI.reset}\n`);
        break;

      case 'doctor':
        const docState = getPipelineStatus();
        const checkBinStatus = bin => {
          try {
            execSync(`which ${bin}`, { stdio: 'ignore' });
            return true;
          } catch (e) {
            return false;
          }
        };

        if (args.includes('--json') || process.argv.includes('--json')) {
          console.log(JSON.stringify({
            nodeVersion: process.version,
            tools: {
              git: checkBinStatus('git'),
              gh: checkBinStatus('gh'),
              claude: checkBinStatus('claude'),
              ollama: checkBinStatus('ollama')
            },
            config: {
              preset: config.DEFAULT_PROVIDER_PRESET || 'hybrid',
              hasGeminiKey: !!config.GEMINI_API_KEY,
              hasAnthropicKey: !!config.ANTHROPIC_API_KEY,
              hasOpenAIKey: !!config.OPENAI_API_KEY
            },
            workspace: {
              activeDir: docState.workspaceDir,
              relative: path.relative(process.cwd(), docState.workspaceDir) || './'
            }
          }, null, 2));
          break;
        }

        const line = '─'.repeat(68);
        console.log(`\n${ANSI.cyan}${ANSI.bold}┌${line}┐`);
        console.log(`│ 🩺 DAG ENVIRONMENT & CONFIGURATION DOCTOR                          │`);
        console.log(`├${line}┤${ANSI.reset}`);

        const checkBin = bin => {
          try {
            execSync(`which ${bin}`, { stdio: 'ignore' });
            return `${ANSI.brightGreen}✓ Installed${ANSI.reset}`;
          } catch (e) {
            return `${ANSI.gray}○ Not Found${ANSI.reset}`;
          }
        };

        const hasKey = k => config[k] ? `${ANSI.brightGreen}✓ Configured${ANSI.reset}` : `${ANSI.gray}○ Not Set${ANSI.reset}`;

        console.log(`│ ${ANSI.bold}Node.js Version:${ANSI.reset}     ${process.version.padEnd(20)} ${ANSI.brightGreen}✓ OK${ANSI.reset}${' '.repeat(20)} │`);
        console.log(`│ ${ANSI.bold}Git CLI:${ANSI.reset}             ${checkBin('git').padEnd(46)} │`);
        console.log(`│ ${ANSI.bold}GitHub CLI (gh):${ANSI.reset}     ${checkBin('gh').padEnd(46)} │`);
        console.log(`│ ${ANSI.bold}Claude Code CLI:${ANSI.reset}     ${checkBin('claude').padEnd(46)} │`);
        console.log(`│ ${ANSI.bold}Ollama (Local):${ANSI.reset}      ${checkBin('ollama').padEnd(46)} │`);
        console.log(`├${line}┤`);
        console.log(`│ ${ANSI.bold}Active Preset:${ANSI.reset}       ${(config.DEFAULT_PROVIDER_PRESET || 'hybrid').padEnd(46)} │`);
        console.log(`│ ${ANSI.bold}Google Gemini Key:${ANSI.reset}   ${hasKey('GEMINI_API_KEY').padEnd(46)} │`);
        console.log(`│ ${ANSI.bold}Anthropic Key:${ANSI.reset}       ${hasKey('ANTHROPIC_API_KEY').padEnd(46)} │`);
        console.log(`│ ${ANSI.bold}OpenAI/DeepSeek Key:${ANSI.reset} ${hasKey('OPENAI_API_KEY').padEnd(46)} │`);
        console.log(`├${line}┤`);
        console.log(`│ ${ANSI.bold}Workspace Root:${ANSI.reset}      ${(path.relative(process.cwd(), docState.workspaceDir) || './').padEnd(46)} │`);
        console.log(`${ANSI.cyan}${ANSI.bold}└${line}┘${ANSI.reset}\n`);
        break;

      case 'status':
        const state = getPipelineStatus();
        if (args.includes('--json') || process.argv.includes('--json')) {
          console.log(JSON.stringify({
            workspace: state.workspaceDir,
            preset: config.DEFAULT_PROVIDER_PRESET || 'hybrid',
            harness: config.DEFAULT_HARNESS || 'standalone',
            artifacts: {
              requirements: state.hasRequirements,
              recon: state.hasRecon,
              contracts: state.hasContracts,
              findings: state.hasFindings,
              domain: state.hasDomain,
              appInfra: state.hasAppInfra,
              data: state.hasData,
              tasks: state.hasTasks,
              review: state.hasReview
            },
            gates: {
              gate1Approved: state.gate1Approved,
              gate2Approved: state.gate2Approved
            },
            blockersCount: state.blockers ? state.blockers.length : 0,
            tasksProgress: `${state.implementedCount}/${state.totalTasks}`
          }, null, 2));
        } else {
          renderStatusCard(state, config);
        }
        break;

      case 'config':
        const [subCmd, key, val] = args;
        if (subCmd === 'preset') {
          if (!key) {
            const { builtIns, custom } = listPresets();
            console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
            console.log(`│ 🎛️  DAG PROVIDER PRESETS                                           │`);
            console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
            console.log(`│ ${ANSI.bold}Built-in Presets:${ANSI.reset} ${builtIns.join(', ')}`);
            if (custom.length > 0) {
              console.log(`│ ${ANSI.bold}Custom Presets:${ANSI.reset}   ${custom.join(', ')}`);
            } else {
              console.log(`│ ${ANSI.bold}Custom Presets:${ANSI.reset}   (None yet. Run \`dag config preset create\` to build one)`);
            }
            console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);
            console.log(`Usage:`);
            console.log(`  dag config preset <name>         Activate a preset`);
            console.log(`  dag config preset create [name]  Create a new custom stage-to-model preset\n`);
          } else if (key === 'create') {
            const customName = val || await askQuestion('👉 Enter custom preset name (e.g., my-team-stack): ');
            if (!customName.trim()) {
              logError('Preset name is required.');
              break;
            }
            
            console.log(`\nConfigure providers per stage for [${customName.trim()}]:`);
            console.log(`Options for each stage: ${ANSI.cyan}gemini | claude | deepseek | ollama${ANSI.reset}\n`);

            const stages = [
              { key: 'PROVIDER_REFINE', label: 'Step 0 (Prompt Refinement)' },
              { key: 'PROVIDER_RECON', label: 'Step 1 (Whole-Repo Recon)' },
              { key: 'PROVIDER_CONTRACT', label: 'Step 1 (Contract Spec Drafting)' },
              { key: 'PROVIDER_SKEPTIC', label: 'Step 1 & 2 (Adversarial Skeptic Audit)' },
              { key: 'PROVIDER_LAYERS', label: 'Step 2 (Parallel Layer Fan-out)' },
              { key: 'PROVIDER_MERGE', label: 'Step 2 (Tasks Plan Merger)' },
              { key: 'PROVIDER_CODING', label: 'Step 3 (Task Implementation)' },
              { key: 'PROVIDER_CONFORMANCE', label: 'Step 3 (Anti-Drift Conformance)' },
              { key: 'PROVIDER_REVIEW', label: 'Step 4 (Final Code Review)' }
            ];

            const mapping = {};
            for (const s of stages) {
              const def = config[s.key] || 'gemini';
              const ans = await askQuestion(`👉 ${s.label} [Default: ${def}]: `);
              mapping[s.key] = ans.trim() || def;
            }

            saveCustomPreset(customName.trim(), mapping);
            applyPreset(customName.trim());
            logSuccess(`Custom preset "${customName.trim()}" created and activated!`);
          } else {
            applyPreset(key);
            logSuccess(`Applied preset: ${key}`);
          }
        } else if (subCmd === 'harness') {
          if (!key) {
            const harnesses = listHarnesses();
            console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
            console.log(`│ 🚀 DAG EXECUTION HARNESS RUNNERS                                   │`);
            console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
            for (const h of harnesses) {
              const isCurrent = (config.DEFAULT_HARNESS || 'standalone') === h.name;
              const tag = isCurrent ? `${ANSI.brightGreen}* ACTIVE${ANSI.reset}` : '        ';
              console.log(`│ ${tag} ${ANSI.bold}${h.name.padEnd(12)}${ANSI.reset} → ${ANSI.dim}${h.desc.padEnd(46)}${ANSI.reset} │`);
            }
            console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);
            console.log(`Usage:`);
            console.log(`  dag config harness <name>        Switch execution harness (standalone | dsh | headless)\n`);
          } else {
            try {
              const chosen = setHarnessRunner(key);
              logSuccess(`Switched execution harness to: "${chosen}"`);
            } catch (err) {
              logError(err.message);
            }
          }
        } else if (subCmd === 'set' && key && val) {
          const oldSpecsDir = config.SPECS_DIR || 'docs/features';
          saveConfig({ [key]: val });
          saveLocalConfig({ [key]: val });
          logSuccess(`Set ${key}=${val}`);

          // If SPECS_DIR changed, check if existing feature folders should be migrated
          if (key === 'SPECS_DIR' && val !== oldSpecsDir) {
            const oldBasePath = path.join(process.cwd(), oldSpecsDir);
            const newBasePath = path.join(process.cwd(), val);

            if (fs.existsSync(oldBasePath)) {
              const featuresToMove = fs.readdirSync(oldBasePath)
                .filter(f => fs.statSync(path.join(oldBasePath, f)).isDirectory());

              if (featuresToMove.length > 0) {
                console.log(`\n📦 Found ${featuresToMove.length} feature workspace(s) in "${oldSpecsDir}":`);
                for (const feat of featuresToMove) {
                  console.log(`   • ${feat}`);
                }
                const moveAns = await askQuestion(`\n👉 Move these feature workspaces to the new location ("${val}")? [Y/n] (Default: Y): `);
                const trimmed = moveAns.trim().toLowerCase();
                if (!trimmed || trimmed === 'y' || trimmed === 'yes') {
                  if (!fs.existsSync(newBasePath)) {
                    fs.mkdirSync(newBasePath, { recursive: true });
                  }
                  for (const feat of featuresToMove) {
                    const srcPath = path.join(oldBasePath, feat);
                    const destPath = path.join(newBasePath, feat);
                    fs.renameSync(srcPath, destPath);
                  }
                  logSuccess(`Successfully migrated ${featuresToMove.length} feature workspace(s) to "${val}"!`);

                  // Add to .gitignore if moving to .dag/
                  if (val.startsWith('.dag')) {
                    const gitignorePath = path.join(process.cwd(), '.gitignore');
                    if (fs.existsSync(gitignorePath)) {
                      let gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
                      if (!gitignoreContent.includes('.dag/')) {
                        gitignoreContent += '\n# DAG Orchestrator workspace and local backups\n.dag/\n';
                        fs.writeFileSync(gitignorePath, gitignoreContent);
                        logSuccess('Added .dag/ to .gitignore');
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (subCmd === 'get' && key) {
          console.log(`${key}=${config[key] || 'not set'}`);
        } else {
          console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
          console.log(`│ ⚙️  CURRENT DAG CONFIGURATION                                       │`);
          console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
          for (const [k, v] of Object.entries(config)) {
            let displayVal = v;
            if (/key|secret|token|password/i.test(k) && v) {
              displayVal = v.length > 8 ? `${v.slice(0, 4)}••••••••${v.slice(-4)}` : '••••••••';
            }
            console.log(`  ${ANSI.bold}${k.padEnd(26)}${ANSI.reset} = ${displayVal || ANSI.dim + '(not set)' + ANSI.reset}`);
          }
          console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);
        }
        break;

      case 'archive':
      case 'archives': {
        const [subAction, targetName] = args;
        const archivedList = listArchivedFeatures(process.cwd());

        // dag archive (with no current feature or explicit 'list') -> list cold storage
        const pipeState = getPipelineStatus();
        if (subAction === 'list' || (!subAction && args.length === 0 && !pipeState.hasRequirements && !pipeState.hasContracts)) {
          console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
          console.log(`│ 📦 ARCHIVED FEATURES (COLD STORAGE: .dag/archive/)                 │`);
          console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
          if (archivedList.length === 0) {
            console.log(`│  (No archived features found in cold storage)                      │`);
          } else {
            archivedList.forEach((feat, idx) => {
              const statusBadge = feat.status === 'SHIPPED' 
                ? `${ANSI.brightGreen}[SHIPPED]${ANSI.reset}` 
                : (feat.status === 'PAUSED' ? `${ANSI.brightYellow}[PAUSED]${ANSI.reset}` : `${ANSI.cyan}[DRAFT]${ANSI.reset}`);
              const branchStr = feat.meta.branch ? `${ANSI.dim}(${feat.meta.branch})${ANSI.reset}` : '';
              console.log(`  [${idx + 1}] ${ANSI.bold}${feat.name.padEnd(28)}${ANSI.reset} ${statusBadge} ${branchStr}`);
              if (feat.title && feat.title !== feat.name) {
                console.log(`      ${ANSI.dim}↳ ${feat.title}${ANSI.reset}`);
              }
            });
          }
          console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);
          console.log(`${ANSI.dim}Use \`dag unarchive <name>\` to restore an archived feature to the active features folder.${ANSI.reset}\n`);
          break;
        }

        // Archive the current workspace to cold storage
        let archiveName = targetName || subAction || '';
        let featureBranch = '';
        try {
          featureBranch = execSync('git branch --show-current', { encoding: 'utf8', cwd: process.cwd() }).trim();
        } catch (e) {}

        if (!pipeState.hasRequirements && !pipeState.hasContracts && !pipeState.hasTasks) {
          logWarning('Current feature workspace is empty. Nothing to archive.');
          break;
        }

        if (!archiveName) {
          let defaultName = 'current-feature';
          const reqPath = resolveArtifactPath('00-requirements.md');
          if (fs.existsSync(reqPath)) {
            try {
              const reqTxt = fs.readFileSync(reqPath, 'utf8');
              const tMatch = reqTxt.match(/^#\s*([^\n]+)/m) || reqTxt.match(/Feature:\s*([^\n]+)/i);
              if (tMatch && tMatch[1]) {
                defaultName = slugify(tMatch[1].replace(/^(Feature\s*Request|Feature\s*Goal|Requirements|Feature):\s*/i, ''));
              }
            } catch (e) {}
          }

          const userEnteredName = await askQuestion(`👉 Name for archived feature (Default: ${defaultName}): `);
          archiveName = userEnteredName.trim() || defaultName;
        }

        const res = archiveFeatureWorkspace('archive', archiveName, {
          branch: featureBranch,
          status: pipeState.hasPrDescription ? 'SHIPPED' : (pipeState.hasTasks ? 'PAUSED' : 'DRAFT')
        }, process.cwd());

        if (res.success) {
          logSuccess(`Feature workspace archived to: ${path.relative(process.cwd(), res.targetDir)}`);
          console.log(`\n✨ Active feature workspace reset. Run \`dag new\` or \`dag activate <name>\`!\n`);
        } else {
          logError(`Archiving failed: ${res.message}`);
        }
        break;
      }

      case 'unarchive': {
        let [targetFeature] = args;
        const archivedList = listArchivedFeatures(process.cwd());

        if (!targetFeature) {
          if (archivedList.length === 0) {
            logWarning('No archived features found in cold storage to unarchive.');
            break;
          }

          console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
          console.log(`│ 📦 SELECT FEATURE TO UNARCHIVE (COLD STORAGE ➔ FEATURES)           │`);
          console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
          archivedList.forEach((feat, idx) => {
            const statusBadge = feat.status === 'SHIPPED' 
              ? `${ANSI.brightGreen}[SHIPPED]${ANSI.reset}` 
              : (feat.status === 'PAUSED' ? `${ANSI.brightYellow}[PAUSED]${ANSI.reset}` : `${ANSI.cyan}[DRAFT]${ANSI.reset}`);
            const branchStr = feat.meta?.branch ? `${ANSI.dim}(${feat.meta.branch})${ANSI.reset}` : '';
            console.log(`  [${idx + 1}] ${ANSI.bold}${feat.name.padEnd(28)}${ANSI.reset} ${statusBadge} ${branchStr}`);
          });
          console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);

          const choice = await askQuestion(`👉 Enter feature number or name to unarchive: `);
          const num = parseInt(choice.trim(), 10);
          if (!isNaN(num) && num >= 1 && num <= archivedList.length) {
            targetFeature = archivedList[num - 1].name;
          } else {
            targetFeature = choice.trim();
          }
        }

        if (!targetFeature) {
          logError('No feature specified.');
          break;
        }

        // Check hot-tier cap before unarchiving
        const maxHotFeatures = parseInt(config.MAX_ACTIVE_FEATURES || '5', 10);
        const hotFeatures = listAllFeatures(process.cwd()).filter(f => !f.isCurrent);
        if (hotFeatures.length >= maxHotFeatures) {
          console.log(`\n${ANSI.brightYellow}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
          console.log(`│ ⚠️  HOT-TIER FEATURE CAPACITY LIMIT REACHED (${hotFeatures.length}/${maxHotFeatures})                │`);
          console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
          console.log(`  Please archive a feature to cold storage before unarchiving.`);
          hotFeatures.forEach((feat, idx) => {
            const stBadge = feat.status === 'SHIPPED' ? `${ANSI.brightGreen}[SHIPPED]${ANSI.reset}` : `${ANSI.brightYellow}[PAUSED]${ANSI.reset}`;
            console.log(`  [${idx + 1}] ${feat.name.padEnd(28)} ${stBadge}`);
          });
          console.log(`  [S] Skip limit check`);
          console.log(`${ANSI.brightYellow}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}`);

          const capAns = await askQuestion(`👉 Select feature to archive, or [S] to skip: `);
          const capNum = parseInt(capAns.trim(), 10);
          if (!isNaN(capNum) && capNum >= 1 && capNum <= hotFeatures.length) {
            const featToMove = hotFeatures[capNum - 1];
            archiveFeatureWorkspace('archive', featToMove.name, featToMove.meta || {}, process.cwd());
            logSuccess(`Archived '${featToMove.name}' to cold storage.`);
          }
        }

        logStep(`Unarchiving '${targetFeature}' to features folder...`, 'Workspace Engine', 'unarchiveFeatureWorkspace');
        const unRes = unarchiveFeatureWorkspace(targetFeature, process.cwd());

        if (!unRes.success) {
          logError(unRes.message);
          break;
        }

        logSuccess(`Feature moved to: ${path.relative(process.cwd(), unRes.targetDir)}`);
        console.log(`\n👉 Run \`dag activate ${unRes.featureName}\` whenever you want to set it as current-feature!\n`);
        break;
      }

      case 'activate':
      case 'restore':
      case 'switch': {
        let [targetFeature] = args;
        // Strictly target Hot Tier features (inside features/ folder)
        const hotFeatures = listAllFeatures(process.cwd()).filter(f => !f.isCurrent);

        if (!targetFeature) {
          if (hotFeatures.length === 0) {
            logWarning('No stored features found in the features/ folder to activate.');
            console.log(`${ANSI.dim}To restore from cold storage, run \`dag unarchive\` first.${ANSI.reset}\n`);
            break;
          }

          console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
          console.log(`│ 🔄 SELECT FEATURE TO ACTIVATE (FEATURES ➔ CURRENT-FEATURE)         │`);
          console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
          hotFeatures.forEach((feat, idx) => {
            const statusBadge = feat.status === 'SHIPPED' 
              ? `${ANSI.brightGreen}[SHIPPED]${ANSI.reset}` 
              : (feat.status === 'PAUSED' ? `${ANSI.brightYellow}[PAUSED]${ANSI.reset}` : `${ANSI.cyan}[DRAFT]${ANSI.reset}`);
            const branchStr = feat.meta?.branch ? `${ANSI.dim}(${feat.meta.branch})${ANSI.reset}` : '';
            console.log(`  [${idx + 1}] ${ANSI.bold}${feat.name.padEnd(28)}${ANSI.reset} ${statusBadge} ${branchStr}`);
          });
          console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);

          const choice = await askQuestion(`👉 Enter feature number or name to activate: `);
          const num = parseInt(choice.trim(), 10);
          if (!isNaN(num) && num >= 1 && num <= hotFeatures.length) {
            targetFeature = hotFeatures[num - 1].name;
          } else {
            targetFeature = choice.trim();
          }
        }

        if (!targetFeature) {
          logError('No feature specified.');
          break;
        }

        logStep(`Activating feature workspace '${targetFeature}'...`, 'Workspace Engine', 'activateFeatureWorkspace');
        const actRes = activateFeatureWorkspace(targetFeature, process.cwd());

        if (!actRes.success) {
          logError(actRes.message);
          break;
        }

        logSuccess(`Workspace '${targetFeature}' is now active at ${path.relative(process.cwd(), actRes.targetDir)}!`);

        // Check associated git branch
        const associatedBranch = actRes.meta?.branch;
        let currentBranch = '';
        try {
          currentBranch = execSync('git branch --show-current', { encoding: 'utf8', cwd: process.cwd() }).trim();
        } catch (e) {}

        if (associatedBranch && currentBranch && associatedBranch !== currentBranch) {
          console.log(`\n${ANSI.brightYellow}⚠️  Associated Git branch for this feature is '${associatedBranch}', but current branch is '${currentBranch}'.${ANSI.reset}`);
          const doSwitch = await askQuestion(`👉 Switch to git branch '${associatedBranch}' now? [Y/n] (Default: Y): `);
          if (!doSwitch.trim() || doSwitch.toLowerCase() === 'y' || doSwitch.toLowerCase() === 'yes') {
            try {
              logStep(`Switching branch to '${associatedBranch}'...`, 'Git', 'git checkout');
              execSync(`git checkout "${associatedBranch}"`, { stdio: 'inherit', cwd: process.cwd() });
              logSuccess(`Switched to '${associatedBranch}'!`);
            } catch (gitErr) {
              logWarning(`Could not switch branch: ${gitErr.message}`);
            }
          }
        }

        // Check for codebase drift since last update
        const lastUpdated = actRes.meta?.lastUpdated;
        if (lastUpdated) {
          const daysAgo = Math.round((Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24));
          if (daysAgo > 1) {
            console.log(`\n${ANSI.brightYellow}🕒 This feature was last worked on ${daysAgo} day(s) ago (${new Date(lastUpdated).toLocaleDateString()}).${ANSI.reset}`);
            const doRecon = await askQuestion(`👉 Run recon refresh to check for breaking codebase changes? [y/N] (Default: N): `);
            if (doRecon.trim().toLowerCase() === 'y' || doRecon.trim().toLowerCase() === 'yes') {
              await runStep1();
            }
          }
        }
        break;
      }

      case 'features':
      case 'list': {
        // Strictly Hot-Tier Features in features/ folder
        const allFeatures = listAllFeatures(process.cwd());

        console.log(`\n${ANSI.cyan}${ANSI.bold}┌────────────────────────────────────────────────────────────────────┐`);
        console.log(`│ 🌟 ACTIVE FEATURE WORKSPACES (HOT TIER: features/)                 │`);
        console.log(`├────────────────────────────────────────────────────────────────────┤${ANSI.reset}`);
        
        if (allFeatures.length === 0) {
          console.log(`│  (No feature workspaces found. Run \`dag new\` to start one)       │`);
        } else {
          allFeatures.forEach((feat, idx) => {
            const currentTag = feat.isCurrent ? `${ANSI.brightGreen}* ACTIVE${ANSI.reset} ` : '         ';
            const statusBadge = feat.status === 'SHIPPED' 
              ? `${ANSI.brightGreen}[SHIPPED]${ANSI.reset}` 
              : (feat.status === 'PAUSED' ? `${ANSI.brightYellow}[PAUSED]${ANSI.reset}` : `${ANSI.cyan}[DRAFT]${ANSI.reset}`);
            const branchStr = feat.meta?.branch ? `${ANSI.dim}(${feat.meta.branch})${ANSI.reset}` : '';
            console.log(`│ ${currentTag} ${ANSI.bold}${feat.name.padEnd(26)}${ANSI.reset} ${statusBadge} ${branchStr}`);
          });
        }
        console.log(`${ANSI.cyan}${ANSI.bold}└────────────────────────────────────────────────────────────────────┘${ANSI.reset}\n`);
        console.log(`${ANSI.dim}Commands: \`dag activate <name>\` | \`dag archive\` to park | \`dag archive list\` for cold storage${ANSI.reset}\n`);
        break;
      }

      case 'rollback':
        const targetStep = parseInt(args[0] || '1', 10);
        const { backupDir, backedUp } = createRollbackSnapshot(targetStep);
        logSuccess(`Rolled back to step ${targetStep}. Backed up ${backedUp.length} files to ${backupDir}`);
        break;

      case 'clean':
        const confirm = await askQuestion('Are you sure you want to remove all pipeline artifacts? (y/N): ');
        if (confirm.toLowerCase() === 'y') {
          const res = cleanArtifacts();
          logSuccess(`Cleaned pipeline. Backups preserved in ${res.backupDir}`);
        }
        break;

      case '0':
      case 'refine':
      case 'plan':
        await ensureRepoInit();
        await runStep0(args.join(' ') || await askQuestion('Enter raw feature request: '));
        break;

      case '1':
      case 'contract':
      case 'spec':
        await ensureRepoInit();
        await runStep1();
        break;

      case '2':
      case 'layers':
      case 'decompose':
      case 'tasks':
        await ensureRepoInit();
        await runStep2();
        break;

      case '3':
      case 'implement':
      case 'code':
      case 'build':
        await ensureRepoInit();
        await runStep3();
        break;

      case 'next':
        await ensureRepoInit();
        const pipelineStatus = getPipelineStatus();

        if (!pipelineStatus.hasRequirements) {
          logStep('Smart Pipeline Advancer: Next step is Step 0 (Requirements Refinement)');
          await runStep0(args.join(' ') || await askQuestion('Enter raw feature request: '));
        } else if (!pipelineStatus.hasContracts || !pipelineStatus.gate1Approved) {
          logStep('Smart Pipeline Advancer: Next step is Step 1 (Contract & Skeptic Audit)');
          await runStep1();
        } else if (!pipelineStatus.hasTasks || !pipelineStatus.gate2Approved) {
          logStep('Smart Pipeline Advancer: Next step is Step 2 (Layer Decomposition & Merge)');
          await runStep2();
        } else if (pipelineStatus.implementedCount < pipelineStatus.totalTasks) {
          logStep(`Smart Pipeline Advancer: Next step is Step 3 (Task Implementation ${pipelineStatus.implementedCount + 1}/${pipelineStatus.totalTasks})`);
          await runStep3();
        } else if (!pipelineStatus.gate3Approved) {
          logStep('Smart Pipeline Advancer: Tasks complete — awaiting Gate 3 (Human Acceptance & Live Verification)');
          await runStep3();
        } else if (!pipelineStatus.hasReview) {
          logStep('Smart Pipeline Advancer: Next step is Step 4 (Full-Repo Impact Review)');
          await runStep4();
        } else {
          logSuccess('All pipeline stages are 100% complete!');
          const shipPr = await askQuestion('👉 Ship Pull Request now (`dag ship`)? [Y/n] (Default: Y): ');
          if (!shipPr.trim() || shipPr.toLowerCase() === 'y' || shipPr.toLowerCase() === 'yes') {
            await runShip(args);
          }
        }
        break;

      case '4':
      case 'review':
        await ensureRepoInit();
        await runStep4();
        break;

      case 'all':
      case 'run':
        const featureAsk = args.join(' ');
        
        // Step 0 check
        if (fs.existsSync('00-requirements.md')) {
          console.log('📄 Found existing 00-requirements.md.');
          const reuse = await askQuestion('👉 Reuse existing 00-requirements.md and skip Step 0? [Y/n] (Default: Y): ');
          if (reuse.trim().toLowerCase() === 'n' || reuse.trim().toLowerCase() === 'no') {
            await runStep0(featureAsk || await askQuestion('Enter raw feature request: '));
          }
        } else {
          await runStep0(featureAsk || await askQuestion('Enter raw feature request: '));
        }

        // Step 1 check
        if (fs.existsSync('02-contracts.md')) {
          console.log('📄 Found existing 02-contracts.md.');
          const reuseContract = await askQuestion('👉 Reuse existing 02-contracts.md and skip Step 1? [Y/n] (Default: Y): ');
          if (reuseContract.trim().toLowerCase() === 'n' || reuseContract.trim().toLowerCase() === 'no') {
            await runStep1();
          }
        } else {
          await runStep1();
        }

        // Step 2 check
        if (fs.existsSync('05-tasks.md')) {
          console.log('📄 Found existing 05-tasks.md.');
          const reuseTasks = await askQuestion('👉 Reuse existing 05-tasks.md and skip Step 2? [Y/n] (Default: Y): ');
          if (reuseTasks.trim().toLowerCase() === 'n' || reuseTasks.trim().toLowerCase() === 'no') {
            await runStep2();
          }
        } else {
          await runStep2();
        }

        // Step 3 & 4
        await runStep3();
        await runStep4();
        break;

      case 'ship':
        await ensureRepoInit();
        await runShip(args);
        break;

      // Step 3 & 4
      case 'all':
      case 'run':

      case 'web':
      case 'dsh':
        console.log('🌐 Launching DeepSeek Harness Web Dashboard on port 3080...');
        const dshProcess = spawn('npx', ['@deepseek-ai/dsh', 'web'], {
          stdio: 'inherit',
          cwd: process.cwd()
        });
        dshProcess.on('error', err => {
          logError(`Failed to launch dsh: ${err.message}`);
        });
        return;

      case 'help':
      case '--help':
      case '-h':
      default:
        const helpTopic = args[0] ? args[0].toLowerCase() : '';
        if (helpTopic === 'config' || helpTopic === 'preset') {
          console.log(`
${ANSI.bold}DAG CLI Help: Provider Presets & Configuration${ANSI.reset}

${ANSI.cyan}Usage:${ANSI.reset}
  dag config                           Display active environment configuration
  dag config harness                   List execution harness runners (standalone | dsh | headless)
  dag config harness <name>            Switch execution harness runner
  dag config preset                    List built-in and custom model presets
  dag config preset <name>             Switch active model preset (gemini | claude | deepseek | local | hybrid)
  dag config preset create [name]      Interactive wizard to build a custom stage-to-model mapping
  dag config set <KEY> <VALUE>         Set global configuration variable
  dag config get <KEY>                 Get value of configuration variable

${ANSI.cyan}Examples:${ANSI.reset}
  dag config harness standalone        # Lightweight CLI mode with ANSI cards
  dag config harness dsh               # Orchestrate via DeepSeek Harness
  dag config preset hybrid             # Gemini 1M+ Context + Claude Coding
  dag config preset create my-team-stack
          `);
        } else if (helpTopic === 'stack') {
          console.log(`
${ANSI.bold}DAG CLI Help: Branch Stacking Helper${ANSI.reset}

${ANSI.cyan}Usage:${ANSI.reset}
  dag stack <base-branch> [new-branch]

${ANSI.cyan}Description:${ANSI.reset}
  Fetches the target base branch or active PR branch from origin, creates a clean
  stacked feature branch on top of it, and locks the parent branch into local configuration
  so that PR shipping (\`dag ship\`) targets the correct base automatically.

${ANSI.cyan}Examples:${ANSI.reset}
  dag stack develop feature/campaign-v3
  dag stack pr-1651 feature/campaign-v3-part-2
          `);
        } else if (helpTopic === 'service' || helpTopic === 'services') {
          console.log(`
${ANSI.bold}DAG CLI Help: Cross-Service & Microservice Schema Registry${ANSI.reset}

${ANSI.cyan}Usage:${ANSI.reset}
  dag service                          List all linked services & discovered contract files
  dag service link <name> <path>       Link a microservice, monorepo package, or test directory
  dag service unlink <name>            Unlink an external service dependency

${ANSI.cyan}Supported Contract Types (Harvested JIT):${ANSI.reset}
  - SQL Schema DDLs: \`schema.sql\`, \`migrations/*.sql\`
  - API Specifications: \`openapi.json\`, \`openapi.yaml\`, \`swagger.json\`, \`schema.graphql\`
  - RPC & Event Definitions: \`*.proto\`
  - E2E Test Collections: \`*.postman_collection.json\`, Thunder Client (\`thunder*.json\`)

${ANSI.cyan}Examples:${ANSI.reset}
  dag service link billing ../billing-service
  dag service link notifications ../packages/notifications
          `);
        } else {
          console.log(`
${ANSI.bold}DAG CLI - Universal Model-Agnostic & Harness-Agnostic Pipeline (v0.1.0-alpha)${ANSI.reset}

${ANSI.cyan}Core Commands:${ANSI.reset}
  dag init                 Interactive repository setup (configure specs directory & .gitignore)
  dag doctor               Diagnose environment tools (git, gh, claude, ollama), keys & workspace
  dag service [link|list]  Manage linked microservices & harvest SQL/OpenAPI/Postman schemas
  dag verify (or audit)    Run Pre-Flight Verifier quality & policy audit on active specs
  dag features (or list)   List active feature workspaces in features/ (Hot Tier)
  dag archive [name]       Park current feature workspace into .dag/archive/<name> (Cold Storage)
  dag archive list         List all archived features in cold storage
  dag unarchive [name]     Restore a feature from cold storage (.dag/archive/) to features/
  dag activate [name]      Switch active workspace to a feature in features/ (Hot Tier)
  dag stack [base-branch]  Fetch base/PR branch and create a clean stacked feature branch
  dag config [preset]      Manage providers, models, and API keys (built-ins & custom presets)
  dag rollback <step>      Safely rewind to a previous stage with automatic backup snapshot
  dag clean                Reset pipeline and backup all generated artifacts
  dag ship [title]         Bundle contract + skeptic report & open Pull Request

${ANSI.cyan}Pipeline Navigation:${ANSI.reset}
  dag next                 Smart Pipeline Advancer: Automatically detects state & executes next stage
  dag run [ask]            Execute full pipeline end-to-end with interactive gate stops

${ANSI.cyan}Explicit Pipeline Stages:${ANSI.reset}
  dag refine (or plan)     Step 0: Decompose prompt into requirements & assumptions (--file, --context)
  dag contract (or spec)   Step 1: Whole-repo recon -> Interface contract -> Skeptic audit [Gate 1]
  dag layers (or tasks)    Step 2: Parallel 3-layer fan-out -> Merge tasks checklist [Gate 2]
  dag implement (or code)  Step 3: Implement next task with tests-first TDD & auto-healing
  dag review (or audit)    Step 4: Whole-repo impact check & final review sign-off
  dag web                  Launch optional DeepSeek Harness web dashboard

${ANSI.cyan}Flags:${ANSI.reset}
  --json                   Output machine-readable JSON for CI/CD and IDE extensions
  --auto-gate              Allow Pre-Flight Verifier to auto-approve gates if 100% passing

${ANSI.dim}Run \`dag help <command>\` for detailed command guidance (e.g. \`dag help config\`, \`dag help stack\`).${ANSI.reset}
          `);
        }
        break;
    }
  } catch (err) {
    logError(err.message);
  } finally {
    rl.close();
  }
}

main();
