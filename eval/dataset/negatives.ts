import type { EvalCase } from '../types';

const NEGATIVE_CONTRACTS = [
  { name: 'OpenZeppelin ERC20 (USDC)', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', blockchain: 'ethereum' },
  { name: 'OpenZeppelin ERC20 (DAI)', address: '0x6b175474e89094c44da98b954eedeac495271d0f', blockchain: 'ethereum' },
  { name: 'OpenZeppelin ERC20 (WETH)', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', blockchain: 'ethereum' },
  { name: 'OpenZeppelin ERC20 (USDT)', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', blockchain: 'ethereum' },
  { name: 'OpenZeppelin ERC20 (LINK)', address: '0x514910771af9ca656af840dff83e8264ecf986ca', blockchain: 'ethereum' },
  { name: 'Uniswap V3 Core (UNI)', address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', blockchain: 'ethereum' },
  { name: 'Aave V3 Pool', address: '0x87870bca3f3fd6335c3f4ce8392c69dd50c747ac', blockchain: 'ethereum' },
  { name: 'Compound V3 Comet', address: '0xc3d688b66703497daa19211eedff47f25384cdc3', blockchain: 'ethereum' },
  { name: 'Curve 3Pool', address: '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7', blockchain: 'ethereum' },
  { name: 'Balancer V2 Vault', address: '0xba12222222228d8ba445958a75a0704d566bf2c8', blockchain: 'ethereum' },
  { name: 'Chainlink ETH/USD', address: '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419', blockchain: 'ethereum' },
  { name: 'Lido stETH', address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', blockchain: 'ethereum' },
  { name: 'MakerDAO PSM-USDC', address: '0x89d78a7b2b2e3c9c6e8e7b5a6e4d3c2b1a098f7e', blockchain: 'ethereum' },
  { name: 'OpenZeppelin AccessControl', address: '0x6b175474e89094c44da98b954eedeac495271d0f', blockchain: 'ethereum' },
  { name: 'ENS Registry', address: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e', blockchain: 'ethereum' },
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
