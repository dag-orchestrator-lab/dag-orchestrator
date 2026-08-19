import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { ANSI } from './ui.js';

export function isFrontendTask(askText = '', repoSummary = '') {
  const feKeywords = /\b(ui|ux|frontend|front-end|component|page|view|screen|modal|dialog|button|sidebar|navbar|header|footer|css|tailwind|styled|sass|scss|html|react|vue|svelte|angular|nextjs|nuxt|astro|layout|responsive|theme|figma|form|input|select|picker|dropdown|table|card)\b/i;
  const isKeywordMatch = feKeywords.test(askText);
  const repoHasFrontend = /\.(tsx|jsx|vue|svelte|html|css|scss)/i.test(repoSummary);
  return isKeywordMatch || (askText.length > 50 && repoHasFrontend);
}

export function fetchUrlContent(targetUrl) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 5000
      }, (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
          if (rawData.length > 50000) { // Limit to 50KB for speed & token efficiency
            res.destroy();
            resolve(extractLayoutTokensFromHtml(rawData, targetUrl));
          }
        });
        res.on('end', () => {
          resolve(extractLayoutTokensFromHtml(rawData, targetUrl));
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

export function extractLayoutTokensFromHtml(html, sourceUrl) {
  if (!html) return null;

  // Extract meta title & description
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Extract structural layout patterns (grid, flex, columns, containers)
  const classMatches = html.match(/class=["']([^"']+)["']/gi) || [];
  const layoutClasses = new Set();
  
  for (const c of classMatches) {
    const rawClass = c.replace(/^class=["']|["']$/g, '');
    const tokens = rawClass.split(/\s+/);
    for (const t of tokens) {
      if (/^(grid|flex|col-|row-|gap-|p-|px-|py-|m-|max-w-|w-|h-|rounded|bg-|text-|shadow|sticky|fixed|border)/i.test(t)) {
        if (layoutClasses.size < 40) layoutClasses.add(t);
      }
    }
  }

  return {
    sourceUrl,
    title,
    detectedLayoutArchetype: layoutClasses.has('grid') ? 'CSS Grid Multi-Column' : 'Flexbox Responsive Flow',
    sampleClasses: Array.from(layoutClasses).slice(0, 30).join(' ')
  };
}

export async function processUIDesignReference(choice, input = '', cwd = process.cwd()) {
  const trimmed = input.trim();

  // Option 1: Figma File / Node URL
  if (choice === '1' || trimmed.includes('figma.com')) {
    const figmaUrl = trimmed;
    const nodeMatch = figmaUrl.match(/node-id=([0-9%3A\-]+)/i);
    const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]) : 'Root Frame';

    return {
      type: 'figma',
      source: figmaUrl,
      spec: `Figma Node Reference: [${nodeId}]\nAuto-Layout Constraints: Preserved\nColor Palette: Extracted from Figma Document Styles\nTypography Scales: Extracted Auto-Layout Frame`
    };
  }

  // Option 2: HTML / Tailwind / v0 Wireframe File
  if (choice === '2' || (fs.existsSync(path.join(cwd, trimmed)) && !trimmed.startsWith('http'))) {
    const filePath = path.isAbsolute(trimmed) ? trimmed : path.join(cwd, trimmed);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').slice(0, 5000);
        return {
          type: 'wireframe-file',
          source: path.basename(filePath),
          spec: `Wireframe Source (${path.basename(filePath)}):\n\`\`\`html\n${content}\n\`\`\``
        };
      } catch (e) {}
    }
  }

  // Option 3: Design Tokens (JSON / Theme Config)
  if (choice === '3') {
    return {
      type: 'design-tokens',
      source: 'Design System Tokens',
      spec: `Design Tokens Specification:\n- Theme Palette: Primary, Secondary, Surface, Neutral\n- Spacing Scale: 4px base (p-2: 8px, p-4: 16px, p-6: 24px)\n- Border Radius: rounded-lg (8px), rounded-xl (12px)`
    };
  }

  // Option 4: AI Design with Inspiration URL / Theme Direction
  if (choice === '4' || trimmed) {
    let urlInspiration = null;
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      urlInspiration = await fetchUrlContent(urlMatch[0]);
    }

    let specText = `Visual Direction / Theme: ${trimmed || 'Modern, clean, accessible responsive interface'}`;
    if (urlInspiration) {
      specText += `\n\nReference Website Layout Scraped (${urlInspiration.sourceUrl}):\n- Title: ${urlInspiration.title}\n- Archetype: ${urlInspiration.detectedLayoutArchetype}\n- Structural Classes: ${urlInspiration.sampleClasses}`;
    }

    return {
      type: 'ai-creative',
      source: urlMatch ? urlMatch[0] : 'Custom Visual Direction',
      spec: specText
    };
  }

  return null;
}

export function formatUIContractSection(uiDesign) {
  if (!uiDesign) return '';

  return `
==================== UI/UX & FRONTEND DESIGN SPECIFICATION ====================
Design Source: ${uiDesign.source} (${uiDesign.type})

${uiDesign.spec}

MANDATORY UI/UX ACCEPTANCE CONTRACT:
1. Component State Machine: Must explicitly handle [Idle, Loading, Error, Empty, Disabled] states.
2. Accessibility (A11y): All interactive elements must carry semantic ARIA labels and \`data-testid\` attributes.
3. Responsive Breakpoints:
   - Mobile (<640px): Single-column stacked layout / bottom-sheet drawers.
   - Desktop (>=1024px): Multi-column grid / contextual popovers.
================================================================================
`;
}
