import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { BLOCKCHAIN_CONFIG, ETHERSCAN_V2_BASE_URL, ETHERSCAN_V2_API_KEY_ENV, SOURCIFY_REPO_URL, type BlockchainId } from './config';

// ============================================
// Types
// ============================================

interface ContractSource {
  SourceCode: string;
  ABI: string;
  ContractName: string;
  CompilerVersion: string;
  OptimizationUsed: string;
  Runs: string;
  ConstructorArguments: string;
  EVMVersion: string;
  Library: string;
  LicenseType: string;
  Proxy: string;
  Implementation: string;
  SwarmSource: string;
}

/** Source code origin */
export type SourceOrigin = 'etherscan' | 'sourcify' | 'heimdall' | 'file' | 'demo';

/** Source code type */
export type SourceType = 'verified' | 'decompiled';

export interface FetchContractResult {
  success: boolean;
  sourceCode?: string;
  contractName?: string;
  compilerVersion?: string;
  error?: string;
  /** Where the source code came from */
  source?: SourceOrigin;
  /** Whether the source is verified original or decompiled pseudo-code */
  sourceType?: SourceType;
}

// ============================================
// Etherscan V2 API
// ============================================

/**
 * 构建 Etherscan V2 API URL，确保:
 * 1. chainid 是第一个查询参数
 * 2. apikey 是最后一个查询参数
 */
export function etherscanUrlSafe(
  chainId: number,
  params: Record<string, string>,
  apiKey: string,
): string {
  const sp = new URLSearchParams();
  sp.set('chainid', String(chainId));
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    sp.set(key, params[key]);
  }
  sp.set('apikey', apiKey);
  return `${ETHERSCAN_V2_BASE_URL}?${sp.toString()}`;
}

/**
 * 获取 API Key: 优先从 settings.json 读取，否则从 .env 读取
 */
async function getApiKey(blockchain: BlockchainId): Promise<string | undefined> {
  try {
    const { getBlockchainApiKey } = await import('@/lib/storage/settings');
    const key = await getBlockchainApiKey(blockchain);
    if (key) return key;
  } catch {
    // Fallback to env
  }
  if (process.env[ETHERSCAN_V2_API_KEY_ENV]) {
    return process.env[ETHERSCAN_V2_API_KEY_ENV];
  }
  const config = BLOCKCHAIN_CONFIG[blockchain];
  if (process.env[config.envKey]) {
    return process.env[config.envKey];
  }
  return undefined;
}

/**
 * 方案一: Etherscan V2 API 获取已验证合约源码
 * 优先级最高，返回的是验证过的真实源码
 */
async function fetchFromEtherscanV2(
  address: string,
  blockchain: BlockchainId,
): Promise<FetchContractResult> {
  const config = BLOCKCHAIN_CONFIG[blockchain];
  if (!config) {
    return { success: false, error: `Unsupported blockchain: ${blockchain}` };
  }

  const apiKey = await getApiKey(blockchain);
  if (!apiKey) {
    return {
      success: false,
      error: `API Key 未配置。请在设置页面配置 Etherscan API Key`,
    };
  }

  const url = etherscanUrlSafe(
    config.chainId,
    { module: 'contract', action: 'getsourcecode', address: address },
    apiKey,
  );

  try {
    console.log(`[Etherscan V2] Fetching ${address} on ${config.name} (chainid=${config.chainId})`);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === '0' && typeof data.result === 'string' && data.result.includes('Missing chainid')) {
      return { success: false, error: 'Etherscan V2 API 报错: Missing chainid parameter' };
    }

    if (data.status === '0') {
      const errMsg = typeof data.result === 'string' ? data.result : 'Contract not verified or does not exist';
      return { success: false, error: errMsg };
    }

    const result: ContractSource = data.result[0];
    if (!result || !result.SourceCode) {
      return { success: false, error: '合约未验证或不存在' };
    }

    // Handle multi-file contract source code
    let sourceCode = result.SourceCode;
    if (sourceCode.startsWith('{{')) {
      try {
        const parsed = JSON.parse(sourceCode.slice(1, -1));
        if (parsed.sources) {
          sourceCode = Object.entries(parsed.sources)
            .map(([filePath, content]: [string, unknown]) => {
              const src = (content as { content: string }).content;
              return `// File: ${filePath}\n${src}`;
            })
            .join('\n\n');
        }
      } catch {
        // Fall back to raw source code
      }
    }

    return {
      success: true,
      sourceCode,
      contractName: result.ContractName,
      compilerVersion: result.CompilerVersion,
      source: 'etherscan',
      sourceType: 'verified',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch contract source';
    console.error(`[Etherscan V2] Failed for ${address} on ${blockchain}:`, error);
    return { success: false, error: message };
  }
}

// ============================================
// Sourcify 自动匹配 (方案二)
// ============================================

