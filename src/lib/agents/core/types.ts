export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';
export type ActionType = 'analyze' | 'search' | 'fetch' | 'retrieve' | 'evaluate' | 'reconstruct' | 'report' | 'finalize';

export interface AgentConfig {
  name: string;
  description: string;
  version: string;
  maxIterations: number;
  timeout: number;
  verbose?: boolean;
}

export interface Observation {
  type: 'perception' | 'tool_result' | 'memory' | 'user_input';
  content: unknown;
  timestamp: number;
  source?: string;
}

export interface Thought {
  reasoning: string;
  action: ActionType;
  confidence: number;
  alternatives?: ActionType[];
  timestamp: number;
}

export interface Action {
  type: ActionType;
  params: Record<string, unknown>;
  target?: string;
}

export interface Result {
  action: Action;
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
  timestamp: number;
}

export interface AgentState {
  id: string;
  iteration: number;
  status: AgentStatus;
  observations: Observation[];
  thoughts: Thought[];
  actions: Action[];
  results: Result[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface AgentResult {
  agentId: string;
  status: AgentStatus;
  data: unknown;
  iterations: number;
  duration: number;
  confidence: number;
}
