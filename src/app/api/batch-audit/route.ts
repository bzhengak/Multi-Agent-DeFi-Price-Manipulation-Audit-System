import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/jwt';
import { fetchContractSource, type SourceOrigin, type SourceType } from '@/lib/blockchain/fetcher';
import { BLOCKCHAIN_CONFIG, type BlockchainId } from '@/lib/blockchain/config';
import { AuditOrchestrator, type OrchestratorProgress } from '@/lib/agents/audit/orchestrator/audit-orchestrator';
import { saveReport, addAnalysisRecord, loadHistoryCases } from '@/lib/storage/data';
import { saveJSON, loadJSON } from '@/lib/storage/blob';
import { sanitizeAddress } from '@/lib/security';

const API_SUPPORTED_CHAINS = Object.keys(BLOCKCHAIN_CONFIG);
const BATCH_TASKS_FILE = 'batch_tasks.json';

async function updateBatchTask(taskId: string, status: Record<string, unknown>) {
  const tasks = (await loadJSON<Record<string, Record<string, unknown>>>(BATCH_TASKS_FILE)) || {};
  tasks[taskId] = { ...tasks[taskId], ...status, updatedAt: new Date().toISOString() };
  await saveJSON(BATCH_TASKS_FILE, tasks);
}

async function getBatchTask(taskId: string): Promise<Record<string, unknown> | null> {
  const tasks = (await loadJSON<Record<string, Record<string, unknown>>>(BATCH_TASKS_FILE)) || {};
  return tasks[taskId] || null;
}

function getBlockchainKey(platform: string): BlockchainId | null {
  const lower = platform.toLowerCase();
  const mapping: Record<string, BlockchainId> = {
    ethereum: 'ethereum',
    eth: 'ethereum',
    bsc: 'bsc',
    binance: 'bsc',
    arbitrum: 'arbitrum',
    arb: 'arbitrum',
    base: 'base',
    opbnb: 'opbnb',
    sei: 'sei',
    hyperliquid: 'hyperliquid',
  };
  return mapping[lower] || null;
}

