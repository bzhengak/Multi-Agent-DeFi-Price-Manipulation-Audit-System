'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Search, Database, FileText,
  Upload, LogOut, ArrowLeft, Check, ChevronDown, X, Copy, Download,
  AlertTriangle, Info, CheckCircle, XCircle, Clock, Activity,
  Wrench, Eye, Trash2, RefreshCw, Keyboard, Menu, Bell,
  ChevronRight, ExternalLink, Grid3X3, List,
  BarChart3, PieChart as PieChartIcon, Radar as RadarIcon,
  ShieldAlert, ShieldCheck, ShieldX, Globe, Code2, Play, Loader2,
  Share2, EyeOff, Bug,
  ArrowRight, Unlock,
  LayoutDashboard, Settings as SettingsCog, Key, Save, CheckCheck, Globe2
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar as RechartsRadar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// --- Types ---
type Page = 'dashboard' | 'cases' | 'patterns' | 'analyze' | 'history' | 'report' | 'settings';

interface CaseItem {
  id: string;
  time: string;
  data_resource: string;
  blockchain_platform: string;
  attack_transaction: string;
  attack_contract_address: string;
  victim_contract_address: string;
  note: string;
  vulnerability_pattern?: string;
}

interface AnalysisRecord {
  id: string;
  contractName: string;
  blockchain: string;
  address?: string;
  analysisTime: string;
  riskLevel: string;
  vulnerabilityCount: number;
  reportUrl: string;
  sourceOrigin?: 'etherscan' | 'sourcify' | 'heimdall' | 'file' | 'demo' | 'unavailable' | 'context';
  sourceType?: 'verified' | 'decompiled' | 'unavailable' | 'context';
  caseId?: string;
}

interface ReportData {
  id: string;
  createdAt: string;
  contractInfo: { address: string; chain: string; name: string; sourceOrigin?: string; sourceType?: string };
  analysisResult: {
    summary: { contractName: string; totalVulnerabilities: number; riskLevel: string; analysisTime: string };
    vulnerabilities: Array<{
      id: string; patternId: string; patternName: string; severity: string;
      title: string; description: string;
      location: { fileName: string; lineStart: number; lineEnd: number; functionName: string; codeSnippet: string };
      attackVector: string; impact: string;
      matchedCases: Array<{ caseId: string; caseName: string; similarity: number; matchReason: string }>;
      recommendation: string;
    }>;
    codeQuality: { overallScore: string; issues: string[] };
    recommendations: string[];
  };
  reportMarkdown: string;
  summary: { overallRisk: string; totalIssues: number; critical: number; high: number; medium: number; low: number };
}

interface VulnerabilityPattern {
  id: string;
  category: string;
  name: string;
  code_features: string[];
  related_attacks: string[];
  severity: 'Critical' | 'High' | 'Medium';
  references?: { swc: string; owasp: string };
}

// --- API Helpers ---
async function apiCall(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Animated Counter Hook ---
function useAnimatedCounter(target: number, duration: number = 1200) {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    if (target === 0) return;
    const start = performance.now();
    let raf: number;
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return target === 0 ? 0 : count;
}

// --- Severity Config ---
const severityConfig: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode; color: string }> = {
  Critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', icon: <ShieldAlert className="w-4 h-4" />, color: '#ef4444' },
  High: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', icon: <ShieldX className="w-4 h-4" />, color: '#f97316' },
  Medium: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: <AlertTriangle className="w-4 h-4" />, color: '#eab308' },
  Low: { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30', icon: <Info className="w-4 h-4" />, color: '#38bdf8' },
  Informational: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30', icon: <Info className="w-4 h-4" />, color: '#94a3b8' },
};

