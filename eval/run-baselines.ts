import { LLMClient } from '@/lib/agents/core/llm-client';
import { VULNERABILITY_SYSTEM_PROMPT } from '@/lib/agents/prompts/vulnerability';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import type { BlockchainId } from '@/lib/blockchain/config';
import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import type { EvalCase, EvalResult } from './types';
import { spawn, type ChildProcess } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

const BASELINE_CACHE_PATH = join(__dirname, 'results', 'baseline-results.json');

// === Raw LLM Baseline ===
export async function runRawLlm(evalCase: EvalCase): Promise<EvalResult> {
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

    const llm = new LLMClient({ maxRetries: 2, temperature: 0.1, maxTokens: 65536 });
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

/** Map pragma version string to the nearest installed solc version */
const INSTALLED_VERSIONS = [
  '0.8.35', '0.8.27', '0.8.25', '0.8.22', '0.8.19',
  '0.8.0', '0.7.6', '0.6.12', '0.5.17', '0.4.24',
];

function detectSolcVersion(sourceCode: string): string {
  const match = sourceCode.match(/pragma\s+solidity\s+(?:\^|>=|~)?\s*(\d+\.\d+)(?:\.\d+)?/);
  if (!match) return '0.8.35';
  const reqVer = match[1]; // e.g. "0.8"
  // Pick the highest installed version that satisfies the pragma
  for (const v of INSTALLED_VERSIONS) {
    if (v.startsWith(reqVer + '.') || v.startsWith(reqVer)) {
      return v;
    }
  }
  return '0.8.35';
}

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

export async function runSlither(evalCase: EvalCase): Promise<EvalResult> {
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
    const jsonOut = join(tmpDir, 'slither-out.json');

    // Detect the best solc version from pragma and set env var
    const solcVersion = detectSolcVersion(fetchResult.sourceCode);
    const env = { ...process.env, SOLC_VERSION: solcVersion };

    let closeCode: number | null = null;
    let proc: ChildProcess | null = null;
    await new Promise<void>((resolve, reject) => {
      proc = spawn('python', ['-m', 'slither', solFile, '--json', jsonOut, '--disable-color'], { shell: true, env });
      let stderr = '';
      proc.stderr.on('data', d => (stderr += d.toString()));
      const timer = setTimeout(() => {
        proc!.kill('SIGKILL');
        proc!.kill('SIGTERM');
        reject(new Error('Slither timed out (60s)'));
      }, 60_000);
      proc.on('close', (code) => {
        clearTimeout(timer);
        closeCode = code;
        // Windows: Slither may return exit code -1 (4294967295 unsigned)
        // even when analysis succeeds. Always attempt to read JSON output.
        resolve();
      });
      proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    });

    let detectors: any[] = [];
    try {
      if (!existsSync(jsonOut)) {
        throw new Error(`JSON output missing (exit code ${closeCode})`);
      }
      const raw = readFileSync(jsonOut, 'utf-8');
      const parsed = JSON.parse(raw);
      detectors = parsed?.results?.detectors || parsed?.result?.detectors || [];
    } catch (e) {
      if (closeCode !== 0 && closeCode !== null) {
        throw new Error(`Slither exited with code ${closeCode} and no usable output: ${e instanceof Error ? e.message : 'unknown'}`);
      }
      // If exit code was 0 or indeterminate but JSON is missing, return empty
    }

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

export async function runAllBaselines(useCache = true): Promise<{
  rawLlm: { positives: EvalResult[]; negatives: EvalResult[] };
  slither: { positives: EvalResult[]; negatives: EvalResult[] };
}> {
  if (useCache && existsSync(BASELINE_CACHE_PATH)) {
    console.log('=== Loading cached baselines ===');
    const cached = JSON.parse(readFileSync(BASELINE_CACHE_PATH, 'utf-8'));
    console.log('  Cached baselines loaded.');
    return cached;
  }

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

  const result = {
    rawLlm: { positives: rawLlmPositives, negatives: rawLlmNegatives },
    slither: { positives: slitherPositives, negatives: slitherNegatives },
  };

  mkdirSync(dirname(BASELINE_CACHE_PATH), { recursive: true });
  const tmp = BASELINE_CACHE_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(result, null, 2), 'utf-8');
  renameSync(tmp, BASELINE_CACHE_PATH);
  console.log('  Baselines cached to baseline-results.json');

  return result;
}

// Auto-execute when run directly via `bun run eval/run-baselines.ts`
if (import.meta.main) {
  runAllBaselines(false).then(r => {
    console.log(`\nDone. Raw LLM: ${r.rawLlm.positives.length} pos + ${r.rawLlm.negatives.length} neg`);
    console.log(`Slither: ${r.slither.positives.length} pos + ${r.slither.negatives.length} neg`);
  }).catch(console.error);
}
