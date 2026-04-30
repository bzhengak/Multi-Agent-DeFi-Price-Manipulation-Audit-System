import type { Vulnerability } from '../../vulnerability-agent';
import type { ProtocolClassification } from '../protocols/types';
import type { PriceManipulationAttack, ReconstructionResult } from '../reconstruction/types';

export interface CalibrationDimension {
  name: string;
  weight: number;
  score: number;
  reasoning: string;
}

export interface CalibratedVulnerability {
  vulnerability: Vulnerability;
  calibratedConfidence: number;
  dimensions: CalibrationDimension[];
  adjustmentFactor: number;
  iterationConsistency: number;
}

export interface CalibratedResult {
  vulnerabilities: CalibratedVulnerability[];
  attacks: Array<{
    attack: PriceManipulationAttack;
    calibratedConfidence: number;
  }>;
  overallConfidence: number;
  calibrationSummary: {
    high: number;
    medium: number;
    low: number;
  };
}

export class ConfidenceCalibrator {
  private readonly DIMENSION_WEIGHTS = {
    sourceCodeAvailability: 0.25,
    patternMatchScore: 0.25,
    historicalCaseSupport: 0.20,
    crossValidationConsistency: 0.15,
    economicFeasibility: 0.15,
  };

  calibrate(
    vulnerabilities: Vulnerability[],
    reconstruction: ReconstructionResult,
    classification: ProtocolClassification,
    iterationCount: number = 1,
    sourceAvailable: boolean = true,
  ): CalibratedResult {
    const adjustmentFactor = this.computeAdjustmentFactor(iterationCount);
    const calibratedVulns: CalibratedVulnerability[] = [];
    const calibratedAttacks: CalibratedResult['attacks'] = [];

    for (const vuln of vulnerabilities) {
      const dimensions = this.scoreDimensions(vuln, classification, sourceAvailable);
      const rawConfidence = dimensions.reduce((sum, d) => sum + d.weight * d.score, 0);
      const calibratedConfidence = Math.min(rawConfidence * adjustmentFactor, 1.0);

      calibratedVulns.push({
        vulnerability: vuln,
        calibratedConfidence: Math.round(calibratedConfidence * 100) / 100,
        dimensions,
        adjustmentFactor,
        iterationConsistency: this.iterationConsistencyScore(iterationCount),
      });
    }

    for (const attack of reconstruction.attacks) {
      const matchingVuln = vulnerabilities.find((v) => v.patternId === attack.attackType);
      const baseConfidence = matchingVuln
        ? calibratedVulns.find((cv) => cv.vulnerability === matchingVuln)?.calibratedConfidence ?? 0.5
        : 0.3;

      const feasibilityBoost = attack.feasibility.overallFeasibility === 'high' ? 0.1
        : attack.feasibility.overallFeasibility === 'medium' ? 0 : -0.1;

      calibratedAttacks.push({
        attack,
        calibratedConfidence: Math.min(Math.round((baseConfidence + feasibilityBoost) * 100) / 100, 1.0),
      });
    }

    const overallConfidence = calibratedVulns.length > 0
      ? Math.round((calibratedVulns.reduce((s, cv) => s + cv.calibratedConfidence, 0) / calibratedVulns.length) * 100) / 100
      : 0;

    const high = calibratedVulns.filter((cv) => cv.calibratedConfidence >= 0.8).length;
    const medium = calibratedVulns.filter((cv) => cv.calibratedConfidence >= 0.5 && cv.calibratedConfidence < 0.8).length;
    const low = calibratedVulns.filter((cv) => cv.calibratedConfidence < 0.5).length;

    return {
      vulnerabilities: calibratedVulns,
      attacks: calibratedAttacks,
      overallConfidence,
      calibrationSummary: { high, medium, low },
    };
  }

  private scoreDimensions(
    vuln: Vulnerability,
    classification: ProtocolClassification,
    sourceAvailable: boolean,
  ): CalibrationDimension[] {
    const isPriorityVuln = classification.priorityVulnerabilities.includes(vuln.patternId);

    const sourceScore = sourceAvailable ? 0.9 : 0.3;

    const patternScore = isPriorityVuln ? 0.85 : 0.5;
    const indicatorCount = vuln.attackVector?.length ?? 0;
    const adjustedPatternScore = indicatorCount > 100 ? Math.min(patternScore + 0.1, 1.0) : patternScore;

    const caseScore = vuln.matchedCases && vuln.matchedCases.length > 0 ? 0.7 + Math.min(vuln.matchedCases.length * 0.1, 0.3) : 0.3;

    const crossScore = vuln.location && vuln.location.lineStart > 0 ? 0.8 : 0.4;

    const severityMap: Record<string, number> = { Critical: 0.9, High: 0.7, Medium: 0.5, Low: 0.3, Informational: 0.2 };
    const economicScore = severityMap[vuln.severity] ?? 0.5;

    return [
      { name: 'sourceCodeAvailability', weight: this.DIMENSION_WEIGHTS.sourceCodeAvailability, score: sourceScore, reasoning: sourceAvailable ? 'Full source code available for analysis' : 'Source code unavailable, relying on context inference' },
      { name: 'patternMatchScore', weight: this.DIMENSION_WEIGHTS.patternMatchScore, score: adjustedPatternScore, reasoning: isPriorityVuln ? `${vuln.patternId} is a priority pattern for ${classification.type} protocols` : `${vuln.patternId} is not a priority pattern for ${classification.type}` },
      { name: 'historicalCaseSupport', weight: this.DIMENSION_WEIGHTS.historicalCaseSupport, score: caseScore, reasoning: `${vuln.matchedCases?.length ?? 0} historical cases matched` },
      { name: 'crossValidationConsistency', weight: this.DIMENSION_WEIGHTS.crossValidationConsistency, score: crossScore, reasoning: vuln.location?.lineStart ? `Specific code location identified (L${vuln.location.lineStart})` : 'No specific code location' },
      { name: 'economicFeasibility', weight: this.DIMENSION_WEIGHTS.economicFeasibility, score: economicScore, reasoning: `Severity ${vuln.severity} indicates ${vuln.severity === 'Critical' || vuln.severity === 'High' ? 'high' : 'moderate'} economic impact` },
    ];
  }

  private computeAdjustmentFactor(iterationCount: number): number {
    if (iterationCount >= 4) return 0.95;
    if (iterationCount >= 2) return 0.85;
    return 0.7;
  }

  private iterationConsistencyScore(iterationCount: number): number {
    if (iterationCount >= 4) return 0.95;
    if (iterationCount >= 2) return 0.85;
    return 0.7;
  }
}
