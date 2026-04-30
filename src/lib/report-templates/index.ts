/**
 * Bilingual Report Templates (EN + CN)
 * Structured report templates for Smart Contract Audit Reports
 */

export type ReportLanguage = 'en' | 'cn';

// ============ Template Labels ============

export const reportLabels: Record<ReportLanguage, {
  // Page title
  pageTitle: string;
  // Section headers
  executiveSummary: string;
  projectOverview: string;
  vulnerabilityDetails: string;
  riskMatrix: string;
  codeQualityAssessment: string;
  conclusionAndRecommendations: string;
  // Sub-sections
  auditOverview: string;
  keyFindings: string;
  overallAssessment: string;
  urgentRecommendations: string;
  projectIntroduction: string;
  contractArchitecture: string;
  coreFunctionality: string;
  technologyStack: string;
  // Vulnerability fields
  vulnerabilityId: string;
  classification: string;
  severityLevel: string;
  description: string;
  rootCause: string;
  attackMechanism: string;
  triggerCondition: string;
  codeLocation: string;
  keyCodeSnippet: string;
  attackVector: string;
  impactAnalysis: string;
  directImpact: string;
  indirectImpact: string;
  systemicRisk: string;
  historicalCases: string;
  similarityAssessment: string;
  keySimilarities: string;
  fixRecommendation: string;
  recommendedSolution: string;
  alternativeSolution: string;
  verificationMethod: string;
  // Risk matrix
  bySeverity: string;
  byVulnerabilityPattern: string;
  fixPriorityOrder: string;
  count: string;
  percentage: string;
  highestSeverity: string;
  // Code quality
  complianceWithStandards: string;
  bestPracticeAdherence: string;
  qualityScore: string;
  specificIssues: string;
  gasOptimizationSuggestions: string;
  // Conclusion
  securityPostureSummary: string;
  phasedRemediationPlan: string;
  immediateFix: string;
  shortTermFix: string;
  longTermImprovement: string;
  continuousSecurityRecommendations: string;
  monitoringAndAlerting: string;
  subsequentAuditPlan: string;
  bugBountyProgram: string;
  // Severity labels
  critical: string;
  high: string;
  medium: string;
  low: string;
  informational: string;
  // Risk rating criteria
  riskRatingCriteria: string;
  definition: string;
  impact: string;
  fixTimeline: string;
  // General
  contractName: string;
  blockchain: string;
  contractAddress: string;
  analysisDate: string;
  auditScope: string;
  totalVulnerabilities: string;
  overallRiskLevel: string;
  securityStatus: string;
  safe: string;
  mostlySafe: string;
  atRisk: string;
  criticalRisk: string;
  page: string;
  of: string;
  generatedBy: string;
  disclaimer: string;
  // Download labels
  downloadPDF: string;
  downloadJSON: string;
  downloadHTML: string;
  shareReport: string;
  printReport: string;
  language: string;
  english: string;
  chinese: string;
}> = {
  en: {
    pageTitle: 'Smart Contract Security Audit Report',
    executiveSummary: 'Executive Summary',
    projectOverview: 'Project Overview',
    vulnerabilityDetails: 'Vulnerability Details',
    riskMatrix: 'Risk Matrix',
    codeQualityAssessment: 'Code Quality Assessment',
    conclusionAndRecommendations: 'Conclusion & Recommendations',
    auditOverview: 'Audit Overview',
    keyFindings: 'Key Findings',
    overallAssessment: 'Overall Assessment',
    urgentRecommendations: 'Urgent Recommendations',
    projectIntroduction: 'Project Introduction',
    contractArchitecture: 'Contract Architecture',
    coreFunctionality: 'Core Functionality',
    technologyStack: 'Technology Stack',
    vulnerabilityId: 'Vulnerability ID',
    classification: 'Classification',
    severityLevel: 'Severity Level',
    description: 'Description',
    rootCause: 'Root Cause',
    attackMechanism: 'Attack Mechanism',
    triggerCondition: 'Trigger Condition',
    codeLocation: 'Code Location',
    keyCodeSnippet: 'Key Code Snippet',
    attackVector: 'Attack Vector',
    impactAnalysis: 'Impact Analysis',
    directImpact: 'Direct Impact',
    indirectImpact: 'Indirect Impact',
    systemicRisk: 'Systemic Risk',
    historicalCases: 'Historical Cases',
    similarityAssessment: 'Similarity Assessment',
    keySimilarities: 'Key Similarities',
    fixRecommendation: 'Fix Recommendation',
    recommendedSolution: 'Recommended Solution',
    alternativeSolution: 'Alternative Solution',
    verificationMethod: 'Verification Method',
    bySeverity: 'By Severity Level',
    byVulnerabilityPattern: 'By Vulnerability Pattern',
    fixPriorityOrder: 'Fix Priority Order',
    count: 'Count',
    percentage: 'Percentage',
    highestSeverity: 'Highest Severity',
    complianceWithStandards: 'Compliance with Standards',
    bestPracticeAdherence: 'Best Practice Adherence',
    qualityScore: 'Quality Score',
    specificIssues: 'Specific Issues',
    gasOptimizationSuggestions: 'Gas Optimization Suggestions',
    securityPostureSummary: 'Security Posture Summary',
    phasedRemediationPlan: 'Phased Remediation Plan',
    immediateFix: 'Immediate Fix (Before Deployment)',
    shortTermFix: 'Short-term Fix (7-30 days)',
    longTermImprovement: 'Long-term Improvement (Future versions)',
    continuousSecurityRecommendations: 'Continuous Security Recommendations',
    monitoringAndAlerting: 'Monitoring & Alerting',
    subsequentAuditPlan: 'Subsequent Audit Plan',
    bugBountyProgram: 'Bug Bounty Program',
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    informational: 'Informational',
    riskRatingCriteria: 'Risk Rating Criteria',
    definition: 'Definition',
    impact: 'Impact',
    fixTimeline: 'Fix Timeline',
    contractName: 'Contract Name',
    blockchain: 'Blockchain',
    contractAddress: 'Contract Address',
    analysisDate: 'Analysis Date',
    auditScope: 'Audit Scope',
    totalVulnerabilities: 'Total Vulnerabilities',
    overallRiskLevel: 'Overall Risk Level',
    securityStatus: 'Security Status',
    safe: 'Safe',
    mostlySafe: 'Mostly Safe',
    atRisk: 'At Risk',
    criticalRisk: 'Critical Risk',
    page: 'Page',
    of: 'of',
    generatedBy: 'Generated by DeFi Price Manipulation Analyzer',
    disclaimer: 'This report is generated by AI-assisted analysis and should be reviewed by security professionals before making deployment decisions.',
    downloadPDF: 'PDF',
    downloadJSON: 'JSON',
    downloadHTML: 'HTML',
    shareReport: 'Share',
    printReport: 'Print',
    language: 'Language',
    english: 'EN',
    chinese: 'CN',
  },
  cn: {
    pageTitle: '智能合约安全审计报告',
    executiveSummary: '执行摘要',
    projectOverview: '项目概述',
    vulnerabilityDetails: '漏洞详情',
    riskMatrix: '风险矩阵',
    codeQualityAssessment: '代码质量评估',
    conclusionAndRecommendations: '结论与建议',
    auditOverview: '审计概述',
    keyFindings: '关键发现',
    overallAssessment: '整体评估',
    urgentRecommendations: '紧急建议',
    projectIntroduction: '项目简介',
    contractArchitecture: '合约架构',
    coreFunctionality: '核心功能描述',
    technologyStack: '技术栈',
    vulnerabilityId: '漏洞ID',
    classification: '漏洞分类',
    severityLevel: '严重等级',
    description: '漏洞描述',
    rootCause: '问题根因',
    attackMechanism: '攻击机制',
    triggerCondition: '触发条件',
    codeLocation: '代码位置',
    keyCodeSnippet: '关键代码片段',
    attackVector: '攻击向量',
    impactAnalysis: '影响分析',
    directImpact: '直接影响',
    indirectImpact: '间接影响',
    systemicRisk: '系统性风险',
    historicalCases: '历史案例关联',
    similarityAssessment: '相似度评估',
    keySimilarities: '关键相似点',
    fixRecommendation: '修复建议',
    recommendedSolution: '推荐方案',
    alternativeSolution: '替代方案',
    verificationMethod: '验证方法',
    bySeverity: '按严重等级分布',
    byVulnerabilityPattern: '按漏洞模式分布',
    fixPriorityOrder: '修复优先级排序',
    count: '数量',
    percentage: '占比',
    highestSeverity: '最高严重等级',
    complianceWithStandards: '代码规范合规性',
    bestPracticeAdherence: '最佳实践遵循度',
    qualityScore: '代码质量评分',
    specificIssues: '具体质量问题描述',
    gasOptimizationSuggestions: 'Gas优化建议',
    securityPostureSummary: '安全态势总结',
    phasedRemediationPlan: '分阶段修复计划',
    immediateFix: '立即修复（部署前必须完成）',
    shortTermFix: '短期修复（7-30天内）',
    longTermImprovement: '长期改进（后续版本）',
    continuousSecurityRecommendations: '持续安全建议',
    monitoringAndAlerting: '监控与告警机制',
    subsequentAuditPlan: '后续审计计划',
    bugBountyProgram: '漏洞赏金计划',
    critical: '严重',
    high: '高危',
    medium: '中危',
    low: '低危',
    informational: '信息性',
    riskRatingCriteria: '风险评级标准',
    definition: '定义',
    impact: '影响',
    fixTimeline: '修复时限',
    contractName: '合约名称',
    blockchain: '区块链',
    contractAddress: '合约地址',
    analysisDate: '分析时间',
    auditScope: '审计范围',
    totalVulnerabilities: '漏洞总数',
    overallRiskLevel: '整体风险等级',
    securityStatus: '安全状态',
    safe: '安全',
    mostlySafe: '基本安全',
    atRisk: '存在风险',
    criticalRisk: '高危',
    page: '第',
    of: '页，共',
    generatedBy: '由 DeFi 价格操纵分析器生成',
    disclaimer: '本报告由AI辅助分析生成，在做出部署决策前应由安全专业人员审核。',
    downloadPDF: 'PDF',
    downloadJSON: 'JSON',
    downloadHTML: 'HTML',
    shareReport: '分享',
    printReport: '打印',
    language: '语言',
    english: '英文',
    chinese: '中文',
  },
};

