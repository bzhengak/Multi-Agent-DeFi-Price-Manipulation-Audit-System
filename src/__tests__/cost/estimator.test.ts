import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

function loadJson(filename: string) {
  const fp = path.resolve(process.cwd(), 'data', filename);
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

describe('T10: Cost Registry', () => {
  it('should create gas price tool', async () => {
    const { createGasPriceTool } = await import('@/lib/cost/tools/gas-price.tool');
    const tool = createGasPriceTool();
    expect(tool.name).toBe('cost.gas_price');
    expect(tool.cachePolicy?.ttlMs).toBeGreaterThan(0);
  });

  it('should create native price tool', async () => {
    const { createNativePriceTool } = await import('@/lib/cost/tools/native-price.tool');
    const tool = createNativePriceTool();
    expect(tool.name).toBe('cost.native_token_price');
  });

  it('should create flash loan fee tool', async () => {
    const { createFlashLoanFeeTool } = await import('@/lib/cost/tools/flash-loan-fee.tool');
    const tool = createFlashLoanFeeTool();
    expect(tool.name).toBe('cost.flash_loan_fee');
  });

  it('should return Aave fee (5 bps)', async () => {
    const { createFlashLoanFeeTool } = await import('@/lib/cost/tools/flash-loan-fee.tool');
    const tool = createFlashLoanFeeTool();
    const result = await tool.execute({ provider: 'aave-v3' }, { agentId: 'test', iteration: 1 });
    expect(result.success).toBe(true);
    expect((result.data as { bps: number; rate: number }).bps).toBe(5);
  });

  it('should return Balancer fee (0 bps)', async () => {
    const { createFlashLoanFeeTool } = await import('@/lib/cost/tools/flash-loan-fee.tool');
    const tool = createFlashLoanFeeTool();
    const result = await tool.execute({ provider: 'balancer-v2' }, { agentId: 'test', iteration: 1 });
    expect(result.success).toBe(true);
    expect((result.data as { bps: number; rate: number }).bps).toBe(0);
  });

  it('should register all 3 tools in cost registry', async () => {
    const { getCostRegistry } = await import('@/lib/cost/cost-registry');
    const registry = getCostRegistry();
    expect(registry.has('cost.gas_price')).toBe(true);
    expect(registry.has('cost.native_token_price')).toBe(true);
    expect(registry.has('cost.flash_loan_fee')).toBe(true);
  });

  it('should return fallback gas price when API unavailable', async () => {
    const { createGasPriceTool } = await import('@/lib/cost/tools/gas-price.tool');
    const tool = createGasPriceTool();
    const result = await tool.execute({ chainId: 99999 }, { agentId: 'test', iteration: 1 });
    expect(result.success).toBe(true);
    const data = result.data as { low: number; mid: number; high: number; source: string };
    expect(data.source).toBe('default');
  });
});

describe('T10: Chain Native Token Mapping', () => {
  it('should map all 7 chains', async () => {
    const { CHAIN_NATIVE_TOKEN } = await import('@/lib/cost/chain-native-token');
    for (const c of ['ethereum', 'bsc', 'arbitrum', 'base', 'opbnb', 'sei', 'hyperliquid']) {
      expect(CHAIN_NATIVE_TOKEN[c]).toBeDefined();
    }
  });

  it('should map Ethereum and Arbitrum to ETH', async () => {
    const { CHAIN_NATIVE_TOKEN } = await import('@/lib/cost/chain-native-token');
    expect(CHAIN_NATIVE_TOKEN.ethereum.symbol).toBe('ETH');
    expect(CHAIN_NATIVE_TOKEN.arbitrum.symbol).toBe('ETH');
  });
});

describe('T10: Pattern Cost Profiles', () => {
  it('should have cost profiles for all 21 patterns', () => {
    const profiles = loadJson('pattern-cost-profiles.json');
    const expected = ['OD-01','OD-02','OD-03','OD-04','OD-05','LR-01','LR-02','LR-03','TO-01','TO-02','TO-03','AC-01','AC-02','AC-03','CL-01','CL-02','CL-03','CR-01','CR-02','CR-03','CR-04'];
    for (const pid of expected) {
      expect(profiles.patterns[pid]).toBeDefined();
      expect(profiles.patterns[pid].gasLow).toBeGreaterThan(0);
      expect(typeof profiles.patterns[pid].flashLoanNeeded).toBe('boolean');
    }
  });

  it('should have fallback profile', () => {
    const profiles = loadJson('pattern-cost-profiles.json');
    expect(profiles.fallback).toBeDefined();
    expect(profiles.fallback.gasLow).toBeGreaterThan(0);
  });

  it('should have highest gas for CR-04', () => {
    const profiles = loadJson('pattern-cost-profiles.json');
    const cr04 = profiles.patterns['CR-04'];
    for (const pid of Object.keys(profiles.patterns)) {
      expect(cr04.gasHigh).toBeGreaterThanOrEqual(profiles.patterns[pid].gasHigh);
    }
  });
});
