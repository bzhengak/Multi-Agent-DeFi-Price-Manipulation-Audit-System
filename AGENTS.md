# DeFi Price Manipulation Analyzer — Agent 系统升级指南

> 本文件是 opencode 中 GLM-5.1 模型的项目级指令文件，指导 AI 代理在 Workflow→Agent 架构升级开发中遵循统一的技术规范、架构约束和工作流程。

---

## 项目概述

本项目是将 **DeFi 价格操纵分析审计系统** 从固定流水线（Workflow）升级为智能多 Agent 协作系统的工程。当前系统采用线性 3 阶段流水线（源码获取→漏洞分析→报告生成），升级后将具备动态决策、深度推理、攻击还原和风险量化能力，聚焦于 **19 种价格操纵攻击模式 (6 大类别)** 的检测与分析。

### 核心架构转变

| 维度 | 当前 Workflow | 升级目标 Agent |
|------|--------------|---------------|
| 执行模式 | 固定3阶段线性流水线 | Observe-Think-Act-Update 迭代循环 |
| 决策能力 | 无，按预定义顺序执行 | 动态决策，根据中间结果调整策略 |
| 分析深度 | 单轮分析，无迭代 | 多轮迭代，逐步深化分析结论 |
| 漏洞关联 | 孤立报告，无关联 | 攻击重建，整合为完整攻击叙事 |
| 风险评估 | 静态严重度标签 | 置信度校准，多维量化评估 |

---

## 技术栈规范

### 核心技术栈（已有）
- **框架**：Next.js 16+（App Router, RSC）
- **语言**：TypeScript 5+（strict 模式，逐步启用 noImplicitAny）
- **运行时**：Bun（开发）/ Node.js 20+（生产）
- **样式**：Tailwind CSS 4 + shadcn/ui（new-york 风格）
- **LLM 接入**：z-ai-web-dev-sdk（主）/ OpenAI SDK（备）
- **认证**：jose（JWT）+ bcryptjs
- **存储**：本地文件系统 `.storage/`（当前）→ 结构化存储（升级中）
- **部署**：Docker 多阶段构建 + Render.com/Railway

### 新增技术栈（Agent 升级引入）
- **Agent 框架**：自研 BaseAgent 抽象类（Observe-Think-Act-Update 循环）
- **工具注册**：ToolRegistry 工具管理中心（含重试、缓存策略）
- **记忆系统**：MemorySystem（工作记忆/情景记忆/语义记忆三层架构）
- **协议识别**：ProtocolTypeDetector（8种DeFi协议自动识别）
- **攻击重建**：PriceManipulationReconstructor（19种攻击模式攻击叙事生成）
- **置信度校准**：ConfidenceCalibrator（多维置信度评估与校准）

---

## 升级阶段与当前状态

### 阶段一：Agent 基础设施（Phase 1 - Foundation）
- [ ] 实现 BaseAgent 抽象类（Observe-Think-Act-Update 循环）
- [ ] 实现 AgentConfig / AgentState 类型系统（`src/lib/agents/core/types.ts`）
- [ ] 实现 ToolRegistry 工具注册中心（含重试策略、缓存策略）
- [ ] 实现 MemorySystem 记忆系统（working/episodic/semantic 三层）
- [ ] 实现 LLMClient 统一 LLM 调用封装

### 阶段二：核心分析引擎（Phase 2 - Analysis Engine）
- [ ] 实现 ProtocolTypeDetector 协议类型识别引擎
- [ ] 实现 ContextManager 针对性分析上下文构建
- [ ] 实现 VulnerabilityAnalysisAgent 多轮迭代漏洞分析
- [ ] 实现 PromptOptimizer 提示词优化模块
- [ ] 集成现有漏洞模式库（OD-01~CR-04, 6大类21种模式）

- [ ] 实现 VP001-VP008 八种攻击模式的重建逻辑
- [ ] 实现 ConfidenceCalibrator 置信度校准机制
- [ ] 实现攻击可行性评估（技术/经济/MEV依赖度）
- [ ] 实现历史案例类比匹配

### 阶段四：协调与集成（Phase 4 - Orchestration & Integration）
- [ ] 实现 AuditOrchestrator 多 Agent 协调调度器
- [ ] 实现现有 API 路由与新 Agent 系统的集成
- [ ] 实现前端 UI 适配（分析进度、中间结果展示）
- [ ] 实现报告生成 Agent（利用攻击重建结果）
- [ ] 端到端测试与性能基准

