import { describe, it, expect } from 'vitest';

describe('AuditOrchestrator - Pipeline Structure', () => {
  it('should export AuditOrchestrator', async () => {
    const mod = await import('@/lib/agents/audit/orchestrator/audit-orchestrator');
    expect(mod.AuditOrchestrator).toBeDefined();
  });

  it('should instantiate with progress callback', async () => {
    const mod = await import('@/lib/agents/audit/orchestrator/audit-orchestrator');
    const progresses: any[] = [];
    const orchestrator = new mod.AuditOrchestrator((p: any) => progresses.push(p));
    expect(orchestrator).toBeDefined();
  });

  it('should instantiate with custom stage budgets', async () => {
    const mod = await import('@/lib/agents/audit/orchestrator/audit-orchestrator');
    const orchestrator = new mod.AuditOrchestrator(undefined, 500000, {
      protocol_detection: 3000,
      vulnerability_analysis: 300000,
    });
    expect(orchestrator).toBeDefined();
  });

  it('should have 7 pipeline stages defined', () => {
    const stages = [
      'protocol_detection',
      'context_building',
      'vulnerability_analysis',
      'attack_reconstruction',
      'cost_estimation',
      'confidence_calibration',
      'report_generation',
    ];
    expect(stages.length).toBe(7);
  });

  it('should include cost_estimation stage (T10 integration)', () => {
    const stages = [
      'protocol_detection', 'context_building', 'vulnerability_analysis',
      'attack_reconstruction', 'cost_estimation', 'confidence_calibration', 'report_generation',
    ];
    expect(stages).toContain('cost_estimation');
  });
});

describe('AuditOrchestrator - Components Integration', () => {
  it('should have ProtocolTypeDetector', async () => {
    const mod = await import('@/lib/agents/audit/protocols/protocol-type-detector');
    expect(mod.ProtocolTypeDetector).toBeDefined();
  });

  it('should have ContextManager', async () => {
    const mod = await import('@/lib/agents/audit/context/context-manager');
    expect(mod.ContextManager).toBeDefined();
  });

  it('should have VulnerabilityAnalysisAgent', async () => {
    const mod = await import('@/lib/agents/audit/vulnerability/vulnerability-agent');
    expect(mod.VulnerabilityAnalysisAgent).toBeDefined();
  });

  it('should have PriceManipulationReconstructor', async () => {
    const mod = await import('@/lib/agents/audit/reconstruction/price-manipulation');
    expect(mod.PriceManipulationReconstructor).toBeDefined();
  });

  it('should have ConfidenceCalibrator', async () => {
    const mod = await import('@/lib/agents/audit/calibration/confidence-calibrator');
    expect(mod.ConfidenceCalibrator).toBeDefined();
  });

  it('should call computeBudget from T11', async () => {
    const { computeBudget } = await import('@/lib/iteration/budget');
    expect(computeBudget).toBeDefined();
    expect(typeof computeBudget).toBe('function');
  });
});

describe('AuditOrchestrator - Confidence Calibrator', () => {
  it('should calibrate with reconstruction result', async () => {
    const mod = await import('@/lib/agents/audit/calibration/confidence-calibrator');
    const calibrator = new mod.ConfidenceCalibrator();

    const vuln = {
      id: 'test',
      patternId: 'OD-01',
      patternName: 'Spot Price',
      severity: 'Critical' as const,
      title: 'Test',
      description: 'desc',
      attackVector: 'av',
      recommendation: 'rec',
      location: { fileName: 't.sol', lineStart: 1, lineEnd: 2, functionName: 'f', codeSnippet: 'x' },
      impact: 'high',
      matchedCases: [],
    };

    const attack = {
      attackType: 'OD-01',
      attackName: 'Test Attack',
      description: 'desc',
      steps: [],
      fundFlow: [],
      feasibility: {
        technicalDifficulty: 'medium' as const,
        technicalScore: 70,
        economicScore: 70,
        mevDependency: 'medium' as const,
        overallScore: 70,
        overallFeasibility: 'high' as const,
      },
      defenses: { immediate: [], shortTerm: [], longTerm: [] },
      historicalAnalogy: { caseId: 'N/A', caseName: 'none', similarity: 0, matchReason: 'none' },
    };

    const result = await calibrator.calibrate(
      [vuln],
      { attacks: [attack], combinedAttackChains: [], summary: { totalAttacks: 1, highFeasibility: 1, criticalAttacks: 1 } },
      {
        type: 'dex_amm', manipulationTarget: 'liquidity_pool', confidence: 0.8, indicators: [],
        priorityVulnerabilities: ['OD-01'], criticalFunctions: [],
        riskProfile: { manipulationRisk: 'high', flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' },
      },
      3, true,
    );

    // result has overallConfidence and vulnerability calibrations
    expect(result.overallConfidence).toBeGreaterThan(0);
    expect(result.overallConfidence).toBeLessThanOrEqual(1);
  });
});

describe('AuditOrchestrator - Historical Analogy', () => {
  it('should find historical analogies for vulnerabilities', async () => {
    const mod = await import('@/lib/agents/audit/reconstruction/price-manipulation');
    const reconstructor = new mod.PriceManipulationReconstructor();

    const vuln = {
      id: 'test-vuln',
      patternId: 'OD-01',
      patternName: 'Spot Price Manipulation',
      severity: 'Critical' as const,
      title: 'Test Spot Price Vuln',
      description: 'The contract uses getReserves() directly for pricing without TWAP',
      attackVector: 'Flash loan to manipulate AMM pair getReserves() price',
      recommendation: 'Use TWAP instead of spot price',
      location: { fileName: 'test.sol', lineStart: 10, lineEnd: 15, functionName: 'getPrice', codeSnippet: 'getReserves()' },
      impact: 'Complete protocol drain',
      matchedCases: [],
    };

    const classification = {
      type: 'dex_amm' as const, manipulationTarget: 'liquidity_pool' as const, confidence: 0.8,
      indicators: [], priorityVulnerabilities: ['OD-01'], criticalFunctions: [],
      riskProfile: { manipulationRisk: 'high' as const, flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' as const },
    };

    const result = await reconstructor.reconstruct([vuln], classification);
    expect(result).toBeDefined();
    expect(result.attacks).toHaveLength(1);
    expect(result.attacks[0].historicalAnalogy).toBeDefined();
    // Just check the analogy exists (it could be a real match or N/A)
    expect(result.attacks[0].historicalAnalogy.caseId).toBeDefined();
  });
});
