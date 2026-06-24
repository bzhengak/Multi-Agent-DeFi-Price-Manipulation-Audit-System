import { readFileSync } from 'fs';
import { join } from 'path';
import type { EvalCase } from '../types';

interface HistoryCase {
  id: string;
  time: string;
  blockchain_platform: string;
  attack_transaction: string;
  attack_contract_address: string;
  victim_contract_address: string;
  note: string;
  vulnerability_pattern: string;
  pattern_ids: string[];
}

const EXPLORER_TO_CHAIN: Record<string, string> = {
  'etherscan': 'ethereum',
  'bscscan': 'bsc',
  'arbiscan': 'arbitrum',
  'basescan': 'base',
  'opbnb': 'opbnb',
  'polygonscan': 'polygon',
  'snowtrace': 'avalanche',
};

export function parseContractUrl(url: string): { blockchain: string; address: string } | null {
  const match = url.match(/https?:\/\/(\w+)\.(?:com|io)\/address\/(0x[a-fA-F0-9]{40})/);
  if (match) {
    const explorer = match[1];
    const chain = EXPLORER_TO_CHAIN[explorer];
    if (chain) {
      return { blockchain: chain, address: match[2] };
    }
  }
  return null;
}

export function parseTxHash(url: string): string | null {
  const match = url.match(/(0x[a-fA-F0-9]{64})/);
  return match ? match[1] : null;
}

export function loadPositiveCases(): EvalCase[] {
  const historyPath = join(process.cwd(), 'data', 'history.json');
  const historyRaw = JSON.parse(readFileSync(historyPath, 'utf-8'));
  const cases: HistoryCase[] = historyRaw.cases || historyRaw;

  return cases.map(c => {
    const parsed = parseContractUrl(c.victim_contract_address || c.attack_contract_address);
    const txHash = parseTxHash(c.attack_transaction || '');

    return {
      caseId: c.id,
      source: 'history.json' as const,
      blockchain: parsed?.blockchain || c.blockchain_platform?.toLowerCase() || 'ethereum',
      victimAddress: parsed?.address || '',
      attackTxHash: txHash || undefined,
      contractName: c.id,
      sourceCode: undefined,
      sourceAvailable: !!parsed,
      expectedPatternIds: c.pattern_ids || [],
      caseNote: c.note || '',
    };
  });
}
