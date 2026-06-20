import type { Vulnerability, VulnerabilityAnalysisResult } from '../../vulnerability-agent';
import type { ProtocolClassification } from '../protocols/types';
import type { ReconstructionResult } from '../reconstruction/types';
import type { CalibratedResult } from '../calibration/confidence-calibrator';
import { ProtocolTypeDetector } from '../protocols/protocol-type-detector';
import { ContextManager } from '../context/context-manager';
import { VulnerabilityAnalysisAgent } from '../vulnerability/vulnerability-agent';
import { PriceManipulationReconstructor } from '../reconstruction/price-manipulation';
import { ConfidenceCalibrator } from '../calibration/confidence-calibrator';
import { LLMClient } from '../../core/llm-client';
import { REPORT_SYSTEM_PROMPT } from '../../prompts/report';
import { VULNERABILITY_SYSTEM_PROMPT } from '../../prompts/vulnerability';
import { loadHistoryCases } from '@/lib/storage/data';
import { computeBudget } from '@/lib/iteration/budget';

export interface OrchestratorProgress {
  stage: string;
  progress: number;
  details?: string;
}

export type ProgressCallback = (progress: OrchestratorProgress) => void;

export type StageName =
  | 'protocol_detection'
  | 'context_building'
  | 'vulnerability_analysis'
  | 'attack_reconstruction'
  | 'confidence_calibration'
  | 'report_generation';

const DEFAULT_STAGE_BUDGETS: Record<StageName, number> = {
  protocol_detection: 5_000,
  context_building: 10_000,
  vulnerability_analysis: 600_000,
  attack_reconstruction: 60_000,
  confidence_calibration: 5_000,
  report_generation: 60_000,
};

export class StageTimeoutError extends Error {
  stage: StageName;
  constructor(stage: StageName, budgetMs: number) {
    super(`Stage "${stage}" timed out after ${budgetMs}ms`);
    this.name = 'StageTimeoutError';
    this.stage = stage;
  }
}

export interface AuditResult {
  analysisResult: VulnerabilityAnalysisResult;
  classification: ProtocolClassification;
  reconstruction: ReconstructionResult;
  calibratedResult: CalibratedResult;
  reportMarkdown: string;
  summary: {
    overallRisk: string;
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    overallConfidence: number;
    highFeasibilityAttacks: number;
    combinedAttackChains: number;
  };
}

export class AuditOrchestrator {
  private detector: ProtocolTypeDetector;
  private contextManager: ContextManager;
  private reconstructor: PriceManipulationReconstructor;
  private calibrator: ConfidenceCalibrator;
  private llm: LLMClient;
  private onProgress?: ProgressCallback;
  private readonly totalTimeout: number;
  private readonly stageBudgets: Record<StageName, number>;

  constructor(
    onProgress?: ProgressCallback,
    totalTimeout: number = 1000000,
    stageBudgets?: Partial<Record<StageName, number>>,
  ) {
    this.detector = new ProtocolTypeDetector();
    this.contextManager = new ContextManager();
    this.reconstructor = new PriceManipulationReconstructor();
    this.calibrator = new ConfidenceCalibrator();
    this.llm = new LLMClient({ maxRetries: 3, temperature: 0.1, maxTokens: 8192 });
    this.onProgress = onProgress;
    this.totalTimeout = totalTimeout;
    this.stageBudgets = { ...DEFAULT_STAGE_BUDGETS, ...stageBudgets };
  }

