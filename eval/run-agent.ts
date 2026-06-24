import { AuditOrchestrator } from '@/lib/agents/audit/orchestrator/audit-orchestrator';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import type { BlockchainId } from '@/lib/blockchain/config';
import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import type { EvalCase, EvalResult } from './types';

async function runSingleCase(evalCase: EvalCase): Promise<EvalResult> {
  const startTime = Date.now();

  try {
    const fetchResult = await fetchContractWithCache(
      evalCase.victimAddress,
      evalCase.blockchain as BlockchainId,
    );

    if (!fetchResult.success || !fetchResult.sourceCode) {
      const orchestrator = new AuditOrchestrator();
      const result = await orchestrator.runFromContext(
        evalCase.caseId,
        evalCase.caseNote,
        evalCase.expectedPatternIds.join(', '),
        evalCase.blockchain,
        evalCase.victimAddress,
      );
      const detected = result.analysisResult.vulnerabilities.map(v => v.patternId);
      return {
        caseId: evalCase.caseId,
        detectedPatternIds: detected,
        vulnerabilities: result.analysisResult.vulnerabilities,
        sourceAvailable: false,
        durationMs: Date.now() - startTime,
      };
    }

    const orchestrator = new AuditOrchestrator();
    const result = await orchestrator.run(
      fetchResult.sourceCode,
      fetchResult.contractName || evalCase.contractName,
      evalCase.blockchain,
      evalCase.victimAddress,
    );
    const detected = result.analysisResult.vulnerabilities.map(v => v.patternId);
    return {
      caseId: evalCase.caseId,
      detectedPatternIds: detected,
      vulnerabilities: result.analysisResult.vulnerabilities,
      sourceAvailable: true,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      caseId: evalCase.caseId,
      detectedPatternIds: [],
      vulnerabilities: [],
      sourceAvailable: evalCase.sourceAvailable,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

export async function runAllCases(): Promise<{ positives: EvalResult[]; negatives: EvalResult[] }> {
  const positiveCases = loadPositiveCases();
  const negativeCases = loadNegativeCases();

  console.log(`Running ${positiveCases.length} positive cases...`);
  const positives: EvalResult[] = [];
  for (const evalCase of positiveCases) {
    console.log(`  [${evalCase.caseId}] ${evalCase.blockchain} patterns: ${evalCase.expectedPatternIds.join(', ')}`);
    const result = await runSingleCase(evalCase);
    positives.push(result);
    console.log(`    -> detected: ${result.detectedPatternIds.join(', ') || 'none'} (${result.durationMs}ms)`);
  }

  console.log(`\nRunning ${negativeCases.length} negative cases...`);
  const negatives: EvalResult[] = [];
  for (const evalCase of negativeCases) {
    console.log(`  [${evalCase.caseId}] ${evalCase.contractName}`);
    const result = await runSingleCase(evalCase);
    negatives.push(result);
    console.log(`    -> FP: ${result.detectedPatternIds.length} (${result.durationMs}ms)`);
  }

  return { positives, negatives };
}
