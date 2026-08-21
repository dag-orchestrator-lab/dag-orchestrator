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
  prDescription: 'PR_DESCRIPTION.md',
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

  // 2. Check dag/features/, .dag/features/, or docs/features/
  const candidateDirs = [
    config.SPECS_DIR ? path.join(cwd, config.SPECS_DIR) : null,
    path.join(cwd, 'dag', 'features'),
    path.join(cwd, '.dag', 'features'),
    path.join(cwd, 'docs', 'features')
  ].filter(Boolean);

  for (const targetBase of candidateDirs) {
    if (fs.existsSync(targetBase)) {
      const subdirs = fs.readdirSync(targetBase)
        .filter(f => fs.statSync(path.join(targetBase, f)).isDirectory())
        .sort()
        .reverse();
      if (subdirs.length > 0) {
        return path.join(targetBase, subdirs[0]);
      }
    }
  }

  // 3. Auto-create in default specs dir (dag/features/current-feature)
  const defaultBase = path.join(cwd, config.SPECS_DIR || 'dag/features');
  const defaultDir = path.join(defaultBase, 'current-feature');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return defaultDir;
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
  const gate3Approved = !!gates.gate3?.approved;

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
    gate3Approved,
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
    const totalMatches = tasksText.match(/###?\s+(T-\d+|Task\s+\d+)|\- \[[ x]\]\s+(Task|T-)\s*\d+/gi) || [];
    const doneMatches = tasksText.match(/\[x\]\s+(T-\d+|Task\s+\d+)|###?\s+T-\d+.*(\(DONE\)|\[DONE\]|—\s*DONE)|status:\s*(done|completed)/gi) || [];
    state.totalTasks = totalMatches.length;
    state.implementedCount = Math.min(doneMatches.length, totalMatches.length);
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

export function archiveFeatureWorkspace(destinationType = 'archive', featureName = '', cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const currentDir = getFeatureWorkspaceDir(cwd);

  if (!fs.existsSync(currentDir)) {
    return { success: false, message: 'No active feature workspace found to archive.' };
  }

  const baseSpecsDir = path.join(cwd, config.SPECS_DIR || '.dag/features');
  let targetDir = '';

  const cleanName = slugify(featureName) || `feature-${Date.now()}`;

  if (destinationType === 'archive') {
    // Move to .dag/archive/<feature-name> or dag/archive/<feature-name>
    const archiveBase = config.SPECS_DIR?.startsWith('.dag') 
      ? path.join(cwd, '.dag', 'archive')
      : path.join(cwd, 'dag', 'archive');
    targetDir = path.join(archiveBase, cleanName);
  } else {
    // Rename/move inside the features folder: [SPECS_DIR]/<clean-feature-name>
    targetDir = path.join(baseSpecsDir, cleanName);
  }

  if (currentDir === targetDir) {
    return { success: true, targetDir, message: 'Feature workspace is already in the target directory.' };
  }

  // Ensure target parent directory exists
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  // Move the entire folder
  fs.renameSync(currentDir, targetDir);

  // Clear ACTIVE_FEATURE in config if it was set
  if (config.ACTIVE_FEATURE) {
    saveLocalConfig({ ACTIVE_FEATURE: null, ACTIVE_BRANCH: null, STACKED_BASE_BRANCH: null }, cwd);
  }

  return {
    success: true,
    previousDir: currentDir,
    targetDir,
    featureName: cleanName
  };
}
