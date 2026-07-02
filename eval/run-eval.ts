import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import { runAllCases } from './run-agent';
import { runAllBaselines } from './run-baselines';
import { generateReport, saveReport } from './report';
import { QuotaExceededError } from '@/lib/llm';

async function main() {
  console.log('=== Loading datasets ===');
  const positiveCases = loadPositiveCases();
  const negativeCases = loadNegativeCases();
  console.log(`Loaded ${positiveCases.length} positive cases and ${negativeCases.length} negative cases`);

  console.log('\n=== Running system ===');
  const systemResults = await runAllCases();

  const posCompleted = systemResults.positives.filter(r => !r.error).length;
  const negCompleted = systemResults.negatives.filter(r => !r.error).length;
  const quotaHit = systemResults.positives.some(r => r.partial) || systemResults.negatives.some(r => r.partial);
  if (quotaHit) {
    console.warn(`\n⚠ LLM quota was exhausted. Using partial results: ${posCompleted}/${positiveCases.length} positive, ${negCompleted}/${negativeCases.length} negative cases.`);
  }

  console.log('\n=== Running baselines ===');
  const baselineResults = await runAllBaselines();

  console.log('\n=== Generating report ===');
  const report = generateReport(positiveCases, negativeCases, systemResults, baselineResults);
  saveReport(report);

  console.log('\n=== Done ===');
}

main().catch((error) => {
  if (error instanceof QuotaExceededError) {
    console.error('Fatal: LLM quota exceeded before any results could be saved.');
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
