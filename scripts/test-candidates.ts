// Test source availability for replacement candidates (both positives & negatives)
import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';

const CANDIDATES = [
  // ============ Positive replacements ============
  // OD-01: edel-xstock (Jul 1, Ethereum) 
  { id: 'edel-xstock', chain: 'ethereum', addr: '0xBd497eE429D9D3E46446339286271b3714a83B29', pattern: 'OD-01', date: '2026-07-01' },
  // LR-01: WHALE (Jun 17, BSC)
  { id: 'WHALE', chain: 'bsc', addr: '0xabc79b7c5a0f1fe0ac55fcb7e659d5817e530123', pattern: 'LR-01', date: '2026-06-17' },
  // LR-01/CL-03: XDKRecycle (Feb 16, BSC)
  { id: 'XDKRecycle', chain: 'bsc', addr: '0x02739be625f7a1cb196f42dceee630c394dd9faa', pattern: 'LR-01', date: '2026-02-16' },
  // OD-01: YSDAO (May 29, BSC)
  { id: 'YSDAO', chain: 'bsc', addr: '0xc036A13D7A6A84677DfCcec483eED124654B7918', pattern: 'OD-01', date: '2026-05-29' },
  // CL-01: LAXO Token (Feb 22, BSC)
  { id: 'LAXO', chain: 'bsc', addr: '0x62951CaD7659393BF07fbe790cF898A3B6d317CB', pattern: 'CL-01', date: '2026-02-22' },
  // OD-04: Moonwell (Feb 15, Base) 
  { id: 'Moonwell', chain: 'base', addr: '0xEC942bE8A8114bFD0396A5052c36027f2cA6a9d0', pattern: 'OD-04', date: '2026-02-15' },
  // CR-03: ATM Token (Jun 4, BSC)  
  { id: 'ATM', chain: 'bsc', addr: '0x986058ec93756E57b4e55b406dD0BeE24bcD95e3', pattern: 'TO-02', date: '2026-06-04' },

  // ============ Negative fixes ============
  // Replace failing negatives with verified protocols
  { id: 'Aave V3 Pool (fixed addr)', chain: 'ethereum', addr: '0x87870Bca3F3fD6335C3F4ce8392C69dd50c747ac', pattern: 'NEG', date: '' },
  { id: 'Uniswap V3 USDC/ETH Pool', chain: 'ethereum', addr: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8', pattern: 'NEG', date: '' },
  { id: 'WETH', chain: 'ethereum', addr: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', pattern: 'NEG', date: '' },
  { id: 'USDC', chain: 'ethereum', addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', pattern: 'NEG', date: '' },
  { id: 'DAI', chain: 'ethereum', addr: '0x6B175474E89094C44Da98b954EedeAC495271d0F', pattern: 'NEG', date: '' },
];

async function main() {
  for (const c of CANDIDATES) {
    try {
      const r = await fetchContractWithCache(c.addr, c.chain as BlockchainId);
      console.log(`${c.id} [${c.pattern}] ${c.date} @ ${c.chain}`);
      console.log(`  ${r.success ? '✅' : '❌'} success=${r.success}, source=${r.source || 'N/A'}, name=${r.contractName || 'N/A'}`);
      if (!r.success) console.log(`  ERROR: ${r.error?.slice(0, 100)}`);
    } catch (e) {
      console.log(`${c.id} @ ${c.chain} ❌ FETCH ERROR: ${e instanceof Error ? e.message : e}`);
    }
    console.log();
  }
}

main().catch(console.error);
