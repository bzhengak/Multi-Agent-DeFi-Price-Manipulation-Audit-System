import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { loadPositiveCases } from './dataset/positives';
import { generatePoc } from './poc/generate-poc';
import { runForgeTest } from './poc/run-forge-test';
import type { PocEvalCase, PocEvalResult, PocMetrics } from './poc/types';

const CHAIN_RPC: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  base: 'https://mainnet.base.org',
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
    // Non-fatal: fork at latest block
  }
  return undefined;
}

function computeMetrics(results: PocEvalResult[]): PocMetrics {
  const total = results.length;
  const generationSuccess = results.filter(r => r.generation.generationSuccess).length;
  const compiled = results.filter(r => r.forgeTest.compiled).length;
  const passed = results.filter(r => r.forgeTest.passed).length;

  return {
    totalCases: total,
    generationSuccess,
    compiled,
    passed,
    referencePassed: 0,
    reproductionRate: total > 0 ? passed / total : 0,
    compilationRate: total > 0 ? compiled / total : 0,
    referenceRate: 0,
  };
}

async function main() {
  console.log('=== Positive Cases PoC Evaluation ===\n');

  const positiveCases = loadPositiveCases();
  console.log(`Loaded ${positiveCases.length} positive cases\n`);

  const results: PocEvalResult[] = [];

  for (const c of positiveCases) {
    console.log(`\n--- ${c.caseId} (${c.blockchain}) ---`);
    console.log(`  Contract: ${c.contractName} at ${c.victimAddress}`);
    console.log(`  Expected: ${c.expectedPatternIds.join(', ')}`);

    let forkBlockNumber: number | undefined;
    if (c.attackTxHash) {
      forkBlockNumber = await fetchBlockNumber(c.attackTxHash, c.blockchain);
      if (forkBlockNumber) {
        console.log(`  Fork block: ${forkBlockNumber}`);
      }
    }
    if (!forkBlockNumber) {
      console.log(`  Fork block: latest (no tx hash configured)`);
    }

    const pocCase: PocEvalCase = {
      caseId: c.caseId,
      blockchain: c.blockchain,
      victimAddress: c.victimAddress,
      contractName: c.contractName,
      sourceCode: c.sourceCode,
      attackTxHash: c.attackTxHash,
      forkBlockNumber,
      referencePocUrl: '',
      referencePocFileName: '',
    };

    console.log('  [1/2] Running system audit + generating PoC...');
    const generation = await generatePoc(pocCase);
    console.log(`    -> Generation: ${generation.generationSuccess ? '✅ success' : '❌ ' + (generation.error || 'failed')}`);

    if (!generation.generationSuccess) {
      results.push({
        caseId: c.caseId,
        blockchain: c.blockchain,
        generation,
        forgeTest: {
          caseId: c.caseId,
          compiled: false,
          passed: false,
          rawOutput: '',
          error: 'PoC generation failed',
          durationMs: 0,
        },
      });
      continue;
    }

    console.log('  [2/2] Running forge test on generated PoC...');
    const forgeTest = await runForgeTest(pocCase, generation.pocCode);
    console.log(`    -> Compiled: ${forgeTest.compiled ? '✅' : '❌'}`);
    console.log(`    -> Passed: ${forgeTest.passed ? '✅ PASS' : '❌ FAIL'}`);
    if (forgeTest.error) {
      console.log(`    -> Error: ${forgeTest.error.substring(0, 200)}`);
    }

    results.push({
      caseId: c.caseId,
      blockchain: c.blockchain,
      generation,
      forgeTest,
    });
  }

  // Report
  const metrics = computeMetrics(results);
  const report = generateReport(results, metrics);
  console.log(`\n${report}`);

  const outDir = join(process.cwd(), 'eval', 'results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'positive-poc-results.json'), JSON.stringify({ results, metrics }, null, 2), 'utf-8');
  console.log(`\nResults saved to eval/results/positive-poc-results.json`);
}

function generateReport(results: PocEvalResult[], metrics: PocMetrics): string {
  const lines: string[] = [];

  lines.push('\n=== PoC Evaluation Results (10 Positive Cases) ===\n');
  lines.push(`| # | Case ID | Blockchain | Expected | Generated | Compiled | Forge Test |`);
  lines.push(`|---|---------|------------|----------|:---------:|:--------:|:----------:|`);

  for (const r of results) {
    const gen = r.generation.generationSuccess ? '✅' : '❌';
    const comp = r.forgeTest.compiled ? '✅' : '❌';
    const passed = r.forgeTest.passed ? '✅' : '❌';
    lines.push(`| ${results.indexOf(r) + 1} | ${r.caseId} | ${r.blockchain} | — | ${gen} | ${comp} | ${passed} |`);
  }

  lines.push('');
  lines.push(`### Summary`);
  lines.push(`- Total: ${metrics.totalCases}`);
  lines.push(`- PoC Generated: ${metrics.generationSuccess}/${metrics.totalCases} (${(metrics.generationSuccess / metrics.totalCases * 100).toFixed(1)}%)`);
  lines.push(`- Compiled: ${metrics.compiled}/${metrics.totalCases} (${(metrics.compilationRate * 100).toFixed(1)}%)`);
  lines.push(`- **Forge Test Passed: ${metrics.passed}/${metrics.totalCases} (${(metrics.reproductionRate * 100).toFixed(1)}%)**`);

  return lines.join('\n');
}

main().catch(console.error);
