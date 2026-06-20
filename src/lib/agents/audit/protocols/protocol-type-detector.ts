import type { ProtocolType, ProtocolClassification, ProtocolIndicator, RiskProfile } from './types';

interface PatternRule {
  regex: RegExp;
  weight: number;
  source: 'keyword' | 'structure';
}

interface ProtocolPattern {
  type: ProtocolType;
  rules: PatternRule[];
  typeWeight: number;
  priorityVulns: string[];
  criticalFns: string[];
  riskProfile: RiskProfile;
}

const PROTOCOL_PATTERNS: ProtocolPattern[] = [
  {
    type: 'dex_amm',
    rules: [
      { regex: /\bswap\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bexchange\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\btrade\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\border\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bliquidity\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bpool\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\binvariant\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bk\s*=\s*x\s*\*\s*y\b/i, weight: 0.6, source: 'keyword' },
      { regex: /function\s+\w*swap\w*/i, weight: 0.4, source: 'structure' },
      { regex: /function\s+\w*exchange\w*/i, weight: 0.4, source: 'structure' },
      { regex: /getReserves\(\)/, weight: 0.4, source: 'structure' },
      { regex: /kLast/, weight: 0.4, source: 'structure' },
      { regex: /fee.*\bswap\b/i, weight: 0.4, source: 'structure' },
    ],
    typeWeight: 0.9,
    priorityVulns: ['OD-01', 'OD-02', 'OD-03', 'OD-04', 'OD-05', 'LR-01', 'LR-03', 'TO-01', 'TO-02', 'TO-03', 'CL-01', 'CL-03', 'CR-03'],
    criticalFns: ['swap', 'mint', 'burn', 'sync', 'getReserves', 'skim', 'getAmountOut', 'getAmountIn'],
    riskProfile: { manipulationRisk: 'critical', flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' },
  },
  {
    type: 'perp',
    rules: [
      { regex: /\bperpetual\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bfunding.*rate\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bindex.*price\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bmark.*price\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bleverage\b/i, weight: 0.6, source: 'keyword' },
      { regex: /openPosition/, weight: 0.4, source: 'structure' },
      { regex: /closePosition/, weight: 0.4, source: 'structure' },
      { regex: /liquidatePosition/, weight: 0.4, source: 'structure' },
      { regex: /fundingRate/, weight: 0.4, source: 'structure' },
    ],
    typeWeight: 0.88,
    priorityVulns: ['OD-01', 'OD-02', 'OD-03', 'OD-04', 'OD-05', 'LR-01', 'LR-02', 'TO-01', 'TO-02', 'CL-02', 'CR-01', 'CR-03'],
    criticalFns: ['openPosition', 'closePosition', 'liquidate', 'settleFunding', 'getPosition'],
    riskProfile: { manipulationRisk: 'critical', flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' },
  },
  {
    type: 'lending',
    rules: [
      { regex: /\bborrow\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bcollateral\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bliquidation\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\binterest\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bhealth.*factor\b/i, weight: 0.6, source: 'keyword' },
      { regex: /liquidate\w*\(/i, weight: 0.4, source: 'structure' },
      { regex: /borrow\w*\(/i, weight: 0.4, source: 'structure' },
      { regex: /repay\w*\(/i, weight: 0.4, source: 'structure' },
      { regex: /healthFactor/, weight: 0.4, source: 'structure' },
    ],
    typeWeight: 0.85,
    priorityVulns: ['OD-01', 'OD-02', 'OD-03', 'OD-04', 'OD-05', 'LR-01', 'LR-02', 'TO-01', 'TO-03', 'CL-02', 'CR-01'],
    criticalFns: ['liquidate', 'borrow', 'repay', 'withdraw', 'deposit', 'accrueInterest'],
    riskProfile: { manipulationRisk: 'high', flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'medium' },
  },
  {
    type: 'yield_aggregator',
    rules: [
      { regex: /\byield\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bharvest\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bstrategy\b/i, weight: 0.6, source: 'keyword' },
      { regex: /harvest\(/, weight: 0.4, source: 'structure' },
      { regex: /earn\(/, weight: 0.4, source: 'structure' },
      { regex: /reportProfit/, weight: 0.4, source: 'structure' },
    ],
    typeWeight: 0.75,
    priorityVulns: ['LR-01', 'LR-03', 'TO-01', 'CR-01', 'CR-02', 'CR-03'],
    criticalFns: ['harvest', 'earn', 'withdraw', 'deposit'],
    riskProfile: { manipulationRisk: 'medium', flashloanExposure: true, oracleDependency: false, liquiditySensitivity: 'low' },
  },
  {
    type: 'bridge',
    rules: [
      { regex: /\bbridge\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\brelay\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bcross.*chain\b/i, weight: 0.6, source: 'keyword' },
      { regex: /relay\(/, weight: 0.4, source: 'structure' },
      { regex: /executeMessage/, weight: 0.4, source: 'structure' },
      { regex: /verifyProof/, weight: 0.4, source: 'structure' },
    ],
    typeWeight: 0.8,
    priorityVulns: ['LR-03', 'CL-02', 'CR-01', 'CR-02', 'CR-03', 'AC-02'],
    criticalFns: ['relay', 'execute', 'verify', 'mint', 'burn'],
    riskProfile: { manipulationRisk: 'critical', flashloanExposure: false, oracleDependency: false, liquiditySensitivity: 'low' },
  },
  {
    type: 'stablecoin',
    rules: [
      { regex: /\bstable\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bpeg\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bcollateral.*ratio\b/i, weight: 0.6, source: 'keyword' },
      { regex: /mint\(/, weight: 0.4, source: 'structure' },
      { regex: /burn\(/, weight: 0.4, source: 'structure' },
      { regex: /updatePeg/, weight: 0.4, source: 'structure' },
    ],
    typeWeight: 0.7,
    priorityVulns: ['OD-01', 'OD-02', 'OD-03', 'OD-04', 'OD-05', 'LR-03', 'TO-01', 'AC-02', 'AC-03', 'CR-01'],
    criticalFns: ['mint', 'burn', 'redeem', 'updatePeg'],
    riskProfile: { manipulationRisk: 'critical', flashloanExposure: true, oracleDependency: true, liquiditySensitivity: 'high' },
  },
  {
    type: 'options',
    rules: [
      { regex: /\boption\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bcall\b/i, weight: 0.5, source: 'keyword' },
      { regex: /\bput\b/i, weight: 0.5, source: 'keyword' },
      { regex: /\bpremium\b/i, weight: 0.5, source: 'keyword' },
      { regex: /\bexercise\b/i, weight: 0.5, source: 'keyword' },
      { regex: /\bstrike\b/i, weight: 0.5, source: 'keyword' },
      { regex: /createOption/i, weight: 0.4, source: 'structure' },
      { regex: /exerciseOption/i, weight: 0.4, source: 'structure' },
    ],
    typeWeight: 0.8,
    priorityVulns: ['OD-01', 'OD-03', 'OD-05', 'CL-02'],
    criticalFns: ['createOption', 'exerciseOption', 'settle', 'expire'],
    riskProfile: { manipulationRisk: 'high', flashloanExposure: false, oracleDependency: true, liquiditySensitivity: 'medium' },
  },
  {
    type: 'liquid_staking',
    rules: [
      { regex: /\bstake\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bunstake\b/i, weight: 0.6, source: 'keyword' },
      { regex: /\bstETH\b/i, weight: 0.5, source: 'keyword' },
      { regex: /\brETH\b/i, weight: 0.5, source: 'keyword' },
      { regex: /\bliquidStaking\b/i, weight: 0.5, source: 'keyword' },
      { regex: /\bwithdrawal\b/i, weight: 0.5, source: 'keyword' },
      { regex: /submit\s*\(/i, weight: 0.4, source: 'structure' },
      { regex: /deposit.*derive/i, weight: 0.4, source: 'structure' },
    ],
    typeWeight: 0.8,
    priorityVulns: ['OD-01', 'OD-02', 'LR-01', 'CR-01'],
    criticalFns: ['submit', 'stake', 'unstake', 'withdraw', 'getRate'],
    riskProfile: { manipulationRisk: 'critical', flashloanExposure: false, oracleDependency: true, liquiditySensitivity: 'medium' },
  },
];

const MANIPULATION_TARGETS: Record<ProtocolType, string> = {
  dex_amm: 'liquidity_pool',
  lending: 'oracle',
  perp: 'margin_trading',
  yield_aggregator: 'yield_farm',
  bridge: 'cross_chain',
  stablecoin: 'oracle',
  options: 'oracle',
  liquid_staking: 'oracle',
  unknown: 'oracle',
};

export class ProtocolTypeDetector {
  detect(sourceCode: string): ProtocolClassification {
    const scores: Map<ProtocolType, { codeScore: number; indicators: ProtocolIndicator[] }> = new Map();

    for (const pattern of PROTOCOL_PATTERNS) {
      let codeScore = 0;
      const indicators: ProtocolIndicator[] = [];

      for (const rule of pattern.rules) {
        const matches = sourceCode.match(rule.regex);
        if (matches && matches.length > 0) {
          codeScore += rule.weight * (rule.source === 'keyword' ? Math.min(matches.length, 3) : 1);
          indicators.push({
            name: rule.regex.source,
            weight: rule.weight,
            source: rule.source,
          });
        }
      }

      codeScore *= pattern.typeWeight;
      scores.set(pattern.type, { codeScore, indicators });
    }

    let bestType: ProtocolType = 'unknown';
    let bestScore = 0;
    let bestIndicators: ProtocolIndicator[] = [];

    for (const [type, data] of scores) {
      if (data.codeScore > bestScore) {
        bestScore = data.codeScore;
        bestType = type;
        bestIndicators = data.indicators;
      }
    }

    const compositeScore = bestScore;
    const confidence = Math.min(compositeScore / 5, 1.0);

    if (compositeScore <= 0.5) {
      return {
        type: 'unknown',
        manipulationTarget: 'oracle',
        confidence: 0,
        indicators: [],
        priorityVulnerabilities: ['OD-01', 'OD-02', 'LR-01', 'TO-01', 'TO-02'],
        criticalFunctions: [],
        riskProfile: { manipulationRisk: 'medium', flashloanExposure: false, oracleDependency: false, liquiditySensitivity: 'low' },
      };
    }

    const matchedPattern = PROTOCOL_PATTERNS.find((p) => p.type === bestType)!;

    return {
      type: bestType,
      manipulationTarget: MANIPULATION_TARGETS[bestType] as ProtocolClassification['manipulationTarget'],
      confidence,
      indicators: bestIndicators,
      priorityVulnerabilities: matchedPattern.priorityVulns,
      criticalFunctions: matchedPattern.criticalFns,
      riskProfile: matchedPattern.riskProfile,
    };
  }
}
