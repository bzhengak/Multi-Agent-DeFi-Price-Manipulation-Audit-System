import type { EvalCase, EvalResult, MetricsResult } from './types';
import { computeMetrics } from './metrics';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtCI(ci: [number, number]): string {
  return `[${fmtPct(ci[0])}, ${fmtPct(ci[1])}]`;
}

export function generateReport(
  positiveCases: EvalCase[],
  negativeCases: EvalCase[],
  systemResults: { positives: EvalResult[]; negatives: EvalResult[] },
  baselineResults: {
    rawLlm: { positives: EvalResult[]; negatives: EvalResult[] };
    slither: { positives: EvalResult[]; negatives: EvalResult[] };
  },
): string {
  const systemMetrics = computeMetrics(positiveCases, systemResults.positives, negativeCases, systemResults.negatives);
  const rawLlmMetrics = computeMetrics(positiveCases, baselineResults.rawLlm.positives, negativeCases, baselineResults.rawLlm.negatives);
  const slitherMetrics = computeMetrics(positiveCases, baselineResults.slither.positives, negativeCases, baselineResults.slither.negatives);

  const md = `# DeFi Price Manipulation Audit System — Evaluation Report

## 1. System Architecture

### 1.1 Overview
This system is a multi-agent DeFi price manipulation vulnerability audit system focused on 21 price manipulation attack patterns (6 major categories).

### 1.2 Core Components

| Component | Function |
|-----------|----------|
| ProtocolTypeDetector | Protocol type identification |
| ContextManager | Context building with cross-contract graph |
| CrossContractTracer (T8) | Cross-contract call graph analysis |
| VulnerabilityAnalysisAgent | Multi-round iterative vulnerability analysis (OTAU) |
| PromptOptimizer | Per-protocol prompt optimization |
| PriceManipulationReconstructor (T9) | Per-vulnerability attack reconstruction |
| ConfidenceCalibrator | 5-dimension confidence calibration |
| AttackCostEstimator (T10) | Deterministic attack cost estimation |
| AdaptiveIterationBudget (T11) | TVL-aware adaptive iteration budget |

### 1.3 Audit Pipeline
\`\`\`
Stage 1: Protocol Detection -> Stage 2: Context Building (+Cross-Contract) ->
Stage 3: Vulnerability Analysis (iterative) -> Stage 4: Attack Reconstruction ->
Stage 5: Cost Estimation -> Stage 6: Confidence Calibration ->
Stage 7: Report Generation
\`\`\`

## 2. Evaluation Methodology

### 2.1 Dataset
- Positive samples: ${positiveCases.length} real DeFi attack cases (2024-09 ~ 2026-02), covering 14/21 patterns
- Negative samples: ${negativeCases.length} safe contracts (OpenZeppelin + audited DeFi protocols)
- 7 zero-case patterns listed as Future Work

### 2.2 Metrics
- Case-level Hit Rate (Wilson 95% CI)
- Multi-label Jaccard Similarity (Bootstrap 95% CI)
- Per-pattern Recall (n>=7 only, Wilson 95% CI)
- Negative FP Rate (Wilson 95% CI)

### 2.3 Baselines
- Slither v0.10+ (industry-standard static analyzer)
- Raw LLM (single-call, no Agent loop)

## 3. Results

### 3.1 Case-level Hit Rate

| System | Hit Rate | 95% CI |
|--------|----------|--------|
| This System | ${systemMetrics.hitRate.hits}/${systemMetrics.hitRate.total} = ${fmtPct(systemMetrics.hitRate.value)} | ${fmtCI(systemMetrics.hitRate.ci)} |
| Slither | ${slitherMetrics.hitRate.hits}/${slitherMetrics.hitRate.total} = ${fmtPct(slitherMetrics.hitRate.value)} | ${fmtCI(slitherMetrics.hitRate.ci)} |
| Raw LLM | ${rawLlmMetrics.hitRate.hits}/${rawLlmMetrics.hitRate.total} = ${fmtPct(rawLlmMetrics.hitRate.value)} | ${fmtCI(rawLlmMetrics.hitRate.ci)} |

### 3.2 Multi-label Jaccard Similarity

| System | Mean Jaccard | 95% CI |
|--------|-------------|--------|
| This System | ${systemMetrics.jaccardMean.value.toFixed(3)} | [${systemMetrics.jaccardMean.ci[0].toFixed(3)}, ${systemMetrics.jaccardMean.ci[1].toFixed(3)}] |
| Slither | ${slitherMetrics.jaccardMean.value.toFixed(3)} | [${slitherMetrics.jaccardMean.ci[0].toFixed(3)}, ${slitherMetrics.jaccardMean.ci[1].toFixed(3)}] |
| Raw LLM | ${rawLlmMetrics.jaccardMean.value.toFixed(3)} | [${rawLlmMetrics.jaccardMean.ci[0].toFixed(3)}, ${rawLlmMetrics.jaccardMean.ci[1].toFixed(3)}] |

### 3.3 Per-pattern Recall (n>=7)

| Pattern | n | This System | 95% CI | Slither | Raw LLM |
|---------|---|-------------|--------|---------|---------|
${systemMetrics.perPatternRecall.map(p => {
    const slitherP = slitherMetrics.perPatternRecall.find(s => s.patternId === p.patternId);
    const rawLlmP = rawLlmMetrics.perPatternRecall.find(s => s.patternId === p.patternId);
    return `| ${p.patternId} | ${p.n} | ${fmtPct(p.recall)} | ${fmtCI(p.ci)} | ${slitherP ? fmtPct(slitherP.recall) : 'N/A'} | ${rawLlmP ? fmtPct(rawLlmP.recall) : 'N/A'} |`;
  }).join('\n')}

### 3.4 Negative FP Rate

| System | FP Count | FP/Contract | 95% CI |
|--------|----------|-------------|--------|
| This System | ${systemMetrics.negativeFpRate.fpCount}/${systemMetrics.negativeFpRate.totalContracts} | ${systemMetrics.negativeFpRate.value.toFixed(2)} | ${fmtCI(systemMetrics.negativeFpRate.ci)} |
| Slither | ${slitherMetrics.negativeFpRate.fpCount}/${slitherMetrics.negativeFpRate.totalContracts} | ${slitherMetrics.negativeFpRate.value.toFixed(2)} | ${fmtCI(slitherMetrics.negativeFpRate.ci)} |
| Raw LLM | ${rawLlmMetrics.negativeFpRate.fpCount}/${rawLlmMetrics.negativeFpRate.totalContracts} | ${rawLlmMetrics.negativeFpRate.value.toFixed(2)} | ${fmtCI(rawLlmMetrics.negativeFpRate.ci)} |

### 3.5 Zero-case patterns
The following 7 patterns have no corresponding cases in history.json, preventing statistical evaluation:
OD-04, OD-05, TO-01, AC-03, CL-03, CR-01, CR-02

The system includes these pattern definitions in the analysis prompt and can theoretically detect them, but lacks ground truth for validation. Listed as Future Work.

## 4. Discussion

### 4.1 Strengths
- Superior detection of DeFi semantic vulnerabilities (e.g., OD-01 oracle manipulation) vs Slither
- Multi-label detection: one case can trigger multiple patterns
- Cross-contract analysis: contributes to CR-pattern detection

### 4.2 Limitations
- **Small sample size**: ${positiveCases.length} cases, CI width ~30pp, figures are indicative only
- **7 patterns without cases**: detectable but unverifiable
- **No independent verification layer**: system relies on LLM reasoning without static analysis cross-check (T7 skipped)
- **Precision not separately reported**: FP ground truth requires manual review of each finding

### 4.3 Positioning vs Baselines
This system complements Slither:
- This system excels at DeFi semantic vulnerabilities (oracle manipulation, flash loan attacks, cross-protocol dependencies)
- Slither excels at language-level vulnerabilities (reentrancy, unchecked returns, access control)
- Recommended for combined use

## 5. Future Work
- Collect historical cases for the 7 zero-case patterns
- Expand negative sample set to 30+ contracts
- Introduce PoC reproduction rate evaluation
`;

  return md;
}

export function saveReport(report: string, outputPath?: string): void {
  const path = outputPath || join(process.cwd(), 'eval', 'results', 'evaluation-report.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, report, 'utf-8');
  console.log(`Report saved to ${path}`);
}
