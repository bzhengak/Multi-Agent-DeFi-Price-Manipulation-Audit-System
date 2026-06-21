import type { ToolDefinition, ToolContext } from '@/lib/agents/core/tools/types';

export function createNativePriceTool(): ToolDefinition {
  return {
    name: 'cost.native_token_price',
    description: 'Fetch native token price in USD from CoinGecko keyless API',
    parameters: {
      type: 'object',
      properties: {
        coinId: { type: 'string', description: 'CoinGecko coin ID (e.g. ethereum, binancecoin)' },
      },
      required: ['coinId'],
    },
    cachePolicy: { enabled: true, ttlMs: 300_000 },
    retryPolicy: { maxRetries: 2, backoffMultiplier: 2, initialDelayMs: 1000 },
    timeout: 10_000,
    execute: async (params: unknown, _context: ToolContext) => {
      const { coinId } = params as { coinId: string };
      const startTime = Date.now();

      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
        const res = await fetch(url);
        const json = await res.json() as Record<string, { usd: number }>;

        if (json[coinId]?.usd) {
          return {
            success: true,
            data: { usd: json[coinId].usd, source: 'coingecko' as const },
            executionTime: Date.now() - startTime,
          };
        }
      } catch {}

      // Fallback: representative 2026 default prices
      const fallbacks: Record<string, number> = {
        ethereum: 3000,
        binancecoin: 600,
        'sei-network': 0.4,
        hyperliquid: 15,
      };
      return {
        success: true,
        data: {
          usd: fallbacks[coinId] || 3000,
          source: 'default' as const,
        },
        executionTime: Date.now() - startTime,
      };
    },
  };
}
