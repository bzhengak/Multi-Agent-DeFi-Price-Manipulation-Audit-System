'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type TaskStatus = 'idle' | 'pending' | 'analyzing' | 'completed' | 'failed' | 'partial';

export interface ExternalDependency {
  address: string;
  contractName: string;
  protocolRole?: string;
  callType: string;
  sourceLine: number;
}

export interface AnalysisState {
  taskId: string | null;
  status: TaskStatus;
  progress: number;
  stage: string;
  stageLabel: string;
  details: string;
  elapsedMs?: number;
  iteration?: number;
  maxIterations?: number;
  findingsCount?: number;
  foundPatterns?: string[];
  severityCounts?: { critical: number; high: number; medium: number; low: number };
  convergenceDelta?: number;
  classification?: {
    type: string;
    confidence: number;
    priorityVulnerabilities: string[];
  };
  contextBuildings?: {
    relatedPatternCount: number;
    relatedCaseCount: number;
    focusAreas: string[];
    crossContractNodeCount: number;
    crossContractEdgeCount: number;
    externalDependencies: ExternalDependency[];
  };
  reconstructionStats?: { totalAttacks: number; highFeasibility: number; combinedChainCount: number };
  costStats?: { estimatedCount: number; totalCount: number; sampleCosts: Array<{ patternId: string; rangeLow: number; rangeHigh: number }> };
  calibrationStats?: { overallConfidence: number; high: number; medium: number; low: number };
  reportId: string | null;
  error: string | null;
  completedStages?: string[];
  failedStage?: string;
  summary?: {
    overallRisk: string;
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    overallConfidence: number;
    highFeasibilityAttacks: number;
    combinedAttackChains: number;
  };
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
}

const INITIAL_STATE: AnalysisState = {
  taskId: null,
  status: 'idle',
  progress: 0,
  stage: '',
  stageLabel: '',
  details: '',
  reportId: null,
  error: null,
  connectionStatus: 'disconnected',
};

export interface AnalysisSource {
  inputType: 'address' | 'file';
  address?: string;
  chain?: string;
  file?: File;
}

async function apiCall(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function useAnalysisSSE() {
  const [state, setState] = useState<AnalysisState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const updateFromTaskData = useCallback((taskData: Record<string, any>) => {
    const status: TaskStatus = taskData.status === 'partial' ? 'partial' : (taskData.status || 'analyzing');
    setState(prev => ({
      ...prev,
      status,
      progress: taskData.progress ?? prev.progress,
      stage: taskData.stage ?? prev.stage,
      stageLabel: taskData.stageLabel ?? prev.stageLabel,
      details: taskData.details ?? prev.details,
      elapsedMs: taskData.elapsedMs ?? prev.elapsedMs,
      iteration: taskData.iteration ?? prev.iteration,
      maxIterations: taskData.maxIterations ?? prev.maxIterations,
      findingsCount: taskData.findingsCount ?? prev.findingsCount,
      foundPatterns: taskData.foundPatterns ?? prev.foundPatterns,
      severityCounts: taskData.severityCounts ?? prev.severityCounts,
      convergenceDelta: taskData.convergenceDelta ?? prev.convergenceDelta,
      classification: taskData.classification ? {
        type: taskData.classification.type || taskData.classification,
        confidence: taskData.classification.confidence ?? 0,
        priorityVulnerabilities: taskData.classification.priorityVulnerabilities ?? [],
      } : prev.classification,
      contextBuildings: taskData.contextBuildings ?? prev.contextBuildings,
      reconstructionStats: taskData.reconstructionStats ?? prev.reconstructionStats,
      costStats: taskData.costStats ?? prev.costStats,
      calibrationStats: taskData.calibrationStats ?? prev.calibrationStats,
      reportId: taskData.reportId ?? prev.reportId,
      error: taskData.error ?? prev.error,
      completedStages: taskData.completedStages ?? prev.completedStages,
      failedStage: taskData.failedStage ?? prev.failedStage,
      summary: taskData.summary ?? prev.summary,
    }));
  }, []);

  const start = useCallback(async (source: AnalysisSource) => {
    cleanup();
    setState({ ...INITIAL_STATE, connectionStatus: 'connecting' });

    try {
      const formData = new FormData();
      formData.append('type', source.inputType);
      if (source.inputType === 'address') {
        formData.append('address', source.address || '');
        formData.append('chain', source.chain || 'ethereum');
      } else if (source.file) {
        formData.append('file', source.file);
        formData.append('chain', source.chain || 'ethereum');
      }

      const data = await apiCall('/api/analyze', { method: 'POST', body: formData });
      const taskId = data.taskId;

      setState(prev => ({ ...prev, taskId, status: 'pending', connectionStatus: 'connecting' }));

      const sseUrl = `/api/analyze/${taskId}/stream`;
      const es = new EventSource(sseUrl);
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const taskData = JSON.parse(event.data);
          updateFromTaskData(taskData);

          if (taskData.status === 'completed' || taskData.status === 'failed' || taskData.status === 'partial') {
            cleanup();
          }
        } catch {
          cleanup();
          setState(prev => ({ ...prev, status: 'failed', error: '分析进度解析失败', connectionStatus: 'disconnected' }));
        }
      };

      es.onopen = () => {
        setState(prev => ({ ...prev, connectionStatus: 'connected' }));
      };

      es.onerror = () => {
        cleanup();
        setState(prev => ({ ...prev, connectionStatus: 'disconnected' }));
        // Fallback to polling
        const pi = setInterval(async () => {
          try {
            const taskData = await apiCall(`/api/analyze?taskId=${taskId}`);
            updateFromTaskData(taskData);
            if (taskData.status === 'completed' || taskData.status === 'failed' || taskData.status === 'partial') {
              clearInterval(pi);
            }
          } catch {
            clearInterval(pi);
            setState(prev => ({ ...prev, status: 'failed', error: '获取分析进度失败', connectionStatus: 'disconnected' }));
          }
        }, 3000);
        pollRef.current = pi;
      };
    } catch (err: any) {
      setState(prev => ({ ...prev, status: 'failed', error: err.message || '分析请求失败', connectionStatus: 'disconnected' }));
    }
  }, [cleanup, updateFromTaskData]);

  const reset = useCallback(() => {
    cleanup();
    setState(INITIAL_STATE);
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return { state, start, reset };
}
