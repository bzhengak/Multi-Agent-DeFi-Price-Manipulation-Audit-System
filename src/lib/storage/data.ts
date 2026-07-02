import { saveJSON, loadJSON, deleteFile } from './blob';
// ─── Types ───────────────────────────────────────────────────────────────────

export interface HistoryCase {
  id: string;
  time: string;
  data_resource: string;
  blockchain_platform: string;
  attack_transaction: string;
  attack_contract_address: string;
  victim_contract_address: string;
  note: string;
  vulnerability_pattern?: string;
  pattern_ids?: string[];
}

export interface HistoryCasesData {
  cases: HistoryCase[];
  lastUpdated: string;
}

export interface VulnerabilityPattern {
  id: string;
  category: string;
  name: string;
  code_features: string[];
  related_attacks: string[];
  severity: 'Critical' | 'High' | 'Medium';
  references?: { swc: string; owasp: string };
}

export interface VulnerabilityPatternsData {
  patterns: VulnerabilityPattern[];
}

export interface AnalysisRecord {
  id: string;
  contractName: string;
  blockchain: string;
  address?: string;
  analysisTime: string;
  riskLevel: string;
  vulnerabilityCount: number;
  reportUrl: string;
  sourceOrigin?: 'etherscan' | 'sourcify' | 'heimdall' | 'file' | 'demo' | 'unavailable' | 'context';
  sourceType?: 'verified' | 'decompiled' | 'unavailable' | 'context';
  caseId?: string;
}

export interface AnalysisHistoryData {
  records: AnalysisRecord[];
}

// ─── File path constants ────────────────────────────────────────────────────

const FILES = {
  HISTORY_CASES: 'history.json',
  VULNERABILITY_PATTERNS: 'vulnerabilities.json',
  ANALYSIS_HISTORY: 'analysis_history.json',
  REPORTS_DIR: 'reports/',
} as const;

// ─── History Cases ──────────────────────────────────────────────────────────

export async function loadHistoryCases(): Promise<HistoryCasesData> {
  const data = await loadJSON<HistoryCasesData>(FILES.HISTORY_CASES);
  return data || { cases: [], lastUpdated: new Date().toISOString() };
}

export async function saveHistoryCases(data: HistoryCasesData): Promise<void> {
  data.lastUpdated = new Date().toISOString();
  await saveJSON(FILES.HISTORY_CASES, data);
}

// ─── Vulnerability Patterns ─────────────────────────────────────────────────

// In-memory cache for vulnerability patterns (5 minute TTL per T6 spec)
let patternsCache: { data: VulnerabilityPattern[]; timestamp: number } | null = null;
const PATTERNS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function loadVulnerabilityPatterns(): Promise<VulnerabilityPatternsData> {
  // Check in-memory cache first
  if (patternsCache && Date.now() - patternsCache.timestamp < PATTERNS_CACHE_TTL) {
    return { patterns: patternsCache.data };
  }

  // T6: Try Prisma first (source of truth after ingest)
  try {
    const { prisma } = await import('@/lib/prisma');
    if (prisma.vulnerabilityPattern) {
      const dbPatterns = await prisma.vulnerabilityPattern.findMany({
        orderBy: { id: 'asc' },
      });
      if (dbPatterns.length > 0) {
        const patterns: VulnerabilityPattern[] = dbPatterns.map((db) => ({
          id: db.id,
          category: db.category,
          name: db.name,
          code_features: JSON.parse(db.codeFeatures),
          related_attacks: JSON.parse(db.relatedAttacks),
          severity: db.severity as VulnerabilityPattern['severity'],
          references: {
            swc: db.swcRefs || '',
            owasp: db.owaspRefs || '',
          },
        }));
        patternsCache = { data: patterns, timestamp: Date.now() };
        return { patterns };
      }
    }
  } catch {
    // Prisma not available (not migrated or client not generated), fall through to JSON
  }

  // Fallback: read from JSON file (original behavior)
  const data = await loadJSON<VulnerabilityPattern[] | { patterns: VulnerabilityPattern[]; lastUpdated?: string }>(FILES.VULNERABILITY_PATTERNS);
  if (!data) return { patterns: [] };
  const patterns = Array.isArray(data)
    ? data
    : (data as { patterns: VulnerabilityPattern[] }).patterns || [];
  patternsCache = { data: patterns, timestamp: Date.now() };
  return { patterns };
}

export async function saveVulnerabilityPatterns(data: VulnerabilityPatternsData): Promise<void> {
  // Write to JSON file (always, as backup/source of truth)
  await saveJSON(FILES.VULNERABILITY_PATTERNS, data.patterns);
  // Invalidate cache
  patternsCache = null;
}

/** Clear the patterns cache (useful after ingest operations) */
export function clearPatternsCache(): void {
  patternsCache = null;
}

// ─── Analysis History ───────────────────────────────────────────────────────

export async function loadAnalysisHistory(): Promise<AnalysisHistoryData> {
  const data = await loadJSON<AnalysisHistoryData>(FILES.ANALYSIS_HISTORY);
  return data || { records: [] };
}

export async function addAnalysisRecord(record: AnalysisRecord): Promise<void> {
  const history = await loadAnalysisHistory();
  history.records.unshift(record);
  await saveJSON(FILES.ANALYSIS_HISTORY, history);
}

export async function deleteAnalysisRecord(id: string): Promise<void> {
  const history = await loadAnalysisHistory();
  history.records = history.records.filter((r) => r.id !== id);
  await saveJSON(FILES.ANALYSIS_HISTORY, history);
  await deleteFile(`${FILES.REPORTS_DIR}${id}.json`);
}

// ─── Reports ────────────────────────────────────────────────────────────────

export async function saveReport(id: string, report: unknown): Promise<string> {
  return await saveJSON(`${FILES.REPORTS_DIR}${id}.json`, report);
}

export async function loadReport(id: string): Promise<unknown | null> {
  return await loadJSON(`${FILES.REPORTS_DIR}${id}.json`);
}
