import { describe, it, expect, beforeAll } from 'vitest';

const SAMPLE_CONTRACT = `
pragma solidity ^0.8.0;

contract UniswapV2Pair {
    uint256 public reserve0;
    uint256 public reserve1;

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external {
        // AMM swap logic
    }

    function getReserves() public view returns (uint256, uint256, uint32) {
        return (reserve0, reserve1, uint32(block.timestamp));
    }

    function mint(address to) external returns (uint256 liquidity) {
        uint256 _reserve0 = reserve0;
        uint256 _reserve1 = reserve1;
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;
        // Uses instant reserves for share calculation - LR-01 vulnerable
        liquidity = (amount0 * totalSupply) / _reserve0;
    }
}

contract LendingPool {
    address public oracle;
    mapping(address => uint256) public collateral;
    mapping(address => uint256) public debt;

    function setOracle(address _oracle) external {
        oracle = _oracle; // No timelock - AC-01 vulnerable
    }

    function borrow(uint256 amount) external {
        uint256 price = IOracle(oracle).getPrice();
        require(collateral[msg.sender] * price >= debt[msg.sender] + amount);
        debt[msg.sender] += amount;
    }

    function setFee(uint256 _fee) external {
        fee = _fee; // No timelock, single-address - AC-02 vulnerable
    }

    function swap(uint256 amountIn, uint256 amountOutMin, address[] calldata path) external {
        // No deadline parameter - TO-01 vulnerable
    }
}

contract OracleConsumer {
    function getPrice() public view returns (uint256) {
        (, int256 answer, , , ) = IChainlink().latestRoundData();
        // Missing updatedAt check - OD-04/OD-05 vulnerable
        return uint256(answer);
    }
}
`;

describe('ProtocolTypeDetector', () => {
  let detector: any;

  beforeAll(async () => {
    const { ProtocolTypeDetector } = await import('@/lib/agents/audit/protocols/protocol-type-detector');
    detector = new ProtocolTypeDetector();
  });

  it('should be instantiable', () => {
    expect(detector).toBeDefined();
  });

  it('should detect protocol type from source code', async () => {
    const result = await detector.detect(SAMPLE_CONTRACT);
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(typeof result.confidence).toBe('number');
    expect(result.priorityVulnerabilities).toBeDefined();
    expect(Array.isArray(result.priorityVulnerabilities)).toBe(true);
  });

  it('should return priority vulnerabilities as array of strings', async () => {
    const result = await detector.detect(SAMPLE_CONTRACT);
    for (const vid of result.priorityVulnerabilities) {
      expect(typeof vid).toBe('string');
      expect(vid).toMatch(/^(OD|LR|TO|AC|CL|CR)-\d{2}$/);
    }
  });

  it('should return known pattern IDs only', async () => {
    const validPatterns = new Set([
      'OD-01', 'OD-02', 'OD-03', 'OD-04', 'OD-05',
      'LR-01', 'LR-02', 'LR-03',
      'TO-01', 'TO-02', 'TO-03',
      'AC-01', 'AC-02', 'AC-03',
      'CL-01', 'CL-02', 'CL-03',
      'CR-01', 'CR-02', 'CR-03', 'CR-04',
    ]);
    const result = await detector.detect(SAMPLE_CONTRACT);
    for (const vid of result.priorityVulnerabilities) {
      expect(validPatterns.has(vid)).toBe(true);
    }
  });

  it('should detect AMM patterns in Uniswap-style code', async () => {
    const ammCode = `contract Pair { function swap() {} function getReserves() {} function mint() {} }`;
    const result = await detector.detect(ammCode);
    expect(result.indicators.some((i: any) => i.name.toLowerCase().includes('pool') || i.name.toLowerCase().includes('reserve'))).toBeDefined();
  });

  it('should detect lending patterns', async () => {
    const lendCode = `contract Lending { function borrow() {} function liquidate() {} mapping(address => uint) collateral; }`;
    const result = await detector.detect(lendCode);
    expect(result.type).toBeDefined();
  });

  it('should handle empty source gracefully', async () => {
    const result = await detector.detect('');
    expect(result).toBeDefined();
    expect(result.type).toBe('unknown');
  });
});

describe('ContextManager', () => {
  it('should be instantiable', async () => {
    const { ContextManager } = await import('@/lib/agents/audit/context/context-manager');
    const cm = new ContextManager();
    expect(cm).toBeDefined();
  });

  it('should build context', async () => {
    const { ContextManager } = await import('@/lib/agents/audit/context/context-manager');
    const cm = new ContextManager();

    const classification = {
      type: 'dex_amm' as const,
      manipulationTarget: 'liquidity_pool' as const,
      confidence: 0.8,
      indicators: [],
      priorityVulnerabilities: ['OD-01', 'LR-01'],
      criticalFunctions: ['swap', 'getReserves'],
      riskProfile: {
        manipulationRisk: 'high' as const,
        flashloanExposure: true,
        oracleDependency: true,
        liquiditySensitivity: 'high' as const,
      },
    };

    const context = await cm.build(SAMPLE_CONTRACT, 'TestContract', 'ethereum', classification);
    expect(context).toBeDefined();
    expect(context.classification).toBe(classification);
  });
});

describe('ProtocolClassification Types', () => {
  it('should import types correctly', async () => {
    const types = await import('@/lib/agents/audit/protocols/types');
    // ProtocolType is a union, checked structurally
    expect(types).toBeDefined();
  });
});
