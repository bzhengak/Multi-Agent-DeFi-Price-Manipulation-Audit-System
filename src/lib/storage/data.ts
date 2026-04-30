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
  name: string;
  description: string;
  indicators: string[];
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  mitigation: string;
}

export interface VulnerabilityPatternsData {
  patterns: VulnerabilityPattern[];
  lastUpdated: string;
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
  /** Where the source code came from */
  sourceOrigin?: 'etherscan' | 'sourcify' | 'heimdall' | 'file' | 'demo' | 'unavailable' | 'context';
  /** Whether the source is verified original or decompiled */
  sourceType?: 'verified' | 'decompiled' | 'unavailable' | 'context';
  /** The original case ID if this analysis was from a case library audit */
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

/**
 * Load the history cases data from storage.
 * Returns a default empty structure if no data exists yet.
 */
export async function loadHistoryCases(): Promise<HistoryCasesData> {
  const data = await loadJSON<HistoryCasesData>(FILES.HISTORY_CASES);
  return data || { cases: [], lastUpdated: new Date().toISOString() };
}

/**
 * Save the history cases data to storage, updating the lastUpdated timestamp.
 */
export async function saveHistoryCases(data: HistoryCasesData): Promise<void> {
  data.lastUpdated = new Date().toISOString();
  await saveJSON(FILES.HISTORY_CASES, data);
}

// ─── Vulnerability Patterns ─────────────────────────────────────────────────

/**
 * Load the vulnerability patterns data from storage.
 * Returns a default empty structure if no data exists yet.
 */
export async function loadVulnerabilityPatterns(): Promise<VulnerabilityPatternsData> {
  const data = await loadJSON<VulnerabilityPatternsData>(FILES.VULNERABILITY_PATTERNS);
  return data || { patterns: [], lastUpdated: new Date().toISOString() };
}

/**
 * Save the vulnerability patterns data to storage, updating the lastUpdated timestamp.
 */
export async function saveVulnerabilityPatterns(data: VulnerabilityPatternsData): Promise<void> {
  data.lastUpdated = new Date().toISOString();
  await saveJSON(FILES.VULNERABILITY_PATTERNS, data);
}

// ─── Analysis History ───────────────────────────────────────────────────────

/**
 * Load the analysis history from storage.
 * Returns a default empty structure if no data exists yet.
 */
export async function loadAnalysisHistory(): Promise<AnalysisHistoryData> {
  const data = await loadJSON<AnalysisHistoryData>(FILES.ANALYSIS_HISTORY);
  return data || { records: [] };
}

/**
 * Add a new analysis record to the history.
 * The record is prepended so that the most recent analyses appear first.
 */
export async function addAnalysisRecord(record: AnalysisRecord): Promise<void> {
  const history = await loadAnalysisHistory();
  history.records.unshift(record);
  await saveJSON(FILES.ANALYSIS_HISTORY, history);
}

/**
 * Delete an analysis record by ID.
 * Also removes the associated report file from storage.
 */
export async function deleteAnalysisRecord(id: string): Promise<void> {
  const history = await loadAnalysisHistory();
  history.records = history.records.filter((r) => r.id !== id);
  await saveJSON(FILES.ANALYSIS_HISTORY, history);

  // Also delete the associated report file
  await deleteFile(`${FILES.REPORTS_DIR}${id}.json`);
}

// ─── Reports ────────────────────────────────────────────────────────────────

/**
 * Save an analysis report to storage.
 * @param id - The report identifier (e.g., analysis record ID)
 * @param report - The report data to save
 * @returns The file path where the report was saved
 */
export async function saveReport(id: string, report: unknown): Promise<string> {
  return await saveJSON(`${FILES.REPORTS_DIR}${id}.json`, report);
}

/**
 * Load a report from storage by its ID.
 * @param id - The report identifier
 * @returns The report data, or null if not found
 */
export async function loadReport(id: string): Promise<unknown | null> {
  return await loadJSON(`${FILES.REPORTS_DIR}${id}.json`);
}
