export type AttackPhase = 'preparation' | 'execution' | 'manipulation' | 'exploitation' | 'profit' | 'cleanup';

export type DifficultyLevel = 'low' | 'medium' | 'high';

export interface AttackStep {
  phase: AttackPhase;
  actor: 'attacker' | 'victim' | 'protocol' | 'oracle' | 'mev_bot' | 'insider';
  action: string;
  target: string;
  expectedOutcome: string;
}

export interface FundFlowNode {
  entity: string;
  role: 'source' | 'intermediate' | 'destination';
  amount?: string;
}

export interface FundFlow {
  from: FundFlowNode;
  to: FundFlowNode;
  asset: string;
  amount?: string;
  step: number;
}

export interface FeasibilityAssessment {
  technicalDifficulty: DifficultyLevel;
  technicalScore: number;
  economicScore: number;
  mevDependency: 'none' | 'low' | 'medium' | 'high';
  overallScore: number;
  overallFeasibility: 'low' | 'medium' | 'high';
}

export interface DefenseRecommendation {
  immediate: string[];
  shortTerm: string[];
  longTerm: string[];
}

export interface HistoricalAnalogy {
  caseId: string;
  caseName: string;
  similarity: number;
  matchReason: string;
}

export interface PriceManipulationAttack {
  attackType: string;
  attackName: string;
  description: string;
  steps: AttackStep[];
  fundFlow: FundFlow[];
  feasibility: FeasibilityAssessment;
  defenses: DefenseRecommendation;
  historicalAnalogy: HistoricalAnalogy;
}

export interface ReconstructionResult {
  attacks: PriceManipulationAttack[];
  combinedAttackChains: AttackChain[];
  summary: {
    totalAttacks: number;
    highFeasibility: number;
    criticalAttacks: number;
  };
}

export interface AttackChain {
  name: string;
  steps: Array<{
    attackType: string;
    order: number;
    enablesNext: string;
  }>;
  combinedFeasibility: number;
}
