import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';

const CANDIDATES = [
  // ATM Token (Jun 4, BSC, CL-03) - already tested, re-verify
  { id: 'ATM Token', chain: 'bsc' as BlockchainId, addr: '0x986058ec93756E57b4e55b406dD0BeE24bcD95e3' },
  // ThetanutsFi (Jun 15, Ethereum, CL-01)
  { id: 'ThetanutsFi', chain: 'ethereum' as BlockchainId, addr: '0xC2C3AE0a7b405058558C9b4a63b373486CB86Ac7' },
];

async function main() {
  for (const c of CANDIDATES) {
    try {
      const r = await fetchContractWithCache(c.addr, c.chain);
      console.log(`${c.id} @ ${c.chain} ${r.success ? '✅' : '❌'} name=${r.contractName || 'N/A'} src=${r.source || 'N/A'}`);
      if (!r.success) console.log(`  ERROR: ${(r.error || '').slice(0, 150)}`);
    } catch (e) {
      console.log(`${c.id} ❌ FETCH ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch(console.error);
