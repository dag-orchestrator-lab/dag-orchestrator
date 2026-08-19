import path from 'node:path';

export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m'
};

export function banner(title) {
  const line = '═'.repeat(68);
  console.log(`\n${ANSI.cyan}${ANSI.bold}╔${line}╗`);
  console.log(`║ 🚀 ${title.padEnd(64)} ║`);
  console.log(`╚${line}╝${ANSI.reset}\n`);
}

export function logStep(stepName, runner, model) {
  const runnerTag = runner ? ` [${runner}]` : '';
  console.log(`\n${ANSI.brightBlue}▶ [${stepName}]${ANSI.reset}${ANSI.dim}${runnerTag} Running via ${ANSI.bold}${model}${ANSI.reset}...`);
  console.log(`${ANSI.dim}  ⏳ Working in background, please wait...${ANSI.reset}`);
}

export function logSuccess(msg) {
  console.log(`${ANSI.brightGreen}✅ ${msg}${ANSI.reset}`);
}

export function logWarning(msg) {
  console.log(`${ANSI.brightYellow}⚠️  ${msg}${ANSI.reset}`);
}

export function logError(msg) {
  console.log(`${ANSI.brightRed}❌ ${msg}${ANSI.reset}`);
}

export function logGate(gateNumber, description) {
  const line = '─'.repeat(68);
  console.log(`\n${ANSI.brightMagenta}${ANSI.bold}┌${line}┐`);
  console.log(`│ 🛑 GATE ${gateNumber}: ${description.padEnd(58)} │`);
  console.log(`└${line}┘${ANSI.reset}`);
  console.log(`${ANSI.brightYellow}👉 ACTION REQUIRED: Review the output above and provide your approval or feedback.${ANSI.reset}`);
}

export function renderStatusCard(state, config) {
  const line = '─'.repeat(68);
  console.log(`\n${ANSI.cyan}${ANSI.bold}┌${line}┐`);
  console.log(`│ 📊 DAG PIPELINE STATUS & CONFIGURATION${' '.repeat(29)} │`);
  console.log(`├${line}┤${ANSI.reset}`);

  // Configuration row
  console.log(`│ ${ANSI.bold}Harness:${ANSI.reset}  ${(config.DEFAULT_HARNESS || 'standalone').padEnd(16)} ${ANSI.bold}Preset:${ANSI.reset}  ${(config.DEFAULT_PROVIDER_PRESET || 'hybrid').padEnd(26)} │`);
  const relativeWs = path.relative(process.cwd(), state.workspaceDir || process.cwd()) || './';
  console.log(`│ ${ANSI.bold}Workspace:${ANSI.reset} ${relativeWs.padEnd(54)} │`);
  console.log(`├${line}┤`);

  // Complete Artifact Chain
  const artifactsList = [
    { code: '00', name: 'Requirements', file: '00-requirements.md', exists: state.hasRequirements, approved: state.hasRequirements },
    { code: '01', name: 'Repo Recon (1M+ ctx)', file: '01-recon.md', exists: state.hasRecon, approved: state.hasRecon },
    { code: '02', name: 'Contract Technical Spec', file: '02-contracts.md', exists: state.hasContracts, approved: state.gate1Approved },
    { code: '04', name: 'Skeptic Audit Findings', file: '04-findings.md', exists: state.hasFindings, approved: state.hasFindings },
    { code: '03', name: 'Domain / Infra / Data', file: '03-*.md (3 layers)', exists: state.hasDomain && state.hasAppInfra && state.hasData, approved: state.hasDomain },
    { code: '05', name: 'Merged Tasks Checklist', file: '05-tasks.md', exists: state.hasTasks, approved: state.gate2Approved },
    { code: '06', name: 'Task Implementation', file: `${state.implementedCount}/${state.totalTasks} Done`, exists: state.implementedCount > 0, approved: state.totalTasks > 0 && state.implementedCount === state.totalTasks },
    { code: '07', name: 'Final Impact Review', file: 'REVIEW.md', exists: state.hasReview, approved: state.hasReview }
  ];

  for (const item of artifactsList) {
    let badge = `${ANSI.gray}○ PENDING${ANSI.reset}`;
    let plainBadge = '○ PENDING';

    if (item.approved) {
      badge = `${ANSI.brightGreen}✓ READY${ANSI.reset}`;
      plainBadge = '✓ READY';
    } else if (item.exists) {
      badge = `${ANSI.brightYellow}⏳ REVIEW${ANSI.reset}`;
      plainBadge = '⏳ REVIEW';
    }

    const padding = 68 - 12 - item.name.length - item.file.length - plainBadge.length;
    console.log(`│ [${item.code}] ${ANSI.bold}${item.name}${ANSI.reset} → ${ANSI.dim}${item.file}${ANSI.reset}${' '.repeat(Math.max(1, padding))}${badge} │`);
  }

  console.log(`├${line}┤`);
  if (state.blockers && state.blockers.length > 0) {
    console.log(`│ ${ANSI.brightRed}${ANSI.bold}🚨 OPEN SKEPTIC BLOCKERS: ${state.blockers.length}${' '.repeat(41)} │${ANSI.reset}`);
  } else {
    console.log(`│ ${ANSI.brightGreen}🎉 No Active Skeptic Blockers${' '.repeat(39)} │${ANSI.reset}`);
  }
  console.log(`${ANSI.cyan}${ANSI.bold}└${line}┘${ANSI.reset}\n`);
}
