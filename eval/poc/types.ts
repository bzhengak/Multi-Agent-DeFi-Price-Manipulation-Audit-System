export interface PocEvalCase {
  caseId: string;
  blockchain: string;
  victimAddress: string;
  contractName: string;
  sourceCode?: string;
  attackTxHash?: string;
  forkBlockNumber?: number;
  referencePocUrl: string;
  referencePocFileName: string;
}

export interface PocGenerationResult {
  caseId: string;
  pocCode: string;
  vulnerabilityReport: any;
  attackReconstruction: any;
  generationSuccess: boolean;
  error?: string;
  generationMs: number;
}

export interface ForgeTestResult {
  caseId: string;
  compiled: boolean;
  passed: boolean;
  rawOutput: string;
  error?: string;
  durationMs: number;
}

export interface PocEvalResult {
  caseId: string;
  generation: PocGenerationResult;
  forgeTest: ForgeTestResult;
  referencePocResult?: ForgeTestResult;
}

export interface PocMetrics {
  totalCases: number;
  generationSuccess: number;
  compiled: number;
  passed: number;
  referencePassed: number;
  reproductionRate: number;
  compilationRate: number;
  referenceRate: number;
}
