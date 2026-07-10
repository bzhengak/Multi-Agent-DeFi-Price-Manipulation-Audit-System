import type { EvalCase } from '../types';

const NEGATIVE_CONTRACTS = [
  { name: 'Uniswap V3 Router', address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', blockchain: 'ethereum' },
  { name: 'Uniswap V3 USDC/ETH Pool', address: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8', blockchain: 'ethereum' },
  { name: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', blockchain: 'ethereum' },
  { name: 'Curve 3Pool', address: '0xbEbc44782c7dB0A1A60CB6fE97d0b483032FF1C7', blockchain: 'ethereum' },
  { name: 'Balancer V2 Vault', address: '0xBA12222222228d8Ba445958a75A0704d566BF2C8', blockchain: 'ethereum' },
  { name: 'Lido stETH', address: '0xae7ab96520DE3A18E5e111B5EaAB095312d7fE84', blockchain: 'ethereum' },
  { name: 'Chainlink ETH/USD Oracle', address: '0x5f4eC3Df9cbd43714fE2740f5E3616155c5b8419', blockchain: 'ethereum' },
  { name: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', blockchain: 'ethereum' },
  { name: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', blockchain: 'ethereum' },
  { name: 'Uniswap V3 Factory', address: '0x1F98431c8aD98523631AE4a59f267346ea31F984', blockchain: 'ethereum' },
];

export function loadNegativeCases(): EvalCase[] {
  return NEGATIVE_CONTRACTS.map((c, i) => ({
    caseId: `NEG-${String(i + 1).padStart(2, '0')}`,
    source: 'manual' as const,
    blockchain: c.blockchain,
    victimAddress: c.address,
    contractName: c.name,
    sourceCode: undefined,
    sourceAvailable: true,
    expectedPatternIds: [],
    caseNote: `Safe contract: ${c.name}`,
  }));
}
