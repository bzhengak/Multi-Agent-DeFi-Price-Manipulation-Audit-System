import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';

const EXTRA = [
  { id: 'Uniswap V3 Factory', chain: 'ethereum' as BlockchainId, addr: '0x1F98431c8aD98523631AE4a59f267346ea31F984' },
  { id: 'EnsRegistry', chain: 'ethereum' as BlockchainId, addr: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' },
  { id: 'Aave V2 LendingPool', chain: 'ethereum' as BlockchainId, addr: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9' },
];

async function main() {
  for (const c of EXTRA) {
    try {
      const r = await fetchContractWithCache(c.addr, c.chain);
      console.log(`${c.id} @ ${c.addr}`);
      console.log(`  ${r.success ? '✅' : '❌'} success=${r.success}, name=${r.contractName || 'N/A'}`);
      if (!r.success) console.log(`  ERROR: ${(r.error || '').slice(0, 150)}`);
    } catch (e) {
      console.log(`${c.id} ❌ FETCH ERROR: ${e instanceof Error ? e.message : e}`);
    }
    console.log();
  }
}

main().catch(console.error);
