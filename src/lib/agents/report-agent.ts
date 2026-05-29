import { chatCompletion } from '../llm';
import { REPORT_SYSTEM_PROMPT } from './prompts/report';
import { loadHistoryCases, loadVulnerabilityPatterns } from '@/lib/storage/data';
import type { VulnerabilityAnalysisResult } from './vulnerability-agent';

export async function generateAuditReport(
  analysisResult: VulnerabilityAnalysisResult,
  contractName: string,
  blockchain: string,
  address?: string
): Promise<string> {
  const [historyCases, vulnPatterns] = await Promise.all([
    loadHistoryCases(),
    loadVulnerabilityPatterns(),
  ]);

  const matchedCaseIds = analysisResult.vulnerabilities
    .flatMap((v) => v.matchedCases.map((m) => m.caseId));

  const caseDetails = historyCases.cases
    .filter((c) => matchedCaseIds.includes(c.id))
    .map((c) => ({
      id: c.id,
      time: c.time,
      platform: c.blockchain_platform,
      attackTx: c.attack_transaction,
      attackContract: c.attack_contract_address,
      victimContract: c.victim_contract_address,
      note: c.note,
      vulnerabilityPattern: c.vulnerability_pattern,
    }));

  const patternRefs = Object.fromEntries(
    vulnPatterns.patterns.map((p) => [p.id, { swc: p.references?.swc, owasp: p.references?.owasp }])
  );

  const userPrompt = `Please generate a complete audit report based on the following vulnerability analysis results.

## Analysis Results
\`\`\`json
${JSON.stringify(analysisResult, null, 2)}
\`\`\`

## Contract Information
- Contract Name: ${contractName}
- Blockchain Platform: ${blockchain}
- Contract Address: ${address || 'Unknown'}
- Analysis Time: ${analysisResult.summary.analysisTime}

## Vulnerability Pattern References (SWC / OWASP)
\`\`\`json
${JSON.stringify(patternRefs, null, 2)}
\`\`\`

## Historical Case Details
${caseDetails.length > 0 ? JSON.stringify(caseDetails, null, 2) : 'No matched historical cases found.'}

For each vulnerability in the report, please include:
- **attack_cost_estimate**: Estimated flash loan size (in ETH/USD) and gas cost based on typical DeFi attack scales. State this is an LLM-based approximation.
- **remediation_timeline**: Critical → within 24 hours, High → within 7 days, Medium/Low → regular sprint cycle.
- **knowledge_references**: Include SWC ID and OWASP category from the Vulnerability Pattern References above.

Please generate a professional audit report containing all required sections. Output in Markdown format.`;

  const report = await chatCompletion(REPORT_SYSTEM_PROMPT, userPrompt);
  return report;
}
