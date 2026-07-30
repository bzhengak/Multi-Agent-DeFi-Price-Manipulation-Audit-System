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
import { QuotaExceededError } from '@/lib/llm';
import { loadHistoryCases } from '@/lib/storage/data';
import { computeBudget } from '@/lib/iteration/budget';
import { estimateAttackCost } from '@/lib/cost/estimator';
import { getCostRegistry } from '@/lib/cost/cost-registry';
import type { AttackCostEstimate } from '@/lib/cost/types';
import type { BlockchainId } from '@/lib/blockchain/config';

export interface OrchestratorProgress {
  stage: string;
  stageLabel?: string;
  progress: number;
  details?: string;
  elapsedMs?: number;
  iteration?: number;
  maxIterations?: number;
  findingsCount?: number;
  foundPatterns?: string[];
  severityCounts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  convergenceDelta?: number;
  classification?: {
    type: string;
    confidence: number;
    manipulationTarget: string;
    priorityVulnerabilities: string[];
    riskProfile: {
      manipulationRisk: string;
      flashloanExposure: boolean;
      oracleDependency: boolean;
      liquiditySensitivity: string;
    };
  };
  contextBuildings?: {
    relatedPatternCount: number;
    relatedCaseCount: number;
    focusAreas: string[];
    crossContractNodeCount: number;
    crossContractEdgeCount: number;
    externalDependencies: Array<{
      address: string;
      contractName: string;
      protocolRole?: string;
      callType: string;
      sourceLine: number;
    }>;
  };
  reconstructionStats?: {
    totalAttacks: number;
    highFeasibility: number;
    combinedChainCount: number;
  };
  costStats?: {
    estimatedCount: number;
    totalCount: number;
    sampleCosts: Array<{
      patternId: string;
      rangeLow: number;
      rangeHigh: number;
    }>;
  };
  calibrationStats?: {
    overallConfidence: number;
    high: number;
    medium: number;
    low: number;
  };
  error?: string;
}

export type ProgressCallback = (progress: OrchestratorProgress) => void;

export type StageName =
  | 'protocol_detection'
  | 'context_building'
  | 'cross_contract_tracing'
  | 'vulnerability_analysis'
  | 'attack_reconstruction'
  | 'cost_estimation'
  | 'confidence_calibration'
  | 'report_generation';

