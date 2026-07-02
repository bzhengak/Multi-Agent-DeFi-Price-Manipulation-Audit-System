import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { PocEvalCase, ForgeTestResult } from './types';

const CHAIN_RPC: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  base: 'https://mainnet.base.org',
  opbnb: 'https://opbnb.publicnode.com',
  sei: 'https://evm-rpc.sei-apis.com',
};

export async function runForgeTest(
  evalCase: PocEvalCase,
  pocCode: string,
  isReference = false,
): Promise<ForgeTestResult> {
  const startTime = Date.now();
  const testDir = join(process.cwd(), 'eval', 'poc', 'foundry-workspace');

  try {
    ensureFoundryProject(testDir);

    const fileName = isReference
      ? `${evalCase.caseId}_ref.t.sol`
      : `${evalCase.caseId}.t.sol`;
    const filePath = join(testDir, 'test', fileName);
    writeFileSync(filePath, pocCode, 'utf-8');

    try {
      execSync('forge build', { cwd: testDir, timeout: 60_000, stdio: 'pipe' });
    } catch (buildError) {
      return {
        caseId: evalCase.caseId,
        compiled: false,
        passed: false,
        rawOutput: buildError instanceof Error ? buildError.message : 'Build failed',
        error: 'Compilation failed',
        durationMs: Date.now() - startTime,
      };
    }

    const rpc = CHAIN_RPC[evalCase.blockchain] || CHAIN_RPC.ethereum;

    let forgeCmd = `forge test --match-contract ExploitTest -vvv`;

    let output: string;
    try {
      output = execSync(forgeCmd, {
        cwd: testDir,
        timeout: 120_000,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch (testError) {
      output = testError instanceof Error
        ? ((testError as any).stdout || testError.message)
        : 'Test execution failed';
    }

    const passed = output.includes('[PASS]') || (output.includes('Test result:') && output.includes('ok'));

    return {
      caseId: evalCase.caseId,
      compiled: true,
      passed,
      rawOutput: output.slice(-2000),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      caseId: evalCase.caseId,
      compiled: false,
      passed: false,
      rawOutput: '',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }
}

function ensureFoundryProject(testDir: string): void {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const foundryToml = join(testDir, 'found.toml');
  if (!existsSync(foundryToml)) {
    writeFileSync(foundryToml, `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.20"
`, 'utf-8');
  }

  const srcDir = join(testDir, 'src');
  if (!existsSync(srcDir)) {
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'Dummy.sol'), '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n', 'utf-8');
  }

  const testDir2 = join(testDir, 'test');
  if (!existsSync(testDir2)) {
    mkdirSync(testDir2, { recursive: true });
  }

  const libDir = join(testDir, 'lib');
  if (!existsSync(libDir)) {
    mkdirSync(libDir, { recursive: true });
    try {
      execSync('forge install foundry-rs/forge-std --no-commit', { cwd: testDir, timeout: 60_000, stdio: 'pipe' });
    } catch {
      const forgeStdDir = join(libDir, 'forge-std', 'src');
      mkdirSync(forgeStdDir, { recursive: true });
      writeFileSync(join(forgeStdDir, 'Test.sol'), `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Test {
  function assertTrue(bool condition) internal { require(condition, "assertion failed"); }
  function assertEq(uint a, uint b) internal { require(a == b, "values not equal"); }
  function startPrank(address sender) internal {}
  function stopPrank() internal {}
  function deal(address to, uint amount) internal {}
}
`, 'utf-8');
    }
  }
}
