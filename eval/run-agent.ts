import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { AuditOrchestrator, type PartialAuditResult } from '@/lib/agents/audit/orchestrator/audit-orchestrator';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import { QuotaExceededError } from '@/lib/llm';
import type { BlockchainId } from '@/lib/blockchain/config';
import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import type { EvalCase, EvalResult, EmptyResultReason } from './types';

const CHECKPOINT_PATH = join(__dirname, 'results', 'eval-checkpoint.json');

interface EvalCheckpoint {
  completedIds: string[];
  positives: EvalResult[];
  negatives: EvalResult[];
  quotaExhausted: boolean;
  updatedAt: string;
  suspectCount?: number;
  suspectBreakdown?: Record<string, number>;
}

/** Keywords that make an empty result suspicious (LLM likely missed real vulnerabilities) */
const HIGH_RISK_SIGNALS = [
  'getReserves', 'getAmountOut', 'getAmountsIn', 'getAmountsOut',
  'latestRoundData', 'latestAnswer', 'swap', 'mint', 'burn',
  'onlyOwner', 'onlyAdmin', 'transferOwnership',
  'call{value', 'delegatecall',
  'IUniswapV2Pair', 'IUniswapV3Pool', 'IOracle', 'ICurvePool',
  'AggregatorV3Interface',
];

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

function computeSuspectStats(cp: EvalCheckpoint): { suspectCount: number; suspectBreakdown: Record<string, number> } {
  const all = [...cp.positives, ...cp.negatives];
  const suspectCount = all.filter(r => r.suspect).length;
  const suspectBreakdown: Record<string, number> = {};
  for (const r of all) {
    if (r.emptyReason) {
      suspectBreakdown[r.emptyReason] = (suspectBreakdown[r.emptyReason] || 0) + 1;
    }
  }
  return { suspectCount, suspectBreakdown };
}

function saveCheckpoint(cp: EvalCheckpoint): void {
  const tmp = CHECKPOINT_PATH + '.tmp';
  mkdirSync(dirname(CHECKPOINT_PATH), { recursive: true });
  cp.updatedAt = new Date().toISOString();
  const suspect = computeSuspectStats(cp);
  cp.suspectCount = suspect.suspectCount;
  cp.suspectBreakdown = suspect.suspectBreakdown;
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
      detectedPatternIds: [...new Set(vulns.map(v => v.patternId as string))],
      vulnerabilities: vulns,
    };
  }
  if ('analysisResult' in result) {
    const full = result as { analysisResult: { vulnerabilities: Array<{ patternId: string }> } };
    return {
      detectedPatternIds: [...new Set(full.analysisResult.vulnerabilities.map(v => v.patternId))],
      vulnerabilities: full.analysisResult.vulnerabilities,
    };
  }
  return { detectedPatternIds: [], vulnerabilities: [] };
}

/**
 * Analyze why an evaluation result is empty and determine if it's suspicious.
 * Scans source code for high-risk signals, proxy boilerplate, and other indicators.
 */
