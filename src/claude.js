import { execSync, spawn } from 'node:child_process';

/**
 * Execute Claude Code CLI with a given prompt
 */
export async function runClaudePrompt(prompt, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    // Escaping prompt safely for shell execution
    // Added --dangerously-skip-permissions to allow Claude Code to edit/write files autonomously in pipeline mode
    const child = spawn('claude', ['--dangerously-skip-permissions', '-p', prompt], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`Claude Code failed (exit ${code}): ${stderr}`));
      }
      resolve(stdout.trim());
    });

    child.on('error', err => {
      reject(new Error(`Failed to invoke claude CLI: ${err.message}. Is claude installed globally and in PATH?`));
    });
  });
}

/**
 * Step 1: Draft Technical Interface Contract Spec
 */
export async function claudeDraftContract(requirementsText, reconText, contractTemplateText, cwd, feedback = '') {
  let prompt = `You are writing 02-contracts.md for a new feature.
Use the following inputs:
- 00-requirements.md:
${requirementsText}

- 01-recon.md:
${reconText}

- Template Reference:
${contractTemplateText}`;

  if (feedback) {
    prompt += `\n\n- USER FEEDBACK & REVISION INSTRUCTIONS:\n${feedback}`;
  }

  prompt += `\n\nRules:
1. Fill every section. Where a section does not apply, write "None" and one line of justification — never delete the section.
2. Where the recon report found no precedent, say so explicitly at the relevant point.
3. Write plain sentences a non-engineer stakeholder could follow for every _Plain:_ prompt, then the exact technical spec below it.
4. IMPORTANT: Do NOT use tools or ask for permissions to write files. Output the raw text of the complete 02-contracts.md markdown document directly in your response.`;

  return await runClaudePrompt(prompt, cwd);
}

/**
 * Step 2: Merge Layer Plans into Dependency-Ordered Task List
 */
export async function claudePlanMerger(contractText, layerPlans, findingsText, cwd) {
  const prompt = `You are plan-merger. You merge plans. You do not design.

Inputs:
02-contracts.md:
${contractText}

Domain Plan (03-domain.md):
${layerPlans.domain || 'None'}

App-Infra Plan (03-app-infra.md):
${layerPlans.appInfra || 'None'}

Data Plan (03-data.md):
${layerPlans.data || 'None'}

Skeptic Findings (04-findings.md):
${findingsText || 'None'}

Rules:
1. 02-contracts.md is immutable. Where a layer plan contradicts the contract, record it under ## Conflicts at the top of 05-tasks.md and continue.
2. Produce a task list ordered by dependency (Schema expand -> Stored procs -> Domain types -> Ports -> Adapters -> Handlers -> Wiring -> Schema contract).
3. Every task carries:
   ### T-<n> <imperative title>
   Depends on: T-<n>
   Lane: keep | change | shared
   Files: <paths>
   Done when: <assertion>
   Check: <command>
4. Fold BLOCKER and MAJOR findings from 04-findings.md into the task it affects as an inline constraint.
5. IMPORTANT: Do NOT use tools or ask for permissions to write files. Output the raw text of the complete 05-tasks.md markdown document directly in your response.`;

  return await runClaudePrompt(prompt, cwd);
}

/**
 * Step 3: Implement Next Atomic Task
 */
export async function claudeImplementTask(taskText, contractText, cwd) {
  const prompt = `You are implementing the atomic tasks defined in 05-tasks.md.

Reference Contract (02-contracts.md):
${contractText}

Task Specification:
${taskText}

Instructions:
1. You MUST use your file editing/writing tools to implement the required code changes directly in the workspace files specified in "Files:".
2. Follow TDD: Implement the unit/verification tests first and run the verification command ("Check:").
3. CRITICAL: Implement EXACTLY the active task block and nothing more. DO NOT implement methods or features belonging to future tasks. If you create a class but a method is not explicitly required in this task, leave it as a \`// TODO\` to prevent diff overlap with future tasks.
4. Do NOT just print the code in your response — you MUST write and save the changes to the disk.
5. Verify that all changes compile, pass typechecking, and satisfy the check commands.`;

  return await runClaudePrompt(prompt, cwd);
}

/**
 * Step 4: Final Code Review before commit
 */
export async function claudeCodeReview(diffText, reviewRulesText, cwd) {
  const prompt = `You are performing a final code review scoped strictly to correctness, reuse, and simplification.

Review Guidelines:
${reviewRulesText}

Git Diff:
${diffText}

Verify that the code is clean, idiomatic, follows codebase conventions, and is ready to commit.
IMPORTANT: Do NOT use tools or ask for permissions. Output the markdown review directly.`;

  return await runClaudePrompt(prompt, cwd);
}

/**
 * Step 5 / Ship: AI Synthesis of Concise PR Description conforming to Confluence template
 */
export async function claudeGeneratePrDescription(context, cwd = process.cwd()) {
  const { reqContent, contractContent, tasksContent, gitDiff, gitLogSummary, templateContent } = context;

  const prompt = `You are writing a clean, accurate, and human-readable Pull Request (PR) description conforming strictly to the repository's Confluence template.

Target Template Format:
${templateContent || `
# Description
Briefly describe what this PR does (2-3 concise bullet points).

# Changes
* Added:
  * ...
* Updated:
  * ...
* Removed:
  * ...

# Testing
[x] Unit tests
[x] Integration tests
[x] Manual testing

Tested by:
* ...

# Breaking Changes
[x] No
[ ] Yes

# Notes
Any non-obvious context or caveats for reviewers.
`}

Actual Code Changes (Committed Git Log & Diff):
${gitLogSummary ? `Commit History:\n${gitLogSummary}\n` : ''}
Git Diff (What was actually changed/added/deleted in code):
${gitDiff || 'No git diff detected'}

Feature Context & Tasks:
- Feature Goal:
${reqContent.slice(0, 1000)}

- Completed Tasks:
${tasksContent.slice(0, 1500)}

CRITICAL INSTRUCTIONS:
1. Base your description and bullet points on the ACTUAL CODE MODIFICATIONS in the Git Diff and Commit History.
2. Under "# Description", explain what the PR accomplishes in 2-4 clean bullet points.
3. Under "# Changes", categorize the actual files/functions into "* Added:", "* Updated:", and "* Removed:".
4. Under "# Testing", check all passing test boxes and list concrete verification checks performed (e.g. unit tests passing, manual UI checks).
5. Do NOT dump raw markdown files, raw contract specs, or internal recon notes.
6. Use plain, common, human-readable words. Avoid AI fluff.
7. Output ONLY the raw markdown of the PR description without conversational preambles.`;

  return await runClaudePrompt(prompt, cwd);
}
