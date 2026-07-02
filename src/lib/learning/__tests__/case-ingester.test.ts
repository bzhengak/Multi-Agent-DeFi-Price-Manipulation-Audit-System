import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ingestAuditResult } from '../case-ingester';
import { loadHistoryCases } from '@/lib/storage/data';
import { writeFileSync, readFileSync, copyFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const HISTORY_PATH = join(process.cwd(), 'data', 'history.json');
const BACKUP_PATH = join(process.cwd(), 'data', 'history.json.bak');
let originalContent: string;

function uniqueAddress(): string {
  const hex = Date.now().toString(16) + Math.random().toString(16).slice(2, 18);
  return ('0x' + hex.padStart(40, '0').slice(0, 40)).toLowerCase();
}

beforeEach(() => {
  if (existsSync(HISTORY_PATH)) {
    originalContent = readFileSync(HISTORY_PATH, 'utf-8');
    copyFileSync(HISTORY_PATH, BACKUP_PATH);
  }
});

afterEach(() => {
  if (existsSync(BACKUP_PATH)) {
    writeFileSync(HISTORY_PATH, originalContent, 'utf-8');
    unlinkSync(BACKUP_PATH);
  }
});

describe('CaseIngester', () => {
  it('ingests a new case into history.json', async () => {
    const before = await loadHistoryCases();
    const beforeCount = before.cases.length;

    const result = await ingestAuditResult({
      contractName: 'TestContract',
      blockchain: 'ethereum',
      address: uniqueAddress(),
      caseNote: 'Test case for ingestion',
      analysisResult: {
        summary: { contractName: 'TestContract', totalVulnerabilities: 1, riskLevel: 'High', analysisTime: '2026-06-28' },
        vulnerabilities: [{
          id: 'v1',
          patternId: 'OD-01',
          patternName: 'Spot Price Directly Used',
          severity: 'High',
          title: 'Oracle manipulation',
          description: 'getReserves() used directly for pricing without TWAP',
          location: { fileName: 'test.sol', lineStart: 10, lineEnd: 15, functionName: 'getPrice', codeSnippet: 'return reserve0 * reserve1;' },
          attackVector: 'flash loan',
          impact: 'fund loss',
          matchedCases: [],
          recommendation: 'use TWAP',
        }],
        codeQuality: { overallScore: 'C', issues: ['no TWAP'] },
        recommendations: ['use TWAP oracle'],
      },
      classification: {
        type: 'dex_amm',
        manipulationTarget: 'oracle',
        confidence: 0.8,
        indicators: [],
        priorityVulnerabilities: ['OD-01'],
        criticalFunctions: ['getPrice'],
        riskProfile: { manipulationRisk: 'high', flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' },
      },
      source: 'auto-audit',
    });

    expect(result.success).toBe(true);
    expect(result.caseId).toMatch(/^CASE-\d{3}$/);

    const after = await loadHistoryCases();
    expect(after.cases.length).toBe(beforeCount + 1);

    const newCase = after.cases.find(c => c.id === result.caseId);
    expect(newCase).toBeDefined();
    expect(newCase!.pattern_ids).toContain('OD-01');
  });

  it('deduplicates by address on re-audit', async () => {
    const dupAddress = uniqueAddress();
    const result1 = await ingestAuditResult({
      contractName: 'DupContract',
      blockchain: 'ethereum',
      address: dupAddress,
      caseNote: 'First audit',
      analysisResult: {
        summary: { contractName: 'DupContract', totalVulnerabilities: 1, riskLevel: 'High', analysisTime: '2026-06-28' },
        vulnerabilities: [{
          id: 'v1', patternId: 'OD-01', patternName: 'Spot Price', severity: 'High',
          title: 'Test', description: 'Test', location: { fileName: 't.sol', lineStart: 1, lineEnd: 2, functionName: 'f', codeSnippet: '' },
          attackVector: '', impact: '', matchedCases: [], recommendation: '',
        }],
        codeQuality: { overallScore: 'B', issues: [] },
        recommendations: [],
      },
      classification: {
        type: 'dex_amm', manipulationTarget: 'oracle', confidence: 0.8, indicators: [],
        priorityVulnerabilities: ['OD-01'], criticalFunctions: [], riskProfile: { manipulationRisk: 'high', flashloanExposure: false, oracleDependency: true, liquiditySensitivity: 'medium' },
      },
      source: 'auto-audit',
    });

    const before2 = await loadHistoryCases();

    const result2 = await ingestAuditResult({
      contractName: 'DupContract',
      blockchain: 'ethereum',
      address: dupAddress,
      caseNote: 'Second audit',
      analysisResult: {
        summary: { contractName: 'DupContract', totalVulnerabilities: 1, riskLevel: 'Medium', analysisTime: '2026-06-29' },
        vulnerabilities: [{
          id: 'v2', patternId: 'LR-01', patternName: 'Instant Reserve', severity: 'Medium',
          title: 'Test2', description: 'Test2', location: { fileName: 't.sol', lineStart: 3, lineEnd: 4, functionName: 'g', codeSnippet: '' },
          attackVector: '', impact: '', matchedCases: [], recommendation: '',
        }],
        codeQuality: { overallScore: 'B', issues: [] },
        recommendations: [],
      },
      classification: {
        type: 'dex_amm', manipulationTarget: 'oracle', confidence: 0.8, indicators: [],
        priorityVulnerabilities: ['OD-01'], criticalFunctions: [], riskProfile: { manipulationRisk: 'high', flashloanExposure: false, oracleDependency: true, liquiditySensitivity: 'medium' },
      },
      source: 'auto-audit',
    });

    const after2 = await loadHistoryCases();
    expect(after2.cases.length).toBe(before2.cases.length);
    const updated = after2.cases.find(c => c.id === result1.caseId);
    expect(updated).toBeDefined();
    expect(updated!.pattern_ids).toContain('OD-01');
    expect(updated!.pattern_ids).toContain('LR-01');
  });

  it('handles empty vulnerabilities gracefully', async () => {
    const result = await ingestAuditResult({
      contractName: 'SafeContract',
      blockchain: 'ethereum',
      address: uniqueAddress(),
      caseNote: 'No vulns found',
      analysisResult: {
        summary: { contractName: 'SafeContract', totalVulnerabilities: 0, riskLevel: 'Low', analysisTime: '2026-06-28' },
        vulnerabilities: [],
        codeQuality: { overallScore: 'A', issues: [] },
        recommendations: [],
      },
      classification: {
        type: 'unknown', manipulationTarget: 'oracle', confidence: 0.3, indicators: [],
        priorityVulnerabilities: [], criticalFunctions: [],
        riskProfile: { manipulationRisk: 'low', flashloanExposure: false, oracleDependency: false, liquiditySensitivity: 'low' },
      },
      source: 'auto-audit',
    });

    expect(result.success).toBe(true);
  });
});
