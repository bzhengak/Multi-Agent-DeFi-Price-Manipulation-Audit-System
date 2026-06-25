import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '@/lib/agents/core/tools/registry';

function makeTool(name: string, success = true, delayMs = 0, data?: unknown) {
  return {
    name,
    description: `Test tool ${name}`,
    parameters: { type: 'object', properties: {} },
    execute: vi.fn().mockImplementation(async () => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return { success, data: data ?? { tool: name }, executionTime: delayMs };
    }),
    cachePolicy: { enabled: false, ttlMs: 0 },
    retryPolicy: { maxRetries: 3, backoffMultiplier: 2, initialDelayMs: 100 },
    timeout: 30000,
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.clearCache();
  });

  it('should register a tool', () => {
    const tool = makeTool('test.tool');
    registry.register(tool);
    expect(registry.has('test.tool')).toBe(true);
  });

  it('should throw on duplicate registration', () => {
    registry.register(makeTool('test.tool'));
    expect(() => registry.register(makeTool('test.tool'))).toThrow('already registered');
  });

  it('should list registered tools', () => {
    registry.register(makeTool('tool.a'));
    registry.register(makeTool('tool.b'));
    expect(registry.list()).toHaveLength(2);
  });

  it('should get a registered tool', () => {
    const tool = makeTool('test.tool');
    registry.register(tool);
    expect(registry.get('test.tool')).toBe(tool);
  });

  it('should return undefined for unregistered tool', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should execute a tool successfully', async () => {
    registry.register(makeTool('test.tool', true, 0, { value: 42 }));
    const result = await registry.execute('test.tool', {}, { agentId: 'test', iteration: 1 });
    expect(result.success).toBe(true);
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('should return error for unregistered tool', async () => {
    const result = await registry.execute('nonexistent', {}, { agentId: 'test', iteration: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should cache successful results', async () => {
    const tool = makeTool('cached.tool');
    tool.cachePolicy = { enabled: true, ttlMs: 60000 };
    registry.register(tool);

    const r1 = await registry.execute('cached.tool', { x: 1 }, { agentId: 'test', iteration: 1 });
    const r2 = await registry.execute('cached.tool', { x: 1 }, { agentId: 'test', iteration: 2 });

    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(r2.cached).toBe(true);
  });

  it('should handle tool timeout', async () => {
    const slowTool = makeTool('slow.tool', true, 2000);
    slowTool.timeout = 100;
    registry.register(slowTool);

    const result = await registry.execute('slow.tool', {}, { agentId: 'test', iteration: 1 });
    expect(result.success).toBe(false);
  }, 10000);

  it('should handle failing tool with retries', async () => {
    const failTool = makeTool('fail.tool', false);
    registry.register(failTool);

    const result = await registry.execute('fail.tool', {}, { agentId: 'test', iteration: 1 });
    expect(result.success).toBe(false);
    expect(failTool.execute).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });
});
