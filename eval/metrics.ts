import type { EvalCase, EvalResult, CaseComparison, MetricsResult } from './types';
import { wilsonCI, bootstrapCI, jaccardSimilarity } from './stats';

export function compareCases(cases: EvalCase[], results: EvalResult[]): CaseComparison[] {
  return cases.map(c => {
    const result = results.find(r => r.caseId === c.caseId);
    const detected = result?.detectedPatternIds || [];
    const expected = c.expectedPatternIds;
    return {
      caseId: c.caseId,
      expected,
      detected,
      hit: jaccardSimilarity(expected, detected) > 0,
      jaccard: jaccardSimilarity(expected, detected),
    };
  });
}

const UNIVERSAL_PATTERNS = new Set(['TO-01', 'TO-02', 'CL-01']);
const PROTOCOL_SPECIFIC_PATTERNS = new Set(['OD-01', 'AC-02', 'CR-03']);

function categorizeFp(
  positiveCases: EvalCase[],
  positiveResults: EvalResult[],
): MetricsResult['fpCategorization'] {
  const universal: Record<string, number> = {};
  const protocolSpecific: Record<string, number> = {};
  const questionable: Record<string, number> = {};

  for (const c of positiveCases) {
    const result = positiveResults.find(r => r.caseId === c.caseId);
    if (!result) continue;
    const fpPatterns = result.detectedPatternIds.filter(p => !c.expectedPatternIds.includes(p));
    for (const p of fpPatterns) {
      if (UNIVERSAL_PATTERNS.has(p)) {
        universal[p] = (universal[p] || 0) + 1;
      } else if (PROTOCOL_SPECIFIC_PATTERNS.has(p)) {
        protocolSpecific[p] = (protocolSpecific[p] || 0) + 1;
      } else {
        questionable[p] = (questionable[p] || 0) + 1;
      }
    }
  }

  const total = Object.values(universal).reduce((a, b) => a + b, 0)
    + Object.values(protocolSpecific).reduce((a, b) => a + b, 0)
    + Object.values(questionable).reduce((a, b) => a + b, 0);

  return {
    universal: { patterns: universal, total: Object.values(universal).reduce((a, b) => a + b, 0) },
    protocolSpecific: { patterns: protocolSpecific, total: Object.values(protocolSpecific).reduce((a, b) => a + b, 0) },
    questionable: { patterns: questionable, total: Object.values(questionable).reduce((a, b) => a + b, 0) },
    total,
  };
}

