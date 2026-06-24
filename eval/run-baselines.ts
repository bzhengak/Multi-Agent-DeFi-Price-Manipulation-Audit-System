import { LLMClient } from '@/lib/agents/core/llm-client';
import { VULNERABILITY_SYSTEM_PROMPT } from '@/lib/agents/prompts/vulnerability';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import type { BlockchainId } from '@/lib/blockchain/config';
import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import type { EvalCase, EvalResult } from './types';
import { spawn } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// === Raw LLM Baseline ===
async function runRawLlm(evalCase: EvalCase): Promise<EvalResult> {
  const startTime = Date.now();
  try {
    const fetchResult = await fetchContractWithCache(
      evalCase.victimAddress,
      evalCase.blockchain as BlockchainId,
    );

    if (!fetchResult.success || !fetchResult.sourceCode) {
      return {
        caseId: evalCase.caseId,
        detectedPatternIds: [],
        vulnerabilities: [],
        sourceAvailable: false,
        durationMs: Date.now() - startTime,
      };
    }

    const llm = new LLMClient({ maxRetries: 2, temperature: 0.1, maxTokens: 8192 });
    const userPrompt = `Analyze the following smart contract for price manipulation vulnerabilities.\n\n## Contract: ${evalCase.contractName}\n## Blockchain: ${evalCase.blockchain}\n\n## Source Code\n${fetchResult.sourceCode}\n\nPlease output the complete analysis results in the specified JSON format.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await llm.getJSON<any>(VULNERABILITY_SYSTEM_PROMPT, userPrompt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detected = (result.vulnerabilities || []).map((v: any) => v.patternId);

    return {
      caseId: evalCase.caseId,
      detectedPatternIds: detected,
      vulnerabilities: result.vulnerabilities || [],
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

// === Slither Baseline ===
const SLITHER_TO_PATTERN: Record<string, string[]> = {
  'reentrancy-eth': ['TO-03'],
  'reentrancy-no-eth': ['TO-03'],
  'reentrancy-unlimited-gas': ['TO-03'],
  'arbitrary-send-eth': ['AC-01'],
  'tx-origin': ['AC-01'],
  'unchecked-transfer': ['CR-03'],
  'unchecked-lowlevel': ['CR-03'],
  'unchecked-send': ['CR-03'],
};

async function runSlither(evalCase: EvalCase): Promise<EvalResult> {
  const startTime = Date.now();
  try {
    const fetchResult = await fetchContractWithCache(
      evalCase.victimAddress,
      evalCase.blockchain as BlockchainId,
    );

    if (!fetchResult.success || !fetchResult.sourceCode) {
      return {
        caseId: evalCase.caseId,
        detectedPatternIds: [],
        vulnerabilities: [],
        sourceAvailable: false,
        durationMs: Date.now() - startTime,
      };
    }

    const tmpDir = mkdtempSync(join(tmpdir(), 'slither-'));
    const solFile = join(tmpDir, `${evalCase.caseId}.sol`);
    writeFileSync(solFile, fetchResult.sourceCode);

    const slitherOutput = await new Promise<string>((resolve, reject) => {
      const proc = spawn('slither', [solFile, '--json', '-', '--disable-color']);
      let stdout = '';
      proc.stdout.on('data', d => (stdout += d.toString()));
      proc.on('close', () => resolve(stdout));
      proc.on('error', reject);
      setTimeout(() => proc.kill('SIGKILL'), 30_000);
    });

    const parsed = JSON.parse(slitherOutput);
    const detectors = parsed?.result?.detectors || [];

    const detected = new Set<string>();
    for (const det of detectors) {
      const patterns = SLITHER_TO_PATTERN[det.check] || [];
      patterns.forEach((p: string) => detected.add(p));
    }

    return {
      caseId: evalCase.caseId,
      detectedPatternIds: Array.from(detected),
      vulnerabilities: detectors,
      sourceAvailable: true,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      caseId: evalCase.caseId,
      detectedPatternIds: [],
      vulnerabilities: [],
      sourceAvailable: evalCase.sourceAvailable,
      error: error instanceof Error ? error.message : 'Slither failed',
      durationMs: Date.now() - startTime,
    };
  }
}

export async function runAllBaselines(): Promise<{
  rawLlm: { positives: EvalResult[]; negatives: EvalResult[] };
  slither: { positives: EvalResult[]; negatives: EvalResult[] };
}> {
  const positiveCases = loadPositiveCases();
  const negativeCases = loadNegativeCases();

  console.log('=== Raw LLM Baseline ===');
  const rawLlmPositives: EvalResult[] = [];
  for (const c of positiveCases) {
    const r = await runRawLlm(c);
    rawLlmPositives.push(r);
    console.log(`  [${c.caseId}] detected: ${r.detectedPatternIds.join(', ') || 'none'}`);
  }
  const rawLlmNegatives: EvalResult[] = [];
  for (const c of negativeCases) {
    const r = await runRawLlm(c);
    rawLlmNegatives.push(r);
  }

  console.log('\n=== Slither Baseline ===');
  const slitherPositives: EvalResult[] = [];
  for (const c of positiveCases) {
    const r = await runSlither(c);
    slitherPositives.push(r);
    console.log(`  [${c.caseId}] detected: ${r.detectedPatternIds.join(', ') || 'none'}`);
  }
  const slitherNegatives: EvalResult[] = [];
  for (const c of negativeCases) {
    const r = await runSlither(c);
    slitherNegatives.push(r);
  }

  return {
    rawLlm: { positives: rawLlmPositives, negatives: rawLlmNegatives },
    slither: { positives: slitherPositives, negatives: slitherNegatives },
  };
}
