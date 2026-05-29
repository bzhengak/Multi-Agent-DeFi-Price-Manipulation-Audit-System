import type { PriceManipulationAttack, AttackStep, FundFlow, DefenseRecommendation, DifficultyLevel } from './types';
import type { ProtocolClassification } from '../protocols/types';

type Vuln = {
  patternId: string;
  patternName: string;
  severity: string;
  title: string;
  description: string;
  attackVector: string;
  recommendation: string;
};

function getCategoryPrefix(patternId: string): string {
  return patternId.substring(0, 2);
}

const CATEGORY_TEMPLATES: Record<string, {
  name: string;
  steps: (vuln: Vuln) => AttackStep[];
  fundFlow: () => FundFlow[];
  defenses: () => DefenseRecommendation;
  difficulty: DifficultyLevel;
}> = {
  OD: {
    name: 'Oracle Dependency Exploit',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Obtain flash loan or accumulate capital', target: 'Flash loan provider / DEX', expectedOutcome: 'Large capital available for manipulation' },
      { phase: 'execution', actor: 'attacker', action: 'Execute trades to distort price feed', target: 'DEX liquidity pool / oracle feed', expectedOutcome: 'Price feed deviates from true market value' },
      { phase: 'manipulation', actor: 'oracle', action: 'Protocol reads manipulated price', target: 'Price-dependent function', expectedOutcome: 'Contract operates on false price data' },
      { phase: 'exploitation', actor: 'attacker', action: v.attackVector || 'Exploit price discrepancy for profit', target: 'Vulnerable contract', expectedOutcome: 'Favorable trade / mint / borrow at manipulated price' },
      { phase: 'profit', actor: 'attacker', action: 'Convert exploited tokens to profit asset', target: 'DEX', expectedOutcome: 'Realize financial gain' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan / unwind positions', target: 'Flash loan provider', expectedOutcome: 'Net profit secured' },
    ],
    fundFlow: () => [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'Capital', amount: 'flash loan amount', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'Tokens', amount: 'large volume', step: 2 },
      { from: { entity: 'Vulnerable Contract', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Profit', amount: 'price delta', step: 3 },
    ],
    defenses: () => ({
      immediate: ['Use TWAP instead of spot price', 'Add price deviation threshold checks', 'Verify oracle freshness (updatedAt, roundId)'],
      shortTerm: ['Integrate multiple oracle sources', 'Implement aggregator with outlier rejection'],
      longTerm: ['Adopt Chainlink decentralized oracles', 'Deploy oracle guardian monitoring'],
    }),
    difficulty: 'medium',
  },
  LR: {
    name: 'Liquidity / Reserve Exploit',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Obtain large capital via flash loan', target: 'Flash loan provider', expectedOutcome: 'Capital ready for manipulation' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Manipulate pool reserves or liquidity state', target: 'Liquidity pool / protocol', expectedOutcome: 'Reserve ratio / state distorted' },
      { phase: 'manipulation', actor: 'protocol', action: 'Contract reads manipulated reserves for calculation', target: 'Reserve-dependent function', expectedOutcome: 'Calculation based on false data' },
      { phase: 'exploitation', actor: 'attacker', action: 'Execute mint/burn/liquidate at favorable terms', target: 'Vulnerable contract', expectedOutcome: 'Disproportionate gain' },
      { phase: 'profit', actor: 'attacker', action: 'Convert exploited tokens to stablecoin', target: 'DEX', expectedOutcome: 'Financial gain realized' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan', target: 'Flash loan provider', expectedOutcome: 'Net profit secured' },
    ],
    fundFlow: () => [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'Capital', amount: 'large', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'Pool / Protocol', role: 'intermediate' }, asset: 'Tokens', amount: 'skewed ratio', step: 2 },
      { from: { entity: 'Protocol', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Profit', amount: 'extracted', step: 3 },
    ],
    defenses: () => ({
      immediate: ['Add reserve validation checks', 'Implement mint/burn slippage protection', 'Add time delay on reserve-dependent operations'],
      shortTerm: ['Use oracle for reserve data verification', 'Implement multi-sig control'],
      longTerm: ['Restructure reserve-independent logic', 'Time-weighted reserve averaging'],
    }),
    difficulty: 'medium',
  },
  TO: {
    name: 'Transaction Ordering / Timing Exploit',
    steps: (v) => [
      { phase: 'preparation', actor: 'mev_bot', action: 'Monitor mempool for target transaction', target: 'Mempool', expectedOutcome: 'Victim transaction identified' },
      { phase: 'execution', actor: 'mev_bot', action: v.attackVector || 'Insert transactions before and after victim', target: 'DEX pool', expectedOutcome: 'Price manipulated around victim trade' },
      { phase: 'manipulation', actor: 'victim', action: 'Victim transaction executes at manipulated price', target: 'DEX', expectedOutcome: 'Victim receives worse price than expected' },
      { phase: 'exploitation', actor: 'mev_bot', action: 'Back-run trade to restore price and extract profit', target: 'DEX pool', expectedOutcome: 'MEV profit captured' },
      { phase: 'profit', actor: 'mev_bot', action: 'Net profit from sandwich spread', target: 'DEX', expectedOutcome: 'MEV extracted' },
      { phase: 'cleanup', actor: 'mev_bot', action: 'No cleanup needed', target: 'N/A', expectedOutcome: 'Attack complete within block' },
    ],
    fundFlow: () => [
      { from: { entity: 'MEV Bot', role: 'source' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'Token A', amount: 'front-run buy', step: 1 },
      { from: { entity: 'Victim', role: 'source' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'Token A', amount: 'victim swap', step: 2 },
      { from: { entity: 'DEX Pool', role: 'intermediate' }, to: { entity: 'MEV Bot', role: 'destination' }, asset: 'Token B', amount: 'back-run sell', step: 3 },
    ],
    defenses: () => ({
      immediate: ['Add deadline parameter to all swap/deposit/withdraw', 'Enforce minimum slippage limits'],
      shortTerm: ['Integrate MEV protection (Flashbots)', 'Use private transaction pools'],
      longTerm: ['Deploy fair ordering mechanisms', 'Implement commit-reveal schemes'],
    }),
    difficulty: 'low',
  },
  AC: {
    name: 'Access Control / Privilege Exploit',
    steps: (v) => [
      { phase: 'preparation', actor: 'insider', action: 'Identify privileged function without timelock', target: 'Protocol admin functions', expectedOutcome: 'Attack vector identified' },
      { phase: 'execution', actor: 'insider', action: v.attackVector || 'Execute privileged function to alter critical parameters', target: 'Protocol state', expectedOutcome: 'Parameters / oracle address changed' },
      { phase: 'manipulation', actor: 'protocol', action: 'Protocol operates with altered parameters', target: 'Protocol logic', expectedOutcome: 'Economic model broken' },
      { phase: 'exploitation', actor: 'insider', action: 'Extract value through manipulated state', target: 'Protocol users', expectedOutcome: 'Funds extracted' },
      { phase: 'profit', actor: 'insider', action: 'Convert to stablecoin and exit', target: 'DEX / CEX', expectedOutcome: 'Financial gain' },
      { phase: 'cleanup', actor: 'insider', action: 'Cover tracks', target: 'N/A', expectedOutcome: 'Exit completed' },
    ],
    fundFlow: () => [
      { from: { entity: 'Privileged Account', role: 'source' }, to: { entity: 'Protocol', role: 'intermediate' }, asset: 'Privilege', amount: 'admin access', step: 1 },
      { from: { entity: 'Protocol', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Tokens', amount: 'extracted', step: 2 },
    ],
    defenses: () => ({
      immediate: ['Add timelock to all admin functions', 'Require multi-signature for critical changes'],
      shortTerm: ['Implement governance voting for parameter changes', 'Add parameter change events with monitoring'],
      longTerm: ['Full DAO governance migration', 'Deploy timelock with 48h+ delay'],
    }),
    difficulty: 'low',
  },
  CL: {
    name: 'Calculation Logic Exploit',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Analyze calculation logic for rounding/division flaws', target: 'Math-dependent functions', expectedOutcome: 'Exploitable calculation error identified' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Craft input to trigger rounding or decimal error', target: 'Calculation function', expectedOutcome: 'Incorrect output from math flaw' },
      { phase: 'manipulation', actor: 'protocol', action: 'Protocol uses flawed calculation result', target: 'Downstream logic', expectedOutcome: 'State updated with incorrect values' },
      { phase: 'exploitation', actor: 'attacker', action: 'Repeat exploit to compound gains', target: 'Vulnerable contract', expectedOutcome: 'Accumulated profit from repeated exploitation' },
      { phase: 'profit', actor: 'attacker', action: 'Convert gained tokens', target: 'DEX', expectedOutcome: 'Profit extraction' },
      { phase: 'cleanup', actor: 'attacker', action: 'No cleanup needed', target: 'N/A', expectedOutcome: 'Attack complete' },
    ],
    fundFlow: () => [
      { from: { entity: 'Attacker', role: 'source' }, to: { entity: 'Contract', role: 'intermediate' }, asset: 'Input tokens', amount: 'crafted amount', step: 1 },
      { from: { entity: 'Contract', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Excess tokens', amount: 'calculation delta', step: 2 },
    ],
    defenses: () => ({
      immediate: ['Use SafeMath / PRBMath libraries', 'Multiply before dividing', 'Add precision checks'],
      shortTerm: ['Implement price deviation limits', 'Add fuzz testing for extreme values'],
      longTerm: ['Formally verify critical calculation logic'],
    }),
    difficulty: 'high',
  },
  CR: {
    name: 'Composability Exploit',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Identify external protocol dependency', target: 'External protocol / bridge', expectedOutcome: 'Single point of failure found' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Manipulate external protocol state', target: 'External DEX / bridge', expectedOutcome: 'External price / state distorted' },
      { phase: 'manipulation', actor: 'protocol', action: 'Protocol reads manipulated external data', target: 'Dependent function', expectedOutcome: 'Cross-protocol influence accepted' },
      { phase: 'exploitation', actor: 'attacker', action: 'Trigger liquidation / mint at favorable terms', target: 'Vulnerable contract', expectedOutcome: 'Value extracted across protocols' },
      { phase: 'profit', actor: 'attacker', action: 'Convert extracted value to stablecoin', target: 'DEX', expectedOutcome: 'Profit realized' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan if used', target: 'Flash loan provider', expectedOutcome: 'Net profit secured' },
    ],
    fundFlow: () => [
      { from: { entity: 'Attacker', role: 'source' }, to: { entity: 'External Protocol', role: 'intermediate' }, asset: 'Tokens', amount: 'manipulation input', step: 1 },
      { from: { entity: 'Vulnerable Protocol', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Profit', amount: 'cross-protocol', step: 2 },
    ],
    defenses: () => ({
      immediate: ['Add circuit breaker for external dependency', 'Implement fallback price source'],
      shortTerm: ['Multi-source external price verification', 'Add consistency checks on external returns'],
      longTerm: ['Reduce external protocol dependency', 'Adopt internal oracle aggregation'],
    }),
    difficulty: 'medium',
  },
};

const COMBINED_CHAINS: Array<{ name: string; pattern: string[] }> = [
  { name: 'Classic Flash Loan to Oracle Chain', pattern: ['LR-01', 'OD-01', 'LR-03'] },
  { name: 'Oracle Feed to Liquidation Chain', pattern: ['OD-03', 'LR-02'] },
  { name: 'MEV Sandwich Chain', pattern: ['TO-01', 'TO-02'] },
  { name: 'Privilege Abuse Cascade', pattern: ['AC-01', 'AC-02', 'OD-03'] },
  { name: 'Cross-Protocol Cascading Chain', pattern: ['CR-01', 'CR-03'] },
];

import type { Vulnerability } from '../../vulnerability-agent';
import type { ReconstructionResult, AttackChain, FeasibilityAssessment, HistoricalAnalogy } from './types';
import { loadHistoryCases } from '@/lib/storage/data';

export class PriceManipulationReconstructor {
  async reconstruct(
    vulnerabilities: Vulnerability[],
    classification: ProtocolClassification,
  ): Promise<ReconstructionResult> {
    const attacks: PriceManipulationAttack[] = [];

    for (const vuln of vulnerabilities) {
      const prefix = getCategoryPrefix(vuln.patternId);
      const template = CATEGORY_TEMPLATES[prefix];
      if (!template) continue;

      const feasibility = this.assessFeasibility(vuln, template.difficulty);
      const historicalAnalogy = await this.findHistoricalAnalogy(vuln);

      attacks.push({
        attackType: vuln.patternId,
        attackName: `${template.name}: ${vuln.patternName}`,
        description: `${vuln.patternId} reconstructed from: ${vuln.title}. ${vuln.description}`,
        steps: template.steps(vuln),
        fundFlow: template.fundFlow(),
        feasibility,
        defenses: template.defenses(),
        historicalAnalogy,
      });
    }

    const combinedAttackChains = this.buildCombinedChains(attacks, classification);

    return {
      attacks,
      combinedAttackChains,
      summary: {
        totalAttacks: attacks.length,
        highFeasibility: attacks.filter((a) => a.feasibility.overallFeasibility === 'high').length,
        criticalAttacks: attacks.filter((a) => a.feasibility.overallScore >= 70).length,
      },
    };
  }

  private assessFeasibility(vuln: Vulnerability, defaultDifficulty: DifficultyLevel): FeasibilityAssessment {
    let techScore: number;
    switch (defaultDifficulty) {
      case 'low': techScore = 90; break;
      case 'medium': techScore = 70; break;
      case 'high': techScore = 50; break;
    }

    if (vuln.severity === 'Critical') techScore = Math.min(techScore + 10, 100);
    if (vuln.severity === 'Low' || vuln.severity === 'Informational') techScore = Math.max(techScore - 20, 10);

    const economicScore = vuln.severity === 'Critical' ? 90 : vuln.severity === 'High' ? 70 : 50;

    const hasFlashLoan = vuln.attackVector?.toLowerCase().includes('flash loan') ?? false;
    const mevDependency: FeasibilityAssessment['mevDependency'] = hasFlashLoan ? 'medium' : 'low';

    const overallScore = Math.round(techScore * 0.4 + economicScore * 0.6);

    let overallFeasibility: FeasibilityAssessment['overallFeasibility'];
    if (overallScore >= 70) overallFeasibility = 'high';
    else if (overallScore >= 40) overallFeasibility = 'medium';
    else overallFeasibility = 'low';

    return {
      technicalDifficulty: defaultDifficulty,
      technicalScore: techScore,
      economicScore,
      mevDependency,
      overallScore,
      overallFeasibility,
    };
  }

  private async findHistoricalAnalogy(vuln: Vulnerability): Promise<HistoricalAnalogy> {
    try {
      const casesData = await loadHistoryCases();
      const patternName = vuln.patternName.toLowerCase();

      let bestMatch: HistoricalAnalogy = {
        caseId: 'N/A',
        caseName: 'No matching case found',
        similarity: 0,
        matchReason: 'No historical case with similar pattern',
      };

      for (const c of casesData.cases) {
        const casePattern = c.vulnerability_pattern?.toLowerCase() ?? '';
        const similarity = this.computeSimilarity(patternName, casePattern, vuln.description, c.note ?? '');
        if (similarity > bestMatch.similarity) {
          bestMatch = {
            caseId: c.id,
            caseName: `${c.id} - ${c.blockchain_platform} (${c.time})`,
            similarity: Math.round(similarity * 100) / 100,
            matchReason: `Both involve ${vuln.patternName} pattern on ${c.blockchain_platform}.`,
          };
        }
      }

      return bestMatch;
    } catch {
      return {
        caseId: 'N/A',
        caseName: 'Case lookup failed',
        similarity: 0,
        matchReason: 'Could not load historical cases',
      };
    }
  }

  private computeSimilarity(pattern1: string, pattern2: string, desc1: string, desc2: string): number {
    let score = 0;
    if (pattern1 && pattern2 && (pattern1.includes(pattern2) || pattern2.includes(pattern1))) {
      score += 0.6;
    }
    const words1 = new Set(desc1.toLowerCase().split(/\s+/));
    const words2 = new Set(desc2.toLowerCase().split(/\s+/));
    const intersection = [...words1].filter((w) => words2.has(w) && w.length > 4);
    const union = new Set([...words1, ...words2]);
    if (union.size > 0) {
      score += (intersection.length / union.size) * 0.4;
    }
    return Math.min(score, 1.0);
  }

  private buildCombinedChains(attacks: PriceManipulationAttack[], _classification: ProtocolClassification): AttackChain[] {
    const foundTypes = new Set(attacks.map((a) => a.attackType));
    const chains: AttackChain[] = [];

    for (const chain of COMBINED_CHAINS) {
      const applicableTypes = chain.pattern.filter((p) => foundTypes.has(p));
      if (applicableTypes.length >= 2) {
        const avgFeasibility = applicableTypes
          .map((t) => attacks.find((a) => a.attackType === t)?.feasibility.overallScore ?? 0)
          .reduce((sum, s) => sum + s, 0) / applicableTypes.length;

        chains.push({
          name: chain.name,
          steps: applicableTypes.map((t, i) => ({
            attackType: t,
            order: i + 1,
            enablesNext: applicableTypes[i + 1] ?? 'none',
          })),
          combinedFeasibility: Math.round(avgFeasibility),
        });
      }
    }

    return chains.sort((a, b) => b.combinedFeasibility - a.combinedFeasibility);
  }
}
