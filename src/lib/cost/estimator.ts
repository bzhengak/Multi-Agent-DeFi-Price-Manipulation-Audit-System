import type { ToolRegistry } from '@/lib/agents/core/tools/registry';
import type { ToolContext } from '@/lib/agents/core/tools/types';
import type { BlockchainId } from '@/lib/blockchain/config';
import type { AttackCostEstimate } from './types';
import { CHAIN_NATIVE_TOKEN } from './chain-native-token';
import { readFileSync } from 'fs';
import { join } from 'path';

interface VulnCostInput {
  patternId: string;
  attackVector?: string;
}

interface GasProfile {
  gasLow: number;
  gasHigh: number;
  flashLoanNeeded: boolean;
  rationale: string;
}

interface CostProfileData {
  version: string;
  fallback: GasProfile;
  patterns: Record<string, GasProfile>;
}

const mockContext: ToolContext = { agentId: 'cost_estimator', iteration: 0 };

const DEFAULT_ASSUMPTIONS = [
  '未计入 MEV bribe / priority fee 贿赂（三明治攻击实际成本可能更高）',
  '未计入 DEX swap fee（0.01%–1%）与自身滑点',
  'L2 链未计入 L1 data fee（Arbitrum/Base 实际 gas 成本可能更高）',
  '闪电贷成本取 Aave V3（0.05%）与 Balancer V2（0%）的最小值（理性攻击者假设）',
];

export async function estimateAttackCost(
  vuln: VulnCostInput,
  chainId: BlockchainId,
  registry: ToolRegistry,
): Promise<AttackCostEstimate> {
  const now = Date.now();

  // 1. Load pattern gas profile
  let gasProfile: GasProfile;
  let gasProfileSource: AttackCostEstimate['dataSource']['gasProfile'];
  try {
    const data = JSON.parse(
      readFileSync(join(process.cwd(), 'data', 'pattern-cost-profiles.json'), 'utf-8')
    ) as CostProfileData;
    gasProfile = data.patterns[vuln.patternId] || data.fallback;
    gasProfileSource = data.patterns[vuln.patternId] ? 'pattern-cost-profiles' : 'fallback';
  } catch {
    gasProfile = { gasLow: 500000, gasHigh: 1500000, flashLoanNeeded: true, rationale: 'default' };
    gasProfileSource = 'fallback';
  }

  // 2. Fetch gas price
  const chainIdNum = getChainIdNumber(chainId);
  const gasResult = await registry.execute('cost.gas_price', { chainId: chainIdNum }, mockContext);
  const gasData = (gasResult.success ? gasResult.data : null) as { low: number; mid: number; high: number; source: string } | null;

  const gasPriceLow = gasData?.low ?? 15;
  const gasPriceMid = gasData?.mid ?? 30;
  const gasPriceHigh = gasData?.high ?? 50;
  const gasDataSource = (gasData?.source || 'default') as AttackCostEstimate['dataSource']['gas'];

  // 3. Fetch native token price
  const nativeToken = CHAIN_NATIVE_TOKEN[chainId];
  const priceResult = await registry.execute('cost.native_token_price', { coinId: nativeToken.coingeckoId }, mockContext);
  const priceData = (priceResult.success ? priceResult.data : null) as { usd: number; source: string } | null;
  const nativePriceUSD = priceData?.usd ?? 3000;
  const priceDataSource = (priceData?.source || 'default') as AttackCostEstimate['dataSource']['nativePrice'];

  // 4. Calculate gas costs
  const gasCostLow = (21000 + gasProfile.gasLow) * gasPriceLow * 1e-9 * nativePriceUSD;
  const gasCostMid = (21000 + (gasProfile.gasLow + gasProfile.gasHigh) / 2) * gasPriceMid * 1e-9 * nativePriceUSD;
  const gasCostHigh = (21000 + gasProfile.gasHigh) * gasPriceHigh * 1e-9 * nativePriceUSD;

  // 5. Fetch flash loan fee and compute
  let flashLoanCostUSD = 0;
  let flashLoanProvider: AttackCostEstimate['breakdown']['flashLoanProvider'] = 'none';
  let flashLoanSource: AttackCostEstimate['dataSource']['flashLoanFee'] = 'default';

  if (gasProfile.flashLoanNeeded || vuln.attackVector?.toLowerCase().includes('flash loan')) {
    const [aaveResult, balancerResult] = await Promise.all([
      registry.execute('cost.flash_loan_fee', { provider: 'aave-v3' }, mockContext),
      registry.execute('cost.flash_loan_fee', { provider: 'balancer-v2' }, mockContext),
    ]);

    const aaveData = aaveResult.success ? (aaveResult.data as { bps: number; rate: number }) : { bps: 5, rate: 0.0005 };
    const balancerData = balancerResult.success ? (balancerResult.data as { bps: number; rate: number }) : { bps: 0, rate: 0 };

    // Attacker chooses cheapest provider
    const minRate = aaveData.rate <= balancerData.rate ? aaveData.rate : balancerData.rate;
    const selectedProvider = aaveData.rate <= balancerData.rate ? 'aave-v3' : 'balancer-v2';
    const fallbackPrincipal = 1_000_000;
    flashLoanCostUSD = fallbackPrincipal * minRate;
    flashLoanProvider = selectedProvider as 'aave-v3' | 'balancer-v2';
    flashLoanSource = selectedProvider === 'aave-v3' ? 'aave-v3-onchain' : 'balancer-v2-doc';
  }

  const low = Math.round((gasCostLow + flashLoanCostUSD) * 100) / 100;
  const mid = Math.round((gasCostMid + flashLoanCostUSD) * 100) / 100;
  const high = Math.round((gasCostHigh + flashLoanCostUSD) * 100) / 100;

  return {
    low, mid, high,
    currency: 'USD',
    asOf: now,
    breakdown: {
      gasCostUSD: {
        low: Math.round(gasCostLow * 100) / 100,
        mid: Math.round(gasCostMid * 100) / 100,
        high: Math.round(gasCostHigh * 100) / 100,
      },
      flashLoanCostUSD: Math.round(flashLoanCostUSD * 100) / 100,
      flashLoanProvider,
    },
    dataSource: {
      gas: gasDataSource,
      nativePrice: priceDataSource,
      flashLoanFee: flashLoanSource,
      gasProfile: gasProfileSource,
    },
    assumptions: DEFAULT_ASSUMPTIONS,
  };
}

function getChainIdNumber(chainId: BlockchainId): number {
  const map: Record<string, number> = {
    ethereum: 1, bsc: 56, arbitrum: 42161, base: 8453,
    opbnb: 204, sei: 1329, hyperliquid: 999,
  };
  return map[chainId] || 1;
}
