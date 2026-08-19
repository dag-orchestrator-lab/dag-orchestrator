import fs from 'node:fs';
import path from 'node:path';
import { ANSI } from './ui.js';

const SERVICES_CONFIG_FILE = '.dag/services.json';
const MAX_HARVEST_BYTES_PER_SERVICE = 20480; // 20KB guard per service

export function loadServiceRegistry(cwd = process.cwd()) {
  const configPath = path.join(cwd, SERVICES_CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {}
  }
  return { services: {} };
}

export function saveServiceRegistry(registry, cwd = process.cwd()) {
  const dagDir = path.join(cwd, '.dag');
  if (!fs.existsSync(dagDir)) fs.mkdirSync(dagDir, { recursive: true });
  const configPath = path.join(cwd, SERVICES_CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(registry, null, 2));
  return registry;
}

export function linkService(name, servicePath, cwd = process.cwd()) {
  const absolutePath = path.isAbsolute(servicePath) ? servicePath : path.resolve(cwd, servicePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Target service path does not exist: ${servicePath}`);
  }

  const registry = loadServiceRegistry(cwd);
  registry.services[name] = {
    path: path.relative(cwd, absolutePath),
    absolutePath,
    linkedAt: new Date().toISOString()
  };

  saveServiceRegistry(registry, cwd);
  return registry.services[name];
}

export function unlinkService(name, cwd = process.cwd()) {
  const registry = loadServiceRegistry(cwd);
  if (registry.services[name]) {
    delete registry.services[name];
    saveServiceRegistry(registry, cwd);
    return true;
  }
  return false;
}

export function parsePostmanCollection(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const items = raw.item || [];
    const endpoints = [];

    const extractRequests = (itemList) => {
      for (const it of itemList) {
        if (it.request) {
          const method = it.request.method || 'GET';
          const url = typeof it.request.url === 'string' ? it.request.url : (it.request.url?.raw || '');
          const bodyMode = it.request.body?.mode;
          let sampleBody = '';
          if (bodyMode === 'raw' && it.request.body.raw) {
            try {
              sampleBody = JSON.stringify(JSON.parse(it.request.body.raw));
            } catch (e) {
              sampleBody = it.request.body.raw.slice(0, 100);
            }
          }
          endpoints.push(`- ${method} ${url} ${sampleBody ? `[Body: ${sampleBody}]` : ''}`);
        }
        if (it.item && Array.isArray(it.item)) {
          extractRequests(it.item);
        }
      }
    };

    extractRequests(items);
    return endpoints.join('\n');
  } catch (e) {
    return '';
  }
}

export function parseThunderCollection(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const requests = Array.isArray(raw) ? raw : (raw.requests || raw.data || []);
    const endpoints = [];

    for (const req of requests) {
      if (req.url && req.method) {
        const body = req.body?.raw ? req.body.raw.replace(/\s+/g, ' ').slice(0, 100) : '';
        endpoints.push(`- ${req.method} ${req.url} ${body ? `[Body: ${body}]` : ''}`);
      }
    }
    return endpoints.join('\n');
  } catch (e) {
    return '';
  }
}

export function harvestSingleService(serviceName, serviceDir) {
  const discovered = [];
  const harvestedData = [];

  const candidatePatterns = [
    // Database Schemas
    { dir: 'database', exts: ['.sql', '.prisma'] },
    { dir: 'prisma', exts: ['.prisma'] },
    { dir: 'src/db', exts: ['.sql', '.ts'] },
    // API Specs & Contracts
    { dir: '', exts: ['openapi.json', 'openapi.yaml', 'swagger.json', 'schema.graphql'] },
    { dir: 'proto', exts: ['.proto'] },
    // E2E Collections (Postman, Thunder Client)
    { dir: '', exts: ['.postman_collection.json', 'thunder-collection.json', 'thunderclient.json'] },
    { dir: 'tests/e2e', exts: ['.json'] },
    { dir: '.thunderclient', exts: ['.json'] }
  ];

  const searchFiles = (currentDir, depth = 0) => {
    if (depth > 3 || !fs.existsSync(currentDir)) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;
        const fullPath = path.join(currentDir, ent.name);
        
        if (ent.isDirectory()) {
          searchFiles(fullPath, depth + 1);
        } else if (ent.isFile()) {
          const lower = ent.name.toLowerCase();
          
          // Postman
          if (lower.includes('postman_collection.json')) {
            const parsed = parsePostmanCollection(fullPath);
            if (parsed) {
              discovered.push(path.basename(fullPath));
              harvestedData.push(`### [Postman API Collection] (${path.basename(fullPath)})\n${parsed}`);
            }
          }
          // Thunder Client
          else if (lower.includes('thunder') && lower.endsWith('.json')) {
            const parsed = parseThunderCollection(fullPath);
            if (parsed) {
              discovered.push(path.basename(fullPath));
              harvestedData.push(`### [Thunder Client Collection] (${path.basename(fullPath)})\n${parsed}`);
            }
          }
          // SQL Schema
          else if (lower.endsWith('.sql') && (lower.includes('schema') || lower.includes('migration') || lower.includes('table'))) {
            const content = fs.readFileSync(fullPath, 'utf8').trim();
            if (content) {
              discovered.push(path.basename(fullPath));
              harvestedData.push(`### [SQL DDL Schema] (${path.basename(fullPath)})\n${content.slice(0, 4000)}`);
            }
          }
          // Protobuf / GraphQL
          else if (lower.endsWith('.proto') || lower.endsWith('.graphql')) {
            const content = fs.readFileSync(fullPath, 'utf8').trim();
            if (content) {
              discovered.push(path.basename(fullPath));
              harvestedData.push(`### [RPC / Event Spec] (${path.basename(fullPath)})\n${content.slice(0, 4000)}`);
            }
          }
          // OpenAPI / Swagger
          else if (lower.includes('openapi') || lower.includes('swagger')) {
            const content = fs.readFileSync(fullPath, 'utf8').trim();
            if (content) {
              discovered.push(path.basename(fullPath));
              harvestedData.push(`### [OpenAPI Specification] (${path.basename(fullPath)})\n${content.slice(0, 4000)}`);
            }
          }
        }
      }
    } catch (e) {}
  };

  searchFiles(serviceDir);

  let combined = harvestedData.join('\n\n');
  if (Buffer.byteLength(combined, 'utf8') > MAX_HARVEST_BYTES_PER_SERVICE) {
    combined = combined.slice(0, MAX_HARVEST_BYTES_PER_SERVICE) + '\n... [Remaining service schemas truncated]';
  }

  return {
    name: serviceName,
    path: serviceDir,
    files: discovered,
    content: combined
  };
}

