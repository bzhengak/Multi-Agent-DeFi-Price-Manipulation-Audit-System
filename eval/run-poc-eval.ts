import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { generatePoc } from './poc/generate-poc';
import { runForgeTest } from './poc/run-forge-test';
import { downloadReferencePoc, extractPocUrl } from './poc/download-reference';
import { computePocMetrics, generatePocReport, savePocReport } from './poc/report';
import type { PocEvalCase, PocEvalResult } from './poc/types';
import { parseContractUrl, parseTxHash } from './dataset/utils';

const CHECKPOINT_PATH = join(__dirname, 'results', 'poc-checkpoint.json');

interface PocCheckpoint {
  completedCaseIds: string[];
  results: PocEvalResult[];
  quotaExhausted: boolean;
  updatedAt: string;
}

function loadCheckpoint(): PocCheckpoint | null {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  try {
    const raw = readFileSync(CHECKPOINT_PATH, 'utf-8');
    return JSON.parse(raw) as PocCheckpoint;
  } catch {
    console.warn('Checkpoint file corrupted, starting fresh');
    return null;
  }
}

function saveCheckpoint(completedCaseIds: string[], results: PocEvalResult[], quotaExhausted: boolean): void {
  const tmp = CHECKPOINT_PATH + '.tmp';
  mkdirSync(dirname(CHECKPOINT_PATH), { recursive: true });
  writeFileSync(tmp, JSON.stringify({ completedCaseIds, results, quotaExhausted, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  renameSync(tmp, CHECKPOINT_PATH);
}

function deleteCheckpoint(): void {
  try {
    if (existsSync(CHECKPOINT_PATH)) {
      const backup = CHECKPOINT_PATH.replace('.json', '.bak.json');
      renameSync(CHECKPOINT_PATH, backup);
    }
  } catch {
    // non-fatal
  }
}

function isQuotaError(error: string): boolean {
  const msg = error.toLowerCase();
  return msg.includes('quota') || msg.includes('insufficient') ||
         msg.includes('rate limit') || msg.includes('partial') ||
         msg.includes('billing') || msg.includes('payment');
}

const CHAIN_RPC: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  base: 'https://mainnet.base.org',
  opbnb: 'https://opbnb.publicnode.com',
  sei: 'https://evm-rpc.sei-apis.com',
};

async function fetchBlockNumber(txHash: string, blockchain: string): Promise<number | undefined> {
  const rpc = CHAIN_RPC[blockchain] || CHAIN_RPC.ethereum;
  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });
    const data = await response.json() as { result?: { blockNumber: string } };
    if (data?.result?.blockNumber) {
      return parseInt(data.result.blockNumber, 16);
    }
  } catch {
    // Non-fatal: run without fork if block number can't be determined
  }
  return undefined;
}

async function loadPocCases(): Promise<PocEvalCase[]> {
  const historyPath = join(process.cwd(), 'data', 'history.json');
  const historyRaw = JSON.parse(readFileSync(historyPath, 'utf-8'));
  const cases = historyRaw.cases || historyRaw;

  const pocCases: PocEvalCase[] = [];

  for (const c of cases) {
    const dataResource = c.data_resource || '';
    const pocInfo = extractPocUrl(dataResource);
    if (!pocInfo) continue;

    const parsed = parseContractUrl(c.victim_contract_address || c.attack_contract_address);
    if (!parsed) continue;

    const txHash = parseTxHash(c.attack_transaction || '');

    const entry: PocEvalCase = {
      caseId: c.id,
      blockchain: parsed.blockchain,
      victimAddress: parsed.address,
      contractName: c.id,
      attackTxHash: txHash || undefined,
      referencePocUrl: pocInfo.url,
      referencePocFileName: pocInfo.fileName,
    };

    // Fetch block number for fork (non-blocking; failure is non-fatal)
    if (txHash && CHAIN_RPC[parsed.blockchain]) {
      const blockNumber = await fetchBlockNumber(txHash, parsed.blockchain);
      if (blockNumber) {
        entry.forkBlockNumber = blockNumber;
      }
    }

    pocCases.push(entry);
  }

  return pocCases;
}