### 阶段五：优化与部署（Phase 5 - Optimization & Deployment）
- [ ] 性能优化（Token 消耗、分析延迟、缓存策略）
- [ ] 全面测试覆盖（单元/集成/E2E）
- [ ] 安全审计（API密钥保护、输入验证、速率限制）
- [ ] 文档与部署更新

---

## 项目目录结构

```
src/
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── analyze/route.ts          # 单合约分析（升级：调用 Agent 系统）
│   │   ├── batch-audit/route.ts      # 批量审计（升级：Agent 并行调度）
│   │   ├── auth/                     # 认证端点（保持不变）
│   │   ├── cases/route.ts            # 案例库 CRUD（保持不变）
│   │   ├── reports/route.ts          # 报告获取（升级：增强报告格式）
│   │   ├── history/route.ts          # 分析历史（保持不变）
│   │   ├── settings/route.ts         # 设置管理（保持不变）
│   │   └── vulnerabilities/route.ts  # 漏洞模式端点（保持不变）
│   ├── layout.tsx
│   └── page.tsx                      # 主 SPA（升级：增强分析交互）
├── components/ui/                    # shadcn/ui 组件库（保持不变）
├── hooks/                            # React Hooks（保持不变）
└── lib/
    ├── agents/                       # ⭐ Agent 系统（新增）
    │   ├── core/                     # 核心基础设施
    │   │   ├── types.ts              # AgentConfig, AgentState, Observation 等
    │   │   ├── base-agent.ts         # BaseAgent 抽象类（OTAU循环）
    │   │   ├── tools/                # 工具系统
    │   │   │   ├── registry.ts       # ToolRegistry 工具注册中心
    │   │   │   ├── definitions/      # 各工具定义
    │   │   │   └── types.ts          # ToolDefinition, ToolContext, ToolResult
    │   │   └── memory/               # 记忆系统
    │   │       ├── memory.ts         # MemorySystem 三层记忆
    │   │       ├── storage-adapter.ts # 存储适配器
    │   │       └── vector-store.ts   # 向量存储（语义检索）
    │   ├── audit/                    # 审计专用 Agent
    │   │   ├── protocols/            # 协议识别
    │   │   │   └── protocol-type-detector.ts
    │   │   ├── context/              # 上下文管理
    │   │   │   └── context-manager.ts
    │   │   ├── vulnerability/        # 漏洞分析
    │   │   │   └── vulnerability-agent.ts
    │   │   ├── reconstruction/       # 攻击重建
    │   │   │   └── price-manipulation.ts
    │   │   ├── calibration/          # 置信度校准
    │   │   │   └── confidence-calibrator.ts
    │   │   └── orchestrator/         # 协调调度
    │   │       └── audit-orchestrator.ts
    │   ├── prompts/                  # 提示词（升级重构）
    │   │   ├── vulnerability.ts
    │   │   └── report.ts
    │   ├── report-agent.ts           # 报告 Agent（升级重构）
    │   └── vulnerability-agent.ts    # 漏洞 Agent（逐步迁移）
    ├── auth/                         # 认证模块（保持不变）
    ├── blockchain/                   # 区块链数据获取（保持不变）
    ├── llm.ts                        # 双模式 LLM（Z.ai + OpenAI）
    ├── pdf/                          # PDF 生成（保持不变）
    ├── report-templates/             # 报告模板（升级：支持攻击叙事）
    ├── storage/                      # 存储层（保持不变）
    └── utils.ts                      # 工具函数
data/
├── history.json                      # 33个真实DeFi攻击案例
└── vulnerabilities.json              # 19个漏洞模式定义（OD-01~CR-03）
docs/                                 # ⭐ 项目文档（新增）
├── agent-upgrade-spec.md             # Agent 升级详细技术规格
├── price-manipulation-patterns.md    # 价格操纵攻击类型体系
└── protocol-classification-mapping.md # 协议类型识别映射
.opencode/                            # ⭐ opencode 自定义代理（新增）
├── agents/                           # 自定义 Agent 定义
│   ├── analyzer.md                   # 漏洞分析专家 Agent
│   ├── reconstructor.md              # 攻击重建专家 Agent
│   └── reviewer.md                   # 代码审查 Agent
└── commands/                         # 自定义斜杠命令
    ├── analyze.md                    # /analyze 快捷分析命令
    └── audit.md                      # /audit 完整审计命令
```

