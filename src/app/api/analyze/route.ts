import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/jwt';
import { fetchContractSource, type SourceOrigin, type SourceType } from '@/lib/blockchain/fetcher';
import { BLOCKCHAIN_CONFIG, type BlockchainId } from '@/lib/blockchain/config';
import { AuditOrchestrator, type OrchestratorProgress } from '@/lib/agents/audit/orchestrator/audit-orchestrator';
import { saveReport, addAnalysisRecord } from '@/lib/storage/data';
import { saveJSON, loadJSON } from '@/lib/storage/blob';
import { checkRateLimit, sanitizeAddress, validateSourceCode } from '@/lib/security';
import { taskStates } from './state';

const API_SUPPORTED_CHAINS = Object.keys(BLOCKCHAIN_CONFIG);

// Task status storage
const TASKS_FILE = 'tasks.json';

async function updateTaskStatus(taskId: string, status: Record<string, unknown>) {
  taskStates.set(taskId, status);
  const tasks = (await loadJSON<Record<string, Record<string, unknown>>>(TASKS_FILE)) || {};
  tasks[taskId] = { ...tasks[taskId], ...status, updatedAt: new Date().toISOString() };
  await saveJSON(TASKS_FILE, tasks);
}

async function getTaskStatus(taskId: string): Promise<Record<string, unknown> | null> {
  const mem = taskStates.get(taskId) as unknown as Record<string, unknown>;
  if (mem) return mem;
  const tasks = await loadJSON<Record<string, Record<string, unknown>>>(TASKS_FILE);
  return tasks?.[taskId] || null;
}

