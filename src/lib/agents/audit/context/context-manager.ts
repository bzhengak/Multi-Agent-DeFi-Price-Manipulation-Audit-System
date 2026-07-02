import type { ProtocolClassification } from '../protocols/types';
import { loadHistoryCases, loadVulnerabilityPatterns } from '@/lib/storage/data';
import { CrossContractTracer } from '../cross-contract/cross-contract-tracer';
import type { CrossContractSummary } from '../cross-contract/types';
import type { BlockchainId } from '@/lib/blockchain/config';
import type { MemoryRecord } from '../../core/memory/storage-adapter';

export interface AnalysisContext {
  contractCode: string;
  contractName: string;
  blockchain: string;
  address?: string;
  classification: ProtocolClassification;
  relevantPatterns: RelevantPattern[];
  relevantCases: RelevantCase[];
  focusAreas: string[];
  analysisDepth: 'standard' | 'deep';
  crossContractGraph?: CrossContractSummary;
}

export interface RelevantPattern {
  id: string;
  category: string;
  name: string;
  code_features: string[];
  related_attacks: string[];
  severity: string;
  priority: number;
  references?: { swc: string; owasp: string };
}

export interface RelevantCase {
  id: string;
  time: string;
  platform: string;
  vulnerabilityPattern: string;
  description: string;
  relevance: number;
}

export class ContextManager {
  private crossContractTracer = new CrossContractTracer();

  async build(
    contractCode: string,
    contractName: string,
    blockchain: string,
    classification: ProtocolClassification,
    address?: string,
    depth: 'standard' | 'deep' = 'standard',
  ): Promise<AnalysisContext> {
    const [allPatterns, allCases] = await Promise.all([
      loadVulnerabilityPatterns(),
      loadHistoryCases(),
    ]);

    const relevantPatterns = this.filterRelevantPatterns(allPatterns.patterns, classification);
    const relevantCases = this.filterRelevantCases(allCases.cases, classification, depth);
    const focusAreas = this.buildFocusAreas(classification);

    // Learning evolution: RAG semantic retrieval
    let semanticMemories: MemoryRecord[] = [];
    try {
      const { MemorySystem } = await import('../../core/memory/memory');
      const memory = new MemorySystem();
      await memory.init();
      const query = `${classification.type} ${classification.priorityVulnerabilities.join(' ')} ${contractName}`;
      semanticMemories = await memory.searchSemantic(query, 3);
      await memory.close();
    } catch {
      // semantic search failure is non-fatal
    }

    const semanticCases: RelevantCase[] = semanticMemories.map(m => ({
      id: m.id,
      time: new Date(m.timestamp).toISOString(),
      platform: (m.metadata as Record<string, unknown>)?.blockchain as string || 'unknown',
      vulnerabilityPattern: ((m.metadata as Record<string, unknown>)?.patterns as string[])?.join(', ') || '',
      description: m.content.substring(0, 200),
      relevance: m.importance,
    }));

    const mergedCases = [...relevantCases, ...semanticCases];

    let crossContractGraph: CrossContractSummary | undefined;
    if (depth === 'deep' && address) {
      try {
        crossContractGraph = await this.crossContractTracer.trace(
          contractCode,
          contractName,
          blockchain as BlockchainId,
          address,
        );
      } catch {
        // cross-contract tracing failure does not block the main pipeline
      }
    }

    return {
      contractCode,
      contractName,
      blockchain,
      address,
      classification,
      relevantPatterns,
      relevantCases: mergedCases,
      focusAreas,
      analysisDepth: depth,
      crossContractGraph,
    };
  }

  private filterRelevantPatterns(
    patterns: Array<{
      id: string;
      category: string;
      name: string;
      code_features: string[];
      related_attacks: string[];
      severity: string;
      references?: { swc: string; owasp: string };
    }>,
    classification: ProtocolClassification,
  ): RelevantPattern[] {
    const prioritySet = new Set(classification.priorityVulnerabilities);

    return patterns
      .filter((p) => prioritySet.has(p.id))
      .map((p, idx) => ({
        id: p.id,
        category: p.category,
        name: p.name,
        code_features: p.code_features,
        related_attacks: p.related_attacks,
        severity: p.severity,
        priority: idx,
        references: p.references,
      }));
  }

  private filterRelevantCases(
    cases: Array<{
      id: string;
      time: string;
      blockchain_platform: string;
      vulnerability_pattern?: string;
      note: string;
    }>,
    classification: ProtocolClassification,
    depth: 'standard' | 'deep',
  ): RelevantCase[] {
    const maxCases = depth === 'deep' ? 20 : 10;

    const categoryKeywords: Record<string, string> = {
      'OD': 'oracle',
      'LR': 'liquidity reserve',
      'TO': 'transaction order timing deadline slippage',
      'AC': 'access control privilege admin owner mint burn',
      'CL': 'calculation precision decimal rounding math flaw',
      'CR': 'composability external protocol bridge cross dependency',
    };

    return cases
      .map((c) => {
        let relevance = 0;
        if (c.blockchain_platform.toLowerCase() === classification.type) relevance += 0.3;
        if (c.vulnerability_pattern) {
          const patternLower = c.vulnerability_pattern.toLowerCase();
          for (const vpId of classification.priorityVulnerabilities) {
            const prefix = vpId.substring(0, 2);
            const keywords = categoryKeywords[prefix] ?? '';
            if (keywords.split(/\s+/).some((kw) => patternLower.includes(kw))) {
              relevance += 0.7;
              break;
            }
          }
        }
        return {
          id: c.id,
          time: c.time,
          platform: c.blockchain_platform,
          vulnerabilityPattern: c.vulnerability_pattern ?? '',
          description: c.note?.substring(0, 200),
          relevance,
        };
      })
      .filter((c) => c.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxCases);
  }

  private buildFocusAreas(classification: ProtocolClassification): string[] {
    const areas: string[] = [];

    if (classification.riskProfile.oracleDependency) {
      areas.push('Oracle price source validation and manipulation resistance (OD-01, OD-02, OD-03, OD-04)');
    }
    if (classification.riskProfile.flashloanExposure) {
      areas.push('Flash loan protection and cross-block validation (LR-01, LR-02, CR-01)');
    }
    if (classification.riskProfile.liquiditySensitivity !== 'low') {
      areas.push('Liquidity pool state manipulation and reserve integrity (LR-01, LR-03)');
    }
    if (classification.type === 'dex_amm') {
      areas.push('AMM/DEX invariant preservation and slippage protection (CL-03, TO-01, TO-02)');
      areas.push('Reentrancy guards on price-sensitive external calls (TO-03)');
    }
    if (classification.type === 'lending' || classification.type === 'perp') {
      areas.push('Collateral/margin valuation and liquidation safety (LR-02, OD-01, OD-03)');
    }

    for (const fn of classification.criticalFunctions.slice(0, 5)) {
      areas.push(`Function ${fn}() input validation and state consistency`);
    }

    areas.push('Access control on admin functions (AC-01, AC-02, AC-03)');
    areas.push('Calculation precision and decimal normalization (CL-01, CL-02)');
    areas.push('Cross-protocol composability dependencies (CR-01, CR-02, CR-03)');

    return areas;
  }
}
