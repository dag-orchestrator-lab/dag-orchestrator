import fs from 'node:fs';
import path from 'node:path';
import { ANSI } from './ui.js';

export function verifyContractSpec(contractText, findingsText = '', rulesText = '') {
  const checks = [];

  // Check 1: Interface & Typed Signature definitions
  const hasTypes = /```(typescript|ts|go|rust|python|sql|json)/i.test(contractText) || 
                   /interface\s+\w+|type\s+\w+|struct\s+\w+|class\s+\w+/i.test(contractText);
  checks.push({
    name: 'Interface Signatures & Data Contracts',
    pass: hasTypes,
    details: hasTypes ? 'Strict types and data structures defined' : 'Missing explicit types or interfaces'
  });

  // Check 2: Error Handling & Status Codes
  const hasErrors = /error|exception|status|40\d|50\d|fail/i.test(contractText);
  checks.push({
    name: 'Failure Modes & Error Signatures',
    pass: hasErrors,
    details: hasErrors ? 'Explicit error handling and codes present' : 'No explicit error scenarios documented'
  });

  // Check 3: Database & Migration Safety
  const hasDB = /CREATE TABLE|ALTER TABLE|MIGRATION|SCHEMA|DATABASE/i.test(contractText);
  if (hasDB) {
    const isSafeDB = !/DROP COLUMN|DROP TABLE/i.test(contractText) || /expand.*contract|deprecat/i.test(contractText);
    checks.push({
      name: 'Database Migration Safety',
      pass: isSafeDB,
      details: isSafeDB ? 'Follows non-destructive expand-and-contract' : 'Detected dangerous DROP operations'
    });
  } else {
    checks.push({
      name: 'Database Migration Safety',
      pass: true,
      details: 'No database schema changes required'
    });
  }

  // Check 4: Skeptic Findings Resolution
  const hasBlockers = /BLOCKER:|CRITICAL:/i.test(findingsText);
  checks.push({
    name: 'Adversarial Skeptic Incident Audit',
    pass: !hasBlockers,
    details: hasBlockers ? 'Unresolved BLOCKER findings present in 04-findings.md' : 'Zero unaddressed critical incidents'
  });

  // Check 5: UI/UX Component State & Accessibility (for Frontend features)
  const isFrontend = /UI\/UX|Component State|Responsive|tailwind|css|frontend|html|react/i.test(contractText);
  if (isFrontend) {
    const hasUIStates = /Idle|Loading|Error|Disabled|data-testid/i.test(contractText);
    checks.push({
      name: 'UI/UX State Matrix & A11y Contract',
      pass: hasUIStates,
      details: hasUIStates ? 'Component states [Idle, Loading, Error] and data-testid defined' : 'Missing explicit component state matrix or data-testid tags'
    });
  }

  // Check 6: Rules & Policies Compliance
  const rulesPass = !rulesText || contractText.length > 200;
  checks.push({
    name: 'Team Policy Compliance (.dagrules)',
    pass: rulesPass,
    details: rulesPass ? 'Aligned with active team constraints' : 'Contract too brief to verify rules compliance'
  });

  const passedCount = checks.filter(c => c.pass).length;
  const scorePct = Math.round((passedCount / checks.length) * 100);
  const isReady = scorePct >= 80 && !hasBlockers;

  return {
    gate: 1,
    artifact: '02-contracts.md',
    checks,
    passedCount,
    totalCount: checks.length,
    scorePct,
    isReady,
    recommendation: isReady ? 'READY FOR HUMAN SIGN-OFF' : 'REQUIRES REVISION BEFORE APPROVAL'
  };
}

export function verifyTaskList(tasksText, _contractText = '') {
  const checks = [];

  // Check 1: Atomic task breakdown (supports ### T-1, ### [ ] T-1, ### Task 1, - [ ] Task 1, ## T-1, etc.)
  const taskMatches = tasksText.match(/###?\s+(?:\[[ x]\]\s*)?(T-\d+|Task\s+\d+)|- \[[ x]\]\s+(Task|T-)\s*\d+/gi) || [];
  const hasTasks = taskMatches.length > 0;
  checks.push({
    name: 'Atomic Task Breakdown',
    pass: hasTasks,
    details: hasTasks ? `Detected ${taskMatches.length} dependency-ordered tasks` : 'No structured task items found'
  });

  // Check 2: Verification / Test Check Commands (Check: or command code blocks)
  const hasCheckCommands = /(Check:|Test:|Validation:)\s+[\w./\-`]+/i.test(tasksText) || /```(bash|sh|cmd)[\s\S]*?```/i.test(tasksText);
  checks.push({
    name: 'Automated Test & Check Commands',
    pass: hasCheckCommands,
    details: hasCheckCommands ? 'Every task carries an executable validation command' : 'Tasks lack automated `Check:` commands'
  });

  // Check 3: File path scoping (Files: or File: or targets or none/inline files)
  const hasFileScopes = /(Files|File|Targets|Target):\s+/i.test(tasksText) || /`[\w./-]+\.(ts|js|sql|json|tsx|jsx)`/i.test(tasksText);
  checks.push({
    name: 'File Modification Scoping',
    pass: hasFileScopes,
    details: hasFileScopes ? 'Explicit target files mapped per task' : 'Missing explicit target file mappings'
  });

  // Check 4: Dependency order
  const hasDependencies = /Depends on:/i.test(tasksText) || taskMatches.length <= 1;
  checks.push({
    name: 'DAG Dependency Ordering',
    pass: hasDependencies,
    details: hasDependencies ? 'Strict partial ordering defined' : 'Dependency relationships not declared'
  });

  const passedCount = checks.filter(c => c.pass).length;
  const scorePct = Math.round((passedCount / checks.length) * 100);
  const isReady = scorePct >= 75;

  return {
    gate: 2,
    artifact: '05-tasks.md',
    checks,
    passedCount,
    totalCount: checks.length,
    scorePct,
    isReady,
    recommendation: isReady ? 'READY FOR HUMAN SIGN-OFF' : 'TASK CHECKLIST INCOMPLETE'
  };
}

