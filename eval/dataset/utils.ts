const EXPLORER_TO_CHAIN: Record<string, string> = {
  'etherscan': 'ethereum',
  'bscscan': 'bsc',
  'arbiscan': 'arbitrum',
  'basescan': 'base',
  'opbnbscan': 'opbnb',
  'polygonscan': 'polygon',
  'snowtrace': 'avalanche',
};

export function parseContractUrl(url: string): { blockchain: string; address: string } | null {
  const match = url.match(/https?:\/\/(\w+)\.(?:com|io|org)\/address\/(0x[a-fA-F0-9]{40})/);
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
