/**
 * Etherscan V2 Unified API Configuration
 *
 * V2 统一端点: https://api.etherscan.io/v2/api
 * 所有链共用一个端点 + chainid 参数区分链
 * chainid 必须是第一个查询参数，apikey 必须是最后一个
 * 所有链使用统一的 ETHERSCAN_API_KEY (V2 只需一个 key)
 */

export interface ChainConfig {
  name: string;
  chainId: number;
  explorerUrl: string;
  envKey: string; // kept for backward compat, but V2 uses single ETHERSCAN_API_KEY
  color: string;
  icon: string;
  /** Public RPC endpoint for bytecode fetching (Heimdall/panoramix) */
  rpcUrl: string;
  /** Whether Sourcify supports this chain */
  sourcifySupported: boolean;
}

export const BLOCKCHAIN_CONFIG: Record<string, ChainConfig> = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    explorerUrl: 'https://etherscan.io',
    envKey: 'ETHERSCAN_API_KEY',
    color: '#627EEA',
    icon: '⟠',
    rpcUrl: 'https://eth.llamarpc.com',
    sourcifySupported: true,
  },
  bsc: {
    name: 'BSC',
    chainId: 56,
    explorerUrl: 'https://bscscan.com',
    envKey: 'BSCSCAN_API_KEY',
    color: '#F3BA2F',
    icon: '◆',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    sourcifySupported: true,
  },
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    explorerUrl: 'https://arbiscan.io',
    envKey: 'ARBISCAN_API_KEY',
    color: '#28A0F0',
    icon: '◈',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    sourcifySupported: true,
  },
  base: {
    name: 'Base',
    chainId: 8453,
    explorerUrl: 'https://basescan.org',
    envKey: 'BASESCAN_API_KEY',
    color: '#0052FF',
    icon: '◉',
    rpcUrl: 'https://mainnet.base.org',
    sourcifySupported: true,
  },
  opbnb: {
    name: 'opBNB',
    chainId: 204,
    explorerUrl: 'https://opbnb.bscscan.com',
    envKey: 'BSCSCAN_API_KEY',
    color: '#F3BA2F',
    icon: '◇',
    rpcUrl: 'https://opbnb-mainnet-rpc.bnbchain.org',
    sourcifySupported: false, // Sourcify doesn't support opBNB yet
  },
  sei: {
    name: 'Sei',
    chainId: 1329,
    explorerUrl: 'https://seiscan.io',
    envKey: 'SEISCAN_API_KEY',
    color: '#9333EA',
    icon: '⬡',
    rpcUrl: 'https://evm-rpc.sei-apis.com',
    sourcifySupported: false, // Sourcify doesn't support Sei yet
  },
  hyperliquid: {
    name: 'Hyperliquid',
    chainId: 999,
    explorerUrl: 'https://app.hyperliquid.xyz',
    envKey: 'HYPERLIQUID_API_KEY',
    color: '#6366F1',
    icon: '⬢',
    rpcUrl: 'https://rpc.hyperliquid.xyz/evm',
    sourcifySupported: false, // Sourcify doesn't support Hyperliquid yet
  },
} as const;

/** Etherscan V2 统一 API 端点 */
export const ETHERSCAN_V2_BASE_URL = 'https://api.etherscan.io/v2/api';

/** 统一 API Key 环境变量名 */
export const ETHERSCAN_V2_API_KEY_ENV = 'ETHERSCAN_API_KEY';

/** Sourcify 仓库基础 URL */
export const SOURCIFY_REPO_URL = 'https://repo.sourcify.dev/contracts';

export type BlockchainId = keyof typeof BLOCKCHAIN_CONFIG;

/**
 * 根据 chainId 反查 blockchain key
 */
export function getBlockchainKeyByChainId(chainId: number): BlockchainId | undefined {
  for (const [key, config] of Object.entries(BLOCKCHAIN_CONFIG)) {
    if (config.chainId === chainId) return key as BlockchainId;
  }
  return undefined;
}

/**
 * 获取链的 explorer 交易链接
 */
export function getExplorerTxUrl(blockchain: BlockchainId, txHash: string): string {
  const config = BLOCKCHAIN_CONFIG[blockchain];
  return `${config.explorerUrl}/tx/${txHash}`;
}

/**
 * 获取链的 explorer 地址链接
 */
export function getExplorerAddressUrl(blockchain: BlockchainId, address: string): string {
  const config = BLOCKCHAIN_CONFIG[blockchain];
  return `${config.explorerUrl}/address/${address}`;
}
