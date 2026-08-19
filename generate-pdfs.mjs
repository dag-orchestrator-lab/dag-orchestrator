import fs from 'node:fs';
import path from 'node:path';

class SimplePDFWriter {
  constructor() {
    this.objects = [];
    this.pages = [];
    this.fonts = {};
  }

  addObject(content) {
    this.objects.push(content);
    return this.objects.length; // 1-indexed object ID
  }

  escapeText(text) {
    // Sanitize emojis and non-standard unicode symbols that default Type1 Helvetica doesn't support
    const clean = text
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/▶/g, '>')
      .replace(/◀/g, '<')
      .replace(/✓/g, '[OK]')
      .replace(/⏳/g, '[PENDING]')
      .replace(/🛑/g, '[STOP]')
      .replace(/🎉/g, '')
      .replace(/🚨/g, '[WARN]')
      .replace(/├|─|│|└|┌|┐|┘|┬|┴|┼/g, '|')
      .replace(/“|”/g, '"')
      .replace(/‘|’/g, "'");

    return clean.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  createDoc(title, author, pagesText) {
    // Standard Letter size: 612 x 792 points
    const fontObjId = this.addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
    const fontBoldObjId = this.addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);
    const fontMonoObjId = this.addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`);

    const pageObjIds = [];

    for (const pageLines of pagesText) {
      let stream = `BT\n`;
      let currentY = 740;
      const leftMargin = 50;

      for (const line of pageLines) {
        if (line.type === 'h1') {
          stream += `/F2 18 Tf\n`;
          stream += `0.05 0.35 0.75 rg\n`; // Blue header
          stream += `1 0 0 1 ${leftMargin} ${currentY} Tm\n`;
          stream += `(${this.escapeText(line.text)}) Tj\n`;
          currentY -= 24;
        } else if (line.type === 'h2') {
          stream += `/F2 13 Tf\n`;
          stream += `0.1 0.15 0.25 rg\n`; // Dark header
          stream += `1 0 0 1 ${leftMargin} ${currentY} Tm\n`;
          stream += `(${this.escapeText(line.text)}) Tj\n`;
          currentY -= 18;
        } else if (line.type === 'h3') {
          stream += `/F2 11 Tf\n`;
          stream += `0.2 0.2 0.2 rg\n`;
          stream += `1 0 0 1 ${leftMargin} ${currentY} Tm\n`;
          stream += `(${this.escapeText(line.text)}) Tj\n`;
          currentY -= 15;
        } else if (line.type === 'code') {
          stream += `/F3 8.5 Tf\n`;
          stream += `0.2 0.2 0.25 rg\n`;
          stream += `1 0 0 1 ${leftMargin + 10} ${currentY} Tm\n`;
          stream += `(${this.escapeText(line.text)}) Tj\n`;
          currentY -= 11;
        } else if (line.type === 'bullet') {
          stream += `/F1 9.5 Tf\n`;
          stream += `0.15 0.15 0.15 rg\n`;
          stream += `1 0 0 1 ${leftMargin + 10} ${currentY} Tm\n`;
          stream += `(- ${this.escapeText(line.text)}) Tj\n`;
          currentY -= 13;
        } else if (line.type === 'quote') {
          stream += `/F1 9.5 Tf\n`;
          stream += `0.35 0.4 0.45 rg\n`;
          stream += `1 0 0 1 ${leftMargin + 15} ${currentY} Tm\n`;
          stream += `(|  ${this.escapeText(line.text)}) Tj\n`;
          currentY -= 13;
        } else {
          stream += `/F1 9.5 Tf\n`;
          stream += `0.15 0.15 0.15 rg\n`;
          stream += `1 0 0 1 ${leftMargin} ${currentY} Tm\n`;
          stream += `(${this.escapeText(line.text)}) Tj\n`;
          currentY -= 13;
        }

        if (currentY < 50) break; // End of page safety
      }
      stream += `ET`;

      const streamLen = Buffer.byteLength(stream, 'utf8');
      const streamObjId = this.addObject(`<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`);

      const pageObjId = this.addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjId} 0 R /F2 ${fontBoldObjId} 0 R /F3 ${fontMonoObjId} 0 R >> >> /Contents ${streamObjId} 0 R >>`);
      pageObjIds.push(pageObjId);
    }

    const pagesObjId = this.addObject(`<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`);

    // Update parent reference in pages
    for (const pid of pageObjIds) {
      this.objects[pid - 1] = this.objects[pid - 1].replace('/Parent 0 0 R', `/Parent ${pagesObjId} 0 R`);
    }

    const catalogObjId = this.addObject(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);
    const infoObjId = this.addObject(`<< /Title (${this.escapeText(title)}) /Author (${this.escapeText(author)}) /Creator (DAG Orchestrator PDF Engine) >>`);

    // Build xref table
    let pdf = `%PDF-1.4\n`;
    const offsets = [];

    for (let i = 0; i < this.objects.length; i++) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${i + 1} 0 obj\n${this.objects[i]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;

    for (const offset of offsets) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogObjId} 0 R /Info ${infoObjId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return pdf;
  }
}

