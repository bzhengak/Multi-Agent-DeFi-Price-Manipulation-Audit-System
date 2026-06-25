import { describe, it, expect } from 'vitest';

describe('MemorySystem SQLite Store', () => {
  it('should export SqliteStore', async () => {
    const mod = await import('@/lib/agents/core/memory/sqlite-store');
    expect(mod.SqliteStore).toBeDefined();
    expect(typeof mod.SqliteStore).toBe('function');
  });

  it('should instantiate SqliteStore', async () => {
    const mod = await import('@/lib/agents/core/memory/sqlite-store');
    const store = new mod.SqliteStore({ dbPath: ':memory:' });
    expect(store).toBeDefined();
  });
});

describe('MemorySystem', () => {
  it('should export MemorySystem', async () => {
    const mod = await import('@/lib/agents/core/memory/memory');
    expect(mod.MemorySystem).toBeDefined();
  });

  it('should instantiate MemorySystem', async () => {
    const mod = await import('@/lib/agents/core/memory/memory');
    const memory = new mod.MemorySystem();
    expect(memory).toBeDefined();
  });
});
