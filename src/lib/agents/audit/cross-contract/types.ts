export interface CrossContractNode {
  address: string;
  contractName: string;
  source: 'main' | 'external-verified' | 'external-decompiled' | 'unknown';
  sourceCode?: string;
  protocolRole?: string;
}

export interface CrossContractEdge {
  from: string;
  to: string;
  functionName: string;
  callType: 'staticcall' | 'call' | 'delegatecall' | 'interface-call' | 'runtime-interface-call';
  sourceLine: number;
  /** Only present for runtime-interface-call edges — records the variable name and interface type */
  runtimeVar?: { variableName: string; interfaceType: string };
}

export interface CrossContractGraph {
  nodes: CrossContractNode[];
  edges: CrossContractEdge[];
  maxDepth: number;
  truncated: boolean;
}

export interface CrossContractSummary {
  graph: CrossContractGraph;
  promptContext: string;
  nodeCount: number;
  edgeCount: number;
}
