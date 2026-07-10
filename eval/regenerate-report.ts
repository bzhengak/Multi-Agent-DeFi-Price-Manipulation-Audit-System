import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import { generateReport, saveReport } from './report';
import type { EvalResult } from './types';

const CHECKPOINT_PATH = join(__dirname, 'results', 'eval-checkpoint.bak.json');
const CHECKPOINT_PATH_ALT = join(__dirname, 'results', 'eval-checkpoint.json');
const BASELINE_CACHE_PATH = join(__dirname, 'results', 'baseline-results.json');

interface EvalCheckpoint {
  completedIds: string[];
  positives: EvalResult[];
  negatives: EvalResult[];
  quotaExhausted: boolean;
  updatedAt: string;
}

async function main() {
  console.log('=== Regenerating Evaluation Report ===\n');

  const positiveCases = loadPositiveCases();
  const negativeCases = loadNegativeCases();
  console.log(`Loaded ${positiveCases.length} positive + ${negativeCases.length} negative cases`);

  const cpPath = existsSync(CHECKPOINT_PATH) ? CHECKPOINT_PATH : CHECKPOINT_PATH_ALT;
  if (!existsSync(cpPath)) {
    console.error('No checkpoint found. Run the full evaluation first: EVAL_MODE=true bun run eval');
    process.exit(1);
  }

  const checkpoint = JSON.parse(readFileSync(cpPath, 'utf-8')) as EvalCheckpoint;
  console.log(`Loaded checkpoint: ${checkpoint.positives.length} positive, ${checkpoint.negatives.length} negative results`);
  console.log(`  Updated: ${checkpoint.updatedAt}`);

  let baselineResults = undefined;
  if (existsSync(BASELINE_CACHE_PATH)) {
    console.log('\n=== Loading cached baselines ===');
    baselineResults = JSON.parse(readFileSync(BASELINE_CACHE_PATH, 'utf-8'));
    console.log('  Cached baselines loaded.');
  } else {
    console.log('\n=== No cached baselines — using original-run values from report ===');
  }

  console.log('\n=== Generating report ===');
  const report = generateReport(
    positiveCases,
    negativeCases,
    { positives: checkpoint.positives, negatives: checkpoint.negatives },
    baselineResults,
  );
  saveReport(report);

  console.log('\n=== Done ===');
}

main().catch(console.error);
