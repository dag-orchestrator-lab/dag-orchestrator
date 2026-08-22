import fs from 'node:fs';
import path from 'node:path';
import { Result } from './domain/common/result.js';
import { WorkspaceResultError } from './domain/common/errors.js';
import { FeatureWorkspaceService } from './application/feature-workspace-service.js';
import { FileSystemFeatureWorkspaceRepository } from './infrastructure/file-system-repository.js';
import { resolveConfiguration } from './infrastructure/config.js';

const SLUG_MAX_LENGTH = 50;

const repository = new FileSystemFeatureWorkspaceRepository(resolveConfiguration());
const service = new FeatureWorkspaceService(repository);

function formatWorkspaceResultError(error: WorkspaceResultError): string {
  switch (error.kind) {
    case 'PersistenceReadError':
      return `Failed to read state at ${error.path}: ${String(error.cause)}`;
    case 'PersistenceWriteError':
      return `Failed to write state at ${error.path}: ${String(error.cause)}`;
    case 'ValidationError':
      return `Invalid ${error.field}: ${error.message}`;
    case 'NotFoundError':
      return `Not found: ${error.identifier}`;
  }
}

function unwrapOrThrow<T>(result: Result<T, WorkspaceResultError>, notFoundFallback?: T): T {
  if (result.isOk) return result.value;
  if (result.error.kind === 'NotFoundError' && notFoundFallback !== undefined) {
    return notFoundFallback;
  }
  throw new Error(formatWorkspaceResultError(result.error));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, SLUG_MAX_LENGTH);
}

// ---------------------------------------------------------
// LEGACY SIGNATURE RESOLUTION
// ---------------------------------------------------------

function resolveSlug(cwdOrSlug?: string): string {
  if (cwdOrSlug && !cwdOrSlug.includes('/') && !cwdOrSlug.includes('\\')) {
    return cwdOrSlug;
  }
  const cwd = cwdOrSlug || process.cwd();
  
  const configPath = path.join(cwd, '.dag', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.ACTIVE_FEATURE) {
        return config.ACTIVE_FEATURE;
      }
    } catch {}
  }

  const featuresDir = path.join(cwd, '.dag', 'features');
  if (fs.existsSync(featuresDir)) {
    const active = fs.readdirSync(featuresDir).find(f => {
      const p = path.join(featuresDir, f);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, '00-requirements.md'));
    });
    if (active) return active;
  }

  throw new Error('No active feature found in configuration or workspace.');
}

export function getFeatureContextMeta(cwdOrSlug?: string): unknown {
  return unwrapOrThrow(service.getFeatureContextMeta(resolveSlug(cwdOrSlug)), null);
}

export function saveFeatureContextMeta(cwdOrSlug: string | undefined, meta: unknown): void {
  if (meta === undefined && typeof cwdOrSlug === 'object') {
    unwrapOrThrow(service.saveFeatureContextMeta(resolveSlug(), cwdOrSlug));
  } else {
    unwrapOrThrow(service.saveFeatureContextMeta(resolveSlug(cwdOrSlug), meta));
  }
}

export function getFeatureWorkspaceDir(cwdOrSlug?: string): string {
  return unwrapOrThrow(service.getFeatureWorkspaceDir(resolveSlug(cwdOrSlug)));
}

export function resolveArtifactPath(cwdOrSlug: string | undefined, artifactName: string): string {
  if (artifactName === undefined && typeof cwdOrSlug === 'string') {
    return unwrapOrThrow(service.resolveArtifactPath(resolveSlug(), cwdOrSlug));
  }
  return unwrapOrThrow(service.resolveArtifactPath(resolveSlug(cwdOrSlug), artifactName));
}


export function listAllFeatures(cwdOrSlug?: string): unknown[] {
  const cwd = process.env.DAG_WORKSPACE_ROOT || process.cwd();
  const configPath = path.join(cwd, '.dag', 'config.json');
  let config: any = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  }
  const specsDir = config.SPECS_DIR || '.dag/features';
  const featuresDir = path.join(cwd, specsDir);
  const results: any[] = [];
  if (fs.existsSync(featuresDir)) {
    for (const item of fs.readdirSync(featuresDir)) {
      const full = path.join(featuresDir, item);
      if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, '00-requirements.md'))) {
        results.push({
          slug: item, name: item,
          dir: full,
          isCurrent: resolveSlug(cwdOrSlug) === item,
          hasContract: fs.existsSync(path.join(full, '02-contracts.md')),
          hasReview: fs.existsSync(path.join(full, 'REVIEW.md'))
        });
      }
    }
  }
  return results;
}

