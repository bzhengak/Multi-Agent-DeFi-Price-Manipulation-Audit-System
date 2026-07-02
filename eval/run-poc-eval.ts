import { readFileSync } from 'fs';
import { join } from 'path';
import { generatePoc } from './poc/generate-poc';
import { runForgeTest } from './poc/run-forge-test';
import { downloadReferencePoc, extractPocUrl } from './poc/download-reference';
import { computePocMetrics, generatePocReport, savePocReport } from './poc/report';
import type { PocEvalCase, PocEvalResult } from './poc/types';
import { parseContractUrl, parseTxHash } from './dataset/positives';

function loadPocCases(): PocEvalCase[] {
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

    pocCases.push({
      caseId: c.id,
      blockchain: parsed.blockchain,
      victimAddress: parsed.address,
      contractName: c.id,
      attackTxHash: txHash || undefined,
      referencePocUrl: pocInfo.url,
      referencePocFileName: pocInfo.fileName,
    });
  }

  return pocCases;
}

async function main() {
  console.log('=== PoC Reproduction Evaluation ===\n');

  const cases = loadPocCases();
  console.log(`Loaded ${cases.length} cases with DeFiHackLabs PoC\n`);

  const results: PocEvalResult[] = [];

  for (const evalCase of cases) {
    console.log(`\n--- ${evalCase.caseId} (${evalCase.blockchain}) ---`);
    console.log(`  Contract: ${evalCase.victimAddress}`);
    console.log(`  Reference PoC: ${evalCase.referencePocFileName}`);

    console.log('  [1/3] Running system audit + generating PoC...');
    const generation = await generatePoc(evalCase);
    console.log(`    -> Generation: ${generation.generationSuccess ? 'success' : 'failed: ' + generation.error}`);

    if (!generation.generationSuccess) {
      results.push({
        caseId: evalCase.caseId,
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
      generation,
      forgeTest,
      referencePocResult,
    });
  }

  console.log('\n=== Generating report ===');
  const metrics = computePocMetrics(results);
  const report = generatePocReport(results, metrics);
  savePocReport(report);

  console.log('\n=== Summary ===');
  console.log(`  Total: ${metrics.totalCases}`);
  console.log(`  Generated: ${metrics.generationSuccess}`);
  console.log(`  Compiled: ${metrics.compiled}`);
  console.log(`  Passed: ${metrics.passed} (${(metrics.reproductionRate * 100).toFixed(1)}%)`);
  console.log(`  Reference passed: ${metrics.referencePassed}`);
}

main().catch(console.error);
