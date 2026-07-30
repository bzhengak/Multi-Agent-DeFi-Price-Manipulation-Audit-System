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
  partial?: boolean;
  error?: string;
  durationMs: number;
  /** Whether this empty result is suspicious (likely missed detection vs genuine clean contract) */
  suspect?: boolean;
  /** Reason classification for empty or suspect results */
  emptyReason?: EmptyResultReason;
}

/** Reasons a case produced zero or suspicious results */
export type EmptyResultReason =
  | 'genuine-clean'           // Low-risk source, LLM correctly found nothing
  | 'high-risk-signals-2'     // 2 high-risk keywords in source, LLM found nothing
  | 'high-risk-signals-3+'    // 3+ high-risk keywords in source, LLM found nothing
  | 'proxy-contract'          // Source is proxy boilerplate (Fix D domain)
  | 'runtime-var-calls-only'  // Only runtime-var interface calls (Fix B domain)
  | 'no-external-calls'       // crossContractGraph empty, no runtime warnings
  | 'quota-exhausted'         // LLM quota exhausted mid-analysis
  | 'orchestrator-error';     // Orchestrator threw an error

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
  perPatternPrecision: Array<{
    patternId: string;
    nDetected: number;
    precision: number;
    ci: [number, number];
    tp: number;
    fp: number;
  }>;
  negativeFpRate: { value: number; ci: [number, number]; fpCount: number; totalContracts: number };
  overallPrecision: { value: number; ci: [number, number]; tp: number; fp: number };
  safeContractPrecision: { value: number; ci: [number, number]; fpCount: number; totalContracts: number };
  calibratedPrecision: {
    value: number;
    lowerBound: number;
    hallucinationRate: number;
    adjustedFp: number;
    tp: number;
    rawFp: number;
  };
  detectionDiscrimination: {
    meanVulnerable: number;
    meanSafe: number;
    ratio: number;
  };
  fpCategorization: {
    universal: { patterns: Record<string, number>; total: number };
    protocolSpecific: { patterns: Record<string, number>; total: number };
    questionable: { patterns: Record<string, number>; total: number };
    total: number;
  };
}
