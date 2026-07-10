// 从 history.json 中查找可用的替换 case（源码可获取）
// 优先 2026 年，匹配同 pattern_ids
import { fetchContractWithCache } from '../src/lib/blockchain/fetcher';
import type { BlockchainId } from '../src/lib/blockchain/config';
import data from '../data/history.json';

interface HistoryCase {
  id: string;
  time: string;
  blockchain_platform: string;
  victim_contract_address: string;
  note: string;
  pattern_ids: string[];
}

const cases = (data as { cases: HistoryCase[] }).cases;

// 需要替换的 pattern 映射
const NEEDED: Record<string, string[]> = {
  'OD-01': ['POS-2026-001'],
  'CL-03': ['POS-2026-002'],
  'LR-01': ['POS-2026-008'],
  'CR-01': ['POS-2026-010'],
};

// 从 BSCScan/Etherscan URL 中提取地址
function extractAddress(url: string): string | null {
  const match = url.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

// 标准化 blockchain 名
function normalizeChain(name: string): string | null {
  const map: Record<string, string> = {
    'ethereum': 'ethereum',
    'bsc': 'bsc',
    'base': 'base',
    'arbitrum': 'arbitrum',
    'opbnb': 'opbnb',
    'sei': 'sei',
    'hyperliquid': 'hyperliquid',
  };
  return map[name.toLowerCase()] || null;
}

async function main() {
  // 1. 先列出 2026 年的 case
  console.log('=== 2026 cases in history.json ===');
  const recent = cases.filter(c => c.time.startsWith('2026'));
  for (const c of recent) {
    const addr = extractAddress(c.victim_contract_address);
    console.log(`${c.id} | ${c.time} | ${c.blockchain_platform} | addr=${addr?.slice(0, 14)}... | patterns=${c.pattern_ids.join(',')}`);
    if (addr) {
      const chain = normalizeChain(c.blockchain_platform);
      if (chain) {
        const r = await fetchContractWithCache(addr, chain as BlockchainId);
        console.log(`  → sourceAvailable=${r.success}, source=${r.source || 'N/A'}`);
        if (r.success) console.log(`  ✓ CAN USE`);
      } else {
        console.log(`  → unsupported chain: ${c.blockchain_platform}`);
      }
    }
    console.log();
  }

  // 2. 对所有 history.json case，按 pattern 分组列出可用候选
  console.log('\n=== Candidates by needed pattern ===');
  for (const [patternId, replacedCases] of Object.entries(NEEDED)) {
    console.log(`\n--- Pattern ${patternId} (replacing ${replacedCases.join(', ')}) ---`);
    const candidates = cases.filter(c => c.pattern_ids.includes(patternId));
    for (const c of candidates) {
      const addr = extractAddress(c.victim_contract_address);
      if (!addr) { console.log(`${c.id} ${c.time} ${c.blockchain_platform} — no address`); continue; }
      const chain = normalizeChain(c.blockchain_platform);
      if (!chain) { console.log(`${c.id} ${c.time} ${c.blockchain_platform} — unsupported chain`); continue; }
      const r = await fetchContractWithCache(addr, chain as BlockchainId);
      console.log(`${c.id} | ${c.time} | ${c.blockchain_platform} | addr=${addr.slice(0, 14)}... | source=${r.success ? '✓' : '✗'}`);
    }
  }
}

main().catch(console.error);