// ============ HTML Report Template ============

export function generateHTMLReport(
  report: {
    id: string;
    createdAt: string;
    contractInfo: { address: string; chain: string; name: string; sourceOrigin?: string; sourceType?: string };
    analysisResult: {
      summary: { contractName: string; totalVulnerabilities: number; riskLevel: string; analysisTime: string };
      vulnerabilities: Array<{
        id: string; patternId: string; patternName: string; severity: string;
        title: string; description: string;
        location: { fileName: string; lineStart: number; lineEnd: number; functionName: string; codeSnippet: string };
        attackVector: string; impact: string;
        matchedCases: Array<{ caseId: string; caseName: string; similarity: number; matchReason: string }>;
        recommendation: string;
      }>;
      codeQuality: { overallScore: string; issues: string[] };
      recommendations: string[];
    };
    reportMarkdown: string;
    summary: { overallRisk: string; totalIssues: number; critical: number; high: number; medium: number; low: number };
  },
  lang: ReportLanguage = 'cn'
): string {
  const t = reportLabels[lang];
  const { analysisResult, summary, contractInfo } = report;
  const vulns = analysisResult?.vulnerabilities || [];
  const criticalVulns = vulns.filter(v => v.severity === 'Critical');
  const highVulns = vulns.filter(v => v.severity === 'High');
  const mediumVulns = vulns.filter(v => v.severity === 'Medium');
  const lowVulns = vulns.filter(v => v.severity === 'Low' || v.severity === 'Informational');

  const severityRow = (level: string, count: number, color: string) => {
    const pct = summary.totalIssues > 0 ? ((count / summary.totalIssues) * 100).toFixed(1) : '0.0';
    return `<tr><td style="color:${color};font-weight:700;">${level}</td><td>${count}</td><td>${pct}%</td></tr>`;
  };

  const vulnCard = (v: typeof vulns[0]) => {
    const sColor = v.severity === 'Critical' ? '#ef4444' : v.severity === 'High' ? '#f97316' : v.severity === 'Medium' ? '#eab308' : '#38bdf8';
    return `
    <div style="border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:16px;page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="background:${sColor}22;color:${sColor};border:1px solid ${sColor}44;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${v.severity}</span>
        <span style="color:#94a3b8;font-size:12px;font-family:monospace;">${v.patternId}</span>
      </div>
      <h4 style="color:#f1f5f9;margin:0 0 8px 0;font-size:16px;">${v.title}</h4>
      <p style="color:#cbd5e1;font-size:13px;line-height:1.6;margin:0 0 12px 0;">${v.description}</p>
      ${v.location ? `
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px;margin-bottom:12px;">
        <p style="color:#94a3b8;font-size:11px;margin:0 0 6px 0;">${t.codeLocation}: ${v.location.fileName} | L${v.location.lineStart}-L${v.location.lineEnd} | ${v.location.functionName}()</p>
        ${v.location.codeSnippet ? `<pre style="color:#34d399;font-size:11px;margin:0;overflow-x:auto;font-family:monospace;">${escapeHtml(v.location.codeSnippet)}</pre>` : ''}
      </div>` : ''}
      ${v.attackVector ? `<p style="color:#cbd5e1;font-size:13px;margin:0 0 8px 0;"><strong style="color:#f1f5f9;">${t.attackVector}:</strong> ${v.attackVector}</p>` : ''}
      ${v.impact ? `<p style="color:#cbd5e1;font-size:13px;margin:0 0 8px 0;"><strong style="color:#f1f5f9;">${t.impactAnalysis}:</strong> ${v.impact}</p>` : ''}
      ${v.matchedCases && v.matchedCases.length > 0 ? `
      <div style="margin-bottom:8px;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 4px 0;">${t.historicalCases}:</p>
        ${v.matchedCases.map(mc => `<p style="color:#22d3ee;font-size:12px;margin:2px 0;">${mc.caseId} - ${mc.caseName} (${lang === 'cn' ? '相似度' : 'Similarity'}: ${(mc.similarity * 100).toFixed(0)}%)</p>`).join('')}
      </div>` : ''}
      ${v.recommendation ? `<p style="color:#6ee7b7;font-size:13px;margin:0;"><strong style="color:#34d399;">${t.fixRecommendation}:</strong> ${v.recommendation}</p>` : ''}
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="${lang === 'cn' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.pageTitle} - ${contractInfo.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #020617; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 30px; }
    .header { text-align: center; padding: 40px 0 30px; border-bottom: 2px solid #10b981; margin-bottom: 40px; }
    .header h1 { font-size: 28px; color: #f1f5f9; margin-bottom: 8px; }
    .header .subtitle { color: #94a3b8; font-size: 14px; }
    .header .meta { margin-top: 16px; display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; }
    .header .meta-item { font-size: 13px; color: #cbd5e1; }
    .header .meta-item strong { color: #f1f5f9; }
    .risk-badge { display: inline-block; padding: 6px 20px; border-radius: 20px; font-size: 16px; font-weight: 700; margin: 16px 0;
      background: ${summary.overallRisk === 'Critical' ? '#ef444420' : summary.overallRisk === 'High' ? '#f9731620' : summary.overallRisk === 'Medium' ? '#eab30820' : '#10b98120'};
      color: ${summary.overallRisk === 'Critical' ? '#ef4444' : summary.overallRisk === 'High' ? '#f97316' : summary.overallRisk === 'Medium' ? '#eab308' : '#10b981'};
      border: 1px solid ${summary.overallRisk === 'Critical' ? '#ef444440' : summary.overallRisk === 'High' ? '#f9731640' : summary.overallRisk === 'Medium' ? '#eab30840' : '#10b98140'};
    }
    .section { margin-bottom: 40px; }
    .section h2 { font-size: 22px; color: #10b981; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #1e293b; }
    .section h3 { font-size: 17px; color: #f1f5f9; margin-bottom: 10px; }
    .severity-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .severity-card { padding: 16px; border-radius: 10px; text-align: center; }
    .severity-card .num { font-size: 28px; font-weight: 700; }
    .severity-card .label { font-size: 12px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #1e293b; font-size: 13px; }
    th { color: #94a3b8; font-weight: 600; background: #0f172a; }
    td { color: #cbd5e1; }
    .recommendation { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; font-size: 13px; color: #cbd5e1; }
    .recommendation .icon { color: #10b981; flex-shrink: 0; margin-top: 2px; }
    .footer { text-align: center; padding: 30px 0; border-top: 1px solid #1e293b; margin-top: 40px; }
    .footer p { color: #64748b; font-size: 11px; line-height: 1.8; }
    @media print {
      body { background: white; color: #1e293b; }
      .header { border-bottom-color: #10b981; }
      .header h1 { color: #0f172a; }
      .header .meta-item { color: #475569; }
      .header .meta-item strong { color: #0f172a; }
      .section h2 { color: #059669; border-bottom-color: #e2e8f0; }
      .section h3 { color: #0f172a; }
      th { background: #f8fafc; color: #475569; }
      td { color: #334155; }
      .recommendation { color: #334155; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>${t.pageTitle}</h1>
      <div class="subtitle">${t.generatedBy} · v3.4</div>
      <div class="risk-badge">${t.overallRiskLevel}: ${summary.overallRisk}</div>
      <div class="meta">
        <div class="meta-item">${t.contractName}: <strong>${contractInfo.name}</strong></div>
        <div class="meta-item">${t.blockchain}: <strong>${contractInfo.chain}</strong></div>
        <div class="meta-item">${t.analysisDate}: <strong>${new Date(report.createdAt).toLocaleString(lang === 'cn' ? 'zh-CN' : 'en-US')}</strong></div>
        <div class="meta-item">${t.totalVulnerabilities}: <strong>${summary.totalIssues}</strong></div>
      </div>
    </div>

    <!-- Section 1: Executive Summary -->
    <div class="section">
      <h2>1. ${t.executiveSummary}</h2>
      <div class="severity-grid">
        <div class="severity-card" style="background:#ef444415;"><div class="num" style="color:#ef4444;">${summary.critical}</div><div class="label" style="color:#ef4444;">${t.critical}</div></div>
        <div class="severity-card" style="background:#f9731615;"><div class="num" style="color:#f97316;">${summary.high}</div><div class="label" style="color:#f97316;">${t.high}</div></div>
        <div class="severity-card" style="background:#eab30815;"><div class="num" style="color:#eab308;">${summary.medium}</div><div class="label" style="color:#eab308;">${t.medium}</div></div>
        <div class="severity-card" style="background:#38bdf815;"><div class="num" style="color:#38bdf8;">${summary.low}</div><div class="label" style="color:#38bdf8;">${t.low}</div></div>
      </div>
      ${criticalVulns.length > 0 ? `<h3>${t.urgentRecommendations}</h3>
      ${criticalVulns.map(v => `<div class="recommendation"><span class="icon">⚠</span><span>${v.title}: ${v.recommendation || ''}</span></div>`).join('')}` : ''}
    </div>

    <!-- Section 2: Contract Info -->
    <div class="section">
      <h2>2. ${t.projectOverview}</h2>
      <table>
        <tr><th>${t.contractName}</th><td>${contractInfo.name}</td></tr>
        <tr><th>${t.contractAddress}</th><td style="font-family:monospace;">${contractInfo.address}</td></tr>
        <tr><th>${t.blockchain}</th><td>${contractInfo.chain}</td></tr>
        <tr><th>${t.analysisDate}</th><td>${new Date(report.createdAt).toLocaleString(lang === 'cn' ? 'zh-CN' : 'en-US')}</td></tr>
        <tr><th>${t.qualityScore}</th><td>${analysisResult?.codeQuality?.overallScore || 'N/A'}</td></tr>
      </table>
    </div>

    <!-- Section 3: Vulnerabilities -->
    <div class="section">
      <h2>3. ${t.vulnerabilityDetails}</h2>
      ${vulns.length > 0 ? vulns.map(v => vulnCard(v)).join('') : `<p style="color:#94a3b8;">${lang === 'cn' ? '未发现漏洞' : 'No vulnerabilities found'}</p>`}
    </div>

    <!-- Section 4: Risk Matrix -->
    <div class="section">
      <h2>4. ${t.riskMatrix}</h2>
      <h3>4.1 ${t.bySeverity}</h3>
      <table>
        <tr><th>${t.severityLevel}</th><th>${t.count}</th><th>${t.percentage}</th></tr>
        ${severityRow(t.critical, summary.critical, '#ef4444')}
        ${severityRow(t.high, summary.high, '#f97316')}
        ${severityRow(t.medium, summary.medium, '#eab308')}
        ${severityRow(t.low, summary.low, '#38bdf8')}
      </table>
      ${(() => {
        const patternMap: Record<string, { count: number; maxSev: string }> = {};
        vulns.forEach(v => {
          if (!patternMap[v.patternName]) patternMap[v.patternName] = { count: 0, maxSev: v.severity };
          patternMap[v.patternName].count++;
          const sevOrder = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
          if (sevOrder.indexOf(v.severity) < sevOrder.indexOf(patternMap[v.patternName].maxSev)) {
            patternMap[v.patternName].maxSev = v.severity;
          }
        });
        return `<h3>4.2 ${t.byVulnerabilityPattern}</h3>
        <table><tr><th>${lang === 'cn' ? '漏洞模式' : 'Pattern'}</th><th>${t.count}</th><th>${t.highestSeverity}</th></tr>
        ${Object.entries(patternMap).map(([name, data]) => `<tr><td>${name}</td><td>${data.count}</td><td>${data.maxSev}</td></tr>`).join('')}
        </table>`;
      })()}
    </div>

    <!-- Section 5: Code Quality -->
    <div class="section">
      <h2>5. ${t.codeQualityAssessment}</h2>
      <table>
        <tr><th>${t.qualityScore}</th><td>${analysisResult?.codeQuality?.overallScore || 'N/A'}</td></tr>
      </table>
      ${analysisResult?.codeQuality?.issues && analysisResult.codeQuality.issues.length > 0 ? `
      <h3>${t.specificIssues}</h3>
      ${analysisResult.codeQuality.issues.map(issue => `<div class="recommendation"><span class="icon">•</span><span>${issue}</span></div>`).join('')}
      ` : ''}
    </div>

    <!-- Section 6: Recommendations -->
    <div class="section">
      <h2>6. ${t.conclusionAndRecommendations}</h2>
      ${analysisResult?.recommendations && analysisResult.recommendations.length > 0 ? `
      <h3>${t.phasedRemediationPlan}</h3>
      <h3 style="font-size:14px;color:#ef4444;">${t.immediateFix}</h3>
      ${criticalVulns.map(v => `<div class="recommendation"><span class="icon">🔴</span><span>${v.title}: ${v.recommendation || ''}</span></div>`).join('')}
      <h3 style="font-size:14px;color:#f97316;margin-top:12px;">${t.shortTermFix}</h3>
      ${highVulns.map(v => `<div class="recommendation"><span class="icon">🟠</span><span>${v.title}: ${v.recommendation || ''}</span></div>`).join('')}
      <h3 style="font-size:14px;color:#eab308;margin-top:12px;">${t.longTermImprovement}</h3>
      ${mediumVulns.concat(lowVulns).map(v => `<div class="recommendation"><span class="icon">🟡</span><span>${v.title}: ${v.recommendation || ''}</span></div>`).join('')}
      ` : ''}
    </div>

    <!-- Risk Rating Criteria -->
    <div class="section">
      <h2>${t.riskRatingCriteria}</h2>
      <table>
        <tr><th>${t.severityLevel}</th><th>${t.definition}</th><th>${t.impact}</th><th>${t.fixTimeline}</th></tr>
        <tr><td style="color:#ef4444;font-weight:700;">${t.critical}</td><td>${lang === 'cn' ? '可直接导致重大资金损失' : 'Can directly cause major fund loss'}</td><td>${lang === 'cn' ? '用户资金面临直接风险' : 'User funds at direct risk'}</td><td>${lang === 'cn' ? '立即修复' : 'Immediate'}</td></tr>
        <tr><td style="color:#f97316;font-weight:700;">${t.high}</td><td>${lang === 'cn' ? '特定条件下可被利用' : 'Exploitable under specific conditions'}</td><td>${lang === 'cn' ? '存在重大安全风险' : 'Major security risk'}</td><td>${lang === 'cn' ? '7天内修复' : 'Within 7 days'}</td></tr>
        <tr><td style="color:#eab308;font-weight:700;">${t.medium}</td><td>${lang === 'cn' ? '需要特定条件才能利用' : 'Requires specific conditions to exploit'}</td><td>${lang === 'cn' ? '潜在风险' : 'Potential risk'}</td><td>${lang === 'cn' ? '30天内修复' : 'Within 30 days'}</td></tr>
        <tr><td style="color:#38bdf8;font-weight:700;">${t.low}</td><td>${lang === 'cn' ? '理论风险或最佳实践问题' : 'Theoretical risk or best practice issue'}</td><td>${lang === 'cn' ? '影响有限' : 'Limited impact'}</td><td>${lang === 'cn' ? '建议修复' : 'Recommended'}</td></tr>
      </table>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>${t.generatedBy} · ${new Date().toLocaleString(lang === 'cn' ? 'zh-CN' : 'en-US')}</p>
      <p style="margin-top:8px;">${t.disclaimer}</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
