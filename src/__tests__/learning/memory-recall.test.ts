import { describe, it, expect } from 'vitest';
import { MemorySystem } from '@/lib/agents/core/memory/memory';

describe('Memory recall integration', () => {
  it('recalls episodic memories by keywords', async () => {
    const memory = new MemorySystem();
    await memory.init();

    await memory.remember(
      'Contract: TestDeFi on ethereum. Type: dex_amm. Found 2 vulnerabilities. Patterns: OD-01, LR-01.',
      'episodic',
      0.8,
      { contractName: 'TestDeFi', blockchain: 'ethereum', protocolType: 'dex_amm', patterns: ['OD-01', 'LR-01'] },
    );

    const results = await memory.recall({
      keywords: ['dex_amm', 'ethereum'],
      limit: 5,
      minImportance: 0.5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('TestDeFi');

    await memory.close();
  });

  it('searchSemantic finds similar content', async () => {
    const memory = new MemorySystem();
    await memory.init();

    await memory.remember(
      'Oracle manipulation via flash loan on Uniswap. Pattern OD-01.',
      'semantic',
      0.8,
      { caseId: 'CASE-TEST-001' },
    );

    const results = await memory.searchSemantic('flash loan oracle attack', 5);

    expect(results.length).toBeGreaterThan(0);

    await memory.close();
  });
});