---

## 构建与开发命令

```bash
# 安装依赖
bun install

# 开发服务器（http://localhost:3000）
bun run dev

# 生产构建
bun run build

# 启动生产服务
bun run start

# 代码检查
bun run lint

# TypeScript 类型检查
npx tsc --noEmit

# Docker 本地环境
docker-compose up -d
docker-compose logs -f

# 数据初始化（首次运行）
curl -X POST http://localhost:3000/api/init
```

---

## 代码规范

### 通用规范
- 所有新代码必须使用 TypeScript，逐步消除现有 `any` 类型
- 严格遵循 `@/` 路径别名（映射到 `./src/*`）
- 提交信息遵循 Conventional Commits：`type(scope): description`
  - `feat(agents)`: Agent 系统新功能
  - `fix(blockchain)`: 区块链模块修复
  - `refactor(analysis)`: 分析逻辑重构
  - `feat(protocols)`: 协议识别相关
  - `perf(memory)`: 记忆系统性能优化
  - `test(agents)`: Agent 测试
  - `docs`: 文档更新

### Agent 系统规范
- 所有 Agent 必须继承 `BaseAgent` 抽象类，实现 `observe()`、`think()`、`act()`、`update()`、`compileResult()` 五个核心方法
- Agent 配置通过 `AgentConfig` 接口定义，禁止硬编码配置
- 工具必须通过 `ToolRegistry` 注册，禁止 Agent 直接调用外部 API
- 记忆操作使用 `remember()` / `recall()` 方法，禁止 Agent 直接操作存储
- Agent 间通信通过 `AuditOrchestrator` 协调，禁止 Agent 之间直接耦合
- 每个Agent的 `maxIterations` 必须设置合理上限（建议3-10），防止无限循环
- Agent 状态必须可序列化，支持中断恢复

### 类型系统规范
- 所有接口和类型定义放在 `src/lib/agents/core/types.ts` 或就近模块的 `types.ts`
- 使用 TypeScript discriminated union 处理多状态（如 `AgentState.status`）
- 禁止使用 `any`，使用 `unknown` 替代并添加类型守卫
- 枚举类型优先使用 union literal（`'idle' | 'running' | 'completed'`）

### API 路由规范
- API 路由逐步迁移，保持现有端点兼容，新旧系统并行运行
- 新的 Agent 分析通过 `/api/analyze` 现有端点触发，内部路由到 Agent 系统
- 异步任务模式保持不变（fire-and-forget + polling）
- 错误响应使用统一格式：`{ error: string; code: string; details?: unknown }`

---

## 价格操纵攻击类型体系

系统聚焦的19种价格操纵攻击类型（6大类别），所有分析逻辑必须覆盖：

| 类别 | 关键ID | 核心原理 | 优先检测协议 |
|------|--------|---------|-------------|
| Oracle Dependency | OD-01~04 | 预言机价格源可被操纵 | DEX, AMM, Perp, Lending |
| Liquidity & Reserve | LR-01~03 | 流动性与储备可操纵性 | AMM, DEX, Lending |
| Transaction Ordering | TO-01~03 | 交易排序与时序依赖 | AMM, DEX, Perp |
| Access Control | AC-01~03 | 访问控制与特权风险 | All |
| Calculation Logic | CL-01~03 | 计算逻辑缺陷 | AMM, DEX, Perp |
| Composability | CR-01~03 | 可组合性风险 | Lending, Perp, Yield, Bridge |

### 协议类型映射（ProtocolTypeDetector 使用的映射）

协议识别后自动关联优先检测的漏洞模式：
- **DEX/AMM**: OD-01, OD-02, OD-03, LR-01, LR-03, TO-01, TO-02, TO-03, CL-01, CL-03, CR-03
- **Lending**: OD-01, OD-02, OD-03, LR-01, LR-02, TO-01, TO-03, CL-02, CR-01
- **Perp**: OD-01, OD-02, OD-03, LR-01, LR-02, TO-01, TO-02, CL-02, CR-01, CR-03
- **Yield Aggregator**: LR-01, LR-03, TO-01, CR-01, CR-02, CR-03
- **Bridge**: LR-03, CL-02, CR-01, CR-02, CR-03, AC-02
- **Stablecoin**: OD-01, OD-02, OD-03, LR-03, TO-01, AC-02, AC-03, CR-01
- **Options**: OD-01, OD-03, CL-02
- **Liquid Staking**: OD-01, OD-02, LR-01, CR-01