/**
 * 方案二: 从 Sourcify 仓库自动获取已验证的合约源码
 *
 * Sourcify 是一个独立于 Etherscan 的合约验证服务。
 * 很多在 Etherscan 上未验证的合约，可能在 Sourcify 上有备份。
 *
 * 执行逻辑:
 * 1. 先尝试 full_match (元数据完全匹配)
 * 2. 再尝试 partial_match (字节码匹配，元数据部分匹配)
 * 3. 从 metadata.json 获取源文件列表
 * 4. 逐个获取源文件内容并拼接
 *
 * @param chainId - 链 ID (1=Ethereum, 56=BSC, 42161=Arbitrum, 8453=Base)
 * @param address - 合约地址
 * @returns 源码字符串 | null
 */
async function fetchFromSourcify(
  chainId: number,
  address: string,
): Promise<FetchContractResult> {
  const normalizedAddress = address.toLowerCase();

  // 尝试 full_match 和 partial_match
  const matchTypes = ['full_match', 'partial_match'] as const;

  for (const matchType of matchTypes) {
    try {
      const metadataUrl = `${SOURCIFY_REPO_URL}/${matchType}/${chainId}/${normalizedAddress}/metadata.json`;
      console.log(`[Sourcify] Trying ${matchType} for ${normalizedAddress} on chain ${chainId}`);

      const res = await fetch(metadataUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (res.status !== 200) {
        continue; // Try next match type
      }

      const metadata = await res.json();
      const sources = metadata?.sources;
      if (!sources || typeof sources !== 'object') {
        continue;
      }

      // 获取源文件名列表
      const sourceFileNames = Object.keys(sources);
      if (sourceFileNames.length === 0) {
        continue;
      }

      // 尝试从 metadata 的 sources 中获取 content (full_match 通常有)
      // 或者从 repo 的 sources/ 目录获取文件内容
      let fullSourceCode = '';
      const contractName = metadata?.settings?.compilationTarget
        ? Object.values(metadata.settings.compilationTarget)[0] as string
        : undefined;

      for (const filePath of sourceFileNames) {
        const contentObj = sources[filePath] as { content?: string; keccak256?: string; urls?: string[] };

        // 优先使用 metadata 中内嵌的 content (full_match 通常有)
        if (contentObj?.content) {
          fullSourceCode += `// File: ${filePath}\n${contentObj.content}\n\n`;
          continue;
        }

        // 否则从 Sourcify repo 的 sources 目录获取
        try {
          // URL encode the file path for the request
          const encodedPath = filePath.replace(/\//g, '%2F');
          const sourceUrl = `${SOURCIFY_REPO_URL}/${matchType}/${chainId}/${normalizedAddress}/sources/${encodedPath}`;
          const sourceRes = await fetch(sourceUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(10000),
          });

          if (sourceRes.status === 200) {
            const sourceContent = await sourceRes.text();
            fullSourceCode += `// File: ${filePath}\n${sourceContent}\n\n`;
          }
        } catch {
          // Skip this file if fetch fails
          console.warn(`[Sourcify] Failed to fetch source file: ${filePath}`);
        }
      }

      if (fullSourceCode.trim()) {
        console.log(`[Sourcify] Successfully fetched source from ${matchType}`);
        return {
          success: true,
          sourceCode: fullSourceCode.trim(),
          contractName: contractName || 'Unknown (Sourcify)',
          source: 'sourcify',
          sourceType: 'verified',
        };
      }
    } catch (error) {
      console.warn(`[Sourcify] ${matchType} fetch error:`, error);
      continue;
    }
  }

  return { success: false, error: 'Sourcify 上未找到该合约的验证源码' };
}

// ============================================
// Heimdall 反编译 (方案三)
// ============================================

/**
 * 方案三: 使用 Heimdall-rs 反编译合约获取伪代码
 *
 * 当合约既不在 Etherscan 也不在 Sourcify 上验证时，
 * 可以通过反编译字节码来获取伪代码（pseudo-code）。
 *
 * 反编译得到的代码不是原始 Solidity 源码，
 * 但足以用于安全审计和漏洞分析。
 *
 * 优先尝试 heimdall (Rust)，若不可用则尝试 panoramix (Python)。
 *
 * @param address - 合约地址
 * @param rpcUrl - 节点 RPC URL (需要有 archive 状态最佳)
 * @returns 伪代码字符串 | null
 */
function decompileWithHeimdall(address: string, rpcUrl: string): string | null {
  const outputDir = path.join(process.cwd(), '.temp_decompiled');
  const outputFile = path.join(outputDir, `${address}_decoded.sol`);

  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // 优先尝试 heimdall-rs (Rust 版本，更精确)
    try {
      execSync(`heimdall decode -a ${address} -r ${rpcUrl} -o ${outputDir}`, {
        stdio: 'ignore',
        timeout: 60000,
      });

      if (fs.existsSync(outputFile)) {
        const result = fs.readFileSync(outputFile, 'utf-8');
        if (result.trim()) return result;
      }
    } catch {
      // heimdall-rs not available, try alternative
    }

    // 备选: 尝试 heimdall 的其他输出文件名
    const possibleFiles = [
      path.join(outputDir, `${address}_decoded.sol`),
      path.join(outputDir, 'decoded.sol'),
      path.join(outputDir, `${address}.sol`),
    ];

    for (const f of possibleFiles) {
      if (fs.existsSync(f)) {
        const content = fs.readFileSync(f, 'utf-8');
        if (content.trim()) return content;
      }
    }

    // 备选: 使用 panoramix (Python 反编译器)
    try {
      const result = execSync(
        `python3 -m panoramix ${address} 2>/dev/null`,
        { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, env: { ...process.env, WEB3_PROVIDER_URI: rpcUrl } },
      );
      const output = result.toString().trim();
      if (output && output.length > 50) {
        return output;
      }
    } catch {
      // panoramix also failed
    }

    return null;
  } catch (error) {
    console.error(`[Heimdall] Decompile failed for ${address}:`, error);
    return null;
  } finally {
    // 清理临时文件
    try {
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================
// 整合调度: 三级级联获取合约源码
// ============================================

/**
 * 获取合约源码 - 三级级联回退策略
 *
 * 优先级:
 * 1. Etherscan V2 API → 真实验证源码 (sourceType: 'verified')
 * 2. Sourcify 仓库 → 真实验证源码 (sourceType: 'verified')
 * 3. Heimdall/panoramix 反编译 → 伪代码 (sourceType: 'decompiled')
 *
 * @param address - 合约地址
 * @param blockchain - 区块链标识符
 * @returns 获取结果，包含源码、来源和类型
 */
export async function fetchContractSource(
  address: string,
  blockchain: BlockchainId,
): Promise<FetchContractResult> {
  const config = BLOCKCHAIN_CONFIG[blockchain];
  if (!config) {
    return { success: false, error: `Unsupported blockchain: ${blockchain}` };
  }

  const errors: string[] = [];

  // === 第一级: Etherscan V2 API ===
  console.log(`[Contract Fetcher] Level 1: Trying Etherscan V2 for ${address} on ${config.name}`);
  const etherscanResult = await fetchFromEtherscanV2(address, blockchain);
  if (etherscanResult.success) {
    console.log(`[Contract Fetcher] ✓ Source obtained from Etherscan V2`);
    return etherscanResult;
  }
  errors.push(`Etherscan: ${etherscanResult.error}`);
  console.log(`[Contract Fetcher] ✗ Etherscan V2 failed: ${etherscanResult.error}`);

  // === 第二级: Sourcify ===
  if (config.sourcifySupported) {
    console.log(`[Contract Fetcher] Level 2: Trying Sourcify for ${address} on ${config.name}`);
    const sourcifyResult = await fetchFromSourcify(config.chainId, address);
    if (sourcifyResult.success) {
      console.log(`[Contract Fetcher] ✓ Source obtained from Sourcify`);
      return sourcifyResult;
    }
    errors.push(`Sourcify: ${sourcifyResult.error}`);
    console.log(`[Contract Fetcher] ✗ Sourcify failed: ${sourcifyResult.error}`);
  } else {
    errors.push('Sourcify: 该链不支持');
    console.log(`[Contract Fetcher] ✗ Sourcify not supported for ${config.name}`);
  }

  // === 第三级: Heimdall/panoramix 反编译 ===
  console.log(`[Contract Fetcher] Level 3: Trying Heimdall/panoramix decompilation for ${address}`);
  const decompiledCode = decompileWithHeimdall(address, config.rpcUrl);
  if (decompiledCode) {
    console.log(`[Contract Fetcher] ✓ Decompiled code obtained from Heimdall/panoramix`);
    return {
      success: true,
      sourceCode: decompiledCode,
      contractName: `${address.slice(0, 8)}... (Decompiled)`,
      source: 'heimdall',
      sourceType: 'decompiled',
    };
  }
  errors.push('Heimdall/panoramix: 反编译失败或工具未安装');
  console.log(`[Contract Fetcher] ✗ Heimdall/panoramix decompilation failed`);

  // === 全部失败 ===
  return {
    success: false,
    error: `无法获取合约代码 (已尝试全部3种方式):\n${errors.join('\n')}`,
  };
}

// ============================================
// Cache Layer
// ============================================

const contractCache = new Map<string, FetchContractResult>();

/**
 * Fetch contract source code with in-memory caching.
 */
export async function fetchContractWithCache(
  address: string,
  blockchain: BlockchainId,
): Promise<FetchContractResult> {
  const cacheKey = `${blockchain}:${address.toLowerCase()}`;

  if (contractCache.has(cacheKey)) {
    return contractCache.get(cacheKey)!;
  }

  const result = await fetchContractSource(address, blockchain);
  contractCache.set(cacheKey, result);

  return result;
}
