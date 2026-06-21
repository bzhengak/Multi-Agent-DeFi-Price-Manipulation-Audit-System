import type { ToolDefinition, ToolContext } from '@/lib/agents/core/tools/types';

const GAS_ORACLE_SUPPORTED_CHAINS = new Set([1, 56, 137, 1284, 1285, 42220, 100, 59144]);

export function createGasPriceTool(): ToolDefinition {
  return {
    name: 'cost.gas_price',
    description: 'Fetch current gas price recommendations from Etherscan Gas Tracker Oracle',
    parameters: {
      type: 'object',
      properties: {
        chainId: { type: 'number', description: 'EVM chain ID (e.g. 1 for Ethereum)' },
      },
      required: ['chainId'],
    },
    cachePolicy: { enabled: true, ttlMs: 120_000 },
    retryPolicy: { maxRetries: 2, backoffMultiplier: 2, initialDelayMs: 1000 },
    timeout: 10_000,
    execute: async (params: unknown, _context: ToolContext) => {
      const { chainId } = params as { chainId: number };
      const startTime = Date.now();

      if (GAS_ORACLE_SUPPORTED_CHAINS.has(chainId)) {
        try {
          const apiKey = process.env.ETHERSCAN_API_KEY || '';
          const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=gastracker&action=gasoracle&apikey=${apiKey}`;
          const res = await fetch(url);
          const json = await res.json() as { status: string; result: { SafeGasPrice: string; ProposeGasPrice: string; FastGasPrice: string; suggestBaseFee: string; gasUsedRatio: string } };

          if (json.status === '1' && json.result) {
            const r = json.result;
            return {
              success: true,
              data: {
                low: parseFloat(r.SafeGasPrice),
                mid: parseFloat(r.ProposeGasPrice),
                high: parseFloat(r.FastGasPrice),
                baseFee: parseFloat(r.suggestBaseFee),
                gasUsedRatio: r.gasUsedRatio,
                source: 'etherscan-gastracker' as const,
              },
              executionTime: Date.now() - startTime,
            };
          }
        } catch {}
      }

      // Fallback: fixed defaults with reasonable 2026 Ethereum values
      return {
        success: true,
        data: {
          low: 15,
          mid: 30,
          high: 50,
          baseFee: 15,
          gasUsedRatio: '0.5',
          source: 'default' as const,
        },
        executionTime: Date.now() - startTime,
      };
    },
  };
}
