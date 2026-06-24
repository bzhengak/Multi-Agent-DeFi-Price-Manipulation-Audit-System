/// <reference types="bun-types" />
import { describe, it, expect } from 'bun:test';
import { CrossContractTracer } from '../cross-contract-tracer';

const tracer = new CrossContractTracer();

const simpleContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract SimpleContract {
    function transferToken(address token, address to, uint256 amount) external {
        IERC20(token).transfer(to, amount);
    }
}
`;

describe('CrossContractTracer', () => {
  it('parses simple contract without hardcoded external calls', async () => {
    const result = await tracer.trace(simpleContract, 'SimpleContract', 'ethereum');
    expect(result.nodeCount).toBe(1);
    expect(result.edgeCount).toBe(0);
  });

  it('handles parse error gracefully', async () => {
    const result = await tracer.trace('invalid solidity!!!', 'Bad', 'ethereum');
    expect(result.nodeCount).toBe(1);
    expect(result.edgeCount).toBe(0);
  });

  it('builds prompt context for single contract', async () => {
    const result = await tracer.trace(simpleContract, 'SimpleContract', 'ethereum');
    expect(result.promptContext).toContain('No external contract dependencies');
  });
});
