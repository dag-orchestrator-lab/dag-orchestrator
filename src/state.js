import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, saveLocalConfig } from './config.js';

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
  gatesState: '.dag-gates.json',
  contextMeta: '.dag-context.json'
};

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 50);
}

export function getFeatureContextMeta(featureDir) {
  const metaPath = path.join(featureDir, ARTIFACT_FILES.contextMeta);
  if (fs.existsSync(metaPath)) {
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (e) {}
  }
  return null;
}

export function saveFeatureContextMeta(featureDir, metaData = {}) {
  const metaPath = path.join(featureDir, ARTIFACT_FILES.contextMeta);
  let existing = getFeatureContextMeta(featureDir) || {};
  const merged = {
    ...existing,
    ...metaData,
    lastUpdated: new Date().toISOString()
  };
  fs.writeFileSync(metaPath, JSON.stringify(merged, null, 2));
  return merged;
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
  const defaultBase = path.join(cwd, config.SPECS_DIR || '.dag/features');
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
    path.join(cwd, '.dag', 'features'),
    path.join(cwd, 'dag', 'features')
  ].filter(Boolean);

  const seen = new Set();

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory() && !seen.has(item)) {
          seen.add(item);
          const hasReq = fs.existsSync(path.join(full, '00-requirements.md'));
          const hasContract = fs.existsSync(path.join(full, '02-contracts.md'));
          const hasTasks = fs.existsSync(path.join(full, '05-tasks.md'));
          const hasReview = fs.existsSync(path.join(full, 'REVIEW.md'));
          const meta = getFeatureContextMeta(full) || {};
          
          let title = meta.title || item;
          if (!meta.title && hasReq) {
            try {
              const reqText = fs.readFileSync(path.join(full, '00-requirements.md'), 'utf8');
              const titleMatch = reqText.match(/^#\s*([^\n]+)/m) || reqText.match(/Feature:\s*([^\n]+)/i);
              if (titleMatch && titleMatch[1]) {
                title = titleMatch[1].replace(/^(Feature\s*Request|Feature\s*Goal|Requirements|Feature):\s*/i, '').trim();
              }
            } catch (e) {}
          }

          results.push({
            name: item,
            title,
            path: full,
            hasReq,
            hasContract,
            hasTasks,
            hasReview,
            meta,
            status: meta.status || (meta.shipped ? 'SHIPPED' : (hasTasks ? 'PAUSED' : 'DRAFT')),
            isCurrent: full === getFeatureWorkspaceDir(cwd)
          });
        }
      }
    }
  }

  return results;
}

