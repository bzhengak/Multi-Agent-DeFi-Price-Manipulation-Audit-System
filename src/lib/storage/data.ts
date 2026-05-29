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

export async function loadVulnerabilityPatterns(): Promise<VulnerabilityPatternsData> {
  const data = await loadJSON<VulnerabilityPattern[] | { patterns: VulnerabilityPattern[]; lastUpdated?: string }>(FILES.VULNERABILITY_PATTERNS);
  if (!data) return { patterns: [] };
  if (Array.isArray(data)) return { patterns: data };
  return { patterns: (data as { patterns: VulnerabilityPattern[] }).patterns || [] };
}

export async function saveVulnerabilityPatterns(data: VulnerabilityPatternsData): Promise<void> {
  await saveJSON(FILES.VULNERABILITY_PATTERNS, data.patterns);
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
