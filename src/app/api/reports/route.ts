import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/jwt';
import { loadReport } from '@/lib/storage/data';
import { generateHTMLReport, type ReportLanguage } from '@/lib/report-templates';
import type { VulnerabilityAnalysisResult } from '@/lib/agents/vulnerability-agent';

interface ReportData {
  id: string;
  createdAt: string;
  contractInfo: { address: string; chain: string; name: string; sourceOrigin?: string; sourceType?: string };
  analysisResult: VulnerabilityAnalysisResult;
  reportMarkdown: string;
  summary: {
    overallRisk: string;
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing report ID' },
        { status: 400 }
      );
    }

    const reportRaw = await loadReport(id);
    if (!reportRaw) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      );
    }

    const report = reportRaw as ReportData;
    const format = searchParams.get('format');
    const lang = (searchParams.get('lang') || 'cn') as ReportLanguage;

    // HTML download - supports both EN and CN
    if (format === 'html') {
      const html = generateHTMLReport(report, lang);
      const response = new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-report-${id}-${lang}.html"`,
        },
      });
      return response;
    }

    // PDF download - English only (pdf-lib can't render Chinese)
    if (format === 'pdf') {
      const { generateReportPDF } = await import('@/lib/pdf/generator');
      const contractName = report.contractInfo?.name || 'Unknown';
      const analysisResult = report.analysisResult;

      const pdfBytes = await generateReportPDF(
        report.reportMarkdown || '',
        analysisResult,
        contractName,
        lang
      );

      const response = new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="audit-report-${id}-${lang}.pdf"`,
        },
      });
      return response;
    }

    // JSON download
    if (format === 'json') {
      const response = new NextResponse(JSON.stringify(report, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="audit-report-${id}-${lang}.json"`,
        },
      });
      return response;
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Reports API error:', error);
    return NextResponse.json(
      { error: 'Failed to load report' },
      { status: 500 }
    );
  }
}
