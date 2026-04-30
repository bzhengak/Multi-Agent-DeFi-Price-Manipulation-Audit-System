export interface ToolContext {
  agentId: string;
  iteration: number;
  correlationId?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
}

export interface CachePolicy {
  enabled: boolean;
  ttlMs: number;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
  cached?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: unknown, context: ToolContext) => Promise<ToolResult>;
  retryPolicy?: RetryPolicy;
  cachePolicy?: CachePolicy;
  timeout?: number;
}
