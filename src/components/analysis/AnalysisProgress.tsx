'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { AnalysisState } from '@/hooks/use-analysis-sse';
import { useElapsedTimer } from '@/hooks/use-elapsed-timer';

interface AnalysisProgressProps {
  state: AnalysisState;
}

function SeverityBar({ severityCounts, findingsCount }: { severityCounts?: { critical: number; high: number; medium: number; low: number }; findingsCount?: number }) {
  if (!severityCounts || !findingsCount || findingsCount === 0) return null;
  const total = findingsCount || 1;
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-lg text-slate-500">
        <span className="text-red-400">Critical {severityCounts.critical}</span>
        <span className="text-amber-400">High {severityCounts.high}</span>
        <span className="text-yellow-400">Medium {severityCounts.medium}</span>
        <span className="text-blue-400">Low {severityCounts.low}</span>
      </div>
      <div className="flex gap-1 h-3 rounded-full overflow-hidden">
        <div className="bg-red-500 transition-all duration-500" style={{ width: `${(severityCounts.critical / total) * 100}%` }} />
        <div className="bg-amber-500 transition-all duration-500" style={{ width: `${(severityCounts.high / total) * 100}%` }} />
        <div className="bg-yellow-500 transition-all duration-500" style={{ width: `${(severityCounts.medium / total) * 100}%` }} />
        <div className="bg-blue-500 transition-all duration-500" style={{ width: `${(severityCounts.low / total) * 100}%` }} />
      </div>
    </div>
  );
}

function ExternalDependenciesCard({ deps }: { deps: NonNullable<AnalysisState['contextBuildings']> }) {
  if (!deps.externalDependencies?.length) return null;
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6 space-y-3">
      <div className="flex items-center gap-3 text-lg font-medium text-slate-400">
        <span className="w-2 h-2 rounded-full bg-cyan-400" />
        外部合约依赖
        <span className="text-slate-600">({deps.crossContractNodeCount} 合约, {deps.crossContractEdgeCount} 调用关系)</span>
      </div>
      <div className="space-y-1.5">
        {deps.externalDependencies.slice(0, 6).map((dep, i) => (
          <div key={i} className="flex items-center gap-3 text-lg text-slate-500 font-mono">
            <span className="text-slate-600">{dep.address.slice(0, 6)}...{dep.address.slice(-4)}</span>
            <span className="text-slate-700">→</span>
            <span className="text-slate-400">{dep.contractName}</span>
            {dep.protocolRole && <span className="text-lg text-cyan-500/60 bg-cyan-500/10 px-1.5 rounded">{dep.protocolRole}</span>}
            <span className="text-slate-700 text-lg ml-auto">{dep.callType}</span>
          </div>
        ))}
        {deps.externalDependencies.length > 6 && (
          <p className="text-lg text-slate-600">+{deps.externalDependencies.length - 6} 个依赖</p>
        )}
      </div>
    </div>
  );
}

