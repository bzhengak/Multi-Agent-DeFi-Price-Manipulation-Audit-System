'use client';

import { AlertTriangle, Eye, RefreshCw, ListChecks } from 'lucide-react';
import type { AnalysisState } from '@/hooks/use-analysis-sse';

interface AnalysisPartialProps {
  state: AnalysisState;
  onViewReport: (id: string) => void;
  onReset: () => void;
}

const STAGE_LABEL_MAP: Record<string, string> = {
  protocol_detection: '协议识别',
  context_building: '上下文构建',
  vulnerability_analysis: '漏洞分析',
  attack_reconstruction: '攻击重建',
  cost_estimation: '成本估算',
  confidence_calibration: '置信度校准',
  report_generation: '报告生成',
};

export function AnalysisPartial({ state, onViewReport, onReset }: AnalysisPartialProps) {
  const completed = state.completedStages ?? [];
  const failedAt = state.failedStage || 'unknown';

  return (
    <div className="py-10 text-center">
      <div className="max-w-lg mx-auto">
        <div className="w-20 h-20 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">分析部分完成</h3>
        <p className="text-slate-400 text-lg mb-5">LLM 配额耗尽，分析已中断</p>

        <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6 mb-5 text-left">
          <div className="flex items-center gap-3 text-lg font-medium text-slate-400 mb-4">
            <ListChecks className="w-4 h-4" />
            已完成阶段 ({completed.length})
          </div>
          <div className="flex flex-wrap gap-2.5">
            {completed.map(s => (
              <span key={s} className="px-3 py-1.5 text-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">
                {STAGE_LABEL_MAP[s] || s}
              </span>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-700/30">
            <span className="text-lg text-slate-500">中断于 </span>
            <span className="text-lg text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
              {STAGE_LABEL_MAP[failedAt] || failedAt}
            </span>
          </div>
        </div>

        {state.error && (
          <p className="text-lg text-slate-500 mb-8">{state.error}</p>
        )}

        <div className="flex gap-4 justify-center">
          {state.reportId && (
            <button
              onClick={() => onViewReport(state.reportId!)}
              className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-xl transition-all flex items-center gap-2"
            >
              <Eye className="w-5 h-5" /> 查看部分报告
            </button>
          )}
          <button
            onClick={onReset}
            className="px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" /> 重新分析
          </button>
        </div>
      </div>
    </div>
  );
}
