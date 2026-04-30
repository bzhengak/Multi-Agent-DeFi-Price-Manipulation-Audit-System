import type { ProtocolClassification } from '../protocols/types';
import { loadHistoryCases, loadVulnerabilityPatterns } from '@/lib/storage/data';

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
}

export interface RelevantPattern {
  id: string;
  name: string;
  description: string;
  indicators: string[];
  severity: string;
  priority: number;
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

    return {
      contractCode,
      contractName,
      blockchain,
      address,
      classification,
      relevantPatterns,
      relevantCases,
      focusAreas,
      analysisDepth: depth,
    };
  }

  private filterRelevantPatterns(
    patterns: Array<{
      id: string;
      name: string;
      description: string;
      indicators: string[];
      severity: string;
    }>,
    classification: ProtocolClassification,
  ): RelevantPattern[] {
    const prioritySet = new Set(classification.priorityVulnerabilities);

    return patterns
      .filter((p) => prioritySet.has(p.id))
      .map((p, idx) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        indicators: p.indicators,
        severity: p.severity,
        priority: idx,
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
    const vulnNames = new Map<string, string>([
      ['VP001', 'Oracle Manipulation'],
      ['VP002', 'Flash Loan Attack'],
      ['VP003', 'Reserve Manipulation'],
      ['VP004', 'Price Calculation Flaw'],
      ['VP005', 'Liquidity Pool Manipulation'],
      ['VP006', 'Slippage Control Bypass'],
      ['VP007', 'TWAP Manipulation'],
      ['VP008', 'AMM Exploitation'],
    ]);

    return cases
      .map((c) => {
        let relevance = 0;
        if (c.blockchain_platform.toLowerCase() === classification.type) relevance += 0.3;
        if (c.vulnerability_pattern) {
          const patternName = c.vulnerability_pattern.toLowerCase();
          for (const vpId of classification.priorityVulnerabilities) {
            const name = vulnNames.get(vpId)?.toLowerCase() ?? '';
            if (patternName.includes(name) || name.includes(patternName)) {
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
      areas.push('Oracle price source validation and manipulation resistance');
    }
    if (classification.riskProfile.flashloanExposure) {
      areas.push('Flash loan protection and cross-block validation');
    }
    if (classification.riskProfile.liquiditySensitivity !== 'low') {
      areas.push('Liquidity pool state manipulation and reserve integrity');
    }
    if (classification.type === 'amm' || classification.type === 'dex') {
      areas.push('AMM invariant preservation and slippage protection');
    }
    if (classification.type === 'lending' || classification.type === 'perp') {
      areas.push('Collateral valuation and liquidation safety');
    }

    for (const fn of classification.criticalFunctions.slice(0, 5)) {
      areas.push(`Function ${fn}() input validation and state consistency`);
    }

    return areas;
  }
}
