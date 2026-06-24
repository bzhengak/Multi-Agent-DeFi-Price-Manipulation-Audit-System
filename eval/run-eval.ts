import { loadPositiveCases } from './dataset/positives';
import { loadNegativeCases } from './dataset/negatives';
import { runAllCases } from './run-agent';
import { runAllBaselines } from './run-baselines';
import { generateReport, saveReport } from './report';

async function main() {
  console.log('=== Loading datasets ===');
  const positiveCases = loadPositiveCases();
  const negativeCases = loadNegativeCases();
  console.log(`Loaded ${positiveCases.length} positive cases and ${negativeCases.length} negative cases`);

  console.log('\n=== Running system ===');
  const systemResults = await runAllCases();

  console.log('\n=== Running baselines ===');
  const baselineResults = await runAllBaselines();

  console.log('\n=== Generating report ===');
  const report = generateReport(positiveCases, negativeCases, systemResults, baselineResults);
  saveReport(report);

  console.log('\n=== Done ===');
}

main().catch(console.error);