function IterationCard({ state }: { state: AnalysisState }) {
  if (!state.iteration) return null;
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-lg font-medium text-slate-400">迭代分析进度</span>
        <span className="text-lg text-slate-500">
          收敛度: {state.convergenceDelta !== undefined ? state.convergenceDelta.toFixed(4) : '--'}
        </span>
      </div>
      <div className="flex items-center gap-4 mb-4">
        <div className="text-4xl font-bold text-emerald-400 tabular-nums">{state.iteration}<span className="text-2xl text-slate-500">/{state.maxIterations}</span></div>
        <div className="flex-1 h-3 bg-slate-700/50 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
            animate={{ width: `${((state.iteration || 1) / (state.maxIterations || 1)) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
      <SeverityBar severityCounts={state.severityCounts} findingsCount={state.findingsCount} />
      {state.foundPatterns && state.foundPatterns.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {[...new Set(state.foundPatterns)].map(p => (
            <span key={p} className="px-2 py-1 text-lg bg-slate-700/40 border border-slate-600/40 rounded text-slate-400 font-mono">{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function CostCard({ costStats }: { costStats: NonNullable<AnalysisState['costStats']> }) {
  if (!costStats.sampleCosts?.length) return null;
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
      <span className="text-lg font-medium text-slate-400">攻击成本估算 ({costStats.estimatedCount}/{costStats.totalCount})</span>
      <div className="mt-3 space-y-2">
        {costStats.sampleCosts.map((c, i) => (
          <div key={i} className="flex justify-between text-lg">
            <span className="text-slate-500 font-mono">{c.patternId}</span>
            <span className="text-slate-300 font-mono">${c.rangeLow}–${c.rangeHigh} USD</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalibrationCard({ cal }: { cal: NonNullable<AnalysisState['calibrationStats']> }) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
      <span className="text-lg font-medium text-slate-400">置信度校准</span>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1e293b" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#34d399" strokeWidth="3"
              strokeDasharray={`${cal.overallConfidence * 100} ${100 - cal.overallConfidence * 100}`}
              strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-emerald-400">
            {Math.round(cal.overallConfidence * 100)}%
          </span>
        </div>
        <div className="space-y-1.5 text-lg">
          <div className="flex gap-4">
            <span className="text-green-400">高 {cal.high}</span>
            <span className="text-yellow-400">中 {cal.medium}</span>
            <span className="text-slate-400">低 {cal.low}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReconstructionCard({ stats }: { stats: NonNullable<AnalysisState['reconstructionStats']> }) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
      <span className="text-lg font-medium text-slate-400">攻击重建</span>
      <div className="mt-3 flex gap-5 text-lg">
        <span className="text-slate-300">{stats.totalAttacks} 个攻击场景</span>
        <span className="text-slate-500">·</span>
        <span className="text-amber-400">{stats.highFeasibility} 个高可行性</span>
        <span className="text-slate-500">·</span>
        <span className="text-cyan-400">{stats.combinedChainCount} 条组合链</span>
      </div>
    </div>
  );
}

export function AnalysisProgress({ state }: AnalysisProgressProps) {
  const elapsedDisplay = useElapsedTimer(state.status === 'analyzing');

  return (
    <div className="py-8 text-center">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
          <div className="text-left">
            <h3 className="text-2xl font-bold text-white">{state.stageLabel || '分析进行中'}</h3>
            <p className="text-lg text-slate-500">{state.details}</p>
          </div>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-3 mb-2 overflow-hidden">
          <motion.div
            className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-3 rounded-full"
            animate={{ width: `${state.progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <p className="text-lg text-slate-500 mb-5">{state.progress}% 完成</p>

        <div className="space-y-4 text-left">
          {state.stage === 'vulnerability_analysis' || (state.findingsCount ?? 0) > 0 ? (
            <IterationCard state={state} />
          ) : null}

          {state.contextBuildings && state.contextBuildings.externalDependencies?.length > 0 && (
            <ExternalDependenciesCard deps={state.contextBuildings} />
          )}

          {state.stage === 'attack_reconstruction' && state.reconstructionStats && (
            <ReconstructionCard stats={state.reconstructionStats} />
          )}

          {state.stage === 'cost_estimation' && state.costStats && (
            <CostCard costStats={state.costStats} />
          )}

          {state.stage === 'confidence_calibration' && state.calibrationStats && (
            <CalibrationCard cal={state.calibrationStats} />
          )}

          {state.stage === 'report_generation' && (
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6 text-center">
              <p className="text-lg text-slate-400">正在生成审计报告...</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 text-lg text-slate-600 pt-3">
          <span className="text-slate-500">已用时: {elapsedDisplay}</span>
          <span>·</span>
          <span>Agent v2.0</span>
          <span>·</span>
          <span>7 阶段流水线</span>
        </div>
      </div>
    </div>
  );
}