  private async runStage<T>(stage: StageName, fn: () => Promise<T>): Promise<T> {
    const budget = this.stageBudgets[stage];
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new StageTimeoutError(stage, budget)), budget);
    });
    return Promise.race([fn(), timeoutPromise]);
  }

  async run(
    sourceCode: string,
    contractName: string,
    blockchain: string,
    address?: string,
  ): Promise<AuditResult> {
    const startTime = Date.now();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Audit orchestrator timed out after ${this.totalTimeout}ms`)), this.totalTimeout);
    });

    return Promise.race([
      this.executePipeline(sourceCode, contractName, blockchain, address, startTime),
      timeoutPromise,
    ]);
  }

  async runFromContext(
    caseId: string,
    caseNote: string,
    vulnerabilityPattern: string,
    blockchain: string,
    contractAddress: string,
  ): Promise<AuditResult> {
    const startTime = Date.now();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Audit orchestrator timed out after ${this.totalTimeout}ms`)), this.totalTimeout);
    });

    return Promise.race([
      this.executeContextPipeline(caseId, caseNote, vulnerabilityPattern, blockchain, contractAddress, startTime),
      timeoutPromise,
    ]);
  }

  private async executePipeline(
    sourceCode: string,
    contractName: string,
    blockchain: string,
    address: string | undefined,
    startTime: number,
  ): Promise<AuditResult> {

    // Step 1: Protocol Detection (parallel-ready with context build)
    this.emit({ stage: 'protocol_detection', progress: 5, details: 'Identifying protocol type...' });
    const classification = await this.runStage('protocol_detection', async () => this.detector.detect(sourceCode));
    this.emit({ stage: 'protocol_detection', progress: 10, details: `Detected: ${classification.type} (confidence: ${classification.confidence})` });

    // Step 2: Context Build (parallel with detection in spec, but detection result feeds context)
    this.emit({ stage: 'context_building', progress: 15, details: 'Building analysis context...' });
    const context = await this.runStage('context_building', () =>
      this.contextManager.build(
        sourceCode,
        contractName,
        blockchain,
        classification,
        address,
        'deep',
      ),
    );

    // Step 3: Vulnerability Analysis (multi-round iterative, adaptive budget)
    const topPatternId = classification.priorityVulnerabilities[0] ?? 'OD-01';
    const budget = computeBudget(classification, topPatternId, null);
    this.emit({ stage: 'vulnerability_analysis', progress: 20, details: `Running multi-round vulnerability analysis (budget: ${budget.maxIterations} iterations, confidence threshold: ${budget.confidenceThreshold})...` });
    const vulnAgent = new VulnerabilityAnalysisAgent(
      sourceCode,
      contractName,
      blockchain,
      address,
      budget.maxIterations,
    );

    const agentResult = await this.runStage('vulnerability_analysis', () => vulnAgent.run());
    const analysisResult = (agentResult.data as { analysisResult: VulnerabilityAnalysisResult }).analysisResult;
    const iterationCount = (agentResult.data as { iterationCount: number }).iterationCount;
    this.emit({ stage: 'vulnerability_analysis', progress: 50, details: `Found ${analysisResult.vulnerabilities.length} vulnerabilities in ${iterationCount} iterations` });

    // Step 4: Attack Reconstruction
    this.emit({ stage: 'attack_reconstruction', progress: 55, details: 'Reconstructing attack scenarios...' });
    const reconstruction = await this.runStage('attack_reconstruction', () =>
      this.reconstructor.reconstruct(
        analysisResult.vulnerabilities,
        classification,
      ),
    );
    this.emit({ stage: 'attack_reconstruction', progress: 70, details: `${reconstruction.summary.totalAttacks} attacks reconstructed, ${reconstruction.combinedAttackChains.length} combined chains` });

    // Step 5: Confidence Calibration
    this.emit({ stage: 'confidence_calibration', progress: 75, details: 'Calibrating confidence scores...' });
    const calibratedResult = await this.runStage('confidence_calibration', async () =>
      this.calibrator.calibrate(
        analysisResult.vulnerabilities,
        reconstruction,
        classification,
        iterationCount,
        true,
      ),
    );
    this.emit({ stage: 'confidence_calibration', progress: 80, details: `Overall confidence: ${calibratedResult.overallConfidence}` });

    // Step 6: Report Generation
    this.emit({ stage: 'report_generation', progress: 85, details: 'Generating audit report...' });
    const reportMarkdown = await this.runStage('report_generation', () =>
      this.generateEnhancedReport(
        analysisResult,
        reconstruction,
        calibratedResult,
        classification,
        contractName,
        blockchain,
        address,
      ),
    );
    this.emit({ stage: 'report_generation', progress: 95, details: 'Report generated' });

    // Compile summary
    const vulns = analysisResult.vulnerabilities;
    const summary = {
      overallRisk: analysisResult.summary.riskLevel,
      totalIssues: vulns.length,
      critical: vulns.filter((v) => v.severity === 'Critical').length,
      high: vulns.filter((v) => v.severity === 'High').length,
      medium: vulns.filter((v) => v.severity === 'Medium').length,
      low: vulns.filter((v) => v.severity === 'Low' || v.severity === 'Informational').length,
      overallConfidence: calibratedResult.overallConfidence,
      highFeasibilityAttacks: reconstruction.summary.highFeasibility,
      combinedAttackChains: reconstruction.combinedAttackChains.length,
    };

    this.emit({ stage: 'completed', progress: 100, details: `Audit complete in ${Date.now() - startTime}ms` });

    return {
      analysisResult,
      classification,
      reconstruction,
      calibratedResult,
      reportMarkdown,
      summary,
    };
  }

  private async executeContextPipeline(
    caseId: string,
    caseNote: string,
    vulnerabilityPattern: string,
    blockchain: string,
    contractAddress: string,
    startTime: number,
  ): Promise<AuditResult> {
    const placeholderCode = `// Source code unavailable for case ${caseId}\n// Attack description: ${caseNote}\n// Vulnerability pattern: ${vulnerabilityPattern}`;

    this.emit({ stage: 'protocol_detection', progress: 5, details: 'Inferring protocol type from case metadata...' });
    const classification = await this.runStage('protocol_detection', async () => this.detector.detect(placeholderCode));
    this.emit({ stage: 'protocol_detection', progress: 10, details: `Inferred: ${classification.type} (confidence: ${classification.confidence})` });

    this.emit({ stage: 'context_building', progress: 15, details: 'Building context from case metadata...' });
    const context = await this.runStage('context_building', () =>
      this.contextManager.build(
        placeholderCode,
        caseId,
        blockchain,
        classification,
        contractAddress,
        'standard',
      ),
    );

    this.emit({ stage: 'vulnerability_analysis', progress: 20, details: 'Running context-based vulnerability analysis...' });

    const contextPrompt = `You are performing a context-based security audit because the contract source code is NOT available (all 3 source fetching methods failed: Etherscan V2, Sourcify, Heimdall decompilation). You must infer vulnerabilities based solely on the attack case metadata.

## Case Information
- Case ID: ${caseId}
- Blockchain: ${blockchain}
- Contract Address: ${contractAddress}
- Attack Description: ${caseNote}
- Vulnerability Pattern: ${vulnerabilityPattern}

## Source Code Status: UNAVAILABLE
The contract source code could not be obtained through any method (Etherscan V2, Sourcify, Heimdall decompilation all failed). Your analysis must be based on the attack case metadata above.

## Protocol Classification (Inferred)
- Detected Type: ${classification.type}
- Confidence: ${classification.confidence}
- Priority Vulnerability Patterns: ${classification.priorityVulnerabilities.join(', ')}

## Instructions
Based on the attack description and vulnerability pattern, infer:
1. What specific vulnerabilities likely existed in the contract
2. How the attack vector exploited those vulnerabilities
3. What the impact was
4. Recommendations for preventing similar attacks

Since source code is unavailable, your analysis should:
- Focus on the attack vector and impact described in the case
- Map to known vulnerability patterns from the database
- Provide recommendations based on the pattern mitigation strategies
- Use lineStart/lineEnd as 0 and functionName as "unknown" in locations

## Historical Case Database Reference
${JSON.stringify(
      context.relevantCases.map((c) => ({
        id: c.id,
        platform: c.platform,
        pattern: c.vulnerabilityPattern,
        description: c.description,
      })),
      null,
      2,
    )}

## Vulnerability Pattern Database
${JSON.stringify(context.relevantPatterns, null, 2)}

Please output the complete analysis results in the specified JSON format. Set codeQuality.overallScore to "F" since source code is unavailable.`;

    const analysisResult = await this.runStage('vulnerability_analysis', () =>
      this.llm.getJSON<VulnerabilityAnalysisResult>(
        VULNERABILITY_SYSTEM_PROMPT,
        contextPrompt,
      ),
    );
    this.emit({ stage: 'vulnerability_analysis', progress: 50, details: `Inferred ${analysisResult.vulnerabilities.length} vulnerabilities from context` });

    this.emit({ stage: 'attack_reconstruction', progress: 55, details: 'Reconstructing attack scenarios...' });
    const reconstruction = await this.runStage('attack_reconstruction', () =>
      this.reconstructor.reconstruct(
        analysisResult.vulnerabilities,
        classification,
      ),
    );
    this.emit({ stage: 'attack_reconstruction', progress: 70, details: `${reconstruction.summary.totalAttacks} attacks reconstructed` });

    this.emit({ stage: 'confidence_calibration', progress: 75, details: 'Calibrating confidence scores...' });
    const calibratedResult = await this.runStage('confidence_calibration', async () =>
      this.calibrator.calibrate(
        analysisResult.vulnerabilities,
        reconstruction,
        classification,
        1,
        false,
      ),
    );
    this.emit({ stage: 'confidence_calibration', progress: 80, details: `Overall confidence: ${calibratedResult.overallConfidence}` });

    this.emit({ stage: 'report_generation', progress: 85, details: 'Generating audit report...' });
    const reportMarkdown = await this.runStage('report_generation', () =>
      this.generateEnhancedReport(
        analysisResult,
        reconstruction,
        calibratedResult,
        classification,
        caseId,
        blockchain,
        contractAddress,
      ),
    );
    this.emit({ stage: 'report_generation', progress: 95, details: 'Report generated' });

    const vulns = analysisResult.vulnerabilities;
    const summary = {
      overallRisk: analysisResult.summary.riskLevel,
      totalIssues: vulns.length,
      critical: vulns.filter((v) => v.severity === 'Critical').length,
      high: vulns.filter((v) => v.severity === 'High').length,
      medium: vulns.filter((v) => v.severity === 'Medium').length,
      low: vulns.filter((v) => v.severity === 'Low' || v.severity === 'Informational').length,
      overallConfidence: calibratedResult.overallConfidence,
      highFeasibilityAttacks: reconstruction.summary.highFeasibility,
      combinedAttackChains: reconstruction.combinedAttackChains.length,
    };

    this.emit({ stage: 'completed', progress: 100, details: `Context-based audit complete in ${Date.now() - startTime}ms` });

    return {
      analysisResult,
      classification,
      reconstruction,
      calibratedResult,
      reportMarkdown,
      summary,
    };
  }

  private async generateEnhancedReport(
    analysisResult: VulnerabilityAnalysisResult,
    reconstruction: ReconstructionResult,
    calibratedResult: CalibratedResult,
    classification: ProtocolClassification,
    contractName: string,
    blockchain: string,
    address?: string,
  ): Promise<string> {
    const historyCases = await loadHistoryCases();
    const matchedCaseIds = analysisResult.vulnerabilities
      .flatMap((v) => v.matchedCases.map((m) => m.caseId));

    const caseDetails = historyCases.cases
      .filter((c) => matchedCaseIds.includes(c.id))
      .map((c) => ({
        id: c.id,
        time: c.time,
        platform: c.blockchain_platform,
        note: c.note?.substring(0, 300),
        vulnerabilityPattern: c.vulnerability_pattern,
      }));

    const reconstructionSummary = reconstruction.attacks.map((a) => ({
      type: a.attackType,
      name: a.attackName,
      feasibility: a.feasibility.overallFeasibility,
      feasibilityScore: a.feasibility.overallScore,
      steps: a.steps.map((s) => `[${s.phase}] ${s.action}`),
      defenses: {
        immediate: a.defenses.immediate,
        shortTerm: a.defenses.shortTerm,
        longTerm: a.defenses.longTerm,
      },
    }));

    const calibrationSummary = calibratedResult.vulnerabilities.map((cv) => ({
      id: cv.vulnerability.id,
      patternId: cv.vulnerability.patternId,
      confidence: cv.calibratedConfidence,
      dimensions: cv.dimensions.map((d) => `${d.name}: ${(d.score * 100).toFixed(0)}%`),
    }));

    const userPrompt = `Please generate a comprehensive audit report based on the following enhanced analysis results.

## Contract Information
- Contract Name: ${contractName}
- Blockchain: ${blockchain}
- Contract Address: ${address || 'Unknown'}
- Protocol Type: ${classification.type} (confidence: ${classification.confidence})

## Vulnerability Analysis Results
\`\`\`json
${JSON.stringify(analysisResult, null, 2)}
\`\`\`

## Attack Reconstruction
\`\`\`json
${JSON.stringify(reconstructionSummary, null, 2)}
\`\`\`

## Combined Attack Chains
${reconstruction.combinedAttackChains.length > 0
      ? JSON.stringify(reconstruction.combinedAttackChains, null, 2)
      : 'No combined attack chains detected.'}

## Confidence Calibration
- Overall Confidence: ${calibratedResult.overallConfidence}
- High confidence findings: ${calibratedResult.calibrationSummary.high}
- Medium confidence findings: ${calibratedResult.calibrationSummary.medium}
- Low confidence findings: ${calibratedResult.calibrationSummary.low}

## Calibration Details
\`\`\`json
${JSON.stringify(calibrationSummary, null, 2)}
\`\`\`

## Historical Case Details
${caseDetails.length > 0 ? JSON.stringify(caseDetails, null, 2) : 'No matched historical cases.'}

Please generate a professional audit report. Include attack reconstruction details and confidence levels. Output in Markdown format.`;

    return this.llm.chat(REPORT_SYSTEM_PROMPT, userPrompt);
  }

  private emit(progress: OrchestratorProgress): void {
    this.onProgress?.(progress);
  }
}
