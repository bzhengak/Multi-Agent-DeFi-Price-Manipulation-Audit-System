import type { EvalCase } from '../types';

const NEGATIVE_CONTRACTS = [
  { name: 'Uniswap V3 Router', address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', blockchain: 'ethereum', auditor: 'OpenZeppelin + ConsenSys' },
  { name: 'Aave V3 Pool', address: '0x87870Bca3F3fD6335C3F4ce8392C69Dd50c747ac', blockchain: 'ethereum', auditor: 'Trail of Bits + OpenZeppelin' },
  { name: 'Compound V3 Comet', address: '0xc3d688B66703497Daa19211EEdff47f25384CDc3', blockchain: 'ethereum', auditor: 'OpenZeppelin' },
  { name: 'Curve 3Pool', address: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7', blockchain: 'ethereum', auditor: 'Quantstamp + ChainSecurity' },
  { name: 'Balancer V2 Vault', address: '0xBA12222222228d8Ba445958a75a0704d566BF2C8', blockchain: 'ethereum', auditor: 'Trail of Bits + ConsenSys' },
  { name: 'Lido stETH', address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', blockchain: 'ethereum', auditor: 'Sigma Prime + Quantstamp' },
  { name: 'Chainlink ETH/USD', address: '0x5f4eC3Df9cbd43714fE2740f5E3616155c5b8419', blockchain: 'ethereum', auditor: 'Chainlink Internal + External' },
  { name: 'MakerDAO DSS', address: '0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B', blockchain: 'ethereum', auditor: 'Trail of Bits + ConsenSys' },
  { name: 'Convex Booster', address: '0xF403C135812408BFbE8713b5A23a04b16Ba8cF81', blockchain: 'ethereum', auditor: 'OpenZeppelin' },
  { name: 'Yearn V3 Vault', address: '0xBF3D2616ab2eCB8ebE5BC54fbA53A1F8953EC7B4', blockchain: 'ethereum', auditor: 'Yearn Internal + Community' },
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
    caseNote: `Safe contract: ${c.name} (audited by ${c.auditor})`,
  }));
}