function analyzeEmptyResult(sourceCode: string | undefined, error: string | undefined, partial: boolean | undefined): { suspect: boolean; emptyReason: EmptyResultReason } {
  if (error) {
    if (error.includes('quota') || error.includes('Quota')) {
      return { suspect: true, emptyReason: 'quota-exhausted' };
    }
    return { suspect: true, emptyReason: 'orchestrator-error' };
  }
  if (partial) {
    return { suspect: true, emptyReason: 'quota-exhausted' };
  }

  if (!sourceCode) {
    return { suspect: true, emptyReason: 'no-external-calls' };
  }

  // Proxy contract detection: short delegatecall-based boilerplate
  const proxyPatterns = ['delegatecall', 'implementation', 'DELEGATECALL'];
  const proxyHits = proxyPatterns.filter(p => sourceCode.includes(p));
  const totalLines = sourceCode.split('\n').length;
  if (proxyHits.length >= 2 && totalLines < 80) {
    return { suspect: true, emptyReason: 'proxy-contract' };
  }

  // Check for I<Interface>(nonLiteral) patterns — runtime-var interface calls
  const runtimeVarPattern = /\bI[A-Z][a-zA-Z]*\s*\(\s*(?!0x[a-fA-F0-9]{40})[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)/;
  if (runtimeVarPattern.test(sourceCode)) {
    return { suspect: true, emptyReason: 'runtime-var-calls-only' };
  }

  // Count high-risk signals
  let signalCount = 0;
  for (const signal of HIGH_RISK_SIGNALS) {
    if (sourceCode.includes(signal)) {
      signalCount++;
    }
  }

  if (signalCount >= 3) {
    return { suspect: true, emptyReason: 'high-risk-signals-3+' };
  }
  if (signalCount === 2) {
    return { suspect: true, emptyReason: 'high-risk-signals-2' };
  }

  // No external calls detected in source, and low risk profile
  return { suspect: false, emptyReason: 'genuine-clean' };
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
    const srcCode = fetchResult?.sourceCode;
    const evalPartial = 'partial' in result && result.partial;
    const suspectAnalysis = detectedPatternIds.length === 0
      ? analyzeEmptyResult(srcCode, undefined, evalPartial)
      : { suspect: false, emptyReason: undefined as EmptyResultReason | undefined };
    return {
      caseId: evalCase.caseId,
      detectedPatternIds,
      vulnerabilities,
      sourceAvailable: !!srcCode,
      partial: evalPartial,
      suspect: suspectAnalysis.suspect,
      emptyReason: suspectAnalysis.emptyReason,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    const { suspect, emptyReason } = analyzeEmptyResult(undefined, errMsg, false);
    return {
      caseId: evalCase.caseId,
      detectedPatternIds: [],
      vulnerabilities: [],
      sourceAvailable: evalCase.sourceAvailable,
      error: errMsg,
      suspect,
      emptyReason,
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
        suspect: true,
        emptyReason: 'quota-exhausted',
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
          suspect: true,
          emptyReason: 'quota-exhausted',
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
          suspect: true,
          emptyReason: 'orchestrator-error',
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
        suspect: true,
        emptyReason: 'quota-exhausted',
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
          suspect: true,
          emptyReason: 'quota-exhausted',
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
          suspect: true,
          emptyReason: 'orchestrator-error',
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

// === CLI entry point ===
const isCLI = process.argv[1]?.replace(/\\/g, '/').includes('run-agent');
if (require.main === module || isCLI) {
  const args = process.argv.slice(2);
  const singleIdx = args.indexOf('--single');

  if (singleIdx !== -1 && args[singleIdx + 1]) {
    runSingleAndSave(args[singleIdx + 1]).catch(console.error);
  } else {
    runAllCases().then(({ positives, negatives }) => {
      console.log(`\nDone: ${positives.length} positive, ${negatives.length} negative`);
    }).catch(console.error);
  }
}

async function runSingleAndSave(caseId: string): Promise<void> {
  const positives = loadPositiveCases();
  const negatives = loadNegativeCases();
  const allCases = [...positives, ...negatives];

  const evalCase = allCases.find(c => c.caseId === caseId);
  if (!evalCase) {
    console.error(`Case "${caseId}" not found. Available: ${allCases.map(c => c.caseId).join(', ')}`);
    process.exit(1);
  }

  const checkpoint = loadCheckpoint();
  const completedIds = new Set(checkpoint?.completedIds || []);
  const posResults = checkpoint?.positives || [];
  const negResults = checkpoint?.negatives || [];
  const quotaExhausted = checkpoint?.quotaExhausted || false;

  if (completedIds.has(caseId)) {
    console.log(`Case "${caseId}" already completed. Skipping.`);
    return;
  }

  if (quotaExhausted) {
    console.log('Previous run quota exhausted. Re-run without --single to handle quota cases.');
    return;
  }

  const isPositive = positives.some(c => c.caseId === caseId);
  console.log(`Running single case [${caseId}] (${isPositive ? 'positive' : 'negative'})...`);
  const result = await runSingleCase(evalCase);

  if (isPositive) {
    posResults.push(result);
  } else {
    negResults.push(result);
  }
  completedIds.add(caseId);

  saveCheckpoint({
    completedIds: Array.from(completedIds),
    positives: posResults,
    negatives: negResults,
    quotaExhausted: !!result.partial,
    updatedAt: new Date().toISOString(),
  });

  const status = result.error ? `ERROR: ${result.error}` : result.detectedPatternIds.join(', ') || 'none';
  console.log(`\n✓ [${caseId}] detected: ${status} (${result.durationMs}ms)`);
  if (result.partial) {
    console.log('⚠ Partial — quota exhausted. Run without --single to continue remaining cases.');
  }
}
