import { chatCompletion } from '../llm';
import { REPORT_SYSTEM_PROMPT } from './prompts/report';
import { loadHistoryCases } from '@/lib/storage/data';
import type { VulnerabilityAnalysisResult } from './vulnerability-agent';

export async function generateAuditReport(
  analysisResult: VulnerabilityAnalysisResult,
  contractName: string,
  blockchain: string,
  address?: string
): Promise<string> {
  // Load history cases for detailed case information
  const historyCases = await loadHistoryCases();

  // Get details of matched cases
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

  // Build user prompt with analysis results and case details
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

## Historical Case Details
${caseDetails.length > 0 ? JSON.stringify(caseDetails, null, 2) : 'No matched historical cases found.'}

Please generate a professional audit report containing all required sections. Output in Markdown format.`;

  // Call LLM and get Markdown report
  const report = await chatCompletion(REPORT_SYSTEM_PROMPT, userPrompt);
  return report;
}
