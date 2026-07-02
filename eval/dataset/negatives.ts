import type { EvalCase } from '../types';

const NEGATIVE_CONTRACTS = [
  { name: 'Uniswap V3 Router', address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', blockchain: 'ethereum' },
  { name: 'Aave V3 Pool', address: '0x87870bca3F3d6335C3F4ce8392C69dd50c747ac', blockchain: 'ethereum' },
  { name: 'Compound V3 Comet', address: '0xc3d688B66703497DAa19211EedeFF47F25384Cdc3', blockchain: 'ethereum' },
  { name: 'Curve 3Pool', address: '0xbEbc44782c7dB0A1A60CB6fE97d0b483032FF1C7', blockchain: 'ethereum' },
  { name: 'Balancer V2 Vault', address: '0xBA12222222228d8Ba445958a75A0704d566BF2C8', blockchain: 'ethereum' },
  { name: 'Lido stETH', address: '0xae7ab96520DE3A18E5e111B5EaAB095312d7fE84', blockchain: 'ethereum' },
  { name: 'Chainlink ETH/USD', address: '0x5f4eC3Df9cbd43714fE2740f5E3616155c5b8419', blockchain: 'ethereum' },
  { name: 'MakerDAO DSS', address: '0xdA0Ab1e0017DEbCd72Be8593Ce2E3E6A2eE0f6F0', blockchain: 'ethereum' },
  { name: 'Convex Booster', address: '0xF403C135812408BFbE8313de1ef99412f4FE4665', blockchain: 'ethereum' },
  { name: 'Yearn V3 Vault', address: '0x5f1C16bDD9a1F989aD77932B0aFC5EF3D4c9D6E2', blockchain: 'ethereum' },
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