async function main() {
  console.log('=== PoC Reproduction Evaluation ===\n');

  // Load all cases
  const allCases = await loadPocCases();
  console.log(`Loaded ${allCases.length} cases with DeFiHackLabs PoC\n`);

  // Load checkpoint
  const checkpoint = loadCheckpoint();
  let completedIds: Set<string>;
  let results: PocEvalResult[];
  let quotaExhausted: boolean;

  if (checkpoint) {
    completedIds = new Set(checkpoint.completedCaseIds);
    results = checkpoint.results;
    quotaExhausted = checkpoint.quotaExhausted;
    console.log(`Checkpoint found: ${completedIds.size} cases already processed`);
    if (quotaExhausted) {
      console.log('  (previous run stopped due to quota exhaustion)\n');
    }
  } else {
    completedIds = new Set();
    results = [];
    quotaExhausted = false;
  }

  // Filter remaining cases
  const remainingCases = allCases.filter(c => !completedIds.has(c.caseId));
  if (remainingCases.length === 0) {
    console.log('All cases already processed. Regenerating report...\n');
  } else {
    console.log(`Remaining: ${remainingCases.length} cases\n`);
  }

  for (const evalCase of remainingCases) {
    if (quotaExhausted) {
      console.log(`\n--- ${evalCase.caseId} (SKIPPED: quota exhausted) ---`);
      continue;
    }

    console.log(`\n--- ${evalCase.caseId} (${evalCase.blockchain}) ---`);
    console.log(`  Contract: ${evalCase.victimAddress}`);
    console.log(`  Reference PoC: ${evalCase.referencePocFileName}`);

    console.log('  [1/3] Running system audit + generating PoC...');
    const generation = await generatePoc(evalCase);
    console.log(`    -> Generation: ${generation.generationSuccess ? 'success' : 'failed: ' + generation.error}`);

    if (!generation.generationSuccess) {
      const isQuota = isQuotaError(generation.error || '');
      results.push({
        caseId: evalCase.caseId,
        blockchain: evalCase.blockchain,
        generation,
        forgeTest: {
          caseId: evalCase.caseId,
          compiled: false,
          passed: false,
          rawOutput: '',
          error: 'PoC generation failed',
          durationMs: 0,
        },
      });
      completedIds.add(evalCase.caseId);
      saveCheckpoint(Array.from(completedIds), results, isQuota);
      if (isQuota) {
        quotaExhausted = true;
        console.log('    -> QUOTA EXHAUSTED: stopping further processing');
        break;
      }
      continue;
    }

    console.log('  [2/3] Running forge test on generated PoC...');
    const forgeTest = await runForgeTest(evalCase, generation.pocCode);
    console.log(`    -> Compiled: ${forgeTest.compiled ? 'yes' : 'no'}`);
    console.log(`    -> Passed: ${forgeTest.passed ? 'YES' : 'no'}`);

    console.log('  [3/3] Running forge test on reference PoC...');
    let referencePocResult;
    try {
      const referenceCode = await downloadReferencePoc(evalCase.referencePocUrl);
      referencePocResult = await runForgeTest(evalCase, referenceCode, true);
      console.log(`    -> Reference compiled: ${referencePocResult.compiled ? 'yes' : 'no'}`);
      console.log(`    -> Reference passed: ${referencePocResult.passed ? 'YES' : 'no'}`);
    } catch (e) {
      console.log(`    -> Reference download failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }

    results.push({
      caseId: evalCase.caseId,
      blockchain: evalCase.blockchain,
      generation,
      forgeTest,
      referencePocResult,
    });
    completedIds.add(evalCase.caseId);
    saveCheckpoint(Array.from(completedIds), results, false);
  }

  if (quotaExhausted) {
    console.log(`\n⚠ Quota exhausted after ${completedIds.size}/${allCases.length} cases. Checkpoint saved.`);
    console.log('  Run `pnpm eval:poc` again to resume from where it stopped.\n');
  }

  console.log('\n=== Generating report ===');
  // Always compute metrics on whatever results we have
  const metrics = computePocMetrics(results);
  const report = generatePocReport(results, metrics);
  savePocReport(report);

  console.log('\n=== Summary ===');
  console.log(`  Total: ${metrics.totalCases}`);
  console.log(`  Generation success: ${metrics.generationSuccess}`);
  console.log(`  Compiled: ${metrics.compiled}`);
  console.log(`  Passed: ${metrics.passed} (${(metrics.reproductionRate * 100).toFixed(1)}%)`);
  console.log(`  Reference passed: ${metrics.referencePassed}`);

  if (!quotaExhausted && completedIds.size === allCases.length) {
    deleteCheckpoint();
    console.log('  Checkpoint cleaned up (all cases completed).');
  } else {
    console.log(`  Checkpoint kept at ${CHECKPOINT_PATH} (${allCases.length - completedIds.size} cases remaining).`);
  }
}

main().catch(console.error);
