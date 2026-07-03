import { keccak256 } from 'js-sha3';
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
7. The forge test runner forks mainnet at the attack block. You do NOT need to call vm.createFork(). Just write the test logic assuming the vulnerable contract is already deployed at its on-chain address.
8. Keep the PoC concise (under 100 lines)
9. Use EIP-55 checksummed addresses (e.g., "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B" not "0xab5801a7d398351b8be11c439e05c5b3259aec9b")

## Output
Output ONLY the Solidity code, no markdown fences, no explanations.`;

/**
 * EIP-55 checksum an Ethereum address using keccak256 of the lowercase hex string.
 */
function toChecksumAddress(address: string): string {
  const clean = address.toLowerCase().replace('0x', '');
  if (clean.length !== 40) return address;
  const hash = keccak256(clean);
  let checksummed = '0x';
  for (let i = 0; i < 40; i++) {
    if (parseInt(hash[i], 16) >= 8) {
      checksummed += clean[i].toUpperCase();
    } else {
      checksummed += clean[i];
    }
  }
  return checksummed;
}

/**
 * Post-process LLM-generated Solidity code to fix common issues:
 * - EIP-55 checksum addresses
 * - Remove markdown fences
 */
function cleanPocCode(raw: string): string {
  let code = raw
    .replace(/^```solidity\n?/m, '')
    .replace(/^```\n?/m, '')
    .replace(/```$/m, '')
    .trim();

  // Fix non-checksummed addresses: 0x followed by exactly 40 hex chars
  code = code.replace(/0x[a-fA-F0-9]{40}/g, (match) => {
    const checksummed = toChecksumAddress(match);
    return checksummed;
  });

  return code;
}

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

    const cleanedCode = cleanPocCode(pocCode);

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