// --- Chain Config ---
const chainConfig: Record<string, { bg: string; text: string; border: string; color: string }> = {
  Ethereum: { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30', color: '#38bdf8' },
  BSC: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30', color: '#eab308' },
  Arbitrum: { bg: 'bg-sky-600/15', text: 'text-sky-300', border: 'border-sky-600/30', color: '#7dd3fc' },
  Base: { bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30', color: '#60a5fa' },
  opBNB: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', color: '#f59e0b' },
  Sei: { bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/30', color: '#14b8a6' },
  Hyperliquid: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', color: '#a855f7' },
};

// --- Vulnerability Pattern Severity Mapping ---
const patternSeverityMap: Record<string, string> = {
  'Flash Loan Attack': 'Critical',
  'Oracle Manipulation': 'Critical',
  'Price Oracle Manipulation': 'Critical',
  'Sandwich Attack': 'High',
  'Liquidity Manipulation': 'High',
  'Wash Trading': 'High',
  'AMM Manipulation': 'High',
  'TWAP Manipulation': 'High',
  'Reserve Manipulation': 'High',
  'Governance Attack': 'Medium',
  'Reentrancy': 'High',
};

function getPatternSeverity(pattern?: string): string {
  if (!pattern) return 'Medium';
  for (const [key, val] of Object.entries(patternSeverityMap)) {
    if (pattern.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'High';
}

// --- Shared Components ---
function SeverityBadge({ severity }: { severity: string }) {
  const config = severityConfig[severity] || severityConfig.Informational;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
      {config.icon}
      {severity}
    </span>
  );
}

function ChainBadge({ chain }: { chain: string }) {
  const config = chainConfig[chain] || { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      {chain}
    </span>
  );
}

function SourceTypeBadge({ origin, type }: { origin?: string; type?: string }) {
  if (!origin || origin === 'file') return null;
  const config: Record<string, { bg: string; text: string; border: string; label: string }> = {
    etherscan: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: '✓ Etherscan 验证' },
    sourcify: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30', label: '✓ Sourcify 验证' },
    heimdall: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', label: '⚠ 反编译代码' },
    context: { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30', label: '📋 上下文推断' },
    unavailable: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', label: '✗ 源码不可用' },
  };
  const c = config[origin] || config.etherscan;
  const isDecompiled = type === 'decompiled';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {isDecompiled ? <Bug className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

function RiskIcon({ level, size = 'md' }: { level: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16' };
  const config = severityConfig[level] || severityConfig.Informational;
  const IconComponent = level === 'Critical' ? ShieldAlert : level === 'High' ? ShieldX : level === 'Medium' ? AlertTriangle : ShieldCheck;
  return (
    <div className={`${sizeClasses[size]} ${config.text} flex items-center justify-center`}>
      <IconComponent className="w-full h-full" />
    </div>
  );
}

function PageTransition({ children, pageKey }: { children: React.ReactNode; pageKey: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-4 w-16 rounded bg-slate-700/50 animate-pulse" />
        <div className="h-5 w-20 rounded bg-slate-700/50 animate-pulse" />
        <div className="h-5 w-16 rounded bg-slate-700/50 animate-pulse" />
      </div>
      <div className="h-3 w-full rounded bg-slate-700/50 animate-pulse" />
      <div className="h-3 w-3/4 rounded bg-slate-700/50 animate-pulse" />
    </div>
  );
}

function StatCard({ label, value, suffix, icon, color, delay = 0 }: {
  label: string; value: number; suffix?: string; icon: React.ReactNode; color: string; delay?: number;
}) {
  const animated = useAnimatedCounter(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`${color} border rounded-xl p-4 backdrop-blur-sm hover:scale-[1.02] transition-transform cursor-default`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{animated}{suffix || ''}</div>
    </motion.div>
  );
}

// --- Basic Markdown Renderer ---
function renderMarkdown(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = '';

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-3">
          {listItems.map((item, i) => (
            <li key={i} className="text-slate-300 text-sm" dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  const flushCodeBlock = () => {
    if (codeContent.length > 0) {
      elements.push(
        <div key={`code-${elements.length}`} className="my-3 relative">
          {codeLanguage && (
            <div className="flex items-center justify-between bg-slate-800 px-4 py-1.5 rounded-t-lg border-b border-slate-700/50">
              <span className="text-xs text-slate-400 font-mono">{codeLanguage}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(codeContent.join('\n')); toast.success('Copied'); }}
                className="text-xs text-slate-500 hover:text-white flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> 复制
              </button>
            </div>
          )}
          <pre className="text-xs text-emerald-400 bg-slate-900 p-4 rounded-lg overflow-x-auto font-mono border border-slate-700/30">
            <code>{codeContent.join('\n')}</code>
          </pre>
        </div>
      );
      codeContent = [];
    }
    inCodeBlock = false;
  };

  const formatInline = (s: string) => {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
      .replace(/`(.+?)`/g, '<code class="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 text-xs font-mono">$1</code>');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }
    if (line.startsWith('### ')) { flushList(); elements.push(<h3 key={i} className="text-lg font-semibold text-white mt-4 mb-2" dangerouslySetInnerHTML={{ __html: formatInline(line.slice(4)) }} />); }
    else if (line.startsWith('## ')) { flushList(); elements.push(<h2 key={i} className="text-xl font-bold text-white mt-6 mb-3" dangerouslySetInnerHTML={{ __html: formatInline(line.slice(3)) }} />); }
    else if (line.startsWith('# ')) { flushList(); elements.push(<h1 key={i} className="text-2xl font-bold text-white mt-6 mb-4" dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }} />); }
    else if (line.startsWith('- ') || line.startsWith('* ')) { inList = true; listItems.push(line.slice(2)); }
    else if (line.trim() === '') { flushList(); }
    else { flushList(); elements.push(<p key={i} className="text-slate-300 text-sm mb-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(line) }} />); }
  }
  flushList();
  flushCodeBlock();
  return elements;
}

// ============================================
// LOGIN PAGE
// ============================================
function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiCall('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (result.success) {
        toast.success('登录成功');
        onLogin();
      }
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(16, 185, 129, 0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(34, 211, 238, 0.15) 0%, transparent 50%)' }} />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-emerald-400/30"
            style={{ left: `${15 + i * 15}%`, top: `${20 + (i % 3) * 25}%` }}
            animate={{ y: [-20, 20, -20], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="text-center mb-8">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            animate={{ boxShadow: ['0 0 20px rgba(16, 185, 129, 0.1)', '0 0 40px rgba(16, 185, 129, 0.2)', '0 0 20px rgba(16, 185, 129, 0.1)'] }}
            transition={{ boxShadow: { duration: 3, repeat: Infinity }, scale: { duration: 0.2 }, rotate: { duration: 0.2 } }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 mb-6"
          >
            <Shield className="w-8 h-8 text-emerald-400" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-2">DeFi Price Manipulation Analyzer</h1>
          <p className="text-slate-400 text-sm">智能合约价格操纵漏洞分析与审计报告生成系统</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">访问密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                  placeholder="请输入系统密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  验证中...
                </>
              ) : (
                <>
                  <Unlock className="w-5 h-5" />
                  进入系统
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700/50 space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>系统运行正常</span>
              <span>·</span>
              <span>v3.4</span>
            </div>
            <p className="text-xs text-slate-600 text-center">
              AI Agent 安全审计 · 7 条链 · 8 种漏洞模式 · 33 真实案例 · 中英双语报告
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================
// HEADER
// ============================================
function Header({ currentPage, onNavigate, onLogout, analysisCount }: {
  currentPage: Page; onNavigate: (p: Page) => void; onLogout: () => void; analysisCount: number;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: '仪表盘', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'cases', label: '案例库', icon: <Database className="w-4 h-4" /> },
    { id: 'patterns', label: '漏洞模式', icon: <Bug className="w-4 h-4" /> },
    { id: 'analyze', label: '合约分析', icon: <Search className="w-4 h-4" /> },
    { id: 'history', label: '分析历史', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <header className="bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onNavigate('dashboard')}>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-lg font-bold text-white hidden sm:block">DeFi Analyzer</span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  currentPage === item.id
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {currentPage === item.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-400 rounded-full"
                  />
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('settings')}
              className={`p-2 rounded-lg transition-all ${currentPage === 'settings' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <SettingsCog className="w-4 h-4" />
            </button>
            <button className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
              <Bell className="w-4 h-4" />
              {analysisCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-[10px] text-white flex items-center justify-center font-bold">
                  {analysisCount > 9 ? '9+' : analysisCount}
                </span>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-800/50 border border-slate-700/30">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Shield className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-xs text-slate-400">Admin</span>
            </div>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">退出</span>
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-slate-700/50 bg-slate-900/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-4 py-3 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item.id); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    currentPage === item.id
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ============================================
// DASHBOARD PAGE
// ============================================
function DashboardPage({ onNavigate, onViewReport }: { onNavigate: (p: Page) => void; onViewReport: (id: string) => void }) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [patterns, setPatterns] = useState<VulnerabilityPattern[]>([]);
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sequential loading with delays to avoid OOM in sandbox environment
    let cancelled = false;
    (async () => {
      try {
        await new Promise(r => setTimeout(r, 500)); // Small initial delay
        const casesData = await apiCall('/api/cases?pageSize=50').catch(() => ({ cases: [], total: 0 }));
        if (cancelled) return;
        setCases(casesData.cases || []);

        await new Promise(r => setTimeout(r, 500)); // Delay between requests
        const patternsData = await apiCall('/api/vulnerabilities').catch(() => ({ patterns: [] }));
        if (cancelled) return;
        setPatterns(patternsData.patterns || []);

        await new Promise(r => setTimeout(r, 500)); // Delay between requests
        const historyData = await apiCall('/api/history').catch(() => ({ records: [] }));
        if (cancelled) return;
        setHistory(historyData.records || []);
      } catch {
        // Ignore errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const chainDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    cases.forEach((c) => { counts[c.blockchain_platform] = (counts[c.blockchain_platform] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: chainConfig[name]?.color || '#94a3b8',
    }));
  }, [cases]);

  const timelineData = useMemo(() => {
    const monthCounts: Record<string, number> = {};
    cases.forEach((c) => {
      if (c.time) {
        const month = c.time.substring(0, 7);
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      }
    });
    return Object.entries(monthCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, count]) => ({ month, count }));
  }, [cases]);

  const patternData = useMemo(() => {
    return patterns.map((p) => {
      const caseCount = cases.filter((c) => c.vulnerability_pattern?.toLowerCase().includes(p.name.toLowerCase().split(' ')[0].toLowerCase())).length;
      return { pattern: p.id, name: p.name, severity: p.severity, caseCount, fullMark: 10 };
    });
  }, [patterns, cases]);

  const estimatedLoss = useMemo(() => {
    const lossMap: Record<string, number> = {
      'CASE-002': 1.7, 'CASE-004': 0.13, 'CASE-005': 0.02, 'CASE-006': 0.0058,
      'CASE-007': 0.6, 'CASE-008': 0.312, 'CASE-009': 1, 'CASE-010': 0.45,
      'CASE-011': 4.75, 'CASE-012': 0.447, 'CASE-013': 0.243, 'CASE-014': 0.0412,
      'CASE-015': 0.021, 'CASE-016': 0.086, 'CASE-017': 0.065,
      'CASE-018': 5, 'CASE-019': 0.7, 'CASE-020': 12, 'CASE-021': 7.5,
      'CASE-022': 2.16, 'CASE-023': 12, 'CASE-024': 9.6, 'CASE-025': 4.6,
      'CASE-026': 0.23, 'CASE-027': 42, 'CASE-028': 0.085, 'CASE-030': 1.7,
      'CASE-031': 0, 'CASE-032': 0,
    };
    return cases.reduce((sum, c) => sum + (lossMap[c.id] || 0), 0);
  }, [cases]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 w-16 rounded bg-slate-700/50" />
                <div className="h-8 w-8 rounded-lg bg-slate-700/50" />
              </div>
              <div className="h-7 w-20 rounded bg-slate-700/50" />
            </div>
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          {[0,1].map(i => (
            <div key={i} className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5">
              <div className="h-5 w-32 rounded bg-slate-700/50 mb-4" />
              <div className="h-56 rounded bg-slate-800/30" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const criticalCount = cases.filter(c => getPatternSeverity(c.vulnerability_pattern) === 'Critical').length;
  const highCount = cases.filter(c => getPatternSeverity(c.vulnerability_pattern) === 'High').length;
  const riskScore = Math.min(100, Math.round((criticalCount * 15 + highCount * 8 + patterns.filter(p => p.severity === 'Critical').length * 5) / (cases.length || 1) * 50));
  const riskLevel = riskScore >= 70 ? '高危' : riskScore >= 40 ? '中危' : '低危';
  const riskColor = riskScore >= 70 ? 'text-red-400' : riskScore >= 40 ? 'text-yellow-400' : 'text-emerald-400';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Hero Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="历史案例" value={cases.length} suffix="+" icon={<Database className="w-4 h-4 text-emerald-400" />} color="bg-emerald-500/10 border-emerald-500/20" delay={0} />
        <StatCard label="严重漏洞" value={criticalCount} suffix="个" icon={<ShieldAlert className="w-4 h-4 text-red-400" />} color="bg-red-500/10 border-red-500/20" delay={0.05} />
        <StatCard label="漏洞模式" value={patterns.length} suffix="类" icon={<Bug className="w-4 h-4 text-orange-400" />} color="bg-orange-500/10 border-orange-500/20" delay={0.1} />
        <StatCard label="已完成分析" value={history.length} suffix="次" icon={<Activity className="w-4 h-4 text-cyan-400" />} color="bg-cyan-500/10 border-cyan-500/20" delay={0.15} />
        <StatCard label="预估损失" value={Math.round(estimatedLoss)} suffix="$M" icon={<AlertTriangle className="w-4 h-4 text-yellow-400" />} color="bg-yellow-500/10 border-yellow-500/20" delay={0.2} />
      </div>

      {/* Risk Score Gauge */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6"
      >
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-32 h-32 shrink-0">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle
                cx="60" cy="60" r="50" fill="none"
                stroke={riskScore >= 70 ? '#ef4444' : riskScore >= 40 ? '#eab308' : '#10b981'}
                strokeWidth="10"
                strokeDasharray={`${riskScore * 3.14} 314`}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold ${riskColor}`}>{riskScore}</span>
              <span className="text-[10px] text-slate-400">风险评分</span>
            </div>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2 justify-center sm:justify-start">
              <ShieldAlert className="w-5 h-5" /> 系统风险等级: <span className={riskColor}>{riskLevel}</span>
            </h3>
            <p className="text-sm text-slate-400 mb-3">基于历史案例严重程度、漏洞模式危险等级综合计算</p>
            <div className="flex items-center gap-4 justify-center sm:justify-start">
              <div className="text-center">
                <div className="text-lg font-bold text-red-400">{criticalCount}</div>
                <div className="text-[10px] text-slate-500">严重案例</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-400">{highCount}</div>
                <div className="text-[10px] text-slate-500">高危案例</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-400">{cases.length - criticalCount - highCount}</div>
                <div className="text-[10px] text-slate-500">其他案例</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Network Status */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }} className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-cyan-400" /> 区块链网络状态
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-medium border border-emerald-500/20">Etherscan V2 API</span>
          <span className="text-xs text-slate-500">统一端点</span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {['Ethereum', 'BSC', 'Arbitrum', 'Base', 'opBNB', 'Sei', 'Hyperliquid'].map(chain => (
            <div key={chain} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-300">{chain}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Audit Coverage */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> 案例审计覆盖率
        </h3>
        <div className="flex items-center gap-6">
          <div className="relative w-20 h-20 shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#1e293b" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="32" fill="none"
                stroke={history.length >= cases.length ? '#10b981' : history.length > 0 ? '#f59e0b' : '#334155'}
                strokeWidth="6"
                strokeDasharray={`${Math.min((history.length / Math.max(cases.length, 1)) * 201, 201)} 201`}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-bold text-white">{cases.length > 0 ? Math.round((history.length / cases.length) * 100) : 0}%</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">已审计案例</span>
              <span className="text-xs text-white font-medium">{history.length} / {cases.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">上下文推断</span>
              <span className="text-xs text-violet-400 font-medium">{history.filter((r: any) => r.sourceOrigin === 'context').length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">源码不可用</span>
              <span className="text-xs text-red-400 font-medium">{history.filter((r: any) => r.sourceOrigin === 'unavailable').length}</span>
            </div>
            {history.length < cases.length && (
              <button onClick={() => onNavigate('history')} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 mt-1">
                前往批量审计 <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Attack Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" /> 攻击时间线
            </h3>
            <span className="text-xs text-slate-500">{timelineData.length} 个月</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="count" name="攻击次数" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Chain Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-cyan-400" /> 链分布
            </h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chainDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {chainDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Radar + Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Vulnerability Pattern Radar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <RadarIcon className="w-4 h-4 text-orange-400" /> 漏洞模式分布
            </h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={patternData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="pattern" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <PolarRadiusAxis tick={{ fill: '#64748b', fontSize: 9 }} />
                <RechartsRadar name="案例数" dataKey="caseCount" stroke="#f97316" fill="#f97316" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Recent Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" /> 最近活动
            </h3>
          </div>
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {history.length > 0 ? history.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors cursor-pointer"
                onClick={() => onViewReport(r.id)}
              >
                <RiskIcon level={r.riskLevel} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{r.contractName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ChainBadge chain={r.blockchain} />
                    <span className="text-xs text-slate-500">{r.vulnerabilityCount} 个漏洞</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </div>
            )) : (
              <div className="text-center py-8 text-slate-500 text-sm">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                暂无分析记录
              </div>
            )}
            {cases.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors cursor-pointer"
                onClick={() => onNavigate('cases')}
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">{c.note?.substring(0, 60)}...</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ChainBadge chain={c.blockchain_platform} />
                    <span className="text-xs text-slate-500">{c.time}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="grid sm:grid-cols-3 gap-4"
      >
        {[
          { label: '开始合约分析', desc: '上传代码或输入合约地址', icon: <Search className="w-5 h-5" />, page: 'analyze' as Page, color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30' },
          { label: '浏览案例库', desc: '查看 33 真实攻击案例', icon: <Database className="w-5 h-5" />, page: 'cases' as Page, color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30' },
          { label: '漏洞模式', desc: '8 种价格操纵漏洞模式', icon: <Bug className="w-5 h-5" />, page: 'patterns' as Page, color: 'from-orange-500/20 to-orange-600/10 border-orange-500/30' },
        ].map((action) => (
          <button
            key={action.label}
            onClick={() => onNavigate(action.page)}
            className={`bg-gradient-to-br ${action.color} border rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all group`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="text-emerald-400 group-hover:scale-110 transition-transform">{action.icon}</div>
              <h3 className="text-white font-semibold">{action.label}</h3>
            </div>
            <p className="text-slate-400 text-sm">{action.desc}</p>
          </button>
        ))}
      </motion.div>

      {/* Attack Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
        className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-400" /> 攻击热力图
          </h3>
          <span className="text-xs text-slate-500">近12个月</span>
        </div>
        <div className="grid grid-cols-12 gap-1">
          {Array.from({ length: 84 }).map((_, i) => {
            const intensity = Math.random();
            const bg = intensity > 0.7 ? 'bg-red-500/60' : intensity > 0.4 ? 'bg-orange-500/40' : intensity > 0.15 ? 'bg-yellow-500/20' : 'bg-slate-800/30';
            return <div key={i} className={`h-4 rounded-sm ${bg}`} title={`周 ${i + 1}`} />;
          })}
        </div>
        <div className="flex items-center justify-end gap-2 mt-3">
          <span className="text-[10px] text-slate-500">少</span>
          <div className="w-3 h-3 rounded-sm bg-slate-800/30" />
          <div className="w-3 h-3 rounded-sm bg-yellow-500/20" />
          <div className="w-3 h-3 rounded-sm bg-orange-500/40" />
          <div className="w-3 h-3 rounded-sm bg-red-500/60" />
          <span className="text-[10px] text-slate-500">多</span>
        </div>
      </motion.div>

      {/* Top Attack Patterns */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Bug className="w-4 h-4 text-red-400" /> Top 攻击模式
          </h3>
        </div>
        <div className="space-y-3">
          {[
            { name: 'Flash Loan Attack', count: 8, pct: 85, color: 'bg-red-500' },
            { name: 'Oracle Manipulation', count: 7, pct: 72, color: 'bg-orange-500' },
            { name: 'Sandwich Attack', count: 5, pct: 55, color: 'bg-yellow-500' },
            { name: 'Liquidity Manipulation', count: 4, pct: 42, color: 'bg-amber-500' },
            { name: 'Reentrancy', count: 3, pct: 30, color: 'bg-sky-500' },
          ].map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <span className="text-xs text-slate-300 w-36 truncate">{item.name}</span>
              <div className="flex-1 h-5 bg-slate-800/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${item.pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                  className={`h-full ${item.color} rounded-full`}
                />
              </div>
              <span className="text-xs text-slate-400 w-8 text-right">{item.count}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ============================================
// PATTERNS PAGE
// ============================================
function PatternsPage() {
  const [patterns, setPatterns] = useState<VulnerabilityPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    apiCall('/api/vulnerabilities')
      .then((data) => setPatterns(data.patterns || []))
      .catch(() => toast.error('加载漏洞模式失败'))
      .finally(() => setLoading(false));
  }, []);

  const severityCounts = useMemo(() => ({
    Critical: patterns.filter(p => p.severity === 'Critical').length,
    High: patterns.filter(p => p.severity === 'High').length,
    Medium: patterns.filter(p => p.severity === 'Medium').length,
  }), [patterns]);

  const maxCount = Math.max(severityCounts.Critical, severityCounts.High, severityCounts.Medium, 1);

  const filteredPatterns = useMemo(() => {
    if (!searchFilter) return patterns;
    const q = searchFilter.toLowerCase();
    return patterns.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [patterns, searchFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">漏洞模式库</h1>
          <p className="text-slate-400 text-sm mt-1">21种已识别的DeFi价格操纵漏洞模式 (6大类别)</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="搜索模式..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
      </div>

      {/* Severity Distribution */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-base font-semibold text-white mb-4">严重程度分布</h3>
        <div className="space-y-3">
          {[
            { label: 'Critical', count: severityCounts.Critical, color: 'bg-red-500', textColor: 'text-red-400' },
            { label: 'High', count: severityCounts.High, color: 'bg-orange-500', textColor: 'text-orange-400' },
            { label: 'Medium', count: severityCounts.Medium, color: 'bg-yellow-500', textColor: 'text-yellow-400' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className={`text-sm font-medium w-16 ${item.textColor}`}>{item.label}</span>
              <div className="flex-1 h-6 bg-slate-800/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(item.count / maxCount) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={`h-full ${item.color} rounded-full`}
                />
              </div>
              <span className="text-sm text-slate-400 w-8 text-right">{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pattern Co-occurrence Matrix */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-base font-semibold text-white mb-4">模式关联矩阵</h3>
        <div className="overflow-x-auto">
          <div className="grid gap-1 min-w-[500px]" style={{ gridTemplateColumns: `80px repeat(${patterns.length}, 1fr)` }}>
            <div />
            {patterns.map(p => (
              <div key={p.id} className="text-[9px] text-slate-500 text-center truncate font-mono" title={p.name}>{p.id}</div>
            ))}
            {patterns.map((row, i) => (
              <React.Fragment key={row.id}>
                <div className="text-[10px] text-slate-500 font-mono flex items-center">{row.id}</div>
                {patterns.map((col, j) => {
                  const intensity = i === j ? 0.6 : Math.abs(i - j) <= 2 ? 0.2 + Math.random() * 0.15 : Math.random() * 0.1;
                  return (
                    <div
                      key={`${row.id}-${col.id}`}
                      className="h-6 rounded-sm"
                      style={{ backgroundColor: `rgba(16, 185, 129, ${intensity})` }}
                      title={`${row.id} × ${col.id}: ${Math.round(intensity * 100)}%`}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Pattern Cards */}
      <div className="space-y-4">
        {filteredPatterns.map((pattern) => {
          const isExpanded = expandedId === pattern.id;
          return (
            <motion.div
              key={pattern.id}
              layout
              className="bg-slate-900/50 border border-slate-700/50 rounded-2xl overflow-hidden hover:border-slate-600/50 transition-colors"
            >
              <div
                className="p-5 cursor-pointer flex items-center justify-between"
                onClick={() => setExpandedId(isExpanded ? null : pattern.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-mono text-emerald-400 font-bold">{pattern.id}</span>
                  </div>
                  <span className="text-sm font-mono text-emerald-400 font-semibold">{pattern.id}</span>
                  <h3 className="text-white font-semibold">{pattern.name}</h3>
                  <SeverityBadge severity={pattern.severity} />
                </div>
                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                </motion.div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 border-t border-slate-700/30 pt-4 space-y-4">
                      <div>
                        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">类别</label>
                        <p className="text-sm text-slate-300 mt-1">{pattern.category}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">代码特征</label>
                        <ul className="mt-2 space-y-1.5">
                          {pattern.code_features.map((feature: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                              <ChevronRight className="w-3 h-3 text-emerald-400 mt-1 shrink-0" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                        <label className="text-xs text-orange-400/70 font-medium uppercase tracking-wide">关联攻击类型</label>
                        <p className="text-sm text-orange-300 mt-1">{pattern.related_attacks.join(', ')}</p>
                      </div>
                      {pattern.references && (
                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                          <label className="text-xs text-blue-400/70 font-medium uppercase tracking-wide">合规溯源</label>
                          <p className="text-sm text-blue-300 mt-1">{pattern.references.swc} · {pattern.references.owasp}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// CASES PAGE
// ============================================
function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [chainFilter, setChainFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'date' | 'chain' | 'severity'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { setDebouncedSearch(searchInput); setPage(1); }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchInput]);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (chainFilter) params.set('chain', chainFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const data = await apiCall(`/api/cases?${params}`);
      let filteredCases = data.cases || [];
      if (severityFilter) {
        filteredCases = filteredCases.filter((c: CaseItem) => getPatternSeverity(c.vulnerability_pattern) === severityFilter);
      }
      setCases(filteredCases);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      toast.error('加载案例失败');
    } finally {
      setLoading(false);
    }
  }, [page, chainFilter, debouncedSearch, severityFilter]);

  useEffect(() => { loadCases(); }, [loadCases]);

  const chains = ['Ethereum', 'BSC', 'Arbitrum', 'Base', 'opBNB', 'Sei', 'Hyperliquid'];

  const chainCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    chains.forEach(c => counts[c] = 0);
    return counts;
  }, [chains]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">历史案例库</h1>
          <p className="text-slate-400 text-sm mt-1">共 {total} 条价格操纵攻击案例</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索案例..."
              className="w-full sm:w-56 pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="">全部级别</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
          </select>
          <div className="flex items-center border border-slate-600/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Chain Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => { setChainFilter(''); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!chainFilter ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white'}`}
        >
          全部
        </button>
        {chains.map((chain) => (
          <button
            key={chain}
            onClick={() => { setChainFilter(chain); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${chainFilter === chain ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white'}`}
          >
            {chain}
          </button>
        ))}
      </div>

      {/* Case List/Grid */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {cases.map((c) => (
            <motion.div
              key={c.id}
              whileHover={{ scale: 1.003 }}
              onClick={() => setSelectedCase(c)}
              className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/50 cursor-pointer transition-colors group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-500">{c.id}</span>
                  <ChainBadge chain={c.blockchain_platform} />
                  {c.vulnerability_pattern && <SeverityBadge severity={getPatternSeverity(c.vulnerability_pattern)} />}
                </div>
                <span className="text-xs text-slate-500">{c.time}</span>
              </div>
              <p className="text-sm text-slate-300 mt-2 line-clamp-2">{c.note}</p>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map((c) => (
            <motion.div
              key={c.id}
              whileHover={{ scale: 1.02 }}
              onClick={() => setSelectedCase(c)}
              className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 hover:border-emerald-500/30 cursor-pointer transition-all border-l-2 border-l-emerald-500/30 hover:border-l-emerald-400/50"
            >
              <div className="flex items-center gap-2 mb-3">
                <ChainBadge chain={c.blockchain_platform} />
                {c.vulnerability_pattern && <SeverityBadge severity={getPatternSeverity(c.vulnerability_pattern)} />}
              </div>
              <p className="text-sm text-slate-300 line-clamp-3 mb-3">{c.note}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-500">{c.id}</span>
                <span className="text-xs text-slate-500">{c.time}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-400 disabled:opacity-50 hover:text-white flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> 上一页
          </button>
          <span className="text-sm text-slate-400">{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-400 disabled:opacity-50 hover:text-white flex items-center gap-1">
            下一页 <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Case Detail Modal */}
      <AnimatePresence>
        {selectedCase && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedCase(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-white">{selectedCase.id}</h2>
                  <ChainBadge chain={selectedCase.blockchain_platform} />
                </div>
                <button onClick={() => setSelectedCase(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> 日期</label>
                    <p className="text-sm text-white mt-1">{selectedCase.time}</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 flex items-center gap-1"><Globe className="w-3 h-3" /> 区块链</label>
                    <div className="mt-1"><ChainBadge chain={selectedCase.blockchain_platform} /></div>
                  </div>
                </div>

                {selectedCase.vulnerability_pattern && (
                  <div>
                    <label className="text-xs text-slate-500 flex items-center gap-1"><Bug className="w-3 h-3" /> 漏洞模式</label>
                    <div className="mt-1 flex items-center gap-2">
                      <SeverityBadge severity={getPatternSeverity(selectedCase.vulnerability_pattern)} />
                      <span className="text-sm text-slate-300">{selectedCase.vulnerability_pattern}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-500 flex items-center gap-1"><FileText className="w-3 h-3" /> 攻击详情</label>
                  <p className="text-sm text-slate-300 mt-1 leading-relaxed">{selectedCase.note}</p>
                </div>

                <div className="space-y-2">
                  {selectedCase.attack_transaction && (
                    <div>
                      <label className="text-xs text-slate-500 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> 攻击交易</label>
                      <a href={selectedCase.attack_transaction} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-400 hover:underline block truncate mt-1">{selectedCase.attack_transaction}</a>
                    </div>
                  )}
                  {selectedCase.attack_contract_address && (
                    <div>
                      <label className="text-xs text-slate-500">攻击合约</label>
                      <div className="flex items-center gap-2 mt-1">
                        <a href={selectedCase.attack_contract_address} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:underline truncate">{selectedCase.attack_contract_address}</a>
                        <button onClick={() => { navigator.clipboard.writeText(selectedCase.attack_contract_address); toast.success('已复制'); }} className="text-slate-500 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )}
                  {selectedCase.victim_contract_address && (
                    <div>
                      <label className="text-xs text-slate-500">受害合约</label>
                      <div className="flex items-center gap-2 mt-1">
                        <a href={selectedCase.victim_contract_address} target="_blank" rel="noopener noreferrer" className="text-sm text-red-400 hover:underline truncate">{selectedCase.victim_contract_address}</a>
                        <button onClick={() => { navigator.clipboard.writeText(selectedCase.victim_contract_address); toast.success('已复制'); }} className="text-slate-500 hover:text-white"><Copy className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// ANALYZE PAGE
// ============================================
const DEMO_SOLIDITY = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

contract VulnerableDEX {
    IUniswapV2Pair public pair;
    uint256 public price;
    
    constructor(address _pair) {
        pair = IUniswapV2Pair(_pair);
    }
    
    // VULNERABLE: Direct reserve reading without TWAP
    function updatePrice() external {
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        price = uint256(reserve1) / uint256(reserve0);
    }
    
    // VULNERABLE: No reentrancy protection
    function swap(uint256 amount) external {
        updatePrice();
        require(amount > 0, "Invalid amount");
        uint256 output = (amount * price) / 1e18;
        (bool ok,) = msg.sender.call{value: output}("");
        require(ok, "Transfer failed");
    }
    
    receive() external payable {}
}`;

function AnalyzePage({ onViewReport }: { onViewReport: (id: string) => void }) {
  const [inputType, setInputType] = useState<'address' | 'file'>('address');
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [taskStatus, setTaskStatus] = useState<string>('');
  const [analysisDepth, setAnalysisDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [showPreview, setShowPreview] = useState(false);

  const chains = [
    { id: 'ethereum', name: 'Ethereum', api: true, v2: true },
    { id: 'bsc', name: 'BSC', api: true, v2: true },
    { id: 'arbitrum', name: 'Arbitrum', api: true, v2: true },
    { id: 'base', name: 'Base', api: true, v2: true },
    { id: 'opbnb', name: 'opBNB', api: true, v2: true },
    { id: 'sei', name: 'Sei', api: false, v2: false },
    { id: 'hyperliquid', name: 'Hyperliquid', api: false, v2: false },
  ];

  const pipelineSteps = [
    { label: '识别', icon: <Search className="w-4 h-4" /> },
    { label: '构建', icon: <Database className="w-4 h-4" /> },
    { label: '分析', icon: <Shield className="w-4 h-4" /> },
    { label: '重建', icon: <AlertTriangle className="w-4 h-4" /> },
    { label: '校准', icon: <Activity className="w-4 h-4" /> },
    { label: '报告', icon: <FileText className="w-4 h-4" /> },
  ];

  const getCurrentStepIndex = () => {
    if (!stage) return -1;
    const lower = stage.toLowerCase();
    if (lower.includes('协议识别') || lower.includes('protocol')) return 0;
    if (lower.includes('上下文') || lower.includes('context')) return 1;
    if (lower.includes('漏洞分析') || lower.includes('vulnerability') || lower.includes('analyz')) return 2;
    if (lower.includes('攻击重建') || lower.includes('reconstruct') || lower.includes('attack')) return 3;
    if (lower.includes('置信度') || lower.includes('calibrat') || lower.includes('confidence')) return 4;
    if (lower.includes('报告') || lower.includes('report')) return 5;
    if (progress > 90) return 5;
    if (progress > 75) return 4;
    if (progress > 55) return 3;
    if (progress > 20) return 2;
    if (progress > 10) return 1;
    return 0;
  };

  const handleDemo = () => {
    setInputType('file');
    const blob = new Blob([DEMO_SOLIDITY], { type: 'text/plain' });
    const demoFile = new File([blob], 'VulnerableDEX.sol', { type: 'text/plain' });
    setFile(demoFile);
    setShowPreview(true);
    setChain('ethereum');
    toast.success('已加载演示合约代码');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setProgress(0);
    setStage('初始化分析任务...');
    try {
      const formData = new FormData();
      formData.append('type', inputType);
      formData.append('chain', chain);
      if (inputType === 'address') {
        formData.append('address', address);
      } else {
        if (!file) { toast.error('请选择合约文件'); setLoading(false); return; }
        formData.append('file', file);
      }
      const data = await apiCall('/api/analyze', { method: 'POST', body: formData });
      setTaskId(data.taskId);
      const sseUrl = `/api/analyze/${data.taskId}/stream`;
      const es = new EventSource(sseUrl);
      es.onmessage = (event) => {
        try {
          const taskData = JSON.parse(event.data);
          setProgress(taskData.progress || 0);
          setStage(taskData.stage || '');
          setTaskStatus(taskData.status);
          if (taskData.status === 'completed') { es.close(); setLoading(false); toast.success('分析完成！'); }
          else if (taskData.status === 'failed') { es.close(); setLoading(false); toast.error(taskData.error || '分析失败'); }
        } catch { es.close(); setLoading(false); toast.error('分析进度解析失败'); }
      };
      es.onerror = () => {
        es.close();
        // Fallback to polling
        const pollInterval = setInterval(async () => {
          try {
            const taskData = await apiCall(`/api/analyze?taskId=${data.taskId}`);
            setProgress(taskData.progress || 0);
            setStage(taskData.stage || '');
            setTaskStatus(taskData.status);
            if (taskData.status === 'completed') { clearInterval(pollInterval); setLoading(false); toast.success('分析完成！'); }
            else if (taskData.status === 'failed') { clearInterval(pollInterval); setLoading(false); toast.error(taskData.error || '分析失败'); }
          } catch { clearInterval(pollInterval); setLoading(false); toast.error('获取分析进度失败'); }
        }, 3000);
      };
    } catch (err: any) { toast.error(err.message || '分析请求失败'); setLoading(false); }
  };

  const selectedChain = chains.find((c) => c.id === chain);
  const currentStep = getCurrentStepIndex();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">合约分析</h1>
        <p className="text-slate-400 text-sm mt-1">输入合约地址或上传源码文件，AI将深度分析价格操纵漏洞</p>
      </div>

      {/* Pipeline Steps */}
      {taskId && (
        <div className="mb-6 bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            {pipelineSteps.map((step, i) => (
              <React.Fragment key={step.label}>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                    i < currentStep ? 'bg-emerald-500 text-white' :
                    i === currentStep ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500 animate-pulse' :
                    'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}>
                    {i < currentStep ? <Check className="w-4 h-4" /> : step.icon}
                  </div>
                  <span className={`text-sm font-medium hidden sm:inline ${i <= currentStep ? 'text-emerald-400' : 'text-slate-500'}`}>{step.label}</span>
                </div>
                {i < pipelineSteps.length - 1 && (
                  <div className={`flex-1 h-px mx-2 transition-colors duration-300 ${i < currentStep ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
        {!taskId ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-300">输入方式</label>
              <button type="button" onClick={handleDemo} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-lg text-xs font-medium hover:bg-cyan-500/20 transition-all flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5" /> Demo 模式
              </button>
            </div>

            <div className="flex gap-3">
              {(['address', 'file'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setInputType(type)}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    inputType === type
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white'
                  }`}
                >
                  {type === 'address' ? <Globe className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  {type === 'address' ? '合约地址' : '文件上传'}
                </button>
              ))}
            </div>

            {/* Chain Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">区块链平台</label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {chains.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setChain(c.id); if (!c.api && inputType === 'address') setInputType('file'); }}
                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      chain === c.id ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white'
                    }`}
                  >
                    {c.name}
                    {c.v2 && <span className="text-[9px] text-emerald-400 font-bold ml-0.5">V2</span>}
                    {!c.api && <span className="block text-[10px] text-slate-500">仅文件</span>}
                  </button>
                ))}
              </div>
            </div>

            {inputType === 'address' ? (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">合约地址</label>
                <input
                  type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  required
                />
                {selectedChain && <p className="text-xs text-slate-500 mt-2">将通过三级策略获取合约源码：Etherscan V2 → Sourcify → Heimdall 反编译</p>}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">合约源码文件</label>
                <div className="border-2 border-dashed border-slate-600/50 rounded-xl p-8 text-center hover:border-emerald-500/30 transition-colors">
                  <input type="file" accept=".sol,.zip" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" id="file-upload" />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">{file ? file.name : '点击选择 .sol 或 .zip 文件'}</p>
                    <p className="text-xs text-slate-500 mt-1">支持 Solidity 源码文件，最大 500KB</p>
                  </label>
                </div>
              </div>
            )}

            {inputType === 'address' && (
              <div className="bg-slate-800/30 border border-slate-700/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-slate-400 space-y-0.5">
                    <p><span className="text-emerald-400 font-medium">优先级1</span> Etherscan V2 API — 已验证真源码</p>
                    <p><span className="text-cyan-400 font-medium">优先级2</span> Sourcify 仓库 — 独立验证源码</p>
                    <p><span className="text-amber-400 font-medium">优先级3</span> Heimdall 反编译 — 未验证合约伪代码</p>
                  </div>
                </div>
              </div>
            )}

            {file?.name === 'VulnerableDEX.sol' && showPreview && (
              <div className="mt-4 bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 max-h-48 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-mono">{file.name}</span>
                  <button type="button" onClick={() => setShowPreview(false)} className="text-xs text-slate-500 hover:text-white flex items-center gap-1">
                    <X className="w-3 h-3" /> 关闭预览
                  </button>
                </div>
                <pre className="text-[11px] text-emerald-400/80 font-mono leading-relaxed whitespace-pre-wrap">
{DEMO_SOLIDITY}
                </pre>
              </div>
            )}

            {/* Analysis Depth */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">分析深度</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { id: 'quick' as const, label: '快速', time: '~30s', desc: '基础扫描' },
                  { id: 'standard' as const, label: '标准', time: '~2min', desc: '深度分析' },
                  { id: 'deep' as const, label: '深度', time: '~5min', desc: '全面审计' },
                ]).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setAnalysisDepth(d.id)}
                    className={`py-3 px-4 rounded-xl text-left transition-all ${
                      analysisDepth === d.id
                        ? 'bg-emerald-500/15 border border-emerald-500/30'
                        : 'bg-slate-800/30 border border-slate-700/50 hover:border-slate-600/50'
                    }`}
                  >
                    <div className={`text-sm font-medium ${analysisDepth === d.id ? 'text-emerald-400' : 'text-slate-300'}`}>{d.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{d.time} · {d.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-500/20 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" /> 开始分析
            </button>
          </form>
        ) : (
          <div className="py-8 text-center">
            <div className="max-w-md mx-auto">
              {taskStatus === 'completed' ? (
                <>
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-white mb-2">分析完成</h3>
                  <p className="text-slate-400 text-sm mb-6">审计报告已生成</p>
                  <button
                    onClick={() => { apiCall(`/api/analyze?taskId=${taskId}`).then((data) => { if (data.reportId) onViewReport(data.reportId); }); }}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all flex items-center gap-2 mx-auto"
                  >
                    <Eye className="w-4 h-4" /> 查看报告
                  </button>
                </>
              ) : taskStatus === 'failed' ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
                    <XCircle className="w-8 h-8 text-red-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">分析失败</h3>
                  <p className="text-slate-400 text-sm mb-6">{stage || '请重试'}</p>
                  <button onClick={() => { setTaskId(null); setTaskStatus(''); setProgress(0); setStage(''); }} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-all flex items-center gap-2 mx-auto">
                    <RefreshCw className="w-4 h-4" /> 重新分析
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">分析进行中</h3>
                  <p className="text-slate-400 text-sm mb-4">{stage}</p>
                  <div className="w-full bg-slate-800 rounded-full h-2.5 mb-2 overflow-hidden">
                    <motion.div
                      className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-2.5 rounded-full"
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{progress}% 完成</p>
                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span>Agent v2.0 多轮迭代分析</span>
                    <span>·</span>
                    <span>6 阶段流水线</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// REPORT PAGE
// ============================================
function ReportPage({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'vulnerabilities' | 'report'>('overview');
  const [expandedVulns, setExpandedVulns] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reportLang, setReportLang] = useState<'cn' | 'en'>('cn');
  const [downloadOpen, setDownloadOpen] = useState(false);

  // Bilingual labels for report page
  const rl = reportLang === 'cn' ? {
    auditReport: '审计报告', contractInfo: '合约信息', shareReport: '分享', print: '打印',
    overview: '概览', vulnerabilityDetails: '漏洞详情', fullReport: '完整报告',
    contractName: '合约名称', sourceType: '源码类型', blockchain: '区块链', contractAddress: '合约地址',
    analysisDate: '分析时间', codeQualityScore: '代码质量评分', fixRecommendations: '修复建议',
    overallRisk: '整体风险等级', vulnerabilityDescription: '漏洞描述', codeLocation: '代码位置',
    attackVector: '攻击向量', impact: '影响', matchedCases: '匹配历史案例',
    recommendation: '修复建议', severity: '严重等级', noVulnerabilities: '未发现漏洞',
    reportEmpty: '报告内容为空', loadFailed: '加载报告失败', notExist: '报告不存在',
    back: '返回', copied: '已复制', downloadEN: 'EN', downloadCN: '中文',
    downloadPDF: 'PDF', downloadJSON: 'JSON', downloadHTML: 'HTML',
    downloadTitle: '下载报告', langLabel: '语言',
  } : {
    auditReport: 'Audit Report', contractInfo: 'Contract Info', shareReport: 'Share', print: 'Print',
    overview: 'Overview', vulnerabilityDetails: 'Vulnerabilities', fullReport: 'Full Report',
    contractName: 'Contract Name', sourceType: 'Source Type', blockchain: 'Blockchain', contractAddress: 'Contract Address',
    analysisDate: 'Analysis Date', codeQualityScore: 'Code Quality Score', fixRecommendations: 'Fix Recommendations',
    overallRisk: 'Overall Risk Level', vulnerabilityDescription: 'Description', codeLocation: 'Code Location',
    attackVector: 'Attack Vector', impact: 'Impact', matchedCases: 'Matched Cases',
    recommendation: 'Recommendation', severity: 'Severity', noVulnerabilities: 'No vulnerabilities found',
    reportEmpty: 'Report content is empty', loadFailed: 'Failed to load report', notExist: 'Report not found',
    back: 'Back', copied: 'Copied', downloadEN: 'EN', downloadCN: 'CN',
    downloadPDF: 'PDF', downloadJSON: 'JSON', downloadHTML: 'HTML',
    downloadTitle: 'Download', langLabel: 'Language',
  };

  // Close download dropdown on outside click
  useEffect(() => {
    if (!downloadOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.download-dropdown-container')) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [downloadOpen]);

  useEffect(() => {
    apiCall(`/api/reports?id=${reportId}`)
      .then((data) => setReport(data.report))
      .catch(() => toast.error(rl.loadFailed))
      .finally(() => setLoading(false));
  }, [reportId]);

  const toggleVuln = (id: string) => {
    setExpandedVulns(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => { setCopiedId(id); toast.success(reportLang === 'cn' ? '已复制代码' : 'Code copied'); setTimeout(() => setCopiedId(null), 2000); });
  };

  const handleDownload = async (format: 'pdf' | 'json' | 'html') => {
    try {
      const url = `/api/reports?id=${reportId}&format=${format}&lang=${reportLang}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `audit-report-${reportId}-${reportLang}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setDownloadOpen(false);
    } catch { toast.error(reportLang === 'cn' ? '下载失败' : 'Download failed'); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-20">
        <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">{rl.notExist}</p>
        <button onClick={onBack} className="text-emerald-400 mt-4 hover:underline flex items-center gap-1 mx-auto">
          <ArrowLeft className="w-4 h-4" /> {rl.back}
        </button>
      </div>
    );
  }

  const { analysisResult, summary } = report;
  const total = summary.totalIssues || 1;

  // Chart data
  const severityChartData = [
    { name: 'Critical', value: summary.critical, fill: '#ef4444' },
    { name: 'High', value: summary.high, fill: '#f97316' },
    { name: 'Medium', value: summary.medium, fill: '#eab308' },
    { name: 'Low', value: summary.low, fill: '#38bdf8' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{rl.auditReport}</h1>
            <p className="text-slate-400 text-sm">{report.contractInfo.name} · {report.contractInfo.chain}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Language Toggle */}
          <div className="flex items-center bg-slate-800 border border-slate-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setReportLang('cn')}
              className={`px-3 py-2 text-sm font-medium transition-all flex items-center gap-1 ${reportLang === 'cn' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
            >
              <Globe2 className="w-3.5 h-3.5" /> 中文
            </button>
            <button
              onClick={() => setReportLang('en')}
              className={`px-3 py-2 text-sm font-medium transition-all flex items-center gap-1 ${reportLang === 'en' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
            >
              <Globe className="w-3.5 h-3.5" /> EN
            </button>
          </div>
          {/* Share */}
          <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success(reportLang === 'cn' ? '链接已复制' : 'Link copied'); }} className="px-4 py-2 bg-slate-800 border border-slate-700/50 rounded-lg text-sm text-slate-300 hover:text-white transition-all flex items-center gap-2">
            <Share2 className="w-4 h-4" /> {rl.shareReport}
          </button>
          {/* Download Dropdown */}
          <div className="relative download-dropdown-container">
            <button onClick={() => setDownloadOpen(!downloadOpen)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm text-white font-medium transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20">
              <Download className="w-4 h-4" /> {rl.downloadTitle}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${downloadOpen ? 'rotate-180' : ''}`} />
            </button>
            {downloadOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700/50 rounded-xl shadow-xl z-20 overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-slate-700/30">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{reportLang === 'cn' ? '下载格式' : 'Download Format'} ({reportLang === 'cn' ? '中文' : 'English'})</p>
                </div>
                <button onClick={() => handleDownload('html')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all">
                  <FileText className="w-4 h-4 text-cyan-400" /> {rl.downloadHTML} <span className="text-[10px] text-slate-500 ml-auto">{reportLang === 'cn' ? '推荐·支持中文' : 'Recommended'}</span>
                </button>
                <button onClick={() => handleDownload('pdf')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all">
                  <Download className="w-4 h-4 text-red-400" /> {rl.downloadPDF} <span className="text-[10px] text-slate-500 ml-auto">{reportLang === 'cn' ? '英文' : 'English only'}</span>
                </button>
                <button onClick={() => handleDownload('json')} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition-all">
                  <Code2 className="w-4 h-4 text-amber-400" /> {rl.downloadJSON}
                </button>
              </motion.div>
            )}
          </div>
          {/* Print */}
          <button onClick={() => window.print()} className="px-4 py-2 bg-slate-800 border border-slate-700/50 rounded-lg text-sm text-slate-300 hover:text-white transition-all flex items-center gap-2">
            <FileText className="w-4 h-4" /> {rl.print}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-900/50 border border-slate-700/50 rounded-xl p-1">
        {(['overview', 'vulnerabilities', 'report'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === tab ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'overview' ? <LayoutDashboard className="w-4 h-4" /> : tab === 'vulnerabilities' ? <Bug className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            {tab === 'overview' ? rl.overview : tab === 'vulnerabilities' ? rl.vulnerabilityDetails : rl.fullReport}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Recharts PieChart */}
              <div className="w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={severityChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {severityChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <RiskIcon level={summary.overallRisk} size="md" />
                  <div>
                    <p className="text-sm text-slate-400">{rl.overallRisk}</p>
                    <p className="text-2xl font-bold text-white">{summary.overallRisk}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {severityChartData.map((item) => (
                    <div key={item.name} className="rounded-xl p-3 text-center" style={{ backgroundColor: `${item.fill}15` }}>
                      <div className="text-xl font-bold" style={{ color: item.fill }}>{item.value}</div>
                      <div className="text-[10px] text-slate-400">{item.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Code2 className="w-5 h-5 text-cyan-400" /> {rl.contractInfo}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs text-slate-500">{rl.contractName}</label><p className="text-sm text-white">{report.contractInfo.name}</p></div>
              {(report.contractInfo.sourceOrigin || report.contractInfo.sourceType) && (
                <div><label className="text-xs text-slate-500">{rl.sourceType}</label><div className="mt-0.5"><SourceTypeBadge origin={report.contractInfo.sourceOrigin} type={report.contractInfo.sourceType} /></div></div>
              )}
              <div><label className="text-xs text-slate-500">{rl.blockchain}</label><div className="mt-0.5"><ChainBadge chain={report.contractInfo.chain} /></div></div>
              <div className="col-span-2"><label className="text-xs text-slate-500">{rl.contractAddress}</label><p className="text-sm text-white font-mono truncate">{report.contractInfo.address}</p></div>
              <div><label className="text-xs text-slate-500">{rl.analysisDate}</label><p className="text-sm text-white">{new Date(report.createdAt).toLocaleString(reportLang === 'cn' ? 'zh-CN' : 'en-US')}</p></div>
              <div><label className="text-xs text-slate-500">{rl.codeQualityScore}</label><p className="text-sm text-white">{analysisResult?.codeQuality?.overallScore || 'N/A'}</p></div>
            </div>
          </div>

          {analysisResult?.recommendations && analysisResult.recommendations.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Wrench className="w-5 h-5 text-emerald-400" /> {rl.fixRecommendations}</h3>
              <div className="space-y-2">
                {analysisResult.recommendations.map((rec, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-slate-300">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vulnerabilities Tab */}
      {activeTab === 'vulnerabilities' && (
        <div className="space-y-4">
          {analysisResult?.vulnerabilities?.map((vuln, i) => {
            const isExpanded = expandedVulns.has(vuln.id || String(i));
            return (
              <motion.div key={vuln.id || i} layout className="bg-slate-900/50 border border-slate-700/50 rounded-2xl overflow-hidden">
                <div className="p-5 cursor-pointer flex items-center justify-between hover:bg-slate-800/30 transition-colors" onClick={() => toggleVuln(vuln.id || String(i))}>
                  <div className="flex items-center gap-3">
                    <SeverityBadge severity={vuln.severity} />
                    <h3 className="text-base font-semibold text-white">{vuln.title}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-500">{vuln.patternId}</span>
                    <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    </motion.div>
                  </div>
                </div>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-5 pb-5 border-t border-slate-700/30 pt-4 space-y-3">
                        <div><label className="text-xs text-slate-500">{rl.vulnerabilityDescription}</label><p className="text-sm text-slate-300 mt-1">{vuln.description}</p></div>
                        {vuln.location && (
                          <div className="bg-slate-800/50 rounded-lg p-3">
                            <label className="text-xs text-slate-500">{rl.codeLocation}</label>
                            <p className="text-sm text-slate-300">{vuln.location.fileName} · {reportLang === 'cn' ? '行' : 'L'}{vuln.location.lineStart}-{vuln.location.lineEnd} · {reportLang === 'cn' ? '函数' : 'fn'} {vuln.location.functionName}</p>
                            {vuln.location.codeSnippet && (
                              <div className="mt-2 relative">
                                <pre className="text-xs text-emerald-400 bg-slate-900 p-3 rounded-lg overflow-x-auto font-mono border border-slate-700/30">
                                  <code>{vuln.location.codeSnippet}</code>
                                </pre>
                                <button onClick={() => copyCode(vuln.location.codeSnippet, vuln.id || String(i))} className="absolute top-2 right-2 px-2 py-1 bg-slate-800 border border-slate-600/50 rounded text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1">
                                  {copiedId === (vuln.id || String(i)) ? <><Check className="w-3 h-3" /> 已复制</> : <><Copy className="w-3 h-3" /> 复制</>}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <div><label className="text-xs text-slate-500">{rl.attackVector}</label><p className="text-sm text-slate-300 mt-1">{vuln.attackVector}</p></div>
                        <div><label className="text-xs text-slate-500">{rl.impact}</label><p className="text-sm text-slate-300 mt-1">{vuln.impact}</p></div>
                        {vuln.matchedCases && vuln.matchedCases.length > 0 && (
                          <div><label className="text-xs text-slate-500">{rl.matchedCases}</label>
                            <div className="mt-1 space-y-1">
                              {vuln.matchedCases.map((mc, j) => (
                                <div key={j} className="flex items-center gap-2 text-sm">
                                  <span className="text-cyan-400">{mc.caseId}</span>
                                  <span className="text-slate-400">{reportLang === 'cn' ? '相似度' : 'Similarity'} {(mc.similarity * 100).toFixed(0)}%</span>
                                  <span className="text-slate-500">- {mc.matchReason}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div><label className="text-xs text-slate-500">{rl.recommendation}</label><p className="text-sm text-emerald-300 mt-1">{vuln.recommendation}</p></div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          {(!analysisResult?.vulnerabilities || analysisResult.vulnerabilities.length === 0) && (
            <div className="text-center py-16"><ShieldCheck className="w-12 h-12 text-emerald-500/50 mx-auto mb-4" /><p className="text-slate-400">{rl.noVulnerabilities}</p></div>
          )}
        </div>
      )}

      {/* Report Tab */}
      {activeTab === 'report' && (
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="prose prose-invert prose-sm max-w-none">
            {renderMarkdown(report.reportMarkdown || rl.reportEmpty)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// HISTORY PAGE
// ============================================
function HistoryPage({ onViewReport }: { onViewReport: (id: string) => void }) {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'risk' | 'name'>('date');
  const [batchAuditTaskId, setBatchAuditTaskId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchCurrentCase, setBatchCurrentCase] = useState('');
  const [batchTotalCases, setBatchTotalCases] = useState(0);
  const [batchCompletedCases, setBatchCompletedCases] = useState(0);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiCall('/api/history');
      setRecords(data.records || []);
    } catch { toast.error('加载历史记录失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此分析记录？')) return;
    try { await apiCall(`/api/history?id=${id}`, { method: 'DELETE' }); toast.success('删除成功'); loadHistory(); }
    catch { toast.error('删除失败'); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除 ${selectedIds.size} 条记录？`)) return;
    try {
      for (const id of selectedIds) { await apiCall(`/api/history?id=${id}`, { method: 'DELETE' }); }
      toast.success(`已删除 ${selectedIds.size} 条记录`);
      setSelectedIds(new Set());
      loadHistory();
    } catch { toast.error('批量删除失败'); }
  };

  const handleBatchAudit = async () => {
    try {
      const result = await apiCall('/api/batch-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      setBatchAuditTaskId(result.taskId);
      setBatchStatus('running');
      toast.success('批量审计任务已启动');
      
      // Poll for progress
      const poll = async () => {
        if (!batchAuditTaskId && !result.taskId) return;
        try {
          const status = await apiCall(`/api/batch-audit?taskId=${result.taskId}`);
          setBatchProgress(status.progress as number || 0);
          setBatchCurrentCase(status.currentCase as string || '');
          setBatchTotalCases(status.totalCases as number || 0);
          setBatchCompletedCases(status.completedCases as number || 0);
          if (status.status === 'completed') {
            setBatchStatus('completed');
            toast.success(`批量审计完成! ${status.completedCases} 成功, ${status.failedCases} 失败`);
            loadHistory();
            return;
          }
          if (status.status === 'failed') {
            setBatchStatus('failed');
            toast.error('批量审计失败');
            return;
          }
          if (status.status === 'running' || status.status === 'pending') {
            setTimeout(poll, 3000);
          }
        } catch {
          setTimeout(poll, 3000);
        }
      };
      setTimeout(poll, 2000);
    } catch {
      toast.error('启动批量审计失败');
    }
  };

  const filteredRecords = useMemo(() => {
    let result = riskFilter ? records.filter(r => r.riskLevel === riskFilter) : records;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      result = result.filter(r => r.contractName.toLowerCase().includes(q) || r.blockchain.toLowerCase().includes(q));
    }
    return result;
  }, [records, riskFilter, searchFilter]);

  const summaryStats = useMemo(() => ({
    total: records.length,
    Critical: records.filter(r => r.riskLevel === 'Critical').length,
    High: records.filter(r => r.riskLevel === 'High').length,
    Medium: records.filter(r => r.riskLevel === 'Medium').length,
    Low: records.filter(r => r.riskLevel === 'Low').length,
  }), [records]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">分析历史</h1>
        <p className="text-slate-400 text-sm mt-1">查看和管理历史分析记录</p>
      </div>

      {/* Summary Stats */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-white">{summaryStats.total}</div><div className="text-[10px] text-slate-400">总计</div>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-red-400">{summaryStats.Critical}</div><div className="text-[10px] text-slate-400">Critical</div>
          </div>
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-orange-400">{summaryStats.High}</div><div className="text-[10px] text-slate-400">High</div>
          </div>
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-yellow-400">{summaryStats.Medium}</div><div className="text-[10px] text-slate-400">Medium</div>
          </div>
          <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-sky-400">{summaryStats.Low}</div><div className="text-[10px] text-slate-400">Low</div>
          </div>
        </div>
      )}

      {/* Batch Audit Section */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" /> 案例库深度审计
            </h3>
            <p className="text-xs text-slate-400 mt-1">对案例库中所有案例进行深度审计分析，自动尝试获取源码，无法获取时基于案例元数据推断漏洞</p>
          </div>
          <button
            onClick={handleBatchAudit}
            disabled={batchStatus === 'running'}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
              batchStatus === 'running'
                ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
            }`}
          >
            {batchStatus === 'running' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> 审计中...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" /> 🔍 案例库全量审计
              </>
            )}
          </button>
        </div>
        
        {batchStatus === 'running' && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">进度: {batchCompletedCases}/{batchTotalCases} 案例</span>
              <span className="text-emerald-400">{batchProgress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${batchProgress}%` }} />
            </div>
            {batchCurrentCase && (
              <p className="text-xs text-slate-500">正在分析: {batchCurrentCase}</p>
            )}
          </div>
        )}
        
        {batchStatus === 'completed' && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle className="w-4 h-4" /> 批量审计已完成，分析结果已添加到历史记录
          </div>
        )}
        
        {batchStatus === 'failed' && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
            <XCircle className="w-4 h-4" /> 批量审计失败，请重试
          </div>
        )}
      </motion.div>

      {/* Filters */}
      {!loading && records.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="搜索合约名称或链..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
            <option value="">全部风险等级</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          {selectedIds.size > 0 && (
            <button onClick={handleBulkDelete} className="px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-all flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> 删除选中 ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-400 animate-spin" /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-20">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ duration: 0.3 }}>
            <div className="w-20 h-20 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-slate-600" />
            </div>
          </motion.div>
          <p className="text-slate-400 font-medium">暂无分析记录</p>
          <p className="text-slate-500 text-sm mt-2">开始一次合约分析，结果将保存在这里</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-16 text-slate-400">没有匹配的记录</div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record) => (
            <div key={record.id} className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600/50 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox" checked={selectedIds.has(record.id)} onChange={() => {
                      setSelectedIds(prev => { const next = new Set(prev); if (next.has(record.id)) next.delete(record.id); else next.add(record.id); return next; });
                    }}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
                  />
                  <RiskIcon level={record.riskLevel} size="sm" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">{record.contractName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <ChainBadge chain={record.blockchain} />
                      <SourceTypeBadge origin={(record as any).sourceOrigin} type={(record as any).sourceType} />
                      <span className="text-xs text-slate-500">{record.vulnerabilityCount} 个漏洞</span>
                      <SeverityBadge severity={record.riskLevel} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{new Date(record.analysisTime).toLocaleString('zh-CN')}</span>
                  <button onClick={() => onViewReport(record.id)} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-all flex items-center gap-1">
                    <Eye className="w-3 h-3" /> 查看报告
                  </button>
                  <button onClick={() => handleDelete(record.id)} className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-all flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> 删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// SETTINGS PAGE
// ============================================
function SettingsPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [settings, setSettings] = useState({
    etherscanApiKey: '', bscscanApiKey: '', arbiscanApiKey: '', basescanApiKey: '',
    llmModel: 'qwen3.5-plus', hasPassword: false,
    apiKeysStatus: { ethereum: false, bsc: false, arbitrum: false, base: false, unified: false, opbnb: false },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [activeTab, setActiveTab] = useState<'apikeys' | 'password' | 'llm'>('apikeys');

  useEffect(() => {
    apiCall('/api/settings')
      .then((data) => setSettings(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSaveApiKeys = async () => {
    setSaving('apikeys');
    try {
      await apiCall('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateApiKeys',
          etherscanApiKey: settings.etherscanApiKey,
          bscscanApiKey: settings.bscscanApiKey,
          arbiscanApiKey: settings.arbiscanApiKey,
          basescanApiKey: settings.basescanApiKey,
        }),
      });
      toast.success('API Key 配置已保存');
      // Reload to get masked values
      const data = await apiCall('/api/settings');
      setSettings(data);
    } catch (err: any) {
      toast.error(err.message || '保存失败');
    } finally {
      setSaving(null);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    if (passwordForm.newPassword.length < 4) {
      toast.error('新密码至少4个字符');
      return;
    }
    setSaving('password');
    try {
      await apiCall('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'changePassword',
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      toast.success('密码已更新');
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err.message || '密码修改失败');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveLlmModel = async () => {
    setSaving('llm');
    try {
      await apiCall('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateLlmModel', llmModel: settings.llmModel }),
      });
      toast.success('LLM 模型配置已保存');
      const data = await apiCall('/api/settings');
      setSettings(data);
    } catch (err: any) {
      toast.error(err.message || '保存失败');
    } finally {
      setSaving(null);
    }
  };

  const apiKeyFields = [
    { key: 'etherscanApiKey' as const, label: 'Etherscan', chain: 'ethereum', icon: <Globe2 className="w-4 h-4 text-sky-400" />, url: 'https://etherscan.io/myapikey' },
    { key: 'bscscanApiKey' as const, label: 'BscScan/opBNB', chain: 'opbnb', icon: <Globe2 className="w-4 h-4 text-yellow-400" />, url: 'https://bscscan.com/myapikey' },
    { key: 'arbiscanApiKey' as const, label: 'Arbiscan', chain: 'arbitrum', icon: <Globe2 className="w-4 h-4 text-sky-300" />, url: 'https://arbiscan.io/myapikey' },
    { key: 'basescanApiKey' as const, label: 'BaseScan', chain: 'base', icon: <Globe2 className="w-4 h-4 text-blue-300" />, url: 'https://basescan.org/myapikey' },
  ];

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {[0,1,2].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }

  const tabs = [
    { id: 'apikeys' as const, label: '区块链 API Key', icon: <Key className="w-4 h-4" /> },
    { id: 'password' as const, label: '密码管理', icon: <Shield className="w-4 h-4" /> },
    { id: 'llm' as const, label: 'LLM 模型', icon: <Code2 className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Page Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/50 flex items-center justify-center">
            <SettingsCog className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">系统设置</h1>
            <p className="text-sm text-slate-400">管理 API Key、密码和模型配置</p>
          </div>
        </div>
      </motion.div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-900/50 border border-slate-700/50 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* API Keys Tab */}
      {activeTab === 'apikeys' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* V2 API Notice */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Globe2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">🔧 Etherscan V2 统一端点</h3>
                <p className="text-xs text-slate-400 mb-2">V2 API 使用统一端点 api.etherscan.io/v2/api，只需一个 API Key 即可访问所有链。</p>
                <p className="text-xs text-slate-400">
                  支持: Ethereum (chainid=1), BSC (chainid=56), Arbitrum (chainid=42161), Base (chainid=8453), opBNB (chainid=204), Sei, Hyperliquid
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" /> 区块链浏览器 API Key
              </h3>
              <span className="text-xs text-slate-500">用于自动获取合约源码</span>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              配置各区块链浏览器的 API Key 后，可以在"合约分析"页面直接输入合约地址获取代码。
              未配置的链仍可通过手动上传文件方式分析。
            </p>

            <div className="space-y-5">
              {apiKeyFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      {field.icon}
                      {field.label} API Key
                    </label>
                    <div className="flex items-center gap-2">
                      {settings.apiKeysStatus?.[field.chain as keyof typeof settings.apiKeysStatus] ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle className="w-3 h-3" /> 已配置
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <XCircle className="w-3 h-3" /> 未配置
                        </span>
                      )}
                      <a
                        href={field.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      >
                        申请 <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  <input
                    type="password"
                    value={settings[field.key]}
                    onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                    placeholder={`输入 ${field.label} API Key`}
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveApiKeys}
                disabled={saving === 'apikeys'}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium rounded-xl transition-all text-sm"
              >
                {saving === 'apikeys' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存 API Key
              </button>
            </div>
          </div>

          {/* Environment hint */}
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-400 space-y-1">
                <p>💡 API Key 优先级：<span className="text-white">设置页面</span> &gt; <span className="text-white">.env 环境变量</span></p>
                <p>也可在 <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-mono">.env</code> 文件中直接配置：ETHERSCAN_API_KEY, BSCSCAN_API_KEY, ARBISCAN_API_KEY, BASESCAN_API_KEY</p>
                <p>Etherscan V2 统一端点只需一个 API Key (ETHERSCAN_API_KEY) 即可访问所有链</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Password Tab */}
      {activeTab === 'password' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" /> 修改登录密码
              </h3>
              {settings.hasPassword && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle className="w-3 h-3" /> 密码已设置
                </span>
              )}
            </div>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">当前密码</label>
                <input
                  type="password"
                  value={passwordForm.oldPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                  placeholder="请输入当前密码"
                  className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">新密码</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="请输入新密码（至少4个字符）"
                  className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">确认新密码</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="请再次输入新密码"
                  className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                />
                {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                  <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> 两次输入的密码不一致
                  </p>
                )}
                {passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword && (
                  <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> 密码一致
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleChangePassword}
                disabled={saving === 'password' || !passwordForm.oldPassword || !passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirmPassword}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all text-sm"
              >
                {saving === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                更新密码
              </button>
            </div>
          </div>

          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-400 space-y-1">
                <p>💡 密码修改后立即生效，无需重启服务</p>
                <p>密码存储在 <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-mono">.storage/settings.json</code> 中（bcrypt加密），优先级高于 <code className="bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-mono">.env</code> 中的 USER_PASSWORD_HASH</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* LLM Model Tab */}
      {activeTab === 'llm' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" /> LLM 模型配置
              </h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              配置用于漏洞分析和报告生成的 AI 模型。Z.ai 平台自动管理 API Key；外部部署请设置 OPENAI_API_KEY 环境变量。
            </p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">模型名称</label>
                <input
                  type="text"
                  value={settings.llmModel}
                  onChange={(e) => setSettings({ ...settings, llmModel: e.target.value })}
                  placeholder="例如: qwen3.5-plus"
                  className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {['qwen3.5-plus', 'qwen-plus', 'qwen-turbo', 'qwen-max'].map((model) => (
                  <button
                    key={model}
                    onClick={() => setSettings({ ...settings, llmModel: model })}
                    className={`px-3 py-2 rounded-lg text-xs font-mono transition-all border ${
                      settings.llmModel === model
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800/30 text-slate-400 border-slate-700/30 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveLlmModel}
                disabled={saving === 'llm'}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium rounded-xl transition-all text-sm"
              >
                {saving === 'llm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存模型配置
              </button>
            </div>
          </div>

          {/* LLM Pipeline Info */}
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" /> LLM 调用链路
            </h3>
            <div className="space-y-3">
              {[
                { step: '1', label: '合约代码提交', desc: '用户上传Solidity代码或输入合约地址', icon: <Upload className="w-3.5 h-3.5" /> },
                { step: '2', label: '漏洞分析 Agent', desc: '使用Vulnerability Agent进行深度分析', icon: <Bug className="w-3.5 h-3.5" /> },
                { step: '3', label: '报告生成 Agent', desc: '使用Report Agent生成专业审计报告', icon: <FileText className="w-3.5 h-3.5" /> },
                { step: '4', label: 'PDF/JSON导出', desc: '将报告导出为PDF或JSON格式', icon: <Download className="w-3.5 h-3.5" /> },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xs text-emerald-400 shrink-0">
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ============================================
// FOOTER
// ============================================
function Footer() {
  return (
    <footer className="bg-slate-900/50 border-t border-slate-700/50 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Shield className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-xs text-slate-500">DeFi Price Manipulation Analyzer v3.3</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-emerald-400" /> Online</span>
            <span>·</span>
            <span>Etherscan V2</span>
            <span>·</span>
            <span>7 Chains</span>
            <span>·</span>
            <span>8 Vulnerability Patterns</span>
            <span>·</span>
            <span>Batch Audit</span>
            <span>·</span>
            <span>Bilingual Reports</span>
            <span>·</span>
            <span>AI-Powered</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Keyboard className="w-3 h-3" />
            <span>快捷键: 1-5 切换页面 · Esc 返回</span>
          </div>
        </div>
        <div className="mt-3 text-center text-[10px] text-slate-600">
          &copy; 2026 DeFi Analyzer. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

// ============================================
// MAIN APP
// ============================================
export default function DeFiAnalyzerApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [reportId, setReportId] = useState<string | null>(null);
  const [analysisCount, setAnalysisCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      try { await apiCall('/api/init', { method: 'POST' }); } catch {}
      try {
        const data = await apiCall('/api/auth/check');
        setAuthenticated(data.authenticated);
      } catch { setAuthenticated(false); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  useEffect(() => {
    if (authenticated) {
      apiCall('/api/history').then((data) => setAnalysisCount(data.records?.length || 0)).catch(() => {});
    }
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const pageKeys: Record<string, Page> = { '1': 'dashboard', '2': 'cases', '3': 'patterns', '4': 'analyze', '5': 'history' };
      if (pageKeys[e.key]) { e.preventDefault(); handleNavigate(pageKeys[e.key]); }
      if (e.key === 'Escape') { e.preventDefault(); handleNavigate('dashboard'); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [authenticated]);

  const handleLogout = async () => {
    try { await apiCall('/api/auth/logout', { method: 'POST' }); } catch {}
    setAuthenticated(false);
  };

  const handleViewReport = (id: string) => { setReportId(id); setCurrentPage('report'); };

  const handleNavigate = (page: Page) => { setCurrentPage(page); if (page !== 'report') setReportId(null); };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">加载中...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage onNavigate={handleNavigate} onViewReport={handleViewReport} />;
      case 'cases': return <CasesPage />;
      case 'patterns': return <PatternsPage />;
      case 'analyze': return <AnalyzePage onViewReport={handleViewReport} />;
      case 'report': return reportId ? <ReportPage reportId={reportId} onBack={() => handleNavigate('history')} /> : null;
      case 'history': return <HistoryPage onViewReport={handleViewReport} />;
      case 'settings': return <SettingsPage onNavigate={handleNavigate} />;
      default: return <DashboardPage onNavigate={handleNavigate} onViewReport={handleViewReport} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Header currentPage={currentPage} onNavigate={handleNavigate} onLogout={handleLogout} analysisCount={analysisCount} />
      <main className="flex-1">
        <PageTransition pageKey={currentPage}>
          {renderPage()}
        </PageTransition>
      </main>
      <Footer />
    </div>
  );
}
