# Agent 升级详细技术规格

> 本文档为 DeFi Price Manipulation Analyzer 从 Workflow 升级为 Agent 系统的详细技术规格，由 `@docs/agent-upgrade-spec.md` 引用加载。

---

## 一、BaseAgent 抽象类规格

### OTAU 循环协议

所有 Agent 必须实现 **Observe → Think → Act → Update** 迭代循环：

```
┌─────────────────────────────────────────────────┐
│                   run()                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ observe() │→│  think()  │→│   act()   │     │
│  └──────────┘  └──────────┘  └──────────┘      │
│       ↑              │             │             │
│       │         ┌──────────┐      │             │
│       └─────────│ update() │←─────┘             │
│                 └──────────┘                    │
│                      │                           │
│               shouldTerminate?                   │
│              ┌───No───┘ └──Yes──→ compileResult  │
└─────────────────────────────────────────────────┘
```

### 类型系统

```typescript
// src/lib/agents/core/types.ts

export interface AgentConfig {
  name: string;
  description: string;
  version: string;
  maxIterations: number;   // 建议范围 3-10
  timeout: number;          // 毫秒，建议 60000-120000
  tools: Tool[];
  memory?: MemorySystem;
  llmClient?: LLMClient;
  verbose?: boolean;
}

export interface AgentState {
  id: string;
  iteration: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  observations: Observation[];
  thoughts: Thought[];
  actions: Action[];
  results: Result[];
  memories: Memory[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Observation {
  type: 'perception' | 'tool_result' | 'memory' | 'user_input';
  content: unknown;
  timestamp: number;
  source?: string;
}

export interface Thought {
  reasoning: string;
  action: ActionType;
  confidence: number;    // 0.0 - 1.0
  alternatives?: Action[];
  timestamp: number;
}

export interface Action {
  type: ActionType;
  params: Record<string, unknown>;
  target?: string;
}

export type ActionType =
  | 'analyze'    // 执行分析逻辑
  | 'search'     // 搜索代码/数据
  | 'fetch'      // 获取外部数据
  | 'retrieve'   // 检索记忆
  | 'evaluate'   // 评估结果
  | 'reconstruct'// 重建攻击场景
  | 'report'     // 生成报告
  | 'finalize';  // 终止迭代

export interface Result {
  action: Action;
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
  timestamp: number;
}

export interface AgentResult {
  agentId: string;
  status: AgentState['status'];
  data: unknown;
  iterations: number;
  duration: number;
  confidence: number;
}
```

### BaseAgent 抽象类

```typescript
// src/lib/agents/core/base-agent.ts
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected state: AgentState;
  protected tools: ToolRegistry;
  protected memory: MemorySystem | null;
  protected llm: LLMClient;

  constructor(config: AgentConfig) { /* 初始化状态、工具、记忆、LLM */ }

  // 五个必须实现的抽象方法
  abstract observe(): Promise<Observation>;
  abstract think(observation: Observation): Promise<Thought>;
  abstract act(thought: Thought): Promise<Action>;
  abstract update(result: Result): Promise<void>;
  abstract compileResult(): AgentResult;

  // 可覆写的终止条件
  protected shouldTerminate(result: Result): boolean {
    return this.state.iteration >= this.config.maxIterations
      || (result.action.type === 'finalize' && result.success);
  }

  // 主运行循环
  async run(): Promise<AgentResult> { /* OTAU 循环 */ }
}
```

---

## 二、工具注册中心规格

### ToolDefinition 接口

```typescript
// src/lib/agents/core/tools/types.ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (params: unknown, context: ToolContext) => Promise<ToolResult>;
  retryPolicy?: RetryPolicy;
  cachePolicy?: CachePolicy;
  timeout?: number;
}

export interface ToolContext {
  agentId: string;
  iteration: number;
  correlationId?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
  cached?: boolean;
}

export interface RetryPolicy {
  maxRetries: number;        // 默认 3
  backoffMultiplier: number; // 默认 2
  initialDelayMs: number;    // 默认 1000
}

export interface CachePolicy {
  enabled: boolean;
  ttlMs: number;  // 默认 3600000 (1小时)
}
```

### 内置工具列表

| 工具名 | 用途 | 使用 Agent |
|--------|------|-----------|
| `source_fetcher` | 获取合约源码（Etherscan V2 → Sourcify → Heimdall） | VulnerabilityAgent |
| `pattern_searcher` | 搜索漏洞模式匹配 | VulnerabilityAgent |
| `case_retriever` | 检索历史攻击案例 | VulnerabilityAgent, Reconstructor |
| `protocol_detector` | 识别协议类型 | Orchestrator |
| `context_builder` | 构建分析上下文 | VulnerabilityAgent |
| `attack_reconstructor` | 重建攻击叙事 | Reconstructor |
| `confidence_calibrator` | 校准置信度 | Calibrator |
| `report_generator` | 生成审计报告 | ReportAgent |