export function listArchivedFeatures(cwd = process.cwd()) {
  const searchDirs = [
    path.join(cwd, '.dag', 'archive'),
    path.join(cwd, 'dag', 'archive')
  ];

  const results = [];
  const seen = new Set();

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory() && !seen.has(item)) {
          seen.add(item);
          const hasReq = fs.existsSync(path.join(full, '00-requirements.md'));
          const hasContract = fs.existsSync(path.join(full, '02-contracts.md'));
          const hasTasks = fs.existsSync(path.join(full, '05-tasks.md'));
          const hasReview = fs.existsSync(path.join(full, 'REVIEW.md'));
          const hasPr = fs.existsSync(path.join(full, 'PR_DESCRIPTION.md'));
          const meta = getFeatureContextMeta(full) || {};

          let title = meta.title || item;
          if (!meta.title && hasReq) {
            try {
              const reqText = fs.readFileSync(path.join(full, '00-requirements.md'), 'utf8');
              const titleMatch = reqText.match(/^#\s*([^\n]+)/m) || reqText.match(/Feature:\s*([^\n]+)/i);
              if (titleMatch && titleMatch[1]) {
                title = titleMatch[1].replace(/^(Feature\s*Request|Feature\s*Goal|Requirements|Feature):\s*/i, '').trim();
              }
            } catch (e) {}
          }

          let status = meta.status;
          if (!status) {
            status = (hasPr || meta.shipped) ? 'SHIPPED' : (hasTasks ? 'PAUSED' : 'DRAFT');
          }

          results.push({
            name: item,
            title,
            path: full,
            hasReq,
            hasContract,
            hasTasks,
            hasReview,
            hasPr,
            meta,
            status
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

  const state = {
    workspaceDir,
    hasRequirements: has(ARTIFACT_FILES.requirements),
    hasRecon: has(ARTIFACT_FILES.recon),
    hasContracts: has(ARTIFACT_FILES.contracts),
    hasFindings: has(ARTIFACT_FILES.findings),
    hasDomain: has(ARTIFACT_FILES.domain),
    hasAppInfra: has(ARTIFACT_FILES.appInfra),
    hasData: has(ARTIFACT_FILES.data),
    hasLayerFindings: has(ARTIFACT_FILES.layerFindings),
    hasTasks: has(ARTIFACT_FILES.tasks),
    hasReview: has(ARTIFACT_FILES.review),
    hasPrDescription: has(ARTIFACT_FILES.prDescription),
    gate1Approved: !!gates.gate1?.approved,
    gate2Approved: !!gates.gate2?.approved,
    gate3Approved: !!gates.gate3?.approved,
    gate4Approved: !!gates.gate4?.approved,
    totalTasks: 0,
    implementedCount: 0
  };

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

export function archiveFeatureWorkspace(destinationType = 'archive', featureName = '', customMeta = {}, cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const currentDir = getFeatureWorkspaceDir(cwd);

  if (!fs.existsSync(currentDir)) {
    return { success: false, message: 'No active feature workspace found to archive.' };
  }

  // Check if currentDir has any artifacts at all
  const status = getPipelineStatus(cwd);
  if (!status.hasRequirements && !status.hasContracts && !status.hasTasks) {
    return { success: false, message: 'Current workspace is empty. Nothing to archive.' };
  }

  let title = featureName;
  if (!title && status.hasRequirements) {
    try {
      const reqText = fs.readFileSync(path.join(currentDir, '00-requirements.md'), 'utf8');
      const titleMatch = reqText.match(/^#\s*([^\n]+)/m) || reqText.match(/Feature:\s*([^\n]+)/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(/^(Feature\s*Request|Feature\s*Goal|Requirements|Feature):\s*/i, '').trim();
      }
    } catch (e) {}
  }

  const cleanName = slugify(featureName || title) || `feature-${Date.now()}`;

  // Save metadata into currentDir before moving
  saveFeatureContextMeta(currentDir, {
    name: cleanName,
    title: title || cleanName,
    branch: customMeta.branch || config.ACTIVE_BRANCH || null,
    baseBranch: customMeta.baseBranch || config.STACKED_BASE_BRANCH || null,
    lastCommit: customMeta.lastCommit || null,
    status: customMeta.status || (status.hasPrDescription ? 'SHIPPED' : (status.hasTasks ? 'PAUSED' : 'DRAFT')),
    tasksProgress: {
      total: status.totalTasks,
      done: status.implementedCount
    }
  });

  const baseSpecsDir = path.join(cwd, config.SPECS_DIR || '.dag/features');
  let targetDir = '';

  if (destinationType === 'archive') {
    const archiveBase = config.SPECS_DIR?.startsWith('.dag') 
      ? path.join(cwd, '.dag', 'archive')
      : path.join(cwd, 'dag', 'archive');
    targetDir = path.join(archiveBase, cleanName);
  } else {
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
  saveLocalConfig({ ACTIVE_FEATURE: null, ACTIVE_BRANCH: null, STACKED_BASE_BRANCH: null }, cwd);

  return {
    success: true,
    previousDir: currentDir,
    targetDir,
    featureName: cleanName
  };
}

export function unarchiveFeatureWorkspace(featureName, cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const cleanName = slugify(featureName);

  const archivePaths = [
    path.join(cwd, '.dag', 'archive', cleanName),
    path.join(cwd, 'dag', 'archive', cleanName)
  ];

  const sourceDir = archivePaths.find(p => fs.existsSync(p) && fs.statSync(p).isDirectory());

  if (!sourceDir) {
    return { success: false, message: `Could not find archived feature '${cleanName}' in .dag/archive/ or dag/archive/.` };
  }

  const baseSpecsDir = path.join(cwd, config.SPECS_DIR || '.dag/features');
  const targetDir = path.join(baseSpecsDir, cleanName);

  if (fs.existsSync(targetDir)) {
    return { success: false, message: `A feature named '${cleanName}' already exists in ${path.relative(cwd, baseSpecsDir)}.` };
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.renameSync(sourceDir, targetDir);

  const meta = getFeatureContextMeta(targetDir) || {};
  meta.status = meta.status === 'SHIPPED' ? 'SHIPPED' : 'PAUSED';
  saveFeatureContextMeta(targetDir, meta);

  return {
    success: true,
    previousDir: sourceDir,
    targetDir,
    featureName: cleanName,
    meta
  };
}

export function activateFeatureWorkspace(featureName, cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const cleanName = slugify(featureName);

  // STRICT HOT-TIER SCOPE: Only activate features inside features/ folder
  const candidatePaths = [
    path.join(cwd, config.SPECS_DIR || '.dag/features', cleanName),
    path.join(cwd, '.dag', 'features', cleanName),
    path.join(cwd, 'dag', 'features', cleanName),
    path.join(cwd, 'docs', 'features', cleanName)
  ];

  let sourceDir = candidatePaths.find(p => fs.existsSync(p) && fs.statSync(p).isDirectory());

  if (!sourceDir) {
    // Check if it's in archive to provide a helpful instruction
    const inArchive = [
      path.join(cwd, '.dag', 'archive', cleanName),
      path.join(cwd, 'dag', 'archive', cleanName)
    ].some(p => fs.existsSync(p));

    if (inArchive) {
      return {
        success: false,
        message: `'${cleanName}' is currently in the archive (Cold Tier). Run \`dag unarchive ${cleanName}\` first to move it to features, then activate it.`
      };
    }

    return { success: false, message: `Could not find feature '${cleanName}' in features folder.` };
  }

  const currentDir = getFeatureWorkspaceDir(cwd);

  // Auto-park current workspace to features/<old-name> or archive before activating new one
  if (currentDir !== sourceDir && fs.existsSync(currentDir)) {
    const currentStatus = getPipelineStatus(cwd);
    if (currentStatus.hasRequirements || currentStatus.hasContracts) {
      // Park current feature in hot tier features folder
      archiveFeatureWorkspace('named_feature', '', {}, cwd);
    }
  }

  // Restore sourceDir to current-feature
  const targetDir = path.join(cwd, config.SPECS_DIR || '.dag/features', 'current-feature');
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  if (fs.existsSync(targetDir)) {
    // If targetDir already exists (e.g. empty), remove it to cleanly replace
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // Move sourceDir to targetDir
  fs.renameSync(sourceDir, targetDir);

  // Read restored metadata
  const meta = getFeatureContextMeta(targetDir) || {};
  meta.status = 'ACTIVE';
  saveFeatureContextMeta(targetDir, meta);

  // Update local config
  saveLocalConfig({
    ACTIVE_FEATURE: 'current-feature',
    ACTIVE_BRANCH: meta.branch || null,
    STACKED_BASE_BRANCH: meta.baseBranch || null
  }, cwd);

  return {
    success: true,
    targetDir,
    meta,
    featureName: cleanName
  };
}