export async function POST(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimit = checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试', retryAfter: Math.ceil(rateLimit.retryAfterMs / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) } },
      );
    }

    const formData = await request.formData();
    const type = formData.get('type') as string;
    const chain = formData.get('chain') as string;

    let sourceCode: string;
    let contractName: string;
    let contractAddress: string;
    let sourceOrigin: SourceOrigin = 'file';
    let sourceType: SourceType = 'verified';

    if (type === 'address') {
      contractAddress = sanitizeAddress((formData.get('address') as string)?.trim() ?? '');

      if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        return NextResponse.json(
          { error: '无效的合约地址' },
          { status: 400 }
        );
      }

      const chainId = chain.toLowerCase() as BlockchainId;
      if (!API_SUPPORTED_CHAINS.includes(chainId)) {
        return NextResponse.json(
          { error: `${chain} 不支持API获取，请使用文件上传方式` },
          { status: 400 }
        );
      }

      const result = await fetchContractSource(contractAddress, chainId);

      if (!result.success) {
        // Record the failed source code fetch attempt in history
        // instead of just returning an error
        const failedReportId = `report_failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const failedReport = {
          id: failedReportId,
          createdAt: new Date().toISOString(),
          contractInfo: {
            address: contractAddress,
            chain,
            name: `Unknown (${contractAddress.slice(0, 10)}...)`,
            sourceOrigin: 'unavailable' as const,
            sourceType: 'unavailable' as const,
          },
          analysisResult: {
            summary: { contractName: `Unknown`, totalVulnerabilities: 0, riskLevel: 'Low' as const, analysisTime: new Date().toISOString() },
            vulnerabilities: [],
            codeQuality: { overallScore: 'F' as const, issues: ['源码获取失败，无法进行深度分析'] },
            recommendations: ['请手动获取合约源码后重新分析', '尝试使用文件上传方式'],
          },
          reportMarkdown: `# 审计报告 - 源码获取失败\n\n## 合约地址\n${contractAddress}\n\n## 链\n${chain}\n\n## 源码状态\n\n❌ 无法获取合约源码:\n${result.error}\n\n## 建议\n\n1. 手动获取合约源码\n2. 使用文件上传方式重新分析\n`,
          summary: { overallRisk: 'Low', totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0 },
          sourceFetchError: result.error,
        };
        await saveReport(failedReportId, failedReport);
        await addAnalysisRecord({
          id: failedReportId,
          contractName: `Unknown (${contractAddress.slice(0, 10)}...)`,
          blockchain: chain,
          address: contractAddress,
          analysisTime: new Date().toISOString(),
          riskLevel: 'Low',
          vulnerabilityCount: 0,
          reportUrl: failedReportId,
          sourceOrigin: 'unavailable',
          sourceType: 'unavailable',
        });

        return NextResponse.json(
          { error: `获取合约代码失败: ${result.error}`, reportId: failedReportId },
          { status: 400 }
        );
      }

      sourceCode = result.sourceCode!;
      contractName = result.contractName || 'Unknown';
      sourceOrigin = result.source || 'etherscan';
      sourceType = result.sourceType || 'verified';
    } else {
      const file = formData.get('file') as File;
      if (!file) {
        return NextResponse.json(
          { error: '请上传合约文件' },
          { status: 400 }
        );
      }

      contractAddress = file.name;
      sourceCode = await file.text();
      contractName = file.name.replace(/\.(sol|zip)$/, '');
    }

    // Validate source code size
    if (sourceCode.length > 500000) {
      return NextResponse.json(
        { error: '合约代码过大，请上传小于500KB的文件' },
        { status: 400 }
      );
    }

    if (sourceCode.trim().length === 0) {
      return NextResponse.json(
        { error: '合约代码为空' },
        { status: 400 }
      );
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize task status
    await updateTaskStatus(taskId, {
      status: 'pending',
      progress: 0,
      stage: '初始化分析任务',
      contractName,
      contractAddress,
      chain,
    });

    // Run analysis asynchronously
    runAnalysis(taskId, sourceCode, chain, contractName, contractAddress, sourceOrigin, sourceType).catch(
      async (error) => {
        console.error('Analysis failed:', error);
        await updateTaskStatus(taskId, {
          status: 'failed',
          progress: 0,
          stage: '分析失败',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    );

    return NextResponse.json({ taskId });
  } catch (error) {
    console.error('Analyze POST error:', error);
    return NextResponse.json(
      { error: '分析请求失败' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // SSE stream endpoint: GET /api/analyze/{taskId}/stream
  if (pathParts.length >= 3 && pathParts[2] && pathParts[pathParts.length - 1] === 'stream') {
    const taskId = pathParts[pathParts.length - 2];

    if (!taskId) {
      return new Response(JSON.stringify({ error: '缺少taskId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const currentState = taskStates.get(taskId) as unknown as Record<string, unknown>;
    if (!currentState) {
      return new Response(JSON.stringify({ error: '任务不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(currentState)}\n\n`));

        const unsubscribe = taskStates.subscribe(taskId, (state) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(state)}\n\n`));
            if (state.status === 'completed' || state.status === 'failed') {
              controller.close();
              unsubscribe();
            }
          } catch {
            controller.close();
            unsubscribe();
          }
        });

        request.signal.addEventListener('abort', () => {
          unsubscribe();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // Polling endpoint: GET /api/analyze?taskId=xxx
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: '缺少taskId参数' }, { status: 400 });
    }

    const task = await getTaskStatus(taskId);
    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Analyze GET error:', error);
    return NextResponse.json({ error: '获取任务状态失败' }, { status: 500 });
  }
}

async function runAnalysis(
  taskId: string,
  sourceCode: string,
  chain: string,
  contractName: string,
  contractAddress: string,
  sourceOrigin: SourceOrigin = 'file',
  sourceType: SourceType = 'verified',
) {
  const STAGE_LABELS: Record<string, string> = {
    protocol_detection: '协议识别中 - AI正在分析合约类型',
    context_building: '上下文构建中 - 正在准备针对性分析策略',
    vulnerability_analysis: '漏洞分析中 - AI正在深度分析合约代码（多轮迭代）',
    attack_reconstruction: '攻击重建中 - 正在重建攻击场景与资金流向',
    cost_estimation: '攻击成本估算中 - 正在计算确定性成本区间',
    confidence_calibration: '置信度校准中 - 正在评估分析结果可信度',
    report_generation: '报告生成中 - AI正在撰写增强版审计报告',
  };

  const onProgress = async (progress: OrchestratorProgress) => {
    const stageLabel = STAGE_LABELS[progress.stage] || progress.stage;
    await updateTaskStatus(taskId, {
      status: 'analyzing',
      progress: progress.progress,
      stage: stageLabel,
      details: progress.details,
    });
  };

  const orchestrator = new AuditOrchestrator(onProgress);
  const auditResult = await orchestrator.run(sourceCode, contractName, chain, contractAddress);

  const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const fullReport = {
    id: reportId,
    createdAt: new Date().toISOString(),
    contractInfo: {
      address: contractAddress,
      chain,
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
  };

  await saveReport(reportId, fullReport);

  await addAnalysisRecord({
    id: reportId,
    contractName,
    blockchain: chain,
    address: contractAddress,
    analysisTime: new Date().toISOString(),
    riskLevel: auditResult.summary.overallRisk,
    vulnerabilityCount: auditResult.summary.totalIssues,
    reportUrl: reportId,
    sourceOrigin,
    sourceType,
  });

  await updateTaskStatus(taskId, {
    status: 'completed',
    progress: 100,
    stage: '分析完成',
    reportId,
    classification: auditResult.classification.type,
    confidence: auditResult.calibratedResult.overallConfidence,
    attackChains: auditResult.reconstruction.combinedAttackChains.length,
  });
}
