import { loadHistoryCases, saveHistoryCases } from '@/lib/storage/data';
import type { VulnerabilityAnalysisResult } from '@/lib/agents/vulnerability-agent';
import type { ProtocolClassification } from '@/lib/agents/audit/protocols/types';

export interface IngestInput {
  contractName: string;
  blockchain: string;
  address?: string;
  attackTxHash?: string;
  caseNote: string;
  analysisResult: VulnerabilityAnalysisResult;
  classification: ProtocolClassification;
  source: 'auto-audit' | 'manual';
}

export interface IngestResult {
  success: boolean;
  caseId: string;
  error?: string;
}

/**
 * Layer 2: Auto-ingest audit results into history.json
 * Called after each audit completes to grow the knowledge base.
 */
export async function ingestAuditResult(input: IngestInput): Promise<IngestResult> {
  try {
    const data = await loadHistoryCases();
    const existingCount = data.cases.length;

    // Dedup: if the same address already exists, update instead of adding
    if (input.address) {
      const existing = data.cases.find(c =>
        c.victim_contract_address?.toLowerCase() === input.address?.toLowerCase() &&
        c.blockchain_platform === input.blockchain,
      );
      if (existing) {
        const newPatternIds = input.analysisResult.vulnerabilities.map(v => v.patternId);
        const existingPatterns = existing.pattern_ids || [];
        const merged = Array.from(new Set([...existingPatterns, ...newPatternIds]));
        existing.pattern_ids = merged;
        existing.note = `${existing.note} | Re-audited ${new Date().toISOString().split('T')[0]}: ${input.analysisResult.summary.riskLevel} (${newPatternIds.length} patterns)`;
        await saveHistoryCases(data);
        return { success: true, caseId: existing.id };
      }
    }

    // Generate case ID: CASE-XXX
    const caseId = `CASE-${String(existingCount + 1).padStart(3, '0')}`;

    const patternIds = input.analysisResult.vulnerabilities.map(v => v.patternId);
    const patternNames = input.analysisResult.vulnerabilities.map(v => v.patternName);
    const vulnerabilityPattern = patternNames.length > 0
      ? patternNames.join('; ')
      : input.classification.type;

    const topVulns = input.analysisResult.vulnerabilities.slice(0, 3);
    const vulnSummary = topVulns.map(v =>
      `${v.patternId}: ${v.title}. ${v.description.substring(0, 100)}`
    ).join(' | ');
    const note = input.caseNote
      ? `${input.caseNote} | Auto-ingested: ${vulnSummary}`
      : `Auto-ingested: ${vulnSummary}`;

    data.cases.push({
      id: caseId,
      time: new Date().toISOString().split('T')[0],
      data_resource: `auto-ingested from audit at ${new Date().toISOString()}`,
      blockchain_platform: input.blockchain,
      attack_transaction: input.attackTxHash || '',
      attack_contract_address: input.address || '',
      victim_contract_address: input.address || '',
      note,
      vulnerability_pattern: vulnerabilityPattern,
      pattern_ids: patternIds,
    });

    await saveHistoryCases(data);

    return { success: true, caseId };
  } catch (error) {
    return {
      success: false,
      caseId: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
