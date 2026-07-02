import { AuditOrchestrator, type PartialAuditResult } from '@/lib/agents/audit/orchestrator/audit-orchestrator';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import { QuotaExceededError } from '@/lib/llm';
import type { BlockchainId } from '@/lib/blockchain/config';
import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import type { EvalCase, EvalResult } from './types';

function extractVulnerabilities(result: Awaited<ReturnType<AuditOrchestrator['run']>>): { detectedPatternIds: string[]; vulnerabilities: unknown[] } {
  if ('partial' in result && result.partial) {
    const partial = result as PartialAuditResult;
    const vulns = partial.analysisResult?.vulnerabilities || [];
    return {
      detectedPatternIds: vulns.map(v => v.patternId as string),
      vulnerabilities: vulns,
    };
  }
  if ('analysisResult' in result) {
    const full = result as { analysisResult: { vulnerabilities: Array<{ patternId: string }> } };
    return {
      detectedPatternIds: full.analysisResult.vulnerabilities.map(v => v.patternId),
      vulnerabilities: full.analysisResult.vulnerabilities,
    };
  }
  return { detectedPatternIds: [], vulnerabilities: [] };
}

async function runSingleCase(evalCase: EvalCase): Promise<EvalResult> {
  const startTime = Date.now();

  try {
    let result: Awaited<ReturnType<AuditOrchestrator['run']>>;

    const fetchResult = await fetchContractWithCache(
      evalCase.victimAddress,
      evalCase.blockchain as BlockchainId,
    );

    if (!fetchResult.success || !fetchResult.sourceCode) {
      const orchestrator = new AuditOrchestrator();
      result = await orchestrator.runFromContext(
        evalCase.caseId,
        evalCase.caseNote,
        evalCase.expectedPatternIds.join(', '),
        evalCase.blockchain,
        evalCase.victimAddress,
      );
    } else {
      const orchestrator = new AuditOrchestrator();
      result = await orchestrator.run(
        fetchResult.sourceCode,
        fetchResult.contractName || evalCase.contractName,
        evalCase.blockchain,
        evalCase.victimAddress,
      );
    }

    const { detectedPatternIds, vulnerabilities } = extractVulnerabilities(result);
    return {
      caseId: evalCase.caseId,
      detectedPatternIds,
      vulnerabilities,
      sourceAvailable: !!fetchResult?.sourceCode,
      partial: 'partial' in result && result.partial,
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
  let quotaExhausted = false;

  for (const evalCase of positiveCases) {
    if (quotaExhausted) {
      positives.push({
        caseId: evalCase.caseId,
        detectedPatternIds: [],
        vulnerabilities: [],
        sourceAvailable: evalCase.sourceAvailable,
        error: 'Skipped: LLM quota exhausted in previous case',
        durationMs: 0,
      });
      continue;
    }

    console.log(`  [${evalCase.caseId}] ${evalCase.blockchain} patterns: ${evalCase.expectedPatternIds.join(', ')}`);
    try {
      const result = await runSingleCase(evalCase);
      positives.push(result);
      if (result.partial) {
        quotaExhausted = true;
        console.log(`    -> PARTIAL: ${result.detectedPatternIds.join(', ') || 'none'} (quota exhausted)`);
      } else {
        console.log(`    -> detected: ${result.detectedPatternIds.join(', ') || 'none'} (${result.durationMs}ms)`);
      }
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        quotaExhausted = true;
        positives.push({
          caseId: evalCase.caseId,
          detectedPatternIds: [],
          vulnerabilities: [],
          sourceAvailable: evalCase.sourceAvailable,
          error: `LLM quota exhausted: ${error.message}`,
          durationMs: Date.now(),
        });
        console.log(`    -> QUOTA EXHAUSTED: stopping remaining positive cases`);
      } else {
        positives.push({
          caseId: evalCase.caseId,
          detectedPatternIds: [],
          vulnerabilities: [],
          sourceAvailable: evalCase.sourceAvailable,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now(),
        });
        console.log(`    -> error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
  }

  console.log(`\nRunning ${negativeCases.length} negative cases...`);
  const negatives: EvalResult[] = [];

  for (const evalCase of negativeCases) {
    if (quotaExhausted) {
      negatives.push({
        caseId: evalCase.caseId,
        detectedPatternIds: [],
        vulnerabilities: [],
        sourceAvailable: evalCase.sourceAvailable,
        error: 'Skipped: LLM quota exhausted in previous case',
        durationMs: 0,
      });
      continue;
    }

    console.log(`  [${evalCase.caseId}] ${evalCase.contractName}`);
    try {
      const result = await runSingleCase(evalCase);
      negatives.push(result);
      if (result.partial) {
        quotaExhausted = true;
        console.log(`    -> PARTIAL: ${result.detectedPatternIds.length} FP (quota exhausted)`);
      } else {
        console.log(`    -> FP: ${result.detectedPatternIds.length} (${result.durationMs}ms)`);
      }
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        quotaExhausted = true;
        negatives.push({
          caseId: evalCase.caseId,
          detectedPatternIds: [],
          vulnerabilities: [],
          sourceAvailable: evalCase.sourceAvailable,
          error: `LLM quota exhausted: ${error.message}`,
          durationMs: Date.now(),
        });
        console.log(`    -> QUOTA EXHAUSTED: stopping remaining negative cases`);
      } else {
        negatives.push({
          caseId: evalCase.caseId,
          detectedPatternIds: [],
          vulnerabilities: [],
          sourceAvailable: evalCase.sourceAvailable,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now(),
        });
        console.log(`    -> error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
  }

  if (quotaExhausted) {
    console.warn(`\n⚠ LLM quota was exhausted. ${positives.filter(p => !p.error).length}/${positiveCases.length} positive and ${negatives.filter(n => !n.error).length}/${negativeCases.length} negative cases completed.`);
  }

  return { positives, negatives };
}
