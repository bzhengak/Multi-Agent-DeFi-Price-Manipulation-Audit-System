import type { ToolDefinition, ToolContext, ToolResult } from './types';

interface CacheEntry {
  result: ToolResult;
  timestamp: number;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private cache: Map<string, CacheEntry> = new Map();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(
    name: string,
    params: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found`,
        executionTime: 0,
      };
    }

    const cacheKey = this.buildCacheKey(name, params);
    const cachePolicy = tool.cachePolicy ?? { enabled: false, ttlMs: 0 };

    if (cachePolicy.enabled) {
      const cached = this.getFromCache(cacheKey, cachePolicy.ttlMs);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    const retryPolicy = tool.retryPolicy ?? { maxRetries: 3, backoffMultiplier: 2, initialDelayMs: 1000 };
    const timeout = tool.timeout ?? 30000;
    const startTime = Date.now();

    let lastResult: ToolResult | null = null;

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(tool, params, context, timeout);
        lastResult = result;

        if (result.success) {
          if (cachePolicy.enabled) {
            this.cache.set(cacheKey, { result, timestamp: Date.now() });
          }
          return result;
        }

        if (attempt < retryPolicy.maxRetries) {
          const delay = retryPolicy.initialDelayMs * Math.pow(retryPolicy.backoffMultiplier, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        lastResult = {
          success: false,
          error: message,
          executionTime: Date.now() - startTime,
        };

        if (attempt < retryPolicy.maxRetries) {
          const delay = retryPolicy.initialDelayMs * Math.pow(retryPolicy.backoffMultiplier, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return lastResult ?? {
      success: false,
      error: 'Tool execution failed after all retries',
      executionTime: Date.now() - startTime,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async executeWithTimeout(
    tool: ToolDefinition,
    params: unknown,
    context: ToolContext,
    timeoutMs: number,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    const result = await Promise.race([
      tool.execute(params, context),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool "${tool.name}" timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);

    return {
      ...result,
      executionTime: result.executionTime || Date.now() - startTime,
    };
  }

  private buildCacheKey(name: string, params: unknown): string {
    return `${name}:${JSON.stringify(params)}`;
  }

  private getFromCache(key: string, ttlMs: number): ToolResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }
}