---

## Agent 系统核心架构约束

### BaseAgent OTAU 循环
所有 Agent 必须遵循 **Observe → Think → Act → Update** 迭代循环：

1. **Observe（观察）**：从环境、工具结果、记忆中获取信息
2. **Think（推理）**：基于观察进行推理，选择行动策略
3. **Act（行动）**：执行工具调用或生成输出
4. **Update（更新）**：评估行动结果，更新内部状态和记忆

### 工具注册原则
- 每个工具必须定义 `name`、`description`、`parameters`（JSON Schema）、`execute` 函数
- 工具必须声明 `retryPolicy`（最多3次重试，指数退避）和 `cachePolicy`（TTL 1小时）
- 工具执行必须有超时保护（默认30秒）
- 工具执行上下文包含 `agentId` 和 `iteration` 用于追踪

### 记忆系统三层架构
- **Working Memory（工作记忆）**：当前分析会话的临时信息，会话结束清除
- **Episodic Memory（情景记忆）**：历史分析案例和经验，跨会话持久化
- **Semantic Memory（语义记忆）**：领域知识（攻击模式、协议特征、最佳实践），通过向量检索

### 协调调度原则
- `AuditOrchestrator` 是唯一的 Agent 调度入口
- 分析流程：协议识别 → 上下文构建 → 漏洞分析 → 攻击重建 → 置信度校准 → 报告生成
- Agent 间通过结构化数据传递结果，禁止共享可变状态
- 支持并行执行无依赖的 Agent，串行执行有依赖关系的 Agent

---

## 升级开发工作流

### 当接到升级任务时，按以下流程执行：

1. **确认阶段**：检查上方"升级阶段与当前状态"，确认任务所属阶段
2. **阅读技术文档**：参考 `@docs/agent-upgrade-spec.md` 了解详细设计规格
3. **检查依赖**：确认前置阶段的模块是否已实现
4. **编写代码**：遵循本文档中的 Agent 系统规范和类型约束
5. **类型检查**：运行 `npx tsc --noEmit` 确保类型正确
6. **代码检查**：运行 `bun run lint` 确保代码风格
7. **本地验证**：启动开发服务器，通过 UI 测试分析功能
8. **提交代码**：使用 Conventional Commits 规范

### 渐进式迁移策略
- **新旧并行**：Agent 系统与现有 Workflow 并行运行，通过特性开关切换
- **逐步替换**：先实现 BaseAgent 基础设施，再逐个迁移分析逻辑到 Agent
- **接口兼容**：保持现有 API 端点和响应格式不变，内部逐步路由到 Agent 系统
- **数据兼容**：Agent 输出必须可转换为现有报告格式，确保前端无需修改

### 安全开发约束
- 禁止在代码或配置中硬编码 API 密钥，全部通过环境变量管理
- LLM 调用必须通过 `llm.ts` 统一封装，禁止 Agent 直接调用 LLM SDK
- 用户输入（合约地址、文件上传）必须验证和清洗
- Agent 工具执行必须有超时和错误处理，防止阻塞
- 分析结果中的敏感信息（私钥、密码）不得记录到日志或记忆系统

---

## 关键参考文件

- Agent 升级详细技术规格：`@docs/agent-upgrade-spec.md`
- 价格操纵攻击类型体系：`@docs/price-manipulation-patterns.md`
- 协议类型识别映射：`@docs/protocol-classification-mapping.md`

**项目已有文件（无需创建，直接引用）：**
- 现有漏洞模式数据：`@data/vulnerabilities.json`
- 现有攻击案例数据：`@data/history.json`
- 现有分析逻辑：`@src/lib/agents/vulnerability-agent.ts`
- 现有报告逻辑：`@src/lib/agents/report-agent.ts`
- BaseAgent 接口设计（升级后）：`@src/lib/agents/core/types.ts`

> CRITICAL: 当遇到上述文件引用（@...）时，使用 Read 工具按需加载。不要预加载所有引用文件，仅在任务需要时加载。加载后将其内容视为强制指令。
