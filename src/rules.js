import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX_RULES_BYTES = 4096; // 4KB guard against prompt bloat

export function loadProjectRules(cwd = process.cwd()) {
  const candidatePaths = [
    path.join(cwd, '.dagrules'),
    path.join(cwd, '.cursorrules'),
    path.join(os.homedir(), '.dagrules')
  ];

  for (const rulePath of candidatePaths) {
    if (fs.existsSync(rulePath)) {
      try {
        let content = fs.readFileSync(rulePath, 'utf8').trim();
        if (!content) continue;

        // If file contains [DAG_RULES] section, prioritize that block
        const dagSectionMatch = content.match(/\[DAG_RULES\]([\s\S]*?)(?=\n\[|$)/i);
        if (dagSectionMatch && dagSectionMatch[1].trim()) {
          content = dagSectionMatch[1].trim();
        }

        // Clamp to MAX_RULES_BYTES
        if (Buffer.byteLength(content, 'utf8') > MAX_RULES_BYTES) {
          content = content.slice(0, MAX_RULES_BYTES) + '\n... [Rules truncated for token efficiency]';
        }

        return {
          rules: content,
          source: path.basename(rulePath),
          path: rulePath
        };
      } catch (e) {}
    }
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

export function appendLearnedRule(feedbackText, category = 'General', cwd = process.cwd()) {
  const rulePath = path.join(cwd, '.dagrules');
  let currentContent = '';
  
  if (fs.existsSync(rulePath)) {
    try {
      currentContent = fs.readFileSync(rulePath, 'utf8').trim();
    } catch (e) {}
  } else {
    currentContent = '# Team Engineering Policies & Architecture Rules\n';
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