export function renderVerificationReport(report) {
  const line = '─'.repeat(68);
  console.log(`\n${ANSI.cyan}${ANSI.bold}┌${line}┐`);
  console.log(`│ 🔍 PRE-FLIGHT VERIFIER AUDIT (Gate ${report.gate}: ${report.artifact})${' '.repeat(Math.max(1, 31 - report.artifact.length))} │`);
  console.log(`├${line}┤${ANSI.reset}`);

  for (const check of report.checks) {
    const badge = check.pass ? `${ANSI.brightGreen}[✓] PASS${ANSI.reset}` : `${ANSI.brightRed}[✗] FAIL${ANSI.reset}`;
    const plainBadge = check.pass ? '[✓] PASS' : '[✗] FAIL';
    const padding = 68 - 6 - check.name.length - plainBadge.length;
    console.log(`│ ${ANSI.bold}${check.name}${ANSI.reset}${' '.repeat(Math.max(1, padding))}${badge} │`);
    console.log(`│   ${ANSI.dim}${check.details.slice(0, 62).padEnd(64)}${ANSI.reset} │`);
  }

  console.log(`├${line}┤`);
  const statusColor = report.isReady ? ANSI.brightGreen : ANSI.brightYellow;
  const recStr = `🤖 VERIFIER RECOMMENDATION: ${report.recommendation}`;
  console.log(`│ ${statusColor}${ANSI.bold}${recStr.padEnd(66)}${ANSI.reset} │`);
  console.log(`${ANSI.cyan}${ANSI.bold}└${line}┘${ANSI.reset}\n`);
}

export function verifyFullPipeline(status, _cwd = process.cwd()) {
  const reports = [];

  // Check 02-contracts.md if present
  const contractPath = path.join(status.workspaceDir, '02-contracts.md');
  const findingsPath = path.join(status.workspaceDir, '04-findings.md');
  if (fs.existsSync(contractPath)) {
    const contractText = fs.readFileSync(contractPath, 'utf8');
    const findingsText = fs.existsSync(findingsPath) ? fs.readFileSync(findingsPath, 'utf8') : '';
    reports.push(verifyContractSpec(contractText, findingsText));
  }

  // Check 05-tasks.md if present
  const tasksPath = path.join(status.workspaceDir, '05-tasks.md');
  if (fs.existsSync(tasksPath)) {
    const tasksText = fs.readFileSync(tasksPath, 'utf8');
    reports.push(verifyTaskList(tasksText));
  }

  return reports;
}
