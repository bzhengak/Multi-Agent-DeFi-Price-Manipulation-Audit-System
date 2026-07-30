'use client';

import { motion } from 'framer-motion';
import { CheckCircle, Eye, RefreshCw } from 'lucide-react';
import type { AnalysisState } from '@/hooks/use-analysis-sse';

interface AnalysisCompleteProps {
  state: AnalysisState;
  onViewReport: (id: string) => void;
  onReset: () => void;
}

export function AnalysisComplete({ state, onViewReport, onReset }: AnalysisCompleteProps) {
  return (
    <div className="py-10 text-center">
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-emerald-400" />
        </motion.div>
        <h3 className="text-2xl font-bold text-white mb-3">分析完成</h3>
        <p className="text-slate-400 text-lg mb-5">审计报告已生成</p>

        {state.summary && (
          <div className="flex justify-center gap-5 mb-8 text-lg">
            <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3">
              <p className="text-slate-500">风险等级</p>
              <p className={`font-bold ${
                state.summary.overallRisk === 'Critical' ? 'text-red-400'
                : state.summary.overallRisk === 'High' ? 'text-amber-400'
                : state.summary.overallRisk === 'Medium' ? 'text-yellow-400'
                : 'text-emerald-400'
              }`}>{state.summary.overallRisk}</p>
            </div>
            <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3">
              <p className="text-slate-500">漏洞总数</p>
              <p className="font-bold text-white">{state.summary.totalIssues}</p>
            </div>
            <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3">
              <p className="text-slate-500">置信度</p>
              <p className="font-bold text-emerald-400">{Math.round(state.summary.overallConfidence * 100)}%</p>
            </div>
          </div>
        )}

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => { if (state.reportId) onViewReport(state.reportId); }}
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all flex items-center gap-2"
          >
            <Eye className="w-5 h-5" /> 查看报告
          </button>
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
