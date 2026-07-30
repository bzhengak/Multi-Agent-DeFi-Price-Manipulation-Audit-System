'use client';

import { XCircle, RefreshCw } from 'lucide-react';
import type { AnalysisState } from '@/hooks/use-analysis-sse';

interface AnalysisFailedProps {
  state: AnalysisState;
  onReset: () => void;
}

export function AnalysisFailed({ state, onReset }: AnalysisFailedProps) {
  return (
    <div className="py-10 text-center">
      <div className="max-w-lg mx-auto">
        <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">分析失败</h3>
        <p className="text-slate-400 text-lg mb-3">{state.stageLabel || '分析出错'}</p>
        {state.error && (
          <p className="text-lg text-red-400/80 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-8 inline-block">
            {state.error}
          </p>
        )}
        <div className="mt-6">
          <button onClick={onReset} className="px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-all flex items-center gap-2 mx-auto">
            <RefreshCw className="w-5 h-5" /> 重新分析
          </button>
        </div>
      </div>
    </div>
  );
}
