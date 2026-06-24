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
    .filter(p => p.n >= 7);

  const fpCount = negativeResults.reduce((sum, r) => sum + r.detectedPatternIds.length, 0);
  const negativeFpRate = {
    value: negativeCases.length > 0 ? fpCount / negativeCases.length : 0,
    ci: wilsonCI(fpCount > 0 ? 1 : 0, negativeCases.length),
    fpCount,
    totalContracts: negativeCases.length,
  };

  return { hitRate, jaccardMean, perPatternRecall, negativeFpRate };
}
