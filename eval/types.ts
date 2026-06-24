export interface EvalCase {
  caseId: string;
  source: 'history.json' | 'manual';
  blockchain: string;
  victimAddress: string;
  attackTxHash?: string;
  contractName: string;
  sourceCode?: string;
  sourceAvailable: boolean;
  expectedPatternIds: string[];
  caseNote: string;
}

export interface EvalResult {
  caseId: string;
  detectedPatternIds: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vulnerabilities: any[];
  sourceAvailable: boolean;
  error?: string;
  durationMs: number;
}

export interface CaseComparison {
  caseId: string;
  expected: string[];
  detected: string[];
  hit: boolean;
  jaccard: number;
}

export interface MetricsResult {
  hitRate: { value: number; ci: [number, number]; hits: number; total: number };
  jaccardMean: { value: number; ci: [number, number] };
  perPatternRecall: Array<{
    patternId: string;
    n: number;
    recall: number;
    ci: [number, number];
    tp: number;
    fn: number;
  }>;
  negativeFpRate: { value: number; ci: [number, number]; fpCount: number; totalContracts: number };
}
