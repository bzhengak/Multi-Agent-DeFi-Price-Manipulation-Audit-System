import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/jwt';
import { loadHistoryCases, loadAnalysisHistory } from '@/lib/storage/data';

/**
 * Escape a CSV field according to RFC 4180:
 * - If the field contains a comma, newline, or double-quote, wrap it in double-quotes
 * - Double-quotes within the field are escaped by doubling them
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Safely convert an unknown value to a string for CSV output.
 */
function toCSVString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export async function GET(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'cases') {
      return await exportCases();
    } else if (type === 'history') {
      return await exportHistory();
    } else {
      return NextResponse.json(
        { error: '无效的导出类型，请使用 type=cases 或 type=history' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Export API error:', error);
    return NextResponse.json(
      { error: '导出数据失败' },
      { status: 500 }
    );
  }
}

async function exportCases(): Promise<NextResponse> {
  const data = await loadHistoryCases();
  const cases = data.cases;

  const headers = [
    'ID',
    'Date',
    'Blockchain',
    'Attack Transaction',
    'Attack Contract',
    'Victim Contract',
    'Vulnerability Pattern',
    'Notes',
  ];

  const rows = cases.map((c) =>
    [
      escapeCSV(toCSVString(c.id)),
      escapeCSV(toCSVString(c.time)),
      escapeCSV(toCSVString(c.blockchain_platform)),
      escapeCSV(toCSVString(c.attack_transaction)),
      escapeCSV(toCSVString(c.attack_contract_address)),
      escapeCSV(toCSVString(c.victim_contract_address)),
      escapeCSV(toCSVString(c.vulnerability_pattern)),
      escapeCSV(toCSVString(c.note)),
    ].join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="defi-cases-export.csv"',
    },
  });
}

async function exportHistory(): Promise<NextResponse> {
  const data = await loadAnalysisHistory();
  const records = data.records;

  const headers = [
    'ID',
    'Contract Name',
    'Blockchain',
    'Address',
    'Analysis Time',
    'Risk Level',
    'Vulnerability Count',
    'Report ID',
  ];

  const rows = records.map((r) =>
    [
      escapeCSV(toCSVString(r.id)),
      escapeCSV(toCSVString(r.contractName)),
      escapeCSV(toCSVString(r.blockchain)),
      escapeCSV(toCSVString(r.address)),
      escapeCSV(toCSVString(r.analysisTime)),
      escapeCSV(toCSVString(r.riskLevel)),
      escapeCSV(toCSVString(r.vulnerabilityCount)),
      escapeCSV(toCSVString(r.reportUrl)),
    ].join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="defi-history-export.csv"',
    },
  });
}
