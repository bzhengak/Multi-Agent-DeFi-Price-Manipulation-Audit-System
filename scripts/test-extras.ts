import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';

const CANDIDATES = [
  // SQTokenStaking (May 12, BSC, AC-03 candidate)
  { id: 'SQTokenStaking', chain: 'bsc' as BlockchainId, addr: '0x404404A845FFF0201f3a4D419B4839fC419c99F7' },
  // SKP Token (May 26, BSC)
  { id: 'SKP Token', chain: 'bsc' as BlockchainId, addr: '0xeCBDc0B76142740Bb564B8aA1BCd061Cb151a666' },
  // YSDAO (May 29, BSC) - alternate if needed
  { id: 'YSDAO Token', chain: 'bsc' as BlockchainId, addr: '0xc036A13D7A6A84677DfCcec483eED124654B7918' },
];

async function main() {
  for (const c of CANDIDATES) {
    try {
      const r = await fetchContractWithCache(c.addr, c.chain);
      console.log(`${c.id} @ ${c.chain} ${r.success ? '✅' : '❌'} name=${r.contractName || 'N/A'}`);
      if (!r.success) console.log(`  ERROR: ${(r.error || '').slice(0, 150)}`);
    } catch (e) {
      console.log(`${c.id} ❌ FETCH ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch(console.error);
