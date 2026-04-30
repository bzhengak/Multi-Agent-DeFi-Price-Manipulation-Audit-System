export { ProtocolTypeDetector } from './protocols/protocol-type-detector';
export type { ProtocolType, ProtocolClassification, ProtocolIndicator, RiskProfile, ManipulationTarget, RiskLevel } from './protocols/types';

export { ContextManager, type AnalysisContext, type RelevantPattern, type RelevantCase } from './context/context-manager';

export { VulnerabilityAnalysisAgent } from './vulnerability/vulnerability-agent';
export { PromptOptimizer, type OptimizedPrompt } from './vulnerability/prompt-optimizer';

export { PriceManipulationReconstructor } from './reconstruction/price-manipulation';
export type { AttackPhase, DifficultyLevel, AttackStep, FundFlowNode, FundFlow, FeasibilityAssessment, DefenseRecommendation, HistoricalAnalogy, PriceManipulationAttack, ReconstructionResult, AttackChain } from './reconstruction/types';

export { ConfidenceCalibrator, type CalibrationDimension, type CalibratedVulnerability, type CalibratedResult } from './calibration/confidence-calibrator';

export { AuditOrchestrator, type OrchestratorProgress, type ProgressCallback, type AuditResult } from './orchestrator/audit-orchestrator';
