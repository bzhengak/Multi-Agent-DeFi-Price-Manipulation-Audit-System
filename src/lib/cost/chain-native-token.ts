import type { BlockchainId } from '@/lib/blockchain/config';

export const CHAIN_NATIVE_TOKEN: Record<BlockchainId, { coingeckoId: string; symbol: string }> = {
  ethereum:    { coingeckoId: 'ethereum',    symbol: 'ETH' },
  bsc:         { coingeckoId: 'binancecoin', symbol: 'BNB' },
  arbitrum:    { coingeckoId: 'ethereum',    symbol: 'ETH' },
  base:        { coingeckoId: 'ethereum',    symbol: 'ETH' },
  opbnb:       { coingeckoId: 'binancecoin', symbol: 'BNB' },
  sei:         { coingeckoId: 'sei-network', symbol: 'SEI' },
  hyperliquid: { coingeckoId: 'hyperliquid', symbol: 'HYPE' },
};
