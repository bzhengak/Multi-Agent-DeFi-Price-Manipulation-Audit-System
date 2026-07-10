import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';
import { loadPositiveCases } from '../eval/dataset/positives';
import { loadNegativeCases } from '../eval/dataset/negatives';

async function main() {
  const positives = loadPositiveCases();
  const negatives = loadNegativeCases();

  console.log('=== POSITIVES (10) ===');
  for (const c of positives) {
    try {
      const r = await fetchContractWithCache(c.victimAddress, c.blockchain as BlockchainId);
      console.log(`${c.caseId} [${c.expectedPatternIds.join(',')}] @ ${c.blockchain} ${r.success ? '✅' : '❌'} name=${r.contractName || 'N/A'} src=${r.source || 'N/A'}`);
      if (!r.success) console.log(`   ERROR: ${(r.error || '').slice(0, 150)}`);
    } catch (e) {
      console.log(`${c.caseId} ❌ FETCH ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('\n=== NEGATIVES (10) ===');
  for (const c of negatives) {
    try {
      const r = await fetchContractWithCache(c.victimAddress, c.blockchain as BlockchainId);
      console.log(`${c.caseId} @ ${c.blockchain} ${r.success ? '✅' : '❌'} name=${r.contractName || 'N/A'}`);
      if (!r.success) console.log(`   ERROR: ${(r.error || '').slice(0, 150)}`);
    } catch (e) {
      console.log(`${c.caseId} ❌ FETCH ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  const allPass = [...positives, ...negatives].every(c => {
    // just report all
    return true;
  });
  console.log(`Done. Check results above.`);
}

main().catch(console.error);