export function listArchivedFeatures(_cwdOrSlug?: string): unknown[] {
  const cwd = process.env.DAG_WORKSPACE_ROOT || process.cwd();
  const archivesDir = path.join(cwd, '.dag', 'archive');
  const results: any[] = [];
  if (fs.existsSync(archivesDir)) {
    for (const item of fs.readdirSync(archivesDir)) {
      const full = path.join(archivesDir, item);
      if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, '00-requirements.md'))) {
        results.push({
          slug: item, name: item,
          dir: full,
          isCurrent: false,
          hasContract: fs.existsSync(path.join(full, '02-contracts.md')),
          hasReview: fs.existsSync(path.join(full, 'REVIEW.md'))
        });
      }
    }
  }
  return results;
}

export function recordGateApproval(cwdOrSlug: any, gate?: any, approval?: any): void {
  // Legacy signature: recordGateApproval(gateNumber, approved = true, cwd = process.cwd())
  const gateName = `gate${cwdOrSlug}`;
  const isApproved = gate !== undefined ? gate : true;
  const cwd = typeof approval === 'string' ? approval : undefined;
  
  const slug = resolveSlug(cwd);
  const domainApproval = {
    approver: 'dag-cli',
    approvedAt: new Date().toISOString(),
    metadata: { approved: isApproved }
  };
  
  // Try to use the new domain service (might create meta.json)
  try {
    service.recordGateApproval(slug, gateName, domainApproval);
  } catch {}

  // ALWAYS write to legacy .dag-gates.json so getPipelineStatus can read it!
  const actualCwd = cwd || process.cwd();
  const configPath = path.join(actualCwd, '.dag', 'config.json');
  let config: any = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  }
  const specsDir = config.SPECS_DIR || '.dag/features';
  const workspaceDir = path.join(actualCwd, specsDir, slug);
  const gatesFile = path.join(workspaceDir, '.dag-gates.json');
  
  let state: any = {};
  if (fs.existsSync(gatesFile)) {
    try { state = JSON.parse(fs.readFileSync(gatesFile, 'utf8')); } catch {}
  }
  state[gateName] = {
    approved: isApproved,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(gatesFile, JSON.stringify(state, null, 2));
}

export function getPipelineStatus(cwdOrSlug?: string): unknown {
  const slug = resolveSlug(cwdOrSlug);
  const cwd = process.env.DAG_WORKSPACE_ROOT || process.cwd();
  const configPath = path.join(cwd, '.dag', 'config.json');
  let config: Record<string, string> = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  }
  const specsDir = config.SPECS_DIR || '.dag/features';
  const workspaceDir = path.join(cwd, specsDir, slug);

  const has = (file: string) => fs.existsSync(path.join(workspaceDir, file)) || fs.existsSync(path.join(cwd, file));
  
  let gates: any = {};
  const gatesPath = fs.existsSync(path.join(workspaceDir, '.dag-gates.json'))
    ? path.join(workspaceDir, '.dag-gates.json')
    : path.join(cwd, '.dag-gates.json');

  if (fs.existsSync(gatesPath)) {
    try { gates = JSON.parse(fs.readFileSync(gatesPath, 'utf8')); } catch {}
  }

  let implementedCount = 0;
  let totalTasks = 0;
  if (has('05-tasks.md')) {
    try {
      const p = fs.existsSync(path.join(workspaceDir, '05-tasks.md')) ? path.join(workspaceDir, '05-tasks.md') : path.join(cwd, '05-tasks.md');
      const text = fs.readFileSync(p, 'utf8');
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.match(/^###\s+\[\s\]\s+T-\d+/)) totalTasks++;
        if (line.match(/^###\s+\[x\]\s+T-\d+/)) {
          totalTasks++;
          implementedCount++;
        }
      }
    } catch {}
  }

  return {
    workspaceDir,
    hasRequirements: has('00-requirements.md'),
    hasRecon: has('01-recon.md'),
    hasContracts: has('02-contracts.md'),
    hasFindings: has('04-findings.md'),
    hasDomainPlan: has('03-domain.md'),
    hasDataPlan: has('03-data.md'),
    hasInfraPlan: has('03-app-infra.md'),
    hasTasks: has('05-tasks.md'),
    gate1Approved: !!(gates.gate1 && gates.gate1.approved),
    gate2Approved: !!(gates.gate2 && gates.gate2.approved),
    gate3Approved: !!(gates.gate3 && gates.gate3.approved),
    gate4Approved: !!(gates.gate4 && gates.gate4.approved),
    implementedCount,
    totalTasks
  };
}