---

## 三、记忆系统规格

### 三层架构

| 层级 | 类型 | 生命周期 | 存储位置 | 用途 |
|------|------|---------|---------|------|
| Working | 工作记忆 | 单次分析会话 | `.storage/memory/working/` | 当前分析的临时状态 |
| Episodic | 情景记忆 | 永久 | `.storage/memory/episodic/` | 历史分析案例经验 |
| Semantic | 语义记忆 | 永久 | `.storage/memory/semantic/` | 领域知识（向量检索） |

### MemoryRecord 结构

```typescript
export interface MemoryRecord {
  id: string;
  type: 'working' | 'episodic' | 'semantic';
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  timestamp: number;
  accessCount: number;
  importance: number;  // 0.0 - 1.0
}
```

---

## 四、协议类型识别规格

### ProtocolType 枚举

```
dex | amm | lending | perp | yield_aggregator | bridge | stablecoin | unknown
```

### 识别方法

1. **代码模式匹配**（权重 70%）：关键字 + 结构特征正则
2. **函数签名分析**（权重 30%）：function name 提取与分类映射
3. **综合评分**：加权融合，阈值 > 0.5 确认类型

### 输出：ProtocolClassification

```typescript
export interface ProtocolClassification {
  type: ProtocolType;
  manipulationTarget: ManipulationTarget;
  confidence: number;
  indicators: { name: string; weight: number; source: string }[];
  priorityVulnerabilities: string[];  // 如 ['VP001', 'VP005', 'VP006']
  criticalFunctions: string[];
  riskProfile: {
    manipulationRisk: 'low' | 'medium' | 'high' | 'critical';
    flashloanExposure: boolean;
    oracleDependency: boolean;
    liquiditySensitivity: 'low' | 'medium' | 'high';
  };
}
```

---

## 五、攻击重建引擎规格

### PriceManipulationAttack 结构

每个重建的攻击包含：
- **attackType**: VP001-VP008 之一
- **steps**: 攻击步骤序列（preparation → execution → manipulation → exploitation → profit → cleanup）
- **fundFlow**: 资金流向图
- **feasibility**: 可行性评估（技术难度 + 经济收益 + MEV 依赖度 → 综合评分）
- **defenses**: 三级防御建议（immediate / shortTerm / longTerm）
- **historicalAnalogy**: 历史案例类比

### 可行性评分算法

```
overallScore = techScore × 0.4 + economicScore × 0.6

techScore:
  difficulty=low → 90, medium → 70, high → 50

economicScore:
  profitMargin > 2.0 → 90, > 1.0 → 70, ≤ 1.0 → 50
```

---

## 六、置信度校准规格

### 校准维度

| 维度 | 权重 | 说明 |
|------|------|------|
| 源码可用性 | 25% | 有完整源码 vs 仅上下文推断 |
| 模式匹配度 | 25% | 与已知漏洞模式的匹配程度 |
| 历史案例支持 | 20% | 相似历史案例的存在与相似度 |
| 跨验证一致性 | 15% | 多轮迭代结果的一致性 |
| 经济可行性 | 15% | 攻击经济模型是否成立 |

### 校准公式

```
calibratedConfidence = Σ(weight_i × dimension_score_i) × adjustmentFactor

adjustmentFactor 考虑：
- 单次迭代发现：0.7
- 2-3次迭代一致：0.85
- 4+次迭代一致：0.95
- 存在矛盾发现：0.5
```

---

## 七、协调调度器规格

### AuditOrchestrator 流程

```
输入: (contractCode, address, blockchain)
  │
  ├─→ ProtocolTypeDetector.detect()  ─→ ProtocolClassification
  │
  ├─→ ContextManager.build(classification)  ─→ AnalysisContext
  │
  ├─→ VulnerabilityAnalysisAgent.run(context)  ─→ Vulnerability[]
  │
  ├─→ PriceManipulationReconstructor.reconstruct(vulns, classification)  ─→ Attack[]
  │
  ├─→ ConfidenceCalibrator.calibrate(vulns, attacks)  ─→ CalibratedResult
  │
  └─→ ReportAgent.generate(calibratedResult)  ─→ AuditReport
```

### 并行/串行策略

- **可并行**：ProtocolTypeDetector + ContextManager（无依赖）
- **必须串行**：VulnerabilityAgent → Reconstructor → Calibrator → ReportAgent
- **超时保护**：每个 Agent 有独立超时，Orchestrator 总超时 = Σ(agent timeouts) × 1.2
