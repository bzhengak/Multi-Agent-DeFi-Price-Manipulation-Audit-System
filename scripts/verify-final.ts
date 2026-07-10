import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';
import { loadPositiveCases } from '../eval/dataset/positives';
import { loadNegativeCases } from '../eval/dataset/negatives';

async function main() {
  console.log('=== FINAL POSITIVES VERIFICATION ===\n');
  const positives = loadPositiveCases();
  for (const c of positives) {
    const r = await fetchContractWithCache(c.victimAddress, c.blockchain as BlockchainId);
    const status = r.success ? '✅' : '❌';
    console.log(`${c.caseId} [${c.expectedPatternIds}] ${c.blockchain} ${status} ${r.contractName || 'N/A'}`);
  }

  console.log('\n=== FINAL NEGATIVES VERIFICATION ===\n');
  const negatives = loadNegativeCases();
  for (const c of negatives) {
    const r = await fetchContractWithCache(c.victimAddress, c.blockchain as BlockchainId);
    const status = r.success ? '✅' : '❌';
    console.log(`${c.caseId} ${c.blockchain} ${status} ${r.contractName || 'N/A'}`);
  }

  console.log('\n=== DATE CHECK (vs Jul 3, 2026) ===\n');
  for (const c of positives) {
    const dateMatch = c.caseNote.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const d = new Date(dateMatch[1]);
      const diffDays = Math.floor((new Date('2026-07-03').getTime() - d.getTime()) / 86400000);
      const ok = diffDays <= 60 ? '✅' : '⚠️';
      console.log(`${c.caseId} ${dateMatch[1]} (${diffDays}d ago) ${ok}`);
    }
  }
}

main().catch(console.error);