export function computeMetrics(
  positiveCases: EvalCase[],
  positiveResults: EvalResult[],
  negativeCases: EvalCase[],
  negativeResults: EvalResult[],
): MetricsResult {
  const comparisons = compareCases(positiveCases, positiveResults);

  const hits = comparisons.filter(c => c.hit).length;
  const hitRate = {
    value: comparisons.length > 0 ? hits / comparisons.length : 0,
    ci: wilsonCI(hits, comparisons.length),
    hits,
    total: comparisons.length,
  };

  const jaccardValues = comparisons.map(c => c.jaccard);
  const jaccardMean = {
    value: jaccardValues.length > 0 ? jaccardValues.reduce((a, b) => a + b, 0) / jaccardValues.length : 0,
    ci: bootstrapCI(jaccardValues),
  };

  const allPatterns = new Set<string>();
  positiveCases.forEach(c => c.expectedPatternIds.forEach(p => allPatterns.add(p)));

  const perPatternRecall = Array.from(allPatterns)
    .map(patternId => {
      const casesWithPattern = positiveCases.filter(c => c.expectedPatternIds.includes(patternId));
      const n = casesWithPattern.length;
      const tp = casesWithPattern.filter(c => {
        const result = positiveResults.find(r => r.caseId === c.caseId);
        return result?.detectedPatternIds.includes(patternId);
      }).length;
      const fn = n - tp;
      const recall = n > 0 ? tp / n : 0;
      return { patternId, n, recall, ci: wilsonCI(tp, n), tp, fn };
    })
    .filter(p => p.n >= 1);

  const perPatternPrecision = Array.from(allPatterns)
    .map(patternId => {
      const positiveTp = positiveCases.filter(c => {
        const result = positiveResults.find(r => r.caseId === c.caseId);
        return result?.detectedPatternIds.includes(patternId) && c.expectedPatternIds.includes(patternId);
      }).length;

      const positiveFp = positiveCases.filter(c => {
        const result = positiveResults.find(r => r.caseId === c.caseId);
        return result?.detectedPatternIds.includes(patternId) && !c.expectedPatternIds.includes(patternId);
      }).length;

      const negativeFp = negativeResults.filter(r => r.detectedPatternIds.includes(patternId)).length;

      const tp = positiveTp;
      const fp = positiveFp + negativeFp;
      const nDetected = tp + fp;
      const precision = nDetected > 0 ? tp / nDetected : 0;

      return { patternId, nDetected, precision, ci: wilsonCI(tp, nDetected), tp, fp };
    });

  const fpCount = negativeResults.reduce((sum, r) => sum + r.detectedPatternIds.length, 0);
  const negativeFpRate = {
    value: negativeCases.length > 0 ? fpCount / negativeCases.length : 0,
    ci: wilsonCI(fpCount > 0 ? 1 : 0, negativeCases.length),
    fpCount,
    totalContracts: negativeCases.length,
  };

  const totalTp = positiveCases.reduce((sum, c) => {
    const result = positiveResults.find(r => r.caseId === c.caseId);
    const tpCount = c.expectedPatternIds.filter(p => result?.detectedPatternIds.includes(p)).length;
    return sum + tpCount;
  }, 0);
  const positiveFp = positiveResults.reduce((sum, r) => {
    const eCase = positiveCases.find(c => c.caseId === r.caseId);
    const fpCount2 = r.detectedPatternIds.filter(p => !eCase?.expectedPatternIds.includes(p)).length;
    return sum + fpCount2;
  }, 0);
  const totalFp = fpCount + positiveFp;
  const overallPrecision = {
    value: (totalTp + totalFp) > 0 ? totalTp / (totalTp + totalFp) : 0,
    ci: wilsonCI(totalTp, totalTp + totalFp),
    tp: totalTp,
    fp: totalFp,
  };

  // === New Metrics ===

  // 1. Safe-Contract Precision: 1 - (contracts with FP / total negative contracts)
  const negativeWithFp = negativeResults.filter(r => r.detectedPatternIds.length > 0).length;
  const safeContractPrecision = {
    value: negativeCases.length > 0 ? 1 - negativeWithFp / negativeCases.length : 0,
    ci: wilsonCI(negativeCases.length - negativeWithFp, negativeCases.length),
    fpCount: negativeWithFp,
    totalContracts: negativeCases.length,
  };

  // 2. Negative-Calibrated Precision (Bayesian adjustment)
  // Laplace smoothing: h = (FP_neg + 1) / (N_neg + 2)
  const hallucinationRate = (fpCount + 1) / (negativeCases.length + 2);
  const adjustedFp = positiveFp * hallucinationRate;
  // Rule of Three (95% CI upper bound for 0/n): 3/n
  const hallucinationUpper = negativeCases.length > 0 ? 3 / negativeCases.length : 1;
  const adjustedFpLower = positiveFp * hallucinationUpper;
  const calibratedPrecision = {
    value: totalTp + adjustedFp + fpCount > 0 ? totalTp / (totalTp + adjustedFp + fpCount) : 0,
    lowerBound: totalTp + adjustedFpLower + fpCount > 0 ? totalTp / (totalTp + adjustedFpLower + fpCount) : 0,
    hallucinationRate,
    adjustedFp,
    tp: totalTp,
    rawFp: positiveFp,
  };

  // 3. Detection Discrimination Ratio
  const meanVulnerable = positiveResults.length > 0
    ? positiveResults.reduce((s, r) => s + r.detectedPatternIds.length, 0) / positiveResults.length
    : 0;
  const meanSafe = negativeResults.length > 0
    ? negativeResults.reduce((s, r) => s + r.detectedPatternIds.length, 0) / negativeResults.length
    : 0;
  const detectionDiscrimination = {
    meanVulnerable,
    meanSafe,
    ratio: meanSafe > 0 ? meanVulnerable / meanSafe : meanVulnerable > 0 ? Infinity : 0,
  };

  // 4. FP Categorization
  const fpCategorization = categorizeFp(positiveCases, positiveResults);

  return {
    hitRate,
    jaccardMean,
    perPatternRecall,
    perPatternPrecision,
    negativeFpRate,
    overallPrecision,
    safeContractPrecision,
    calibratedPrecision,
    detectionDiscrimination,
    fpCategorization,
  };
}
