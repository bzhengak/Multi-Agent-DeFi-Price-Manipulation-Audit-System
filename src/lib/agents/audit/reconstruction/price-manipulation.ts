import type { PriceManipulationAttack, AttackStep, FundFlow, DefenseRecommendation, DifficultyLevel } from './types';
import type { ProtocolClassification } from '../protocols/types';
import { VULNERABILITY_SYSTEM_PROMPT } from '../../prompts/vulnerability';

type Vuln = {
  patternId: string;
  patternName: string;
  severity: string;
  title: string;
  description: string;
  attackVector: string;
  recommendation: string;
};

const ATTACK_TEMPLATES: Record<string, {
  name: string;
  steps: (vuln: Vuln) => AttackStep[];
  fundFlow: () => FundFlow[];
  defenses: () => DefenseRecommendation;
  difficulty: DifficultyLevel;
}> = {
  VP001: {
    name: 'Oracle Manipulation',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Obtain flash loan from lending protocol', target: 'Flash loan provider', expectedOutcome: 'Large capital available in single transaction' },
      { phase: 'execution', actor: 'attacker', action: 'Execute large swap to distort DEX pool price', target: 'DEX liquidity pool', expectedOutcome: 'Oracle price deviates significantly from true value' },
      { phase: 'manipulation', actor: 'oracle', action: 'Protocol reads manipulated spot price from pool', target: 'Price oracle', expectedOutcome: 'Contract operates on false price data' },
      { phase: 'exploitation', actor: 'attacker', action: v.attackVector || 'Exploit price discrepancy for profit', target: 'Vulnerable contract', expectedOutcome: 'Favorable trade/mint/borrow at manipulated price' },
      { phase: 'profit', actor: 'attacker', action: 'Convert exploited tokens to profit asset', target: 'DEX', expectedOutcome: 'Realize financial gain' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan', target: 'Flash loan provider', expectedOutcome: 'Net profit after loan repayment' },
    ],
    fundFlow: () => [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'USDC', amount: '~millions', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'Token A', amount: 'large', step: 2 },
      { from: { entity: 'Vulnerable Contract', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Token B', amount: 'excess', step: 3 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'Flash Loan', role: 'destination' }, asset: 'USDC', amount: 'principal + fee', step: 4 },
    ],
    defenses: () => ({
      immediate: ['Use TWAP instead of spot price', 'Add price deviation threshold checks'],
      shortTerm: ['Integrate multiple oracle sources', 'Implement price volatility limits'],
      longTerm: ['Adopt Chainlink decentralized oracles', 'Deploy oracle guardian monitoring'],
    }),
    difficulty: 'medium',
  },
  VP002: {
    name: 'Flash Loan Attack',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Initiate flash loan for massive capital', target: 'Flash loan provider (Aave/dYdX)', expectedOutcome: 'Borrowed funds available within same tx' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Use borrowed funds to manipulate protocol state', target: 'Target protocol', expectedOutcome: 'Protocol state altered within single transaction' },
      { phase: 'manipulation', actor: 'protocol', action: 'Protocol processes transaction with no cross-block validation', target: 'Vulnerable contract', expectedOutcome: 'State change accepted without delay' },
      { phase: 'exploitation', actor: 'attacker', action: 'Extract value from manipulated state', target: 'Protocol treasury/users', expectedOutcome: 'Unauthorized gain' },
      { phase: 'profit', actor: 'attacker', action: 'Convert extracted value to stablecoin', target: 'DEX', expectedOutcome: 'Profit realized' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan in same transaction', target: 'Flash loan provider', expectedOutcome: 'Attack completed, net profit extracted' },
    ],
    fundFlow: () => [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'ETH/USDC', amount: 'flash loan amount', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'Protocol', role: 'intermediate' }, asset: 'manipulated', amount: 'large', step: 2 },
      { from: { entity: 'Protocol', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'profit token', amount: 'excess', step: 3 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'Flash Loan', role: 'destination' }, asset: 'ETH/USDC', amount: 'repayment', step: 4 },
    ],
    defenses: () => ({
      immediate: ['Add time locks on critical operations', 'Limit cumulative effect within single transaction'],
      shortTerm: ['Use on-chain historical price averages', 'Implement transaction volume limits'],
      longTerm: ['Deploy MEV protection mechanisms', 'Use Commit-Reveal schemes'],
    }),
    difficulty: 'low',
  },
  VP003: {
    name: 'Reserve Manipulation',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Identify reserve-dependent calculation', target: 'Pool contract', expectedOutcome: 'Reserve ratio used for pricing/rewards' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Transfer tokens directly to pool to inflate reserves', target: 'Liquidity pool', expectedOutcome: 'Reserve balance artificially inflated' },
      { phase: 'manipulation', actor: 'protocol', action: 'Contract reads inflated reserve for calculation', target: 'Reserve-dependent function', expectedOutcome: 'Skewed calculation output' },
      { phase: 'exploitation', actor: 'attacker', action: 'Call skim() or exploit calculation error', target: 'Vulnerable contract', expectedOutcome: 'Extract excess tokens' },
      { phase: 'profit', actor: 'attacker', action: 'Swap extracted tokens for profit', target: 'DEX', expectedOutcome: 'Financial gain realized' },
      { phase: 'cleanup', actor: 'attacker', action: 'Remove direct transfers if any remaining', target: 'Pool', expectedOutcome: 'Traces minimized' },
    ],
    fundFlow: () => [
      { from: { entity: 'Attacker', role: 'source' }, to: { entity: 'Pool', role: 'intermediate' }, asset: 'Token', amount: 'direct transfer', step: 1 },
      { from: { entity: 'Pool', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Excess Token', amount: 'skim/exploit', step: 2 },
    ],
    defenses: () => ({
      immediate: ['Remove direct reserve modification functions', 'Add reserve validation checks'],
      shortTerm: ['Use oracle for reserve data', 'Implement multi-sig control'],
      longTerm: ['Completely restructure reserve management logic'],
    }),
    difficulty: 'medium',
  },
  VP004: {
    name: 'Price Calculation Flaw',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Analyze price calculation for precision/boundary issues', target: 'Calculation function', expectedOutcome: 'Identify exploitable math flaw' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Craft input parameters to trigger calculation error', target: 'Price calculation function', expectedOutcome: 'Incorrect price output' },
      { phase: 'manipulation', actor: 'protocol', action: 'Contract uses flawed calculation result', target: 'Downstream logic', expectedOutcome: 'State updated with wrong values' },
      { phase: 'exploitation', actor: 'attacker', action: 'Repeat exploit to compound gains', target: 'Vulnerable contract', expectedOutcome: 'Accumulated profit from repeated exploitation' },
      { phase: 'profit', actor: 'attacker', action: 'Convert gained tokens', target: 'DEX', expectedOutcome: 'Profit extraction' },
      { phase: 'cleanup', actor: 'attacker', action: 'No cleanup needed - pure math exploit', target: 'N/A', expectedOutcome: 'Attack complete' },
    ],
    fundFlow: () => [
      { from: { entity: 'Attacker', role: 'source' }, to: { entity: 'Contract', role: 'intermediate' }, asset: 'Input tokens', amount: 'crafted amount', step: 1 },
      { from: { entity: 'Contract', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Excess tokens', amount: 'calculation delta', step: 2 },
    ],
    defenses: () => ({
      immediate: ['Use safe math libraries', 'Add precision checks'],
      shortTerm: ['Implement price deviation limits', 'Increase test coverage'],
      longTerm: ['Formally verify critical calculation logic'],
    }),
    difficulty: 'high',
  },
  VP005: {
    name: 'Liquidity Pool Manipulation',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Obtain flash loan or large capital', target: 'Flash loan/own funds', expectedOutcome: 'Capital ready for manipulation' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Add/remove liquidity with skewed ratios', target: 'Liquidity pool', expectedOutcome: 'LP token minting logic exploited' },
      { phase: 'manipulation', actor: 'protocol', action: 'Pool state distorted, LP calculations affected', target: 'AMM contract', expectedOutcome: 'Abnormal LP values or rewards' },
      { phase: 'exploitation', actor: 'attacker', action: 'Remove liquidity or claim rewards at favorable terms', target: 'Pool/Reward contract', expectedOutcome: 'Disproportionate gain' },
      { phase: 'profit', actor: 'attacker', action: 'Convert to stablecoin', target: 'DEX', expectedOutcome: 'Profit realized' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan', target: 'Flash loan provider', expectedOutcome: 'Net profit secured' },
    ],
    fundFlow: () => [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'Capital', amount: 'large', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'LP Pool', role: 'intermediate' }, asset: 'Tokens', amount: 'skewed', step: 2 },
      { from: { entity: 'LP Pool', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'LP/Excess tokens', amount: 'disproportionate', step: 3 },
    ],
    defenses: () => ({
      immediate: ['Set minimum liquidity requirements', 'Add price impact warnings'],
      shortTerm: ['Implement dynamic slippage protection', 'Limit large liquidity removals'],
      longTerm: ['Use tiered liquidity mechanisms'],
    }),
    difficulty: 'medium',
  },
  VP006: {
    name: 'Slippage Control Bypass',
    steps: (v) => [
      { phase: 'preparation', actor: 'mev_bot', action: 'Detect pending user transaction in mempool', target: 'Mempool', expectedOutcome: 'Target transaction identified' },
      { phase: 'execution', actor: 'mev_bot', action: 'Front-run: buy before victim', target: 'DEX pool', expectedOutcome: 'Price moved against victim' },
      { phase: 'manipulation', actor: 'victim', action: 'User transaction executes at worse price than expected', target: 'DEX', expectedOutcome: 'Slippage tolerance consumed' },
      { phase: 'exploitation', actor: 'mev_bot', action: 'Back-run: sell after victim', target: 'DEX pool', expectedOutcome: 'Price restored, MEV profit captured' },
      { phase: 'profit', actor: 'mev_bot', action: 'Net profit from front-run + back-run spread', target: 'DEX', expectedOutcome: 'MEV extracted' },
      { phase: 'cleanup', actor: 'mev_bot', action: 'No cleanup needed', target: 'N/A', expectedOutcome: 'Attack complete' },
    ],
    fundFlow: () => [
      { from: { entity: 'MEV Bot', role: 'source' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'Token A', amount: 'front-run buy', step: 1 },
      { from: { entity: 'Victim', role: 'source' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'Token A', amount: 'victim swap', step: 2 },
      { from: { entity: 'DEX Pool', role: 'intermediate' }, to: { entity: 'MEV Bot', role: 'destination' }, asset: 'Token B', amount: 'back-run sell', step: 3 },
    ],
    defenses: () => ({
      immediate: ['Add minimum slippage limits', 'Implement TWAP execution'],
      shortTerm: ['Integrate MEV protection', 'Use private transaction pools'],
      longTerm: ['Deploy fair ordering mechanisms'],
    }),
    difficulty: 'low',
  },
  VP007: {
    name: 'TWAP Manipulation',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Obtain flash loan across multiple blocks', target: 'Flash loan provider', expectedOutcome: 'Capital available for multi-block manipulation' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Execute trades across multiple blocks to skew TWAP', target: 'DEX pool', expectedOutcome: 'TWAP accumulator manipulated' },
      { phase: 'manipulation', actor: 'oracle', action: 'Protocol reads manipulated TWAP value', target: 'TWAP oracle', expectedOutcome: 'Time-averaged price still deviates' },
      { phase: 'exploitation', actor: 'attacker', action: 'Use distorted TWAP for favorable protocol interaction', target: 'Vulnerable contract', expectedOutcome: 'Profit from TWAP deviation' },
      { phase: 'profit', actor: 'attacker', action: 'Extract profit and unwind positions', target: 'DEX', expectedOutcome: 'Gain realized' },
      { phase: 'cleanup', actor: 'attacker', action: 'Repay flash loan', target: 'Flash loan provider', expectedOutcome: 'Net profit secured' },
    ],
    fundFlow: () => [
      { from: { entity: 'Flash Loan', role: 'source' }, to: { entity: 'Attacker', role: 'intermediate' }, asset: 'Capital', amount: 'large', step: 1 },
      { from: { entity: 'Attacker', role: 'intermediate' }, to: { entity: 'DEX Pool', role: 'intermediate' }, asset: 'Tokens', amount: 'multi-block', step: 2 },
      { from: { entity: 'Vulnerable Contract', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Profit', amount: 'TWAP delta', step: 3 },
    ],
    defenses: () => ({
      immediate: ['Increase TWAP window length', 'Implement price deviation limits'],
      shortTerm: ['Integrate external price source verification', 'Monitor abnormal TWAP movements'],
      longTerm: ['Use Chainlink price aggregators'],
    }),
    difficulty: 'high',
  },
  VP008: {
    name: 'AMM Exploitation',
    steps: (v) => [
      { phase: 'preparation', actor: 'attacker', action: 'Identify AMM invariant vulnerability or reentrancy', target: 'AMM contract', expectedOutcome: 'Attack vector identified' },
      { phase: 'execution', actor: 'attacker', action: v.attackVector || 'Execute reentrancy or batch swap to exploit AMM logic', target: 'AMM contract', expectedOutcome: 'AMM state corrupted' },
      { phase: 'manipulation', actor: 'protocol', action: 'AMM invariant broken or global average price manipulated', target: 'AMM internal state', expectedOutcome: 'Incorrect state persisted' },
      { phase: 'exploitation', actor: 'attacker', action: 'Extract value from corrupted AMM state', target: 'AMM pool', expectedOutcome: 'Tokens drained' },
      { phase: 'profit', actor: 'attacker', action: 'Convert drained tokens to stablecoin', target: 'DEX', expectedOutcome: 'Profit realized' },
      { phase: 'cleanup', actor: 'attacker', action: 'Cover tracks if reentrancy used', target: 'N/A', expectedOutcome: 'Attack complete' },
    ],
    fundFlow: () => [
      { from: { entity: 'Attacker', role: 'source' }, to: { entity: 'AMM Pool', role: 'intermediate' }, asset: 'Tokens', amount: 'exploit input', step: 1 },
      { from: { entity: 'AMM Pool', role: 'intermediate' }, to: { entity: 'Attacker', role: 'destination' }, asset: 'Drained tokens', amount: 'excess', step: 2 },
    ],
    defenses: () => ({
      immediate: ['Formally verify AMM contract', 'Add boundary checks'],
      shortTerm: ['Limit extreme parameter values', 'Implement pause mechanisms'],
      longTerm: ['Use audited AMM templates'],
    }),
    difficulty: 'high',
  },
};

const COMBINED_CHAINS: Array<{ name: string; pattern: string[] }> = [
  { name: 'Classic Flash Loan Chain', pattern: ['VP002', 'VP001', 'VP005'] },
  { name: 'TWAP Attack Chain', pattern: ['VP002', 'VP007', 'VP001'] },
  { name: 'Slippage Attack Chain', pattern: ['VP006', 'VP008', 'VP005'] },
  { name: 'Reserve Attack Chain', pattern: ['VP003', 'VP004', 'VP001'] },
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
      const template = ATTACK_TEMPLATES[vuln.patternId];
      if (!template) continue;

      const feasibility = this.assessFeasibility(vuln, template.difficulty);
      const historicalAnalogy = await this.findHistoricalAnalogy(vuln);

      attacks.push({
        attackType: vuln.patternId,
        attackName: template.name,
        description: `${template.name} attack reconstructed from: ${vuln.title}. ${vuln.description}`,
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
            matchReason: `Both involve ${vuln.patternName} pattern. Case occurred on ${c.blockchain_platform}.`,
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

  private buildCombinedChains(attacks: PriceManipulationAttack[], classification: ProtocolClassification): AttackChain[] {
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