export function harvestAllLinkedServices(cwd = process.cwd()) {
  const registry = loadServiceRegistry(cwd);
  const services = Object.entries(registry.services || {});
  
  if (services.length === 0) return { services: [], promptText: '' };

  const results = [];
  const promptBlocks = [];

  for (const [name, meta] of services) {
    const absPath = path.isAbsolute(meta.path) ? meta.path : path.resolve(cwd, meta.path);
    if (fs.existsSync(absPath)) {
      const harvested = harvestSingleService(name, absPath);
      results.push(harvested);
      if (harvested.content) {
        promptBlocks.push(`==================== LINKED EXTERNAL SERVICE: ${name} ====================\nDirectory: ${meta.path}\nDiscovered Contracts: ${harvested.files.join(', ') || 'None'}\n\n${harvested.content}\n========================================================================`);
      }
    }
  }

  return {
    services: results,
    promptText: promptBlocks.join('\n\n')
  };
}

export function renderServicesList(cwd = process.cwd()) {
  const registry = loadServiceRegistry(cwd);
  const services = Object.entries(registry.services || {});
  const line = '─'.repeat(68);

  console.log(`\n${ANSI.cyan}${ANSI.bold}┌${line}┐`);
  console.log(`│ 🌐 LINKED MICROSERVICES & CROSS-BOUNDARY CONTRACTS                 │`);
  console.log(`├${line}┤${ANSI.reset}`);

  if (services.length === 0) {
    console.log(`│ No linked external services. Run \`dag service link <name> <path>\`   │`);
  } else {
    for (const [name, meta] of services) {
      const absPath = path.isAbsolute(meta.path) ? meta.path : path.resolve(cwd, meta.path);
      const exists = fs.existsSync(absPath);
      const harvested = exists ? harvestSingleService(name, absPath) : { files: [] };
      const statusBadge = exists ? `${ANSI.brightGreen}✓ ACTIVE${ANSI.reset}` : `${ANSI.brightRed}✗ MISSING${ANSI.reset}`;
      const plainBadge = exists ? '✓ ACTIVE' : '✗ MISSING';
      
      const padding = 68 - 8 - name.length - meta.path.slice(0, 30).length - plainBadge.length;
      console.log(`│ ${ANSI.bold}${name}${ANSI.reset} → ${ANSI.dim}${meta.path.slice(0, 30)}${ANSI.reset}${' '.repeat(Math.max(1, padding))}${statusBadge} │`);
      if (harvested.files.length > 0) {
        console.log(`│   ${ANSI.dim}Contracts: ${harvested.files.slice(0, 4).join(', ')}${harvested.files.length > 4 ? '...' : ''}${ANSI.reset}${' '.repeat(Math.max(1, 52 - harvested.files.slice(0, 4).join(', ').length))} │`);
      }
    }
  }

  console.log(`${ANSI.cyan}${ANSI.bold}└${line}┘${ANSI.reset}\n`);
}
