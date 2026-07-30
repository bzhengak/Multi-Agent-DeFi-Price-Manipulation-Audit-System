'use client';

import { Search, Database, Shield, AlertTriangle, BarChart3, Activity, FileText, Check } from 'lucide-react';

const STAGE_INDEX: Record<string, number> = {
  '': -1,
  protocol_detection: 0,
  context_building: 1,
  vulnerability_analysis: 2,
  attack_reconstruction: 3,
  cost_estimation: 4,
  confidence_calibration: 5,
  report_generation: 6,
  completed: 7,
};

const PIPELINE_STEPS = [
  { label: '识别', icon: Search },
  { label: '构建', icon: Database },
  { label: '分析', icon: Shield },
  { label: '重建', icon: AlertTriangle },
  { label: '成本', icon: BarChart3 },
  { label: '校准', icon: Activity },
  { label: '报告', icon: FileText },
];

interface AnalysisPipelineStepsProps {
  stage: string;
  progress: number;
}

export function AnalysisPipelineSteps({ stage, progress }: AnalysisPipelineStepsProps) {
  const currentStep = STAGE_INDEX[stage] ?? (
    progress > 90 ? 6
    : progress > 75 ? 5
    : progress > 70 ? 4
    : progress > 55 ? 3
    : progress > 20 ? 2
    : progress > 10 ? 1
    : 0
  );

  return (
    <div className="mb-8 bg-slate-900/50 border border-slate-700/50 rounded-2xl p-7">
      <div className="flex items-center justify-between">
        {PIPELINE_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-3 flex-1">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold transition-all duration-300 ${
              i < currentStep ? 'bg-emerald-500 text-white' :
              i === currentStep ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500 animate-pulse' :
              'bg-slate-800 text-slate-500 border border-slate-700'
            }`}>
              {i < currentStep ? <Check className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
            </div>
            <span className={`text-lg font-medium hidden sm:inline ${i <= currentStep ? 'text-emerald-400' : 'text-slate-500'}`}>
              {step.label}
            </span>
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 transition-colors duration-300 ${i < currentStep ? 'bg-emerald-500' : 'bg-slate-700'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
