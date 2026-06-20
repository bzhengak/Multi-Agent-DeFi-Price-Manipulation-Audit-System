import patternWeights from '../../../data/pattern-weights.json';
import type { ProtocolClassification } from '@/lib/agents/audit/protocols/types';

interface PatternWeightMap {
  patterns: Record<string, { weight: number; scores: Record<string, number>; rationale: string }>;
}

export interface IterationBudget {
  maxIterations: number;
  confidenceThreshold: number;
}

export function computeBudget(
  classification: ProtocolClassification,
  patternId: string,
  tvlUSD: number | null,
): IterationBudget {
  const data = patternWeights as PatternWeightMap;
  const w = data.patterns[patternId]?.weight ?? 3;
  const tvl = tvlUSD ?? 1e5;
  const max = Math.max(1, Math.min(10,
    Math.round(w * Math.log10(tvl + 1) / 2)
  ));
  return { maxIterations: max, confidenceThreshold: 0.85 };
}