function wrapText(text, maxChars = 85) {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = current ? current + ' ' + w : w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function paginateMarkdown(mdText) {
  const rawLines = mdText.split('\n');
  const pages = [];
  let currentPage = [];
  let lineCount = 0;
  const maxLinesPerPage = 48;
  let inCodeBlock = false;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      const wrapped = wrapText(raw, 95);
      for (const w of wrapped) {
        currentPage.push({ type: 'code', text: w });
        lineCount++;
      }
    } else if (trimmed.startsWith('# ')) {
      currentPage.push({ type: 'h1', text: trimmed.slice(2).trim() });
      lineCount += 2;
    } else if (trimmed.startsWith('## ')) {
      currentPage.push({ type: 'h2', text: trimmed.slice(3).trim() });
      lineCount += 2;
    } else if (trimmed.startsWith('### ')) {
      currentPage.push({ type: 'h3', text: trimmed.slice(4).trim() });
      lineCount += 1.5;
    } else if (trimmed.startsWith('> ')) {
      const wrapped = wrapText(trimmed.slice(2).trim(), 80);
      for (const w of wrapped) {
        currentPage.push({ type: 'quote', text: w });
        lineCount++;
      }
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const wrapped = wrapText(trimmed.slice(2).trim(), 80);
      for (let i = 0; i < wrapped.length; i++) {
        currentPage.push({ type: i === 0 ? 'bullet' : 'text', text: (i > 0 ? '  ' : '') + wrapped[i] });
        lineCount++;
      }
    } else if (trimmed.length > 0) {
      const wrapped = wrapText(trimmed, 85);
      for (const w of wrapped) {
        currentPage.push({ type: 'text', text: w });
        lineCount++;
      }
    } else {
      currentPage.push({ type: 'text', text: '' });
      lineCount += 0.5;
    }

    if (lineCount >= maxLinesPerPage) {
      pages.push(currentPage);
      currentPage = [];
      lineCount = 0;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

export function buildPdfFromMarkdown(mdFilePath, outputPdfPath, title, author = 'DAG Lead Architect') {
  const mdContent = fs.readFileSync(mdFilePath, 'utf8');
  const pages = paginateMarkdown(mdContent);
  const writer = new SimplePDFWriter();
  const pdfBuffer = writer.createDoc(title, author, pages);
  fs.writeFileSync(outputPdfPath, pdfBuffer, 'binary');
  console.log(`✓ Successfully generated: ${outputPdfPath} (${pages.length} pages)`);
}

const dir = process.cwd();
buildPdfFromMarkdown(
  path.join(dir, 'DOMAIN_GUIDE.md'),
  path.join(dir, 'DOMAIN_GUIDE.pdf'),
  'DAG Orchestrator - Product & Domain Guide'
);

buildPdfFromMarkdown(
  path.join(dir, 'ARCHITECTURE.md'),
  path.join(dir, 'ARCHITECTURE.pdf'),
  'DAG Orchestrator - Technical Architecture Blueprint'
);
