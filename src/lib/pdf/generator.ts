import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import type { VulnerabilityAnalysisResult } from '../agents/vulnerability-agent';

// A4 page dimensions
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const LINE_HEIGHT = 16;

/**
 * Generate a PDF audit report from analysis results and markdown content
 */
export async function generateReportPDF(
  reportMarkdown: string,
  analysisResult: VulnerabilityAnalysisResult,
  contractName: string,
  lang: 'en' | 'cn' = 'en'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Embed standard fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Track current page and y position
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // ============== Title Page ==============
  // Main title (always English for PDF since standard fonts don't support Chinese)
  const title = lang === 'cn' ? 'Smart Contract Security Audit Report' : 'Smart Contract Audit Report';
  y = drawText(page, title, MARGIN, y, boldFont, 24, rgb(0.1, 0.1, 0.1));
  y -= 15;

  // Decorative line
  page.drawLine({
    start: { x: MARGIN, y: y },
    end: { x: PAGE_WIDTH - MARGIN, y: y },
    thickness: 2,
    color: rgb(0.2, 0.4, 0.8),
  });
  y -= 30;

  // Contract info section
  y = drawText(page, 'Contract Information', MARGIN, y, boldFont, 16, rgb(0.2, 0.2, 0.2));
  y -= 5;

  y = drawText(page, `Contract Name: ${contractName}`, MARGIN + 10, y, font, 12, rgb(0.3, 0.3, 0.3));
  y -= LINE_HEIGHT;

  y = drawText(
    page,
    `Analysis Date: ${new Date(analysisResult.summary.analysisTime).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    MARGIN + 10,
    y,
    font,
    12,
    rgb(0.3, 0.3, 0.3)
  );
  y -= LINE_HEIGHT;

  // Risk level with color
  const riskColor = getSeverityColor(analysisResult.summary.riskLevel);
  y = drawText(
    page,
    `Overall Risk Level: ${analysisResult.summary.riskLevel}`,
    MARGIN + 10,
    y,
    boldFont,
    14,
    riskColor
  );
  y -= LINE_HEIGHT;

  y = drawText(
    page,
    `Total Vulnerabilities: ${analysisResult.summary.totalVulnerabilities}`,
    MARGIN + 10,
    y,
    font,
    12,
    rgb(0.3, 0.3, 0.3)
  );
  y -= LINE_HEIGHT;

  // Code quality score
  y = drawText(
    page,
    `Code Quality Score: ${analysisResult.codeQuality.overallScore}`,
    MARGIN + 10,
    y,
    font,
    12,
    rgb(0.3, 0.3, 0.3)
  );
  y -= 30;

  // ============== Severity Distribution ==============
  const severityCounts = countBySeverity(analysisResult);
  y = drawText(page, 'Severity Distribution', MARGIN, y, boldFont, 16, rgb(0.2, 0.2, 0.2));
  y -= 5;

  for (const [severity, count] of Object.entries(severityCounts)) {
    if (count > 0) {
      const color = getSeverityColor(severity);
      // Draw colored indicator
      page.drawRectangle({
        x: MARGIN + 10,
        y: y - 4,
        width: 8,
        height: 8,
        color,
      });
      y = drawText(page, `${severity}: ${count}`, MARGIN + 25, y, font, 11, rgb(0.3, 0.3, 0.3));
      y -= LINE_HEIGHT;
    }
  }
  y -= 20;

  // ============== Vulnerability List ==============
  y = drawText(page, 'Vulnerability Details', MARGIN, y, boldFont, 16, rgb(0.2, 0.2, 0.2));
  y -= 5;

  for (const vuln of analysisResult.vulnerabilities) {
    // Check if we need a new page
    if (y < 150) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }

    // Vulnerability header with severity color
    const vulnColor = getSeverityColor(vuln.severity);
    const vulnHeader = `[${vuln.severity}] ${vuln.id} - ${vuln.patternName}`;
    y = drawText(page, vulnHeader, MARGIN + 5, y, boldFont, 12, vulnColor);
    y -= 5;

    // Title
    y = drawWrappedText(page, vuln.title, MARGIN + 15, y, font, 11, rgb(0.2, 0.2, 0.2), CONTENT_WIDTH - 20);
    y -= 4;

    // Location
    const locationStr = `Location: ${vuln.location.fileName} | Lines ${vuln.location.lineStart}-${vuln.location.lineEnd} | ${vuln.location.functionName}()`;
    y = drawWrappedText(page, locationStr, MARGIN + 15, y, font, 9, rgb(0.5, 0.5, 0.5), CONTENT_WIDTH - 20);
    y -= 4;

    // Description (truncated for PDF readability)
    const descText = vuln.description.length > 300
      ? vuln.description.substring(0, 300) + '...'
      : vuln.description;
    y = drawWrappedText(page, descText, MARGIN + 15, y, font, 10, rgb(0.3, 0.3, 0.3), CONTENT_WIDTH - 20);
    y -= 4;

    // Attack vector (brief)
    if (vuln.attackVector) {
      const attackText = vuln.attackVector.length > 200
        ? vuln.attackVector.substring(0, 200) + '...'
        : vuln.attackVector;
      y = drawWrappedText(page, `Attack Vector: ${attackText}`, MARGIN + 15, y, font, 10, rgb(0.6, 0.2, 0.2), CONTENT_WIDTH - 20);
      y -= 4;
    }

    // Recommendation (brief)
    if (vuln.recommendation) {
      const recText = vuln.recommendation.length > 200
        ? vuln.recommendation.substring(0, 200) + '...'
        : vuln.recommendation;
      y = drawWrappedText(page, `Recommendation: ${recText}`, MARGIN + 15, y, font, 10, rgb(0.2, 0.5, 0.2), CONTENT_WIDTH - 20);
      y -= 4;
    }

    // Separator line
    page.drawLine({
      start: { x: MARGIN + 10, y: y },
      end: { x: PAGE_WIDTH - MARGIN - 10, y: y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 12;
  }

  // ============== Markdown Content Pages ==============
  if (reportMarkdown) {
    y -= 10;
    if (y < 100) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }

    y = drawText(page, 'Full Audit Report', MARGIN, y, boldFont, 16, rgb(0.2, 0.2, 0.2));
    y -= 10;

    // Parse and render markdown content
    const lines = reportMarkdown.split('\n');
    for (const line of lines) {
      if (y < 80) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }

      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) {
        y -= 8;
        continue;
      }

      // Headings
      if (trimmedLine.startsWith('### ')) {
        y -= 5;
        y = drawText(page, trimmedLine.replace('### ', ''), MARGIN, y, boldFont, 13, rgb(0.15, 0.15, 0.15));
        y -= 4;
      } else if (trimmedLine.startsWith('## ')) {
        y -= 8;
        y = drawText(page, trimmedLine.replace('## ', ''), MARGIN, y, boldFont, 15, rgb(0.1, 0.1, 0.1));
        y -= 4;
      } else if (trimmedLine.startsWith('# ')) {
        y -= 10;
        y = drawText(page, trimmedLine.replace('# ', ''), MARGIN, y, boldFont, 18, rgb(0.05, 0.05, 0.05));
        y -= 4;
      } else if (trimmedLine.startsWith('---')) {
        page.drawLine({
          start: { x: MARGIN, y: y },
          end: { x: PAGE_WIDTH - MARGIN, y: y },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });
        y -= 8;
      } else if (trimmedLine.startsWith('| ')) {
        // Table row - render as simple text
        const cleanLine = trimmedLine.replace(/\|/g, ' | ').replace(/\s+/g, ' ').trim();
        y = drawWrappedText(page, cleanLine, MARGIN, y, font, 9, rgb(0.3, 0.3, 0.3), CONTENT_WIDTH);
        y -= 4;
      } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        // List item
        const itemText = trimmedLine.replace(/^[-*]\s+/, '');
        y = drawWrappedText(page, `  \u2022 ${itemText}`, MARGIN, y, font, 10, rgb(0.3, 0.3, 0.3), CONTENT_WIDTH);
        y -= 2;
      } else if (trimmedLine.startsWith('```')) {
        // Code block marker - skip
        y -= 4;
      } else {
        // Regular paragraph
        const cleanText = trimmedLine.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '');
        y = drawWrappedText(page, cleanText, MARGIN, y, font, 10, rgb(0.25, 0.25, 0.25), CONTENT_WIDTH);
        y -= 2;
      }
    }
  }

  // ============== Add Page Numbers ==============
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const pageNum = `Page ${i + 1} of ${pages.length}`;
    const textWidth = font.widthOfTextAtSize(pageNum, 9);
    p.drawText(pageNum, {
      x: (PAGE_WIDTH - textWidth) / 2,
      y: 30,
      font,
      size: 9,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return await pdfDoc.save();
}

// ============== Helper Functions ==============

/**
 * Draw text at a position and return the new y coordinate
 */
function drawText(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>
): number {
  // Sanitize text to avoid pdf-lib encoding issues
  const sanitized = sanitizeText(text);
  page.drawText(sanitized, {
    x,
    y,
    font,
    size,
    color,
  });
  return y - size - 4;
}

/**
 * Draw wrapped text that fits within maxWidth, handling page breaks
 */
function drawWrappedText(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  maxWidth: number
): number {
  const sanitized = sanitizeText(text);
  const lines = wrapText(sanitized, font, size, maxWidth);

  for (const line of lines) {
    if (y < 80) {
      // Note: We can't easily add a new page here without access to pdfDoc
      // In practice, we check before calling this function
      break;
    }
    page.drawText(line, {
      x,
      y,
      font,
      size,
      color,
    });
    y -= size + 4;
  }

  return y;
}

/**
 * Wrap text to fit within a maximum width using font metrics
 */
function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    try {
      const width = font.widthOfTextAtSize(sanitizeText(testLine), fontSize);

      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    } catch {
      // If font measurement fails, use a rough character estimate
      const estimatedWidth = testLine.length * fontSize * 0.5;
      if (estimatedWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Get color for severity level
 */
function getSeverityColor(severity: string): ReturnType<typeof rgb> {
  switch (severity) {
    case 'Critical':
      return rgb(0.8, 0, 0);
    case 'High':
      return rgb(0.9, 0.3, 0);
    case 'Medium':
      return rgb(0.9, 0.6, 0);
    case 'Low':
      return rgb(0.2, 0.6, 0.2);
    case 'Informational':
      return rgb(0.3, 0.5, 0.8);
    default:
      return rgb(0.3, 0.3, 0.3);
  }
}

/**
 * Count vulnerabilities by severity level
 */
function countBySeverity(
  analysisResult: VulnerabilityAnalysisResult
): Record<string, number> {
  const counts: Record<string, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
    Informational: 0,
  };

  for (const vuln of analysisResult.vulnerabilities) {
    if (counts[vuln.severity] !== undefined) {
      counts[vuln.severity]++;
    }
  }

  return counts;
}

/**
 * Sanitize text to remove characters that pdf-lib cannot encode
 * (pdf-lib with standard fonts only supports a subset of Unicode)
 */
function sanitizeText(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, '') // Keep only printable ASCII
    .replace(/[{}<>]/g, '') // Remove characters that might cause issues
    .trim();
}
