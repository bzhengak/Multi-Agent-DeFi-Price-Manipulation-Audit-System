export type ProtocolType =
  | 'dex'
  | 'amm'
  | 'lending'
  | 'perp'
  | 'yield_aggregator'
  | 'bridge'
  | 'stablecoin'
  | 'unknown';

export type ManipulationTarget =
  | 'oracle'
  | 'liquidity_pool'
  | 'margin_trading'
  | 'yield_farm'
  | 'cross_chain';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ProtocolIndicator {
  name: string;
  weight: number;
  source: 'keyword' | 'structure';
}

export interface RiskProfile {
  manipulationRisk: RiskLevel;
  flashloanExposure: boolean;
  oracleDependency: boolean;
  liquiditySensitivity: RiskLevel;
}

export interface ProtocolClassification {
  type: ProtocolType;
  manipulationTarget: ManipulationTarget;
  confidence: number;
  indicators: ProtocolIndicator[];
  priorityVulnerabilities: string[];
  criticalFunctions: string[];
  riskProfile: RiskProfile;
}
