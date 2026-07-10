import { keccak256 } from 'js-sha3';
import { AuditOrchestrator, type AuditResult } from '@/lib/agents/audit/orchestrator/audit-orchestrator';
import { LLMClient } from '@/lib/agents/core/llm-client';
import { fetchContractWithCache } from '@/lib/blockchain/fetcher';
import type { BlockchainId } from '@/lib/blockchain/config';
import type { PocEvalCase, PocGenerationResult } from './types';

const POC_GENERATION_PROMPT = `You are a DeFi exploit PoC generator. Based on the vulnerability analysis and attack reconstruction below, generate a Foundry test contract that reproduces the attack.

## Requirements
1. Use Foundry test framework: import "forge-std/Test.sol"
2. Your test contract MUST be named "ExploitTest" and inherit from Test
3. Include a setUp() function that calls vm.createSelectFork() with the chain alias and fork block number (if provided)
4. Use vm.startPrank(attacker) / vm.stopPrank() to simulate the attacker
5. Use vm.deal(attacker, amount) if the attacker needs ETH or native tokens (no external flash loan protocol needed)
6. Include assert or require statements to verify the attack succeeded (e.g., profit > 0, balance increased)
7. Keep the PoC concise (under 100 lines)
8. Use EIP-55 checksummed addresses (e.g., "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B" not "0xab5801a7d398351b8be11c439e05c5b3259aec9b")

## Output
Output ONLY the Solidity code, no markdown fences, no explanations. Use SPDX license identifier and pragma solidity ^0.8.0.`;

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

    const llm = new LLMClient({ maxRetries: 2, temperature: 0.2, maxTokens: 4096, provider: 'medium' });

    const blockchain = evalCase.blockchain;
    const forkClause = evalCase.forkBlockNumber
      ? `\`\`\`solidity\nvm.createSelectFork("${blockchain}", ${evalCase.forkBlockNumber});\n\`\`\``
      : `\`\`\`solidity\nvm.createSelectFork("${blockchain}");\n\`\`\``;

    const vulnDetails = vulnReport.vulnerabilities.map((v: any) =>
`[${v.patternId}] ${v.location.functionName} (lines ${v.location.lineStart}-${v.location.lineEnd}):
  Description: ${v.description}
  Attack vector: ${v.attackVector}

  Vulnerable code snippet:
  \`\`\`solidity
  ${v.location.codeSnippet}
  \`\`\``
    ).join('\n\n');

    const attackSteps = attackRecon.attacks.map((a: any) =>
      `- ${a.attackType}: ${a.steps.map((s: any) => `[${s.phase}] ${s.action}`).join('\n    ')}`
    ).join('\n');

    const userPrompt = `## Contract: ${evalCase.contractName}
## Blockchain: ${blockchain}
## Contract Address: ${evalCase.victimAddress}

## Fork Setup (use in setUp()):
${forkClause}

## Vulnerable Functions & Attack Details
${vulnDetails}

## Attack Reconstruction Steps
${attackSteps}

## Full Source Code
\`\`\`solidity
${fetchResult.sourceCode}
\`\`\`

Generate a Foundry test contract named "ExploitTest" that reproduces this attack.`;

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
