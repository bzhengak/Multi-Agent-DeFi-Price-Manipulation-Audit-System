import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { PocEvalCase, ForgeTestResult } from './types';

const CHAIN_ALIAS: Record<string, string> = {
  ethereum: 'ethereum',
  bsc: 'bsc',
  arbitrum: 'arbitrum',
  base: 'base',
  opbnb: 'opbnb',
  sei: 'sei',
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

    let processedCode = pocCode;
    const chainAlias = CHAIN_ALIAS[evalCase.blockchain] || 'ethereum';

    processedCode = normalizePragma(processedCode);

    if (isReference) {
      processedCode = stripBlockNumberOfReferencePoC(processedCode);
    } else {
      processedCode = injectForkSetup(processedCode, chainAlias);
    }

    cleanTestDir(testDir);

    const fileName = isReference
      ? `${evalCase.caseId}_ref.t.sol`
      : `${evalCase.caseId}.t.sol`;
    const filePath = join(testDir, 'test', fileName);
    writeFileSync(filePath, processedCode, 'utf-8');

    try {
      execSync('forge build --force', { cwd: testDir, timeout: 120_000, stdio: 'pipe' });
    } catch (buildError) {
      const buildOutput = buildError instanceof Error
        ? ((buildError as any).stdout || buildError.message)
        : 'Build failed';
      return {
        caseId: evalCase.caseId,
        compiled: false,
        passed: false,
        rawOutput: String(buildOutput).slice(-2000),
        error: 'Compilation failed',
        durationMs: Date.now() - startTime,
      };
    }

    const fileNameFilter = isReference
      ? `--match-path "test/${fileName}"`
      : '--match-contract ExploitTest';
    const forgeCmd = `forge test ${fileNameFilter} -vvv`;

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

/**
 * Remove all .t.sol files from the test directory before writing a new one.
 * This prevents forge build from recompiling all previous test files, which
 * causes ETIMEDOUT as files accumulate.
 */
function cleanTestDir(testDir: string): void {
  const testDirPath = join(testDir, 'test');
  if (!existsSync(testDirPath)) return;
  for (const file of readdirSync(testDirPath)) {
    if (file.endsWith('.t.sol')) {
      unlinkSync(join(testDirPath, file));
    }
  }
}

/**
 * Normalize all pragma solidity directives to ^0.8.0.
 * Reference PoCs from DeFiHackLabs use exact versions like `=0.8.19` which
 * may not be installed. Normalizing to ^0.8.0 ensures compatibility with
 * the solc 0.8.26 configured in foundry.toml.
 */
function normalizePragma(code: string): string {
  return code.replace(
    /pragma\s+solidity\s+[>=^~]*\s*\d+\.\d+\.\d+\s*;/g,
    'pragma solidity ^0.8.0;',
  );
}

/**
 * Strip the block number from createSelectFork / createFork calls in reference PoCs.
 * DeFiHackLabs PoCs hard-code old block numbers (e.g., createSelectFork("bsc", 42131697))
 * that require archival RPC access. By removing the block number, the test forks at
 * the latest block, which works with free public RPCs.
 */
function stripBlockNumberOfReferencePoC(code: string): string {
  return code
    .replace(
      /(createSelectFork|createFork)\s*\(\s*("[^"]+"|'[^']+')\s*,\s*[^)]+\)/g,
      (_match, fn, chainArg) => `${fn}(${chainArg})`,
    );
}

/**
 * Inject a setUp() function with vm.createSelectFork into generated PoCs that
 * don't have one. Generated PoCs typically make external calls to live contracts
 * (routers, pairs) and need a fork to resolve those addresses.
 */
function injectForkSetup(code: string, chainAlias: string): string {
  if (/function\s+setUp\s*\(/.test(code)) {
    return code;
  }

  const contractMatch = code.match(/contract\s+\w+\s+is\s+Test\s*\{/);
  if (!contractMatch) {
    return code;
  }

  const insertPos = code.indexOf(contractMatch[0]) + contractMatch[0].length;

  const setUpFunc = `
    function setUp() public {
        vm.createSelectFork("${chainAlias}");
    }`;

  return code.slice(0, insertPos) + setUpFunc + code.slice(insertPos);
}

function ensureFoundryProject(testDir: string): void {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const foundryToml = join(testDir, 'foundry.toml');
  const foundryConfig = `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.26"
rpc_timeout = "120s"
rpc_retries = 8

[rpc_endpoints]
ethereum = "https://eth.llamarpc.com"
mainnet = "https://eth.llamarpc.com"
bsc = "https://bsc-dataseed1.binance.org"
arbitrum = "https://arb1.arbitrum.io/rpc"
base = "https://mainnet.base.org"
opbnb = "https://opbnb.publicnode.com"
sei = "https://evm-rpc.sei-apis.com"
optimism = "https://mainnet.optimism.io"
polygon = "https://polygon-rpc.com"
avalanche = "https://api.avax.network/ext/bc/C/rpc"
fantom = "https://rpc.ftm.tools"
`;
  writeFileSync(foundryToml, foundryConfig, 'utf-8');

  const srcDir = join(testDir, 'src');
  if (!existsSync(srcDir)) {
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'Dummy.sol'), '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n', 'utf-8');
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
pragma solidity ^0.8.0;

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
