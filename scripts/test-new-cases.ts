import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';

const NEW_CASES = [
  // VTSwapHook (Mar 28, Arbitrum, CL-03)
  { id: 'VTSwapHook', chain: 'arbitrum' as BlockchainId, addr: '0xbf4b4a83708474528a93c123f817e7f2a0637a88' },
  // SingularityDynaVault (Apr 25, Base, OD-04)
  { id: 'SingularityDynaVault', chain: 'base' as BlockchainId, addr: '0x67b93f6676bd1911c5fae7ffa90fff5f35e14dcd' },
];

async function main() {
  for (const c of NEW_CASES) {
    try {
      const r = await fetchContractWithCache(c.addr, c.chain);
      console.log(`${c.id} @ ${c.chain}`);
      console.log(`  ${r.success ? '✅' : '❌'} success=${r.success}, name=${r.contractName || 'N/A'}, source=${r.source || 'N/A'}`);
      if (!r.success) console.log(`  ERROR: ${(r.error || '').slice(0, 200)}`);
    } catch (e) {
      console.log(`${c.id} ❌ FETCH ERROR: ${e instanceof Error ? e.message : e}`);
    }
    console.log();
  }
}

main().catch(console.error);
