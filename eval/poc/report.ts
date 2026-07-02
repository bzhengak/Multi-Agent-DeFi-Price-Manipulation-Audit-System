import type { PocEvalResult, PocMetrics } from './types';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export function computePocMetrics(results: PocEvalResult[]): PocMetrics {
  const total = results.length;
  const generationSuccess = results.filter(r => r.generation.generationSuccess).length;
  const compiled = results.filter(r => r.forgeTest.compiled).length;
  const passed = results.filter(r => r.forgeTest.passed).length;
  const referencePassed = results.filter(r => r.referencePocResult?.passed).length;

  return {
    totalCases: total,
    generationSuccess,
    compiled,
    passed,
    referencePassed,
    reproductionRate: total > 0 ? passed / total : 0,
    compilationRate: total > 0 ? compiled / total : 0,
    referenceRate: total > 0 ? referencePassed / total : 0,
  };
}

export function generatePocReport(results: PocEvalResult[], metrics: PocMetrics): string {
  const md = `# PoC 复现评估报告

## 1. 评估方法

系统对 18 个有 DeFiHackLabs 参考 PoC 的真实攻击案例进行审计，基于漏洞报告和攻击重建（T9）自动生成 Foundry PoC 测试代码，通过 \`forge test\` 运行验证。PoC 复现率 = 测试通过数 / 18。该指标不依赖人工标注的模式标签，是最客观的评估方式。

## 2. 汇总结果

| 指标 | 结果 |
|------|------|
| 总案例数 | ${metrics.totalCases} |
| PoC 生成成功 | ${metrics.generationSuccess}/${metrics.totalCases} (${(metrics.generationSuccess / metrics.totalCases * 100).toFixed(1)}%) |
| PoC 编译通过 | ${metrics.compiled}/${metrics.totalCases} (${(metrics.compilationRate * 100).toFixed(1)}%) |
| **PoC 复现成功** | **${metrics.passed}/${metrics.totalCases} (${(metrics.reproductionRate * 100).toFixed(1)}%)** |
| 参考 PoC 验证通过 | ${metrics.referencePassed}/${metrics.totalCases} (${(metrics.referenceRate * 100).toFixed(1)}%) |

## 3. 详细结果

| Case ID | 协议 | 链 | 生成 | 编译 | 复现 | 参考 PoC | 耗时 |
|---------|------|-----|:---:|:---:|:---:|:---:|------|
${results.map(r => {
    const protocol = r.generation.vulnerabilityReport?.summary?.contractName || r.caseId;
    return `| ${r.caseId} | ${protocol} | ${r.generation.vulnerabilityReport ? '—' : '—'} | ${r.generation.generationSuccess ? '✅' : '❌'} | ${r.forgeTest.compiled ? '✅' : '❌'} | ${r.forgeTest.passed ? '✅' : '❌'} | ${r.referencePocResult?.passed ? '✅' : '❌'} | ${r.forgeTest.durationMs}ms |`;
  }).join('\n')}

## 4. 分析

### 4.1 复现成功案例
${results.filter(r => r.forgeTest.passed).map(r => `- **${r.caseId}**: 复现成功，耗时 ${r.forgeTest.durationMs}ms`).join('\n') || '- 无'}

### 4.2 复现失败案例
${results.filter(r => !r.forgeTest.passed && r.forgeTest.compiled).map(r => {
    return `- **${r.caseId}**: 编译通过但测试失败。错误: ${r.forgeTest.error || r.forgeTest.rawOutput.slice(-200)}`;
  }).join('\n') || '- 无'}

### 4.3 编译失败案例
${results.filter(r => !r.forgeTest.compiled).map(r => `- **${r.caseId}**: ${r.forgeTest.error || '编译失败'}`).join('\n') || '- 无'}

## 5. 局限性
- PoC 生成依赖 LLM，复杂攻击路径可能生成不完整的测试代码
- 部分 PoC 需要 fork 链上状态（需配置 RPC 和正确的区块号）
- 参考 PoC 的通过率受 Foundry 版本和 Solidity 编译器版本影响
`;

  return md;
}

export function savePocReport(report: string, outputPath?: string): void {
  const path = outputPath || join(process.cwd(), 'eval', 'results', 'poc-report.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, report, 'utf-8');
  console.log(`PoC report saved to ${path}`);
}
