# PoC 复现评估报告

## 1. 评估方法

系统对 5 个有 DeFiHackLabs 参考 PoC 的真实攻击案例进行审计，基于漏洞报告和攻击重建（T9）自动生成 Foundry PoC 测试代码，通过 `forge test` 运行验证。PoC 复现率 = 测试通过数 / 5。该指标不依赖人工标注的模式标签，是最客观的评估方式。

## 2. 汇总结果

| 指标 | 结果 |
|------|------|
| 总案例数 | 5 |
| PoC 生成成功 | 1/5 (20.0%) |
| PoC 编译通过 | 1/5 (20.0%) |
| **PoC 复现成功** | **0/5 (0.0%)** |
| 参考 PoC 验证通过 | 0/5 (0.0%) |

## 3. 详细结果

| Case ID | 链 | 生成 | 编译 | 复现 | 参考 PoC | 耗时 |
|---------|-----|:---:|:---:|:---:|:---:|------|
| CASE-001 | — | ❌ | ❌ | ❌ | ❌ | 0ms |
| CASE-002 | — | ✅ | ✅ | ❌ | ❌ | 3704ms |
| CASE-003 | — | ❌ | ❌ | ❌ | ❌ | 0ms |
| CASE-004 | — | ❌ | ❌ | ❌ | ❌ | 0ms |
| CASE-005 | — | ❌ | ❌ | ❌ | ❌ | 0ms |

## 4. 分析

### 4.1 复现成功案例
- 无

### 4.2 复现失败案例
- **CASE-002**: 编译通过但测试失败。错误: iagnostics:
cf-ray: a152a4cc8f1784de-HKG
server: cloudflare] setUp() (gas: 0)

Encountered a total of 1 failing tests, 0 tests succeeded

Tip: Run `forge test --rerun` to retry only the 1 failed test


### 4.3 编译失败案例
- **CASE-001**: PoC generation failed
- **CASE-003**: PoC generation failed
- **CASE-004**: PoC generation failed
- **CASE-005**: PoC generation failed

## 5. 局限性
- PoC 生成依赖 LLM，复杂攻击路径可能生成不完整的测试代码
- 部分 PoC 需要 fork 链上状态（需配置 RPC 和正确的区块号）
- 参考 PoC 的通过率受 Foundry 版本和 Solidity 编译器版本影响