const DEFAULT_STAGE_BUDGETS: Record<StageName, number> = {
  protocol_detection: 5_000,
  context_building: 10_000,
  cross_contract_tracing: 30_000,
  // Raised: 8-10 OTAU iterations each calling the primary LLM.
  // With thinking mode (reasoning_effort=high), a single call can take 15-20 min.
  // Budget allows 3-4 thinking iterations within a single stage.
  vulnerability_analysis: 5_000_000,
  // Raised: attack reconstruction generates per-vuln narratives via primary LLM.
  // With thinking, a single multi-vuln reconstruction call can exceed 5 min.
  attack_reconstruction: 600_000,
  cost_estimation: 15_000,
  confidence_calibration: 5_000,
  // Raised: report_generation is a single LLM call (fastLlm -> GLM fallback when
  // no fast provider is configured) that can exceed the old 3-minute cap.
  report_generation: 600_000,
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
  codeTruncated: boolean;
  codeTruncationRatio: number;
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

export interface PartialAuditResult {
  partial: true;
  completedStages: StageName[];
  failedStage: StageName;
  error: string;
  classification?: ProtocolClassification;
  analysisResult?: VulnerabilityAnalysisResult;
  reconstruction?: ReconstructionResult;
  calibratedResult?: CalibratedResult;
  reportMarkdown?: string;
}

export class AuditOrchestrator {
  private detector: ProtocolTypeDetector;
  private contextManager: ContextManager;
  private reconstructor: PriceManipulationReconstructor;
  private calibrator: ConfidenceCalibrator;
  private llm: LLMClient;
  private fastLlm: LLMClient;
  private onProgress?: ProgressCallback;
  private readonly totalTimeout: number;
  private readonly stageBudgets: Record<StageName, number>;

  constructor(
    onProgress?: ProgressCallback,
    totalTimeout: number = 7_200_000,
    stageBudgets?: Partial<Record<StageName, number>>,
  ) {
    this.detector = new ProtocolTypeDetector();
    this.contextManager = new ContextManager();
    this.reconstructor = new PriceManipulationReconstructor();
    this.calibrator = new ConfidenceCalibrator();
    this.llm = new LLMClient({ maxRetries: 3, temperature: 0.1, maxTokens: 65536 });
    this.fastLlm = new LLMClient({ provider: 'fast', maxRetries: 2, temperature: 0.1, maxTokens: 65536 });
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
  ): Promise<AuditResult | PartialAuditResult> {
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
  ): Promise<AuditResult | PartialAuditResult> {
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
  ): Promise<AuditResult | PartialAuditResult> {
    const completedStages: StageName[] = [];
    let classification: ProtocolClassification | undefined;
    let analysisResult: VulnerabilityAnalysisResult | undefined;
    let reconstruction: ReconstructionResult | undefined;
    let calibratedResult: CalibratedResult | undefined;
    let reportMarkdown: string | undefined;
    let codeTruncated = false;
    let codeTruncationRatio = 0;

    // Step 1: Protocol Detection
    try {
      const stageStart = Date.now();
      this.emit({ stage: 'protocol_detection', stageLabel: '协议识别中', progress: 5, details: '正在识别合约协议类型...', elapsedMs: Date.now() - startTime });
      classification = await this.runStage('protocol_detection', async () => this.detector.detect(sourceCode));
      completedStages.push('protocol_detection');
      this.emit({
        stage: 'protocol_detection',
        stageLabel: '协议识别完成',
        progress: 10,
        details: `检测结果: ${classification!.type}（置信度: ${Math.round(classification!.confidence * 100)}%）`,
        elapsedMs: Date.now() - startTime,
        classification: {
          type: classification!.type,
          confidence: classification!.confidence,
          manipulationTarget: classification!.manipulationTarget,
          priorityVulnerabilities: classification!.priorityVulnerabilities,
          riskProfile: {
            manipulationRisk: classification!.riskProfile.manipulationRisk,
            flashloanExposure: classification!.riskProfile.flashloanExposure,
            oracleDependency: classification!.riskProfile.oracleDependency,
            liquiditySensitivity: classification!.riskProfile.liquiditySensitivity,
          },
        },
      });
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        return this.buildPartialResult(completedStages, 'protocol_detection', error.message, classification, analysisResult, reconstruction, calibratedResult, reportMarkdown);
      }
      throw error;
    }

    // Step 2: Context Build
    try {
      this.emit({ stage: 'context_building', stageLabel: '上下文构建中', progress: 15, details: '正在构建分析上下文 + 追踪跨合约依赖...', elapsedMs: Date.now() - startTime });
      const context = await this.runStage('context_building', () =>
        this.contextManager.build(sourceCode, contractName, blockchain, classification!, address, 'deep'),
      );
      completedStages.push('context_building');
      const graph = context.crossContractGraph;
      const deps = (graph?.graph?.edges ?? []).map(edge => {
        const toNode = graph?.graph?.nodes?.find(n => n.address?.toLowerCase() === edge.to?.toLowerCase());
        return {
          address: edge.to,
          contractName: toNode?.contractName || edge.to.slice(0, 10) + '...',
          protocolRole: toNode?.protocolRole,
          callType: edge.callType,
          sourceLine: edge.sourceLine,
        };
      });
      this.emit({
        stage: 'context_building',
        stageLabel: '上下文构建完成',
        progress: 20,
        details: `已加载 ${context.relevantPatterns.length} 个相关漏洞模式、${context.relevantCases.length} 个历史案例`,
        elapsedMs: Date.now() - startTime,
        contextBuildings: {
          relatedPatternCount: context.relevantPatterns.length,
          relatedCaseCount: context.relevantCases.length,
          focusAreas: context.focusAreas,
          crossContractNodeCount: graph?.nodeCount ?? 0,
          crossContractEdgeCount: graph?.edgeCount ?? 0,
          externalDependencies: deps,
        },
      });

      // Step 3: Vulnerability Analysis
      const topPatternId = classification!.priorityVulnerabilities[0] ?? 'OD-01';
      const budget = computeBudget(classification!, topPatternId, null);
      this.emit({
        stage: 'vulnerability_analysis',
        stageLabel: '漏洞分析中',
        progress: 22,
        details: `即将启动 ${budget.maxIterations} 轮迭代分析（置信度阈值: ${budget.confidenceThreshold}）`,
        elapsedMs: Date.now() - startTime,
        iteration: 1,
        maxIterations: budget.maxIterations,
        findingsCount: 0,
      });
      const vulnAgent = new VulnerabilityAnalysisAgent(
        sourceCode, contractName, blockchain, address, budget.maxIterations, true,
        (ip) => {
          this.emit({
            stage: 'vulnerability_analysis',
            stageLabel: '漏洞分析中',
            progress: 22 + Math.round((ip.iteration / budget.maxIterations) * 28),
            details: ip.iteration < ip.maxIterations
              ? `第 ${ip.iteration}/${budget.maxIterations} 轮分析中 | 已发现 ${ip.findingsCount} 个漏洞`
              : `分析完成 | 共发现 ${ip.findingsCount} 个漏洞`,
            elapsedMs: (Date.now() - startTime),
            iteration: ip.iteration,
            maxIterations: budget.maxIterations,
            findingsCount: ip.findingsCount,
            foundPatterns: ip.foundPatterns,
            severityCounts: {
              critical: ip.severityCounts['Critical'] || 0,
              high: ip.severityCounts['High'] || 0,
              medium: ip.severityCounts['Medium'] || 0,
              low: (ip.severityCounts['Low'] || 0) + (ip.severityCounts['Informational'] || 0),
            },
            convergenceDelta: ip.convergenceDelta,
          });
        },
      );
      const agentResult = await this.runStage('vulnerability_analysis', () => vulnAgent.run());
      const agentError = (agentResult.data as { error?: string })?.error;
      if (agentError) {
        throw new Error(`Vulnerability agent failed: ${agentError}`);
      }
      analysisResult = (agentResult.data as { analysisResult: VulnerabilityAnalysisResult }).analysisResult;
      if (!analysisResult) {
        throw new Error('Vulnerability agent returned no analysis result');
      }
      const iterationCount = (agentResult.data as { iterationCount: number }).iterationCount;
      codeTruncated = (agentResult.data as { codeTruncated?: boolean }).codeTruncated ?? false;
      codeTruncationRatio = (agentResult.data as { codeTruncationRatio?: number }).codeTruncationRatio ?? 0;
completedStages.push('vulnerability_analysis');
      const sevCounts = {
        critical: analysisResult.vulnerabilities.filter(v => v.severity === 'Critical').length,
        high: analysisResult.vulnerabilities.filter(v => v.severity === 'High').length,
        medium: analysisResult.vulnerabilities.filter(v => v.severity === 'Medium').length,
        low: analysisResult.vulnerabilities.filter(v => v.severity === 'Low' || v.severity === 'Informational').length,
      };
      const allPatterns = [...new Set(analysisResult.vulnerabilities.map(v => v.patternId))];
      this.emit({
        stage: 'vulnerability_analysis',
        stageLabel: '漏洞分析完成',
        progress: 50,
        details: `共 ${iterationCount} 轮迭代，发现 ${analysisResult.vulnerabilities.length} 个漏洞`,
        elapsedMs: Date.now() - startTime,
        iteration: iterationCount,
        maxIterations: budget.maxIterations,
        findingsCount: analysisResult.vulnerabilities.length,
        foundPatterns: allPatterns,
        severityCounts: sevCounts,
      });

      // Step 4: Attack Reconstruction
      this.emit({ stage: 'attack_reconstruction', stageLabel: '攻击重建中', progress: 55, details: '正在重建攻击场景与资金流向...', elapsedMs: Date.now() - startTime });
      reconstruction = await this.runStage('attack_reconstruction', () =>
        this.reconstructor.reconstruct(analysisResult!.vulnerabilities, classification!),
      );
      completedStages.push('attack_reconstruction');
      this.emit({
        stage: 'attack_reconstruction',
        stageLabel: '攻击重建完成',
        progress: 70,
        details: `${reconstruction!.summary.totalAttacks} 个攻击场景、${reconstruction!.combinedAttackChains.length} 条组合攻击链`,
        elapsedMs: Date.now() - startTime,
        reconstructionStats: {
          totalAttacks: reconstruction!.summary.totalAttacks,
          highFeasibility: reconstruction!.summary.highFeasibility,
          combinedChainCount: reconstruction!.combinedAttackChains.length,
        },
      });

      // Step 5: Cost Estimation
      this.emit({ stage: 'cost_estimation', stageLabel: '成本估算中', progress: 72, details: '正在估算攻击成本...', elapsedMs: Date.now() - startTime });
      const costRegistry = getCostRegistry();
      const costEstimates: Record<string, AttackCostEstimate> = {};
      for (const vuln of analysisResult!.vulnerabilities) {
        try {
          const estimate = await this.runStage('cost_estimation', () =>
            estimateAttackCost({ patternId: vuln.patternId, attackVector: vuln.attackVector }, blockchain as BlockchainId, costRegistry),
          );
          costEstimates[vuln.id] = estimate;
          (vuln as unknown as Record<string, unknown>).attackCostEstimate = estimate;
        } catch {
          // Cost estimation failure is non-fatal
        }
      }
      completedStages.push('cost_estimation');
      const costCount = Object.keys(costEstimates).length;
      const sampleCosts = Object.entries(costEstimates).slice(0, 4).map(([vid, est]) => {
        const v = analysisResult!.vulnerabilities.find(p => p.id === vid);
        return { patternId: v?.patternId ?? 'unknown', rangeLow: est.low, rangeHigh: est.high };
      });
      this.emit({
        stage: 'cost_estimation',
        stageLabel: '成本估算完成',
        progress: 75,
        details: `已估算 ${costCount}/${analysisResult!.vulnerabilities.length} 个漏洞的攻击成本`,
        elapsedMs: Date.now() - startTime,
        costStats: { estimatedCount: costCount, totalCount: analysisResult!.vulnerabilities.length, sampleCosts },
      });

      // Step 6: Confidence Calibration
      this.emit({ stage: 'confidence_calibration', stageLabel: '置信度校准中', progress: 75, details: '正在评估分析结果可信度...', elapsedMs: Date.now() - startTime });
      calibratedResult = await this.runStage('confidence_calibration', async () =>
        this.calibrator.calibrate(analysisResult!.vulnerabilities, reconstruction!, classification!, iterationCount, true),
      );
      completedStages.push('confidence_calibration');
      this.emit({
        stage: 'confidence_calibration',
        stageLabel: '置信度校准完成',
        progress: 80,
        details: `整体置信度: ${Math.round(calibratedResult!.overallConfidence * 100)}%`,
        elapsedMs: Date.now() - startTime,
        calibrationStats: {
          overallConfidence: calibratedResult!.overallConfidence,
          high: calibratedResult!.calibrationSummary.high,
          medium: calibratedResult!.calibrationSummary.medium,
          low: calibratedResult!.calibrationSummary.low,
        },
      });

      // Step 7: Report Generation (uses fast provider)
      this.emit({ stage: 'report_generation', stageLabel: '报告生成中', progress: 85, details: 'AI正在撰写增强版审计报告...', elapsedMs: Date.now() - startTime });
      reportMarkdown = await this.runStage('report_generation', () =>
        this.generateEnhancedReport(analysisResult!, reconstruction!, calibratedResult!, classification!, contractName, blockchain, address, codeTruncated, codeTruncationRatio),
      );
      completedStages.push('report_generation');
      this.emit({
        stage: 'report_generation',
        stageLabel: '报告生成完成',
        progress: 95,
        details: codeTruncated ? `报告已生成 [代码已被截断]` : `报告已生成`,
        elapsedMs: Date.now() - startTime,
      });
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        const failedStage = this.detectFailedStage(completedStages);
        return this.buildPartialResult(completedStages, failedStage, error.message, classification, analysisResult, reconstruction, calibratedResult, reportMarkdown);
      }
      throw error;
    }

    // Compile summary
    const vulns = analysisResult!.vulnerabilities;
    const summary = {
      overallRisk: analysisResult!.summary.riskLevel,
      totalIssues: vulns.length,
      critical: vulns.filter((v) => v.severity === 'Critical').length,
      high: vulns.filter((v) => v.severity === 'High').length,
      medium: vulns.filter((v) => v.severity === 'Medium').length,
      low: vulns.filter((v) => v.severity === 'Low' || v.severity === 'Informational').length,
      overallConfidence: calibratedResult!.overallConfidence,
      highFeasibilityAttacks: reconstruction!.summary.highFeasibility,
      combinedAttackChains: reconstruction!.combinedAttackChains.length,
    };

    this.emit({
    stage: 'completed',
    stageLabel: '分析完成',
    progress: 100,
    details: `审计完成，耗时 ${Math.round((Date.now() - startTime) / 1000)}秒`,
    elapsedMs: Date.now() - startTime,
  });

    // Learning evolution: ingest audit result into history.json (skipped in EVAL_MODE)
    if (process.env.EVAL_MODE !== 'true') {
      try {
        const { ingestAuditResult } = await import('../learning/case-ingester');
        const ingestResult = await ingestAuditResult(
          { analysisResult: analysisResult!, classification: classification!, reconstruction: reconstruction!, calibratedResult: calibratedResult!, reportMarkdown: reportMarkdown!, codeTruncated, codeTruncationRatio, summary },
          blockchain,
          address,
          { pocResult: undefined },
        );
        if (ingestResult.ingested) {
          console.log(`[Learning] ${ingestResult.tier}: ${ingestResult.reason}`);
        }
      } catch {
        // Learning ingest failure is non-fatal
      }
    }

    return {
      analysisResult: analysisResult!,
      classification: classification!,
      reconstruction: reconstruction!,
      calibratedResult: calibratedResult!,
      reportMarkdown: reportMarkdown!,
      codeTruncated,
      codeTruncationRatio,
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
  ): Promise<AuditResult | PartialAuditResult> {
    const completedStages: StageName[] = [];
    let classification: ProtocolClassification | undefined;
    let analysisResult: VulnerabilityAnalysisResult | undefined;
    let reconstruction: ReconstructionResult | undefined;
    let calibratedResult: CalibratedResult | undefined;
    let reportMarkdown: string | undefined;
    const codeTruncated = false;
    const codeTruncationRatio = 0;

    const placeholderCode = `// Source code unavailable for case ${caseId}\n// Attack description: ${caseNote}\n// Vulnerability pattern: ${vulnerabilityPattern}`;

    // Step 1: Protocol Detection
    try {
      this.emit({ stage: 'protocol_detection', progress: 5, details: 'Inferring protocol type from case metadata...' });
      classification = await this.runStage('protocol_detection', async () => this.detector.detect(placeholderCode));
      completedStages.push('protocol_detection');
      this.emit({ stage: 'protocol_detection', progress: 10, details: `Inferred: ${classification!.type} (confidence: ${classification!.confidence})` });
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        return this.buildPartialResult(completedStages, 'protocol_detection', error.message, classification, analysisResult, reconstruction, calibratedResult, reportMarkdown);
      }
      throw error;
    }

    // Step 2: Context Build
    try {
      this.emit({ stage: 'context_building', progress: 15, details: 'Building context from case metadata...' });
      const context = await this.runStage('context_building', () =>
        this.contextManager.build(placeholderCode, caseId, blockchain, classification!, contractAddress, 'standard'),
      );
      completedStages.push('context_building');

      // Step 3: Vulnerability Analysis
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
- Detected Type: ${classification!.type}
- Confidence: ${classification!.confidence}
- Priority Vulnerability Patterns: ${classification!.priorityVulnerabilities.join(', ')}

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

      analysisResult = await this.runStage('vulnerability_analysis', () =>
        this.llm.getJSON<VulnerabilityAnalysisResult>(VULNERABILITY_SYSTEM_PROMPT, contextPrompt),
      );
      completedStages.push('vulnerability_analysis');
      this.emit({ stage: 'vulnerability_analysis', progress: 50, details: `Inferred ${analysisResult!.vulnerabilities.length} vulnerabilities from context` });

      // Step 4: Attack Reconstruction
      this.emit({ stage: 'attack_reconstruction', progress: 55, details: 'Reconstructing attack scenarios...' });
      reconstruction = await this.runStage('attack_reconstruction', () =>
        this.reconstructor.reconstruct(analysisResult!.vulnerabilities, classification!),
      );
      completedStages.push('attack_reconstruction');
      this.emit({ stage: 'attack_reconstruction', progress: 70, details: `${reconstruction!.summary.totalAttacks} attacks reconstructed` });

      // Step 5: Confidence Calibration
      this.emit({ stage: 'confidence_calibration', progress: 75, details: 'Calibrating confidence scores...' });
      calibratedResult = await this.runStage('confidence_calibration', async () =>
        this.calibrator.calibrate(analysisResult!.vulnerabilities, reconstruction!, classification!, 1, false),
      );
      completedStages.push('confidence_calibration');
      this.emit({ stage: 'confidence_calibration', progress: 80, details: `Overall confidence: ${calibratedResult!.overallConfidence}` });

      // Step 6: Report Generation (uses fast provider)
      this.emit({ stage: 'report_generation', progress: 85, details: 'Generating audit report...' });
      reportMarkdown = await this.runStage('report_generation', () =>
        this.generateEnhancedReport(analysisResult!, reconstruction!, calibratedResult!, classification!, caseId, blockchain, contractAddress),
      );
      completedStages.push('report_generation');
      this.emit({ stage: 'report_generation', progress: 95, details: 'Report generated' });
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        const failedStage = this.detectFailedStage(completedStages);
        return this.buildPartialResult(completedStages, failedStage, error.message, classification, analysisResult, reconstruction, calibratedResult, reportMarkdown);
      }
      throw error;
    }

    const vulns = analysisResult!.vulnerabilities;
    const summary = {
      overallRisk: analysisResult!.summary.riskLevel,
      totalIssues: vulns.length,
      critical: vulns.filter((v) => v.severity === 'Critical').length,
      high: vulns.filter((v) => v.severity === 'High').length,
      medium: vulns.filter((v) => v.severity === 'Medium').length,
      low: vulns.filter((v) => v.severity === 'Low' || v.severity === 'Informational').length,
      overallConfidence: calibratedResult!.overallConfidence,
      highFeasibilityAttacks: reconstruction!.summary.highFeasibility,
      combinedAttackChains: reconstruction!.combinedAttackChains.length,
    };

    this.emit({ stage: 'completed', progress: 100, details: `Context-based audit complete in ${Date.now() - startTime}ms` });

    // Learning evolution: ingest audit result into history.json (skipped in EVAL_MODE)
    if (process.env.EVAL_MODE !== 'true') {
      try {
        const { ingestAuditResult } = await import('../learning/case-ingester');
        const ingestResult = await ingestAuditResult(
          { analysisResult: analysisResult!, classification: classification!, reconstruction: reconstruction!, calibratedResult: calibratedResult!, reportMarkdown: reportMarkdown!, codeTruncated, codeTruncationRatio, summary },
          blockchain,
          contractAddress,
          { pocResult: undefined },
        );
        if (ingestResult.ingested) {
          console.log(`[Learning] ${ingestResult.tier}: ${ingestResult.reason}`);
        }
      } catch {
        // Learning ingest failure is non-fatal
      }
    }

    return {
      analysisResult: analysisResult!,
      classification: classification!,
      reconstruction: reconstruction!,
      calibratedResult: calibratedResult!,
      reportMarkdown: reportMarkdown!,
      codeTruncated,
      codeTruncationRatio,
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
    codeTruncated?: boolean,
    codeTruncationRatio?: number,
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

    // Deterministic per-vulnerability metadata (not LLM-generated)
    const vulnMeta = analysisResult.vulnerabilities.map((v) => ({
      id: v.id,
      patternId: v.patternId,
      costEstimate: (v as unknown as Record<string, unknown>).attackCostEstimate || null,
      remediationTimeline: v.severity === 'Critical' ? '建议 24 小时内修复'
        : v.severity === 'High' ? '建议 7 天内修复'
        : '建议纳入常规 Sprint 周期修复',
      knowledgeReferences: v.knowledge_references || null,
    }));

    const truncationWarning = codeTruncated
      ? `> **⚠️ Warning**: The contract source code exceeds the LLM context window. Only ~${((1 - (codeTruncationRatio ?? 0)) * 100).toFixed(0)}% of the source code could be sent for analysis. Vulnerabilities in truncated code regions may be missed. Consider splitting the contract or running targeted sub-analyses for complete coverage.\n\n`
      : '';

    const userPrompt = `${truncationWarning}Please generate a comprehensive audit report based on the following enhanced analysis results.

## Contract Information
- Contract Name: ${contractName}
- Blockchain: ${blockchain}
- Contract Address: ${address || 'Unknown'}
- Protocol Type: ${classification.type} (confidence: ${classification.confidence})

## Vulnerability Analysis Results
\`\`\`json
${JSON.stringify(analysisResult, null, 2)}
\`\`\`

## Attack Reconstruction (T9 — Deterministic)
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

## Per-Vulnerability Metadata (Deterministic — use as-is, do not re-generate)
\`\`\`json
${JSON.stringify(vulnMeta, null, 2)}
\`\`\`

IMPORTANT: The per-vulnerability metadata above contains deterministic values (cost estimate, remediation timeline, knowledge references) calculated by the system, NOT by LLM. Use these values directly in the report. Do not re-estimate or re-generate them.

Please generate a professional audit report. Include attack reconstruction details, confidence levels, and the provided deterministic metadata. Output in Markdown format.`;

    return this.fastLlm.chat(REPORT_SYSTEM_PROMPT, userPrompt);
  }

  private detectFailedStage(completedStages: StageName[]): StageName {
    const allStages: StageName[] = [
      'protocol_detection', 'context_building', 'vulnerability_analysis',
      'attack_reconstruction', 'cost_estimation', 'confidence_calibration', 'report_generation',
    ];
    for (const stage of allStages) {
      if (!completedStages.includes(stage)) return stage;
    }
    return 'report_generation';
  }

  private buildPartialResult(
    completedStages: StageName[],
    failedStage: StageName,
    errorMessage: string,
    classification?: ProtocolClassification,
    analysisResult?: VulnerabilityAnalysisResult,
    reconstruction?: ReconstructionResult,
    calibratedResult?: CalibratedResult,
    reportMarkdown?: string,
  ): PartialAuditResult {
    return {
      partial: true,
      completedStages,
      failedStage,
      error: `LLM quota exceeded at stage "${failedStage}": ${errorMessage}`,
      classification,
      analysisResult,
      reconstruction,
      calibratedResult,
      reportMarkdown,
    };
  }

  private emit(progress: OrchestratorProgress): void {
    this.onProgress?.(progress);
  }
}
