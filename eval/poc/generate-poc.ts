import { AuditOrchestrator, type AuditResult } from '@/lib/agents/audit/orchestrator/audit-orchestrator';
import { LLMClient } from '@/lib/agents/core/llm-client';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import type { BlockchainId } from '@/lib/blockchain/config';
import type { PocEvalCase, PocGenerationResult } from './types';

const POC_GENERATION_PROMPT = `You are a DeFi exploit PoC generator. Based on the vulnerability analysis and attack reconstruction below, generate a Foundry test contract that reproduces the attack.

## Requirements
1. Use Foundry test framework: import "forge-std/Test.sol"
2. The test contract should inherit from Test
3. Use vm.startPrank(attacker) / vm.stopPrank() to simulate the attacker
4. Use vm.deal(attacker, amount) if the attacker needs ETH
5. Include assert or require statements to verify the attack succeeded (e.g., profit > 0, balance increased)
6. If the attack requires a flash loan, simulate it with vm.deal (simplified, no need for actual Aave/Balancer integration)
7. Do NOT use fork (the forge test runner will handle forking). Just write the test logic assuming the vulnerable contract is already deployed.
8. Keep the PoC concise (under 100 lines)

## Output
Output ONLY the Solidity code, no markdown fences, no explanations.`;

export async function generatePoc(
  evalCase: PocEvalCase,
): Promise<PocGenerationResult> {
  const startTime = Date.now();

  try {
    const fetchResult = await fetchContractWithCache(
      evalCase.victimAddress,
      evalCase.blockchain as BlockchainId,
    );

    if (!fetchResult.success || !fetchResult.sourceCode) {
      return {
        caseId: evalCase.caseId,
        pocCode: '',
        vulnerabilityReport: null,
        attackReconstruction: null,
        generationSuccess: false,
        error: 'Source code unavailable',
        generationMs: Date.now() - startTime,
      };
    }

    const orchestrator = new AuditOrchestrator();
    const auditResult = await orchestrator.run(
      fetchResult.sourceCode,
      evalCase.contractName,
      evalCase.blockchain,
      evalCase.victimAddress,
    );

    if ('partial' in auditResult && auditResult.partial) {
      return {
        caseId: evalCase.caseId,
        pocCode: '',
        vulnerabilityReport: null,
        attackReconstruction: null,
        generationSuccess: false,
        error: 'Partial audit result: LLM quota exceeded during analysis',
        generationMs: Date.now() - startTime,
      };
    }

    const fullResult = auditResult as AuditResult;
    const vulnReport = fullResult.analysisResult;
    const attackRecon = fullResult.reconstruction;

    const llm = new LLMClient({ maxRetries: 2, temperature: 0.2, maxTokens: 4096 });

    const userPrompt = `## Contract: ${evalCase.contractName}
## Blockchain: ${evalCase.blockchain}
## Contract Address: ${evalCase.victimAddress}

## Vulnerability Analysis
${JSON.stringify(vulnReport.vulnerabilities.map((v: any) => ({
  patternId: v.patternId,
  title: v.title,
  description: v.description,
  attackVector: v.attackVector,
  location: v.location,
})), null, 2)}

## Attack Reconstruction
${JSON.stringify(attackRecon.attacks.map((a: any) => ({
  type: a.attackType,
  name: a.attackName,
  steps: a.steps.map((s: any) => `[${s.phase}] ${s.action}`),
  fundFlow: a.fundFlow,
})), null, 2)}

## Contract Source Code (first 200 lines)
${fetchResult.sourceCode.split('\n').slice(0, 200).join('\n')}

Generate a Foundry test contract that reproduces this attack.`;

    const pocCode = await llm.chat(POC_GENERATION_PROMPT, userPrompt);

    const cleanedCode = pocCode
      .replace(/^```solidity\n?/m, '')
      .replace(/^```\n?/m, '')
      .replace(/```$/m, '')
      .trim();

    return {
      caseId: evalCase.caseId,
      pocCode: cleanedCode,
      vulnerabilityReport: vulnReport,
      attackReconstruction: attackRecon,
      generationSuccess: true,
      generationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      caseId: evalCase.caseId,
      pocCode: '',
      vulnerabilityReport: null,
      attackReconstruction: null,
      generationSuccess: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      generationMs: Date.now() - startTime,
    };
  }
}
