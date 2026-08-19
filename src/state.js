import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';

export const ARTIFACT_FILES = {
  requirements: '00-requirements.md',
  recon: '01-recon.md',
  contracts: '02-contracts.md',
  findings: '04-findings.md',
  domain: '03-domain.md',
  appInfra: '03-app-infra.md',
  data: '03-data.md',
  layerFindings: '04-layer-findings.md',
  tasks: '05-tasks.md',
  review: 'REVIEW.md',
  gatesState: '.dag-gates.json'
};

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 50);
}

export function getFeatureWorkspaceDir(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  
  // 1. If explicit feature is active
  if (config.ACTIVE_FEATURE && config.SPECS_DIR) {
    const dir = path.join(cwd, config.SPECS_DIR, config.ACTIVE_FEATURE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // 2. Check if local root already has 00-requirements or 02-contracts
  if (fs.existsSync(path.join(cwd, '00-requirements.md')) || fs.existsSync(path.join(cwd, '02-contracts.md'))) {
    return cwd;
  }

  // 3. Check docs/features/ or .dag/features/
  const candidateBases = [
    config.SPECS_DIR ? path.join(cwd, config.SPECS_DIR) : null,
    path.join(cwd, 'docs', 'features'),
    path.join(cwd, '.dag', 'features')
  ].filter(Boolean);

  for (const base of candidateBases) {
    if (fs.existsSync(base)) {
      const subdirs = fs.readdirSync(base)
        .filter(f => fs.statSync(path.join(base, f)).isDirectory())
        .sort()
        .reverse();
      if (subdirs.length > 0) {
        return path.join(base, subdirs[0]);
      }
    }
  }

  return cwd;
}

export function resolveArtifactPath(filename, cwd = process.cwd()) {
  const workspaceDir = getFeatureWorkspaceDir(cwd);
  const featurePath = path.join(workspaceDir, filename);
  if (fs.existsSync(featurePath)) return featurePath;
  
  const rootPath = path.join(cwd, filename);
  if (fs.existsSync(rootPath)) return rootPath;

  return featurePath;
}

export function listAllFeatures(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const results = [];
  const searchDirs = [
    config.SPECS_DIR ? path.join(cwd, config.SPECS_DIR) : null,
    path.join(cwd, 'docs', 'features'),
    path.join(cwd, '.dag', 'features')
  ].filter(Boolean);

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          const hasReq = fs.existsSync(path.join(full, '00-requirements.md'));
          const hasContract = fs.existsSync(path.join(full, '02-contracts.md'));
          const hasTasks = fs.existsSync(path.join(full, '05-tasks.md'));
          const hasReview = fs.existsSync(path.join(full, 'REVIEW.md'));
          results.push({
            name: item,
            path: full,
            hasReq,
            hasContract,
            hasTasks,
            hasReview,
            isCurrent: full === getFeatureWorkspaceDir(cwd)
          });
        }
      }
    }
  }

  return results;
}

export function recordGateApproval(gateNumber, approved = true, cwd = process.cwd()) {
  const workspaceDir = getFeatureWorkspaceDir(cwd);
  const gatesFile = path.join(workspaceDir, ARTIFACT_FILES.gatesState);
  let state = {};
  if (fs.existsSync(gatesFile)) {
    try {
      state = JSON.parse(fs.readFileSync(gatesFile, 'utf8'));
    } catch (e) {}
  }
  state[`gate${gateNumber}`] = {
    approved,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(gatesFile, JSON.stringify(state, null, 2));
}

export function getPipelineStatus(cwd = process.cwd()) {
  const workspaceDir = getFeatureWorkspaceDir(cwd);
  const has = file => fs.existsSync(path.join(workspaceDir, file)) || fs.existsSync(path.join(cwd, file));
  const read = file => {
    const target = fs.existsSync(path.join(workspaceDir, file)) ? path.join(workspaceDir, file) : path.join(cwd, file);
    return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  };

  let gates = {};
  const gatesPath = fs.existsSync(path.join(workspaceDir, ARTIFACT_FILES.gatesState))
    ? path.join(workspaceDir, ARTIFACT_FILES.gatesState)
    : path.join(cwd, ARTIFACT_FILES.gatesState);

  if (fs.existsSync(gatesPath)) {
    try {
      gates = JSON.parse(fs.readFileSync(gatesPath, 'utf8'));
    } catch (e) {}
  }

  const gate1Approved = !!gates.gate1?.approved;
  const gate2Approved = !!gates.gate2?.approved;

  const state = {
    workspaceDir,
    hasRequirements: has(ARTIFACT_FILES.requirements),
    hasRecon: has(ARTIFACT_FILES.recon),
    hasContracts: has(ARTIFACT_FILES.contracts),
    hasFindings: has(ARTIFACT_FILES.findings),
    hasDomain: has(ARTIFACT_FILES.domain),
    hasAppInfra: has(ARTIFACT_FILES.appInfra),
    hasData: has(ARTIFACT_FILES.data),
    hasTasks: has(ARTIFACT_FILES.tasks),
    hasReview: has(ARTIFACT_FILES.review),
    gate1Approved,
    gate2Approved,
    blockers: [],
    majors: [],
    implementedCount: 0,
    totalTasks: 0
  };

  // Inspect findings for blockers
  if (state.hasFindings) {
    const findingsText = read(ARTIFACT_FILES.findings);
    const blockerMatches = findingsText.match(/BLOCKER[^\n]*/gi) || [];
    state.blockers = blockerMatches;
    const majorMatches = findingsText.match(/MAJOR[^\n]*/gi) || [];
    state.majors = majorMatches;
  }

  // Inspect tasks progress
  if (state.hasTasks) {
    const tasksText = read(ARTIFACT_FILES.tasks);
    const totalMatches = tasksText.match(/###\s+T-\d+/g) || [];
    const doneMatches = tasksText.match(/\[x\]\s+T-\d+|###\s+T-\d+.*\(DONE\)/gi) || [];
    state.totalTasks = totalMatches.length;
    state.implementedCount = doneMatches.length;
  }

  return state;
}

export function createRollbackSnapshot(stepNumber, cwd = process.cwd()) {
  const backupDir = path.join(cwd, '.dag-backup', `step-${stepNumber}-${Date.now()}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const artifactsToBackup = [];
  if (stepNumber <= 0) artifactsToBackup.push(ARTIFACT_FILES.requirements);
  if (stepNumber <= 1) artifactsToBackup.push(ARTIFACT_FILES.recon, ARTIFACT_FILES.contracts, ARTIFACT_FILES.findings);
  if (stepNumber <= 2) artifactsToBackup.push(ARTIFACT_FILES.domain, ARTIFACT_FILES.appInfra, ARTIFACT_FILES.data, ARTIFACT_FILES.layerFindings, ARTIFACT_FILES.tasks);

  const backedUp = [];
  for (const file of artifactsToBackup) {
    const src = path.join(cwd, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, file));
      fs.unlinkSync(src);
      backedUp.push(file);
    }
  }

  return { backupDir, backedUp };
}

export function cleanArtifacts(cwd = process.cwd()) {
  const backupDir = path.join(cwd, '.dag-backup', `clean-${Date.now()}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const removed = [];
  for (const file of Object.values(ARTIFACT_FILES)) {
    const src = path.join(cwd, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, file));
      fs.unlinkSync(src);
      removed.push(file);
    }
  }

  return { backupDir, removed };
}
