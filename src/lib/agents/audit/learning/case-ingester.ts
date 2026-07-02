import { loadHistoryCases, saveHistoryCases } from '@/lib/storage/data';
import { MemorySystem } from '@/lib/agents/core/memory/memory';
import type { AuditResult } from '../orchestrator/audit-orchestrator';

export interface IngestOptions {
  pocResult?: {
    generated: boolean;
    compiled: boolean;
    passed: boolean;
  };
  confidenceThreshold?: number;
}

export async function ingestAuditResult(
  result: AuditResult,
  blockchain: string,
  address: string | undefined,
  options: IngestOptions = {},
): Promise<{ ingested: boolean; tier: string; reason: string }> {
  const { pocResult, confidenceThreshold = 0.8 } = options;

  // Tier 1: PoC 验证学习
  if (pocResult) {
    if (!pocResult.generated || !pocResult.compiled) {
      return { ingested: false, tier: 'poc', reason: 'PoC not generated or not compiled' };
    }
    if (pocResult.passed) {
      await ingestToHistory(result, blockchain, address, {
        verified: 'poc-pass',
        importance: 0.8,
      });
      await ingestToMemory(result, 'episodic', 0.8, { verified: 'poc-pass' });
      return { ingested: true, tier: 'poc', reason: 'PoC passed, ingested as verified' };
    } else {
      return { ingested: false, tier: 'poc', reason: 'PoC failed, not ingested' };
    }
  }

  // Tier 2: 自主学习
  const vulns = result.analysisResult.vulnerabilities || [];
  const calibratedVulns = result.calibratedResult.vulnerabilities || [];
  const highConfidenceVulns = vulns.filter(v => {
    const calibrated = calibratedVulns.find(cv => cv.vulnerability.id === v.id);
    return calibrated && calibrated.calibratedConfidence >= confidenceThreshold;
  });

  if (highConfidenceVulns.length === 0) {
    return { ingested: false, tier: 'autonomous', reason: `No vulnerabilities above confidence threshold ${confidenceThreshold}` };
  }

  const filteredResult: AuditResult = {
    ...result,
    analysisResult: {
      ...result.analysisResult,
      vulnerabilities: highConfidenceVulns,
      summary: {
        ...result.analysisResult.summary,
        totalVulnerabilities: highConfidenceVulns.length,
      },
    },
  };

  await ingestToHistory(filteredResult, blockchain, address, {
    verified: false,
    importance: 0.3,
  });
  await ingestToMemory(filteredResult, 'episodic', 0.3, { verified: false });

  return {
    ingested: true,
    tier: 'autonomous',
    reason: `${highConfidenceVulns.length} high-confidence vulnerabilities ingested (unverified)`,
  };
}

async function ingestToHistory(
  result: AuditResult,
  blockchain: string,
  address: string | undefined,
  meta: { verified: boolean | string; importance: number },
): Promise<void> {
  const data = await loadHistoryCases();

  if (address) {
    const existing = data.cases.find(c =>
      c.victim_contract_address?.toLowerCase() === address.toLowerCase() &&
      c.blockchain_platform === blockchain,
    );
    if (existing) {
      const newPatternIds = result.analysisResult.vulnerabilities.map(v => v.patternId);
      existing.pattern_ids = Array.from(new Set([...(existing.pattern_ids || []), ...newPatternIds]));
      existing.note = `${existing.note} | Re-audited ${new Date().toISOString().split('T')[0]}: ${result.analysisResult.summary.riskLevel}`;
      await saveHistoryCases(data);
      return;
    }
  }

  const patternIds = result.analysisResult.vulnerabilities.map(v => v.patternId);
  const caseId = `LEARN-${Date.now().toString(36)}`;

  data.cases.push({
    id: caseId,
    time: new Date().toISOString().split('T')[0],
    data_resource: `learning-auto: verified=${meta.verified}`,
    blockchain_platform: blockchain,
    attack_transaction: '',
    attack_contract_address: address || '',
    victim_contract_address: address || '',
    note: `Auto-ingested from audit (${meta.verified === 'poc-pass' ? 'PoC verified' : 'unverified'}): ${result.analysisResult.summary.riskLevel} (${patternIds.length} patterns)`,
    vulnerability_pattern: result.analysisResult.vulnerabilities.map(v => v.patternName).join('; ') || blockchain,
    pattern_ids: patternIds,
  });

  await saveHistoryCases(data);
}

async function ingestToMemory(
  result: AuditResult,
  type: 'episodic' | 'semantic',
  importance: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const memory = new MemorySystem();
    await memory.init();

    const patternIds = result.analysisResult.vulnerabilities.map(v => v.patternId);
    const content = `Contract analysis: ${result.analysisResult.summary.contractName}. Patterns: ${patternIds.join(', ')}. Risk: ${result.analysisResult.summary.riskLevel}. Total vulns: ${result.analysisResult.vulnerabilities.length}.`;

    await memory.remember(content, type, importance, {
      ...metadata,
      patterns: patternIds,
      riskLevel: result.analysisResult.summary.riskLevel,
      contractName: result.analysisResult.summary.contractName,
      timestamp: Date.now(),
    });

    await memory.close();
  } catch {
    // Memory ingestion failure is non-fatal
  }
}
