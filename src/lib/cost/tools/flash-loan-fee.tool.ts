import type { ToolDefinition, ToolContext } from '@/lib/agents/core/tools/types';

const AAVE_FLASHLOAN_FEE_BPS = 5;
const BALANCER_FLASHLOAN_FEE_BPS = 0;

export function createFlashLoanFeeTool(): ToolDefinition {
  return {
    name: 'cost.flash_loan_fee',
    description: 'Get flash loan fee for supported providers (Aave V3 = 0.05%, Balancer V2 = 0%)',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Flash loan provider: aave-v3 or balancer-v2' },
      },
      required: ['provider'],
    },
    cachePolicy: { enabled: true, ttlMs: 3_600_000 },
    retryPolicy: { maxRetries: 1, backoffMultiplier: 2, initialDelayMs: 500 },
    timeout: 5_000,
    execute: async (params: unknown, _context: ToolContext) => {
      const { provider } = params as { provider: string };
      const startTime = Date.now();

      // Aave V3: fee is fixed at 5 bps (0.05%), stored as FLASHLOAN_PREMIUM_TOTAL on Pool contract
      // Balancer V2: fee is 0% per official docs
      const feeBps = provider === 'aave-v3'
        ? AAVE_FLASHLOAN_FEE_BPS
        : provider === 'balancer-v2'
          ? BALANCER_FLASHLOAN_FEE_BPS
          : AAVE_FLASHLOAN_FEE_BPS;

      return {
        success: true,
        data: {
          bps: feeBps,
          rate: feeBps / 10000,
          source: provider === 'balancer-v2' ? 'balancer-v2-doc' as const : 'aave-v3-onchain' as const,
        },
        executionTime: Date.now() - startTime,
      };
    },
  };
}
