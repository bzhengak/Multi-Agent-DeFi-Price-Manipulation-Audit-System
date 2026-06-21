export interface AttackCostEstimate {
  low: number;
  mid: number;
  high: number;
  currency: 'USD';
  asOf: number;
  breakdown: {
    gasCostUSD: { low: number; mid: number; high: number };
    flashLoanCostUSD: number;
    flashLoanProvider: 'aave-v3' | 'balancer-v2' | 'none';
  };
  dataSource: {
    gas: 'etherscan-gastracker' | 'rpc-feehistory' | 'default';
    nativePrice: 'coingecko' | 'cached-stale' | 'default';
    flashLoanFee: 'aave-v3-onchain' | 'balancer-v2-doc' | 'default';
    gasProfile: 'pattern-cost-profiles' | 'fallback';
  };
  assumptions: string[];
}
