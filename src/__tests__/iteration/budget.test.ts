import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

function loadJson(filename: string) {
  const fp = path.resolve(process.cwd(), 'data', filename);
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

describe('T11: computeBudget', () => {
  it('should return valid budget for known pattern', async () => {
    const { computeBudget } = await import('@/lib/iteration/budget');
    const budget = computeBudget(
      { type: 'dex_amm' as const, manipulationTarget: 'liquidity_pool' as const, confidence: 0.8, indicators: [], priorityVulnerabilities: ['OD-01'], criticalFunctions: ['swap'], riskProfile: { manipulationRisk: 'high' as const, flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' as const } },
      'OD-01', null,
    );
    expect(budget.maxIterations).toBeGreaterThanOrEqual(1);
    expect(budget.confidenceThreshold).toBeGreaterThan(0);
  });

  it('should handle all 21 pattern IDs without throwing', async () => {
    const { computeBudget } = await import('@/lib/iteration/budget');
    const cls = { type: 'dex_amm' as const, manipulationTarget: 'liquidity_pool' as const, confidence: 0.8, indicators: [], priorityVulnerabilities: ['OD-01'], criticalFunctions: [], riskProfile: { manipulationRisk: 'high' as const, flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' as const } };
    const allPatterns = ['OD-01','OD-02','OD-03','OD-04','OD-05','LR-01','LR-02','LR-03','TO-01','TO-02','TO-03','AC-01','AC-02','AC-03','CL-01','CL-02','CL-03','CR-01','CR-02','CR-03','CR-04'];
    for (const pid of allPatterns) {
      expect(() => computeBudget(cls, pid, null)).not.toThrow();
    }
  });

  it('should scale with TVL logarithmically', async () => {
    const { computeBudget } = await import('@/lib/iteration/budget');
    const cls = { type: 'dex_amm' as const, manipulationTarget: 'liquidity_pool' as const, confidence: 0.8, indicators: [], priorityVulnerabilities: ['OD-01'], criticalFunctions: [], riskProfile: { manipulationRisk: 'high' as const, flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' as const } };
    const low = computeBudget(cls, 'OD-01', 1_000_000);
    const high = computeBudget(cls, 'OD-01', 1_000_000_000);
    expect(high.maxIterations).toBeGreaterThanOrEqual(low.maxIterations);
  });
});

describe('T11: pattern-weights.json', () => {
  it('should have weights for all 21 patterns', () => {
    const weights = loadJson('pattern-weights.json');
    const expected = ['OD-01','OD-02','OD-03','OD-04','OD-05','LR-01','LR-02','LR-03','TO-01','TO-02','TO-03','AC-01','AC-02','AC-03','CL-01','CL-02','CL-03','CR-01','CR-02','CR-03','CR-04'];
    for (const pid of expected) {
      expect(weights.patterns[pid]).toBeDefined();
      expect(weights.patterns[pid].weight).toBeGreaterThanOrEqual(1);
      expect(weights.patterns[pid].weight).toBeLessThanOrEqual(5);
    }
  });

  it('should have CR-04 as highest weight', () => {
    const weights = loadJson('pattern-weights.json');
    const cr04 = weights.patterns['CR-04'];
    for (const pid of Object.keys(weights.patterns)) {
      expect(cr04.weight).toBeGreaterThanOrEqual(weights.patterns[pid].weight);
    }
  });
});
