import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { AuditOrchestrator, type PartialAuditResult } from '@/lib/agents/audit/orchestrator/audit-orchestrator';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import { QuotaExceededError } from '@/lib/llm';
import type { BlockchainId } from '@/lib/blockchain/config';
import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import type { EvalCase, EvalResult } from './types';

const CHECKPOINT_PATH = join(__dirname, 'results', 'eval-checkpoint.json');

interface EvalCheckpoint {
  completedIds: string[];
  positives: EvalResult[];
  negatives: EvalResult[];
  quotaExhausted: boolean;
  updatedAt: string;
}

function loadCheckpoint(): EvalCheckpoint | null {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  try {
    const raw = readFileSync(CHECKPOINT_PATH, 'utf-8');
    return JSON.parse(raw) as EvalCheckpoint;
  } catch {
    console.warn('Eval checkpoint file corrupted, starting fresh');
    return null;
  }
}

function saveCheckpoint(cp: EvalCheckpoint): void {
  const tmp = CHECKPOINT_PATH + '.tmp';
  mkdirSync(dirname(CHECKPOINT_PATH), { recursive: true });
  cp.updatedAt = new Date().toISOString();
  writeFileSync(tmp, JSON.stringify(cp, null, 2), 'utf-8');
  renameSync(tmp, CHECKPOINT_PATH);
}

function deleteCheckpoint(): void {
  try {
    if (existsSync(CHECKPOINT_PATH)) {
      renameSync(CHECKPOINT_PATH, CHECKPOINT_PATH.replace('.json', '.bak.json'));
    }
  } catch {
    // non-fatal
  }
}

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

  // Load checkpoint
  const checkpoint = loadCheckpoint();
  let completedIds: Set<string>;
  let positives: EvalResult[];
  let negatives: EvalResult[];
  let quotaExhausted: boolean;

  if (checkpoint) {
    completedIds = new Set(checkpoint.completedIds);
    positives = checkpoint.positives;
    negatives = checkpoint.negatives;
    quotaExhausted = checkpoint.quotaExhausted;
    console.log(`Checkpoint found: ${completedIds.size} cases already evaluated`);
    if (quotaExhausted) {
      console.log('  (previous run stopped due to quota exhaustion)');
    }
  } else {
    completedIds = new Set();
    positives = [];
    negatives = [];
    quotaExhausted = false;
  }

  const updateCheckpoint = () => {
    saveCheckpoint({
      completedIds: Array.from(completedIds),
      positives,
      negatives,
      quotaExhausted,
      updatedAt: new Date().toISOString(),
    });
  };

  console.log(`Running ${positiveCases.length} positive cases...`);

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

    if (completedIds.has(evalCase.caseId)) {
      console.log(`  [${evalCase.caseId}] (already completed, skipped)`);
      continue;
    }

    console.log(`  [${evalCase.caseId}] ${evalCase.blockchain} patterns: ${evalCase.expectedPatternIds.join(', ')}`);
    try {
      const result = await runSingleCase(evalCase);
      positives.push(result);
      completedIds.add(evalCase.caseId);
      updateCheckpoint();
      if (result.partial) {
        quotaExhausted = true;
        console.log(`    -> PARTIAL: ${result.detectedPatternIds.join(', ') || 'none'} (quota exhausted)`);
        break;
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
          error: `LLM quota exhausted: ${(error as Error).message}`,
          durationMs: Date.now(),
        });
        completedIds.add(evalCase.caseId);
        updateCheckpoint();
        console.log(`    -> QUOTA EXHAUSTED: stopping remaining positive cases`);
        break;
      } else {
        positives.push({
          caseId: evalCase.caseId,
          detectedPatternIds: [],
          vulnerabilities: [],
          sourceAvailable: evalCase.sourceAvailable,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now(),
        });
        completedIds.add(evalCase.caseId);
        updateCheckpoint();
        console.log(`    -> error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
  }

  console.log(`\nRunning ${negativeCases.length} negative cases...`);

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

    if (completedIds.has(evalCase.caseId)) {
      console.log(`  [${evalCase.caseId}] (already completed, skipped)`);
      continue;
    }

    console.log(`  [${evalCase.caseId}] ${evalCase.contractName}`);
    try {
      const result = await runSingleCase(evalCase);
      negatives.push(result);
      completedIds.add(evalCase.caseId);
      updateCheckpoint();
      if (result.partial) {
        quotaExhausted = true;
        console.log(`    -> PARTIAL: ${result.detectedPatternIds.length} FP (quota exhausted)`);
        break;
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
          error: `LLM quota exhausted: ${(error as Error).message}`,
          durationMs: Date.now(),
        });
        completedIds.add(evalCase.caseId);
        updateCheckpoint();
        console.log(`    -> QUOTA EXHAUSTED: stopping remaining negative cases`);
        break;
      } else {
        negatives.push({
          caseId: evalCase.caseId,
          detectedPatternIds: [],
          vulnerabilities: [],
          sourceAvailable: evalCase.sourceAvailable,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs: Date.now(),
        });
        completedIds.add(evalCase.caseId);
        updateCheckpoint();
        console.log(`    -> error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
  }

  if (quotaExhausted) {
    const posDone = positives.filter(p => !p.error || !p.error.startsWith('Skipped')).length;
    const negDone = negatives.filter(n => !n.error || !n.error.startsWith('Skipped')).length;
    console.warn(`\n⚠ LLM quota was exhausted. Checkpoint saved. Run again to resume.`);
    console.warn(`  Completed: ${posDone}/${positiveCases.length} positive, ${negDone}/${negativeCases.length} negative`);
  } else {
    // All cases completed cleanly — remove checkpoint
    deleteCheckpoint();
    const posDone = positives.filter(p => !p.error).length;
    const negDone = negatives.filter(n => !n.error).length;
    console.log(`\n✓ All ${posDone} positive and ${negDone} negative cases completed.`);
  }

  return { positives, negatives };
}