export function createRollbackSnapshot(cwdOrSlug?: string): unknown {
  return unwrapOrThrow(service.createRollbackSnapshot(resolveSlug(cwdOrSlug)));
}

export function cleanArtifacts(cwdOrSlug?: string): void {
  unwrapOrThrow(service.cleanArtifacts(resolveSlug(cwdOrSlug)));
}

export function archiveFeatureWorkspace(destinationType: string = 'archive', featureName: string = '', customMeta: any = {}, cwd: string = process.cwd()): unknown {
  const currentSlug = resolveSlug(undefined);
  let defaultName = 'current-feature';
  const reqPath = path.join(cwd, '.dag/features', currentSlug, '00-requirements.md');
  if (fs.existsSync(reqPath)) {
    try {
      const reqTxt = fs.readFileSync(reqPath, 'utf8');
      const tMatch = reqTxt.match(/^#\s*([^\n]+)/m) || reqTxt.match(/Feature:\s*([^\n]+)/i);
      if (tMatch && tMatch[1]) {
        defaultName = tMatch[1].replace(/^(Feature\s*Request|Feature\s*Goal|Requirements|Feature):\s*/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
    } catch {}
  }
  const targetName = featureName || defaultName;
  try { unwrapOrThrow(service.archiveFeatureWorkspace(currentSlug)); } catch {}
  
  const specsDir = '.dag/features';
  const currentDir = path.join(cwd, specsDir, currentSlug);
  let targetDir;
  
  if (destinationType === 'archive') {
    targetDir = path.join(cwd, '.dag', 'archive', targetName);
  } else {
    targetDir = path.join(cwd, specsDir, targetName);
  }
  
  if (fs.existsSync(currentDir) && currentDir !== targetDir) {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.renameSync(currentDir, targetDir);
    const metaPath = path.join(targetDir, 'meta.json');
    let meta = {};
    if (fs.existsSync(metaPath)) { try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {} }
    meta = { ...meta, ...customMeta };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  return { success: true, targetDir };
}

export function unarchiveFeatureWorkspace(featureName: string, cwd: string = process.cwd()): unknown {
  const cleanName = featureName;
  try { unwrapOrThrow(service.unarchiveFeatureWorkspace(cleanName)); } catch {}
  const sourceDir = path.join(cwd, '.dag', 'archive', cleanName);
  const targetDir = path.join(cwd, '.dag', 'features', cleanName);
  if (fs.existsSync(sourceDir)) {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.renameSync(sourceDir, targetDir);
    return { success: true, targetDir };
  }
  return { success: false, message: 'Not found' };
}

export function activateFeatureWorkspace(featureName: string, cwd: string = process.cwd()): unknown {
  try { unwrapOrThrow(service.activateFeatureWorkspace(featureName)); } catch {}
  
  const currentSlug = resolveSlug(undefined);
  const hotDir = path.join(cwd, '.dag', 'features');
  
  if (currentSlug && currentSlug !== featureName) {
    const currentDir = path.join(hotDir, currentSlug);
    if (fs.existsSync(currentDir)) {
      archiveFeatureWorkspace('named_feature', '', {}, cwd);
    }
  }
  
  const sourceDir = path.join(hotDir, featureName);
  const targetDir = path.join(hotDir, 'current-feature');
  if (fs.existsSync(sourceDir)) {
    fs.renameSync(sourceDir, targetDir);
    return { success: true, targetDir };
  }
  return { success: false, message: 'Not found' };
}