function extractAddress(url: string): string | null {
  const match = url.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

export async function POST(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const caseIds = body.caseIds as string[] | undefined;

    const taskId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await updateBatchTask(taskId, {
      status: 'pending',
      progress: 0,
      totalCases: 0,
      completedCases: 0,
      failedCases: 0,
      currentCase: '',
      results: [] as Array<{
        caseId: string;
        reportId: string;
        sourceOrigin: string;
        sourceType: string;
        riskLevel: string;
        vulnerabilityCount: number;
        classification: string;
        confidence: number;
        attackChains: number;
        error?: string;
      }>,
    });

    runBatchAudit(taskId, caseIds).catch(async (error) => {
      console.error('Batch audit failed:', error);
      await updateBatchTask(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return NextResponse.json({ taskId, message: '批量审计任务已启动' });
  } catch (error) {
    console.error('Batch audit POST error:', error);
    return NextResponse.json({ error: '批量审计请求失败' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: '缺少taskId参数' }, { status: 400 });
    }

    const task = await getBatchTask(taskId);
    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Batch audit GET error:', error);
    return NextResponse.json({ error: '获取任务状态失败' }, { status: 500 });
  }
}

async function runBatchAudit(taskId: string, caseIds?: string[]) {
  const casesData = await loadHistoryCases();
  let casesToAudit = casesData.cases;

  if (caseIds && caseIds.length > 0) {
    casesToAudit = casesToAudit.filter((c) => caseIds.includes(c.id));
  }

  const totalCases = casesToAudit.length;
  let completedCases = 0;
  let failedCases = 0;
  const results: Array<{
    caseId: string;
    reportId: string;
    sourceOrigin: string;
    sourceType: string;
    riskLevel: string;
    vulnerabilityCount: number;
    classification: string;
    confidence: number;
    attackChains: number;
    error?: string;
  }> = [];

  await updateBatchTask(taskId, {
    status: 'running',
    totalCases,
    completedCases: 0,
    failedCases: 0,
    currentCase: casesToAudit[0]?.id || '',
    progress: 0,
    results: [],
  });

  for (let i = 0; i < casesToAudit.length; i++) {
    const caseItem = casesToAudit[i];
    const caseId = caseItem.id;

    console.log(`[Batch Audit] Processing case ${i + 1}/${totalCases}: ${caseId}`);

    await updateBatchTask(taskId, {
      currentCase: caseId,
      progress: Math.round((i / totalCases) * 100),
    });

    try {
      const blockchainKey = getBlockchainKey(caseItem.blockchain_platform);
      const isSupportedChain = blockchainKey && API_SUPPORTED_CHAINS.includes(blockchainKey);

      const victimAddress = extractAddress(caseItem.victim_contract_address);
      const attackAddress = extractAddress(caseItem.attack_contract_address);
      const rawAddress = victimAddress || attackAddress || '';
      const contractAddress = sanitizeAddress(rawAddress);

      let sourceCode: string | null = null;
      let contractName: string = caseId;
      let sourceOrigin: SourceOrigin | 'unavailable' | 'context' = 'unavailable';
      let sourceType: SourceType | 'unavailable' | 'context' = 'unavailable';

      if (isSupportedChain && contractAddress && /^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        try {
          const fetchResult = await fetchContractSource(contractAddress, blockchainKey!);
          if (fetchResult.success && fetchResult.sourceCode) {
            sourceCode = fetchResult.sourceCode;
            contractName = fetchResult.contractName || caseId;
            sourceOrigin = fetchResult.source || 'etherscan';
            sourceType = fetchResult.sourceType || 'verified';
            console.log(`[Batch Audit] Source code obtained from ${sourceOrigin} for ${caseId}`);
          } else {
            console.log(`[Batch Audit] Source code fetch failed for ${caseId}: ${fetchResult.error}`);
          }
        } catch (fetchError) {
          console.log(`[Batch Audit] Source code fetch error for ${caseId}:`, fetchError);
        }
      } else {
        if (!isSupportedChain) {
          console.log(`[Batch Audit] Chain ${caseItem.blockchain_platform} not supported for API fetching`);
        } else if (!contractAddress) {
          console.log(`[Batch Audit] No valid contract address found for ${caseId}`);
        }
      }

      const onProgress = async (progress: OrchestratorProgress) => {
        await updateBatchTask(taskId, {
          currentStage: `${caseId}: ${progress.stage}`,
          caseProgress: progress.progress,
          details: progress.details,
        });
      };

      const orchestrator = new AuditOrchestrator(onProgress);

      let auditResult;

      if (sourceCode) {
        auditResult = await orchestrator.run(
          sourceCode,
          contractName,
          caseItem.blockchain_platform,
          contractAddress,
        );
      } else {
        sourceOrigin = 'context';
        sourceType = 'context';
        contractName = `${caseId} (${caseItem.vulnerability_pattern || 'Unknown Pattern'})`;

        auditResult = await orchestrator.runFromContext(
          caseId,
          caseItem.note || '',
          caseItem.vulnerability_pattern || '',
          caseItem.blockchain_platform,
          contractAddress,
        );
      }

      const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const fullReport = {
        id: reportId,
        createdAt: new Date().toISOString(),
        contractInfo: {
          address: contractAddress,
          chain: caseItem.blockchain_platform,
          name: contractName,
          sourceOrigin,
          sourceType,
        },
        analysisResult: auditResult.analysisResult,
        reportMarkdown: auditResult.reportMarkdown,
        summary: auditResult.summary,
        classification: auditResult.classification,
        reconstruction: auditResult.reconstruction,
        calibratedResult: auditResult.calibratedResult,
        caseId,
      };

      await saveReport(reportId, fullReport);

      await addAnalysisRecord({
        id: reportId,
        contractName,
        blockchain: caseItem.blockchain_platform,
        address: contractAddress,
        analysisTime: new Date().toISOString(),
        riskLevel: auditResult.summary.overallRisk,
        vulnerabilityCount: auditResult.summary.totalIssues,
        reportUrl: reportId,
        sourceOrigin,
        sourceType,
        caseId,
      });

      results.push({
        caseId,
        reportId,
        sourceOrigin,
        sourceType,
        riskLevel: auditResult.summary.overallRisk,
        vulnerabilityCount: auditResult.summary.totalIssues,
        classification: auditResult.classification.type,
        confidence: auditResult.calibratedResult.overallConfidence,
        attackChains: auditResult.reconstruction.combinedAttackChains.length,
      });

      completedCases++;
    } catch (error) {
      console.error(`[Batch Audit] Failed to analyze case ${caseId}:`, error);
      failedCases++;

      const failedReportId = `report_failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const failedReport = {
        id: failedReportId,
        createdAt: new Date().toISOString(),
        contractInfo: {
          address: extractAddress(caseItem.victim_contract_address) || extractAddress(caseItem.attack_contract_address) || '',
          chain: caseItem.blockchain_platform,
          name: `${caseId} (分析失败)`,
          sourceOrigin: 'unavailable',
          sourceType: 'unavailable',
        },
        analysisResult: {
          summary: {
            contractName: caseId,
            totalVulnerabilities: 0,
            riskLevel: 'Low' as const,
            analysisTime: new Date().toISOString(),
          },
          vulnerabilities: [],
          codeQuality: { overallScore: 'F' as const, issues: ['源码获取失败，分析无法完成'] },
          recommendations: ['请手动获取合约源码后重新分析'],
        },
        reportMarkdown: `# 审计报告 - ${caseId} (分析失败)\n\n## 源码状态\n\n无法获取合约源码，所有3种方式均失败：\n- Etherscan V2 API: 合约未验证或链不支持\n- Sourcify: 未找到验证源码\n- Heimdall 反编译: 工具不可用\n\n## 案例信息\n\n- **案例ID**: ${caseId}\n- **链**: ${caseItem.blockchain_platform}\n- **攻击模式**: ${caseItem.vulnerability_pattern || 'Unknown'}\n- **攻击描述**: ${caseItem.note || 'N/A'}\n\n## 建议\n\n1. 手动获取合约源码\n2. 使用文件上传方式重新分析\n`,
        summary: { overallRisk: 'Low', totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0, overallConfidence: 0, highFeasibilityAttacks: 0, combinedAttackChains: 0 },
        caseId,
        analysisFailed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      await saveReport(failedReportId, failedReport);

      await addAnalysisRecord({
        id: failedReportId,
        contractName: `${caseId} (分析失败)`,
        blockchain: caseItem.blockchain_platform,
        address: extractAddress(caseItem.victim_contract_address) || extractAddress(caseItem.attack_contract_address) || '',
        analysisTime: new Date().toISOString(),
        riskLevel: 'Low',
        vulnerabilityCount: 0,
        reportUrl: failedReportId,
        sourceOrigin: 'unavailable',
        sourceType: 'unavailable',
        caseId,
      });

      results.push({
        caseId,
        reportId: failedReportId,
        sourceOrigin: 'unavailable',
        sourceType: 'unavailable',
        riskLevel: 'Low',
        vulnerabilityCount: 0,
        classification: 'unknown',
        confidence: 0,
        attackChains: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    await updateBatchTask(taskId, {
      completedCases,
      failedCases,
      progress: Math.round(((i + 1) / totalCases) * 100),
      results,
    });

    await new Promise((r) => setTimeout(r, 500));
  }

  await updateBatchTask(taskId, {
    status: 'completed',
    progress: 100,
    completedCases,
    failedCases,
    currentCase: '',
    results,
  });

  console.log(`[Batch Audit] Complete: ${completedCases} succeeded, ${failedCases} failed out of ${totalCases}`);
}
