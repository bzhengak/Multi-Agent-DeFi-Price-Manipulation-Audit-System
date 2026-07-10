// 检查所有 evaluaion case 的源码可获取性
import { loadPositiveCases } from '../eval/dataset/positives';
import { loadNegativeCases } from '../eval/dataset/negatives';
import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';

async function checkCases() {
  const positives = loadPositiveCases();
  const negatives = loadNegativeCases();

  console.log('=== Checking Positive Cases ===\n');
  for (const c of positives) {
    try {
      const r = await fetchContractWithCache(c.victimAddress, c.blockchain as BlockchainId);
      console.log(`[${c.caseId}] ${c.contractName} @ ${c.blockchain}:${c.victimAddress.slice(0, 10)}...`);
      console.log(`  sourceAvailable=${c.sourceAvailable}, fetchSuccess=${r.success}, origin=${r.source || 'N/A'}`);
      if (!r.success) console.log(`  ERROR: ${r.error}`);
      console.log();
    } catch (e) {
      console.log(`[${c.caseId}] ${c.contractName} @ ${c.blockchain}:${c.victimAddress.slice(0, 10)}...`);
      console.log(`  FETCH ERROR: ${e instanceof Error ? e.message : e}`);
      console.log();
    }
  }

  console.log('=== Checking Negative Cases ===\n');
  for (const c of negatives) {
    try {
      const r = await fetchContractWithCache(c.victimAddress, c.blockchain as BlockchainId);
      console.log(`[${c.caseId}] ${c.contractName} @ ${c.blockchain}:${c.victimAddress.slice(0, 10)}...`);
      console.log(`  fetchSuccess=${r.success}, origin=${r.source || 'N/A'}`);
      if (!r.success) console.log(`  ERROR: ${r.error}`);
      console.log();
    } catch (e) {
      console.log(`[${c.caseId}] ${c.contractName} @ ${c.blockchain}:${c.victimAddress.slice(0, 10)}...`);
      console.log(`  FETCH ERROR: ${e instanceof Error ? e.message : e}`);
      console.log();
    }
  }
}

checkCases().catch(console.error);
