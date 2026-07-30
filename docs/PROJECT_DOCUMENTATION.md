# DeFi 价格操纵分析审计系统 · 项目全量文档
# DeFi Price Manipulation Analyzer & Auditor — Full Project Documentation

> 版本 Version: v3.7.0
> 说明 Note: 本文档以**项目实际代码实现为唯一事实来源**（single source of truth），覆盖除 `eval/` 之外的全部模块，并对每个部分给出设计原理与理由（Why）。
> This document describes the system **as actually implemented in code** (ignoring the `eval/` directory) and gives the design rationale behind every component.

---

## 目录 / Table of Contents

1. [项目概览 / Overview](#1)
2. [技术栈 / Tech Stack](#2)
3. [系统架构总览 / Architecture](#3)
4. [Agent 核心框架 / Core Infrastructure](#4)
5. [审计专用 Agent / Audit Agents](#5)
6. [攻击重建与置信度校准 / Reconstruction & Calibration](#6)
7. [编排与协调 / Orchestration](#7)
8. [学习进化 / Learning](#8)
9. [跨合约追踪 / Cross-Contract Tracing](#9)
10. [成本估算与迭代预算 / Cost & Iteration Budget](#10)
11. [LLM 接入层 / LLM Integration](#11)
12. [区块链数据获取 / Blockchain Fetcher](#12)
13. [存储层 / Storage](#13)
14. [鉴权与安全 / Auth & Security](#14)
15. [API 路由 / API Routes](#15)
16. [报告生成 / Report Generation](#16)
17. [提示词体系 / Prompts](#17)
18. [数据资产 / Data Assets](#18)
19. [设计原理总结 / Design Principles](#19)

---

<a id="1"></a>
## 1. 项目概览 / Overview

**中文**：本项目是一个面向 DeFi 智能合约的**价格操纵（price manipulation）垂直领域安全审计系统**。它从最初的三阶段固定流水线（Workflow：源码获取 → 漏洞分析 → 报告生成），升级为以 `AuditOrchestrator` 为唯一调度入口、多个专用 Agent 通过结构化数据协作的**多 Agent 系统**。系统聚焦 **21 种价格操纵攻击模式（6 大类别）** 的检测、攻击路径重建、风险量化与可解释报告。

三大核心能力主张（claims）：
- **垂直深度覆盖**：只做价格操纵这一细分方向，对 21 种模式（OD/LR/TO/AC/CL/CR）做到模式级（pattern-level）而非通用告警级。
- **跨合约语义推理**：通过 `CrossContractTracer` 构建外部调用图，识别 CR-01/CR-04 这类"依赖外部协议价格"的盲区。
- **双模型路由 + Quota 优雅降级**：复杂推理走主模型，报告/摘要走快速模型；配额耗尽时保存已完成结果（partial），不丢数据。

**English**: This is a **vertical, price-manipulation-focused** security auditor for DeFi smart contracts. It evolved from a fixed 3-stage pipeline into a multi-agent system coordinated by a single `AuditOrchestrator`, where specialized agents hand off **structured data objects** (no shared mutable state). It covers **21 price-manipulation patterns across 6 categories**, with attack-path reconstruction, risk quantification, and explainable reporting. Three headline capabilities: vertical depth (pattern-level, not generic), cross-contract semantic reasoning, and dual-model routing with quota-graceful degradation.

---

<a id="2"></a>
## 2. 技术栈 / Tech Stack

| 领域 Area | 选型 Choice | 理由 / Rationale |
|---|---|---|
| 框架 Framework | Next.js 16 (App Router + RSC) | 单一代码库同时承载 API 路由与服务端渲染 UI；RSC 减少客户端 JS 体积 |
| 语言 Language | TypeScript 5 (strict) | `any` 被禁用、组件间契约靠 union literal，保证 Agent 状态可序列化 |
| 运行时 Runtime | Bun (dev) / Node 20+ (prod) | Bun 开发体验快；生产用标准 Node，部署兼容 `standalone` 输出 |
| 样式 Style | Tailwind CSS 4 + shadcn/ui (new-york) | 统一的 UI 原语，便于快速构建分析/进度面板 |
| LLM | OpenAI 兼容协议（`openai` SDK）；primary/medium/fast 三 provider | 任意 OpenAI 兼容端点均可接入（默认 DeepSeek / GLM）；统一封装便于 provider 路由与配额分类 |
| 鉴权 Auth | `jose` (JWT) + `bcryptjs` | JWT 存于 httpOnly cookie 防 XSS 窃取；密码 bcrypt 哈希 |
| 存储 Storage | 文件 `.storage/` JSON + 可选 Prisma | 零配置即可运行；Prisma 作为可插拔升级路径（T6） |
| PDF | `pdf-lib` | 纯 JS 生成 PDF，无系统依赖 |
| 合约解析 Parse | `@solidity-parser/parser` | 跨合约追踪阶段做 AST 级外部调用抽取 |
| 嵌入向量 Vector | `sql.js`（WASM SQLite） | 情景记忆（episodic）持久化；语义记忆用轻量哈希向量索引 |

---

<a id="3"></a>
## 3. 系统架构总览 / Architecture

**分层 Layering**（三层 + 编排）：

```
┌──────────────────────────────────────────────────────────────┐
│                      API Layer (Next.js routes)                │
│   /api/analyze (SSE state machine) · /api/batch-audit · ...   │
└───────────────────────────────┬──────────────────────────────┘
                                 │  triggers
                                 ▼
┌──────────────────────────────────────────────────────────────┐
│              AuditOrchestrator  (single coordinator)           │
│   7-stage pipeline, per-stage budgets, SSE progress, partial   │
└───┬───────────┬──────────────┬──────────────┬─────────────────┘
    │           │              │              │
    ▼           ▼              ▼              ▼
 Protocol   ContextManager  Vulnerability   PriceManipulation
 Detector    (+RAG +cross)   AnalysisAgent   Reconstructor
                                  │
                                  ▼
                            CostEstimator → ConfidenceCalibrator → Report(fast LLM)
```

**统一数据流 Unified data flow**（各阶段只传递不可变结果对象，Agent 间无共享可变状态）：

```
ProtocolTypeDetector.detect(code)            → ProtocolClassification
ContextManager.build(code, classification)    → AnalysisContext (含 crossContractGraph)
VulnerabilityAnalysisAgent.run() [OTAU loop]  → VulnerabilityAnalysisResult { Vulnerability[] }
PriceManipulationReconstructor.reconstruct()  → ReconstructionResult { Attack[], Chain[] }
CostEstimator.estimateAttackCost()           → 每个 Vulnerability.attackCostEstimate
ConfidenceCalibrator.calibrate()             → CalibratedResult
generateEnhancedReport() [fast LLM]          → reportMarkdown
```

**设计理由 / Why**：把"决策"从固定顺序抽离到 `AuditOrchestrator` 的显式阶段编排，使每个 Agent 只需关心自身领域逻辑；结构化数据传递（而非共享内存）保证可中断恢复与并发安全，也便于把单个阶段替换为更优实现而不影响其余阶段。

---

<a id="4"></a>
## 4. Agent 核心框架 / Core Infrastructure

> 路径 `src/lib/agents/core/`。这是自研的轻量 Agent 框架，所有审计 Agent 都继承 `BaseAgent`。

### 4.1 类型系统 / Type System — `core/types.ts`
- `AgentStatus = 'idle'|'running'|'paused'|'completed'|'error'` (types.ts:1)
- `ActionType = 'analyze'|'search'|'fetch'|'retrieve'|'evaluate'|'reconstruct'|'report'|'finalize'` (types.ts:2)，其中 `'finalize'` 是循环终止动作。
- `AgentConfig` (types.ts:4-11)：`name/description/version/maxIterations/timeout/verbose`。`maxIterations` 是 OTAU 循环的硬上限。
- `Observation` (types.ts:13-18)、`Thought` (types.ts:20-26)、`Action` (types.ts:28-32)、`Result` (types.ts:34-41)、`AgentState` (types.ts:43-54)、`AgentResult` (types.ts:56-62)。

**Why**：全部使用 union literal（而非 enum）与纯接口（无行为），满足 AGENTS.md"优先 union literal""状态必须可序列化"。统一词汇表让工具、记忆、Agent 彼此可组合。

### 4.2 BaseAgent OTAU 循环 / `core/base-agent.ts`
- 构造时实例化三个协作者：`ToolRegistry`、`MemorySystem`、`LLMClient`（base-agent.ts:21-38）。
- 子类必须实现 5 个抽象方法：`observe() / think() / act() / update() / compileResult()`（base-agent.ts:40-44）。
- `run()`（base-agent.ts:52-98）是唯一的循环驱动：每轮 `iteration++` → `observe` → `think` → `act` → `update` → `shouldTerminate`。
- 终止条件（base-agent.ts:46-50）：到达 `maxIterations`，或 `think()` 选择 `action:'finalize'` 且上一步成功。
- 错误不向外抛：任何异常都被捕获，`status='error'` 但仍返回 `compileResult()`（data 含 error），`finally` 中 `clearWorking()`（base-agent.ts:95-97）。
- `getState()/getConfig()` 返回浅拷贝，防止外部篡改内部状态。

**Why**：把"迭代/记账/错误处理/序列化"这一套脚手架统一在基类，子类只写领域逻辑（如何观察、推理、行动、更新），避免每个 Agent 重复实现控制流；单一 `try/catch/finally` 让每个 Agent 具备容错且自清理（工作记忆按会话清除）。

### 4.3 工具注册中心 / ToolRegistry — `core/tools/registry.ts`
- `ToolDefinition`（tools/types.ts:26-33）：`name/description/parameters(JSON Schema)/execute/retryPolicy?/cachePolicy?/timeout?`。
- `ToolContext`（tools/types.ts:1-5）：每次调用注入 `{agentId, iteration, correlationId?}`，用于追踪。
- `execute(name, params, context)`（registry.ts:31-97）：
  1. 未知工具返回失败 Result；
  2. 命中 `cachePolicy` 且未过期则直接返回（带 `cached:true`）；
  3. 默认 `retryPolicy = {maxRetries:3, backoffMultiplier:2, initialDelayMs:1000}`、默认 `timeout=30000`；
  4. 用 `Promise.race` 实现超时（registry.ts:103-125），指数退避重试。

**Why**：重试/缓存/超时这类横切关注点集中在注册中心，Agent 本身不必处理；超时用 `Promise.race` 保证挂死的工具不会阻塞整个 OTAU 循环。

### 4.4 三层记忆系统 / MemorySystem — `core/memory/memory.ts`
三层（各自后端与生命周期不同，理由各异）：

| 层 Layer | 后端 Backing | 生命周期 Lifetime | 理由 / Why |
|---|---|---|---|
| working | 内存 `Map`（LRU，上限 100） | 仅当前会话，`run()` 的 `finally` 清除 | 快速易失草稿，无需持久化 |
| episodic | **sql.js（WASM SQLite）** → `.storage/memory.sqlite` | 跨会话持久 | 历史案例/经验，需可查询、并发安全（替代易竞态的文件+JSON） |
| semantic | 文件（`.storage/memory/semantic/`）+ 内存向量索引 | 跨会话持久 | 领域知识：文件保证持久，向量索引支持相似度检索 |

- `remember(content, type, importance=0.5, metadata)`（memory.ts:43-82）：生成 `id`，计算哈希嵌入，按层落库。
- `recall(query)`（memory.ts:84-114）：跨层聚合，按 `minImportance` / `keywords` 过滤，按时间倒序截断。
- `searchSemantic(query, topK)`（memory.ts:116-137）：哈希嵌入 + 余弦相似度，命中回查记录并 `accessCount++`。
- `sqlite-store.ts`：schema `episodic(id, agent_id, session_id, ts, kind, content, embedding, metadata, access_count, importance)`；5 秒周期 `dirty` 时 `db.export()` 落盘（sql.js 在内存跑库、定时序列化）。
- `vector-store.ts`：`simpleHashEmbedding`（64 维词袋哈希，非 ML 嵌入），`cosineSimilarity` 仅做词面重叠度量。

**Why**：区分"会话草稿/历史经验/领域知识"三类信息，分别用最合适且最经济的存储；episodic 用 SQLite 解决并发审计的竞态；semantic 用文件+向量兼顾持久与检索。

### 4.5 LLM 客户端 / LLMClient — `core/llm-client.ts` + `src/lib/llm.ts`
- `LLMClient`（llm-client.ts:12）：薄封装，`getJSON` / `getStructuredJSON` / `chat`，默认 `provider:'primary'`，把"选哪个模型"收敛到一处。
- 三 provider（llm.ts:42）：`primary`（深推理）、`medium`（可选）、`fast`（报告/摘要）。`getClient(provider)`（llm.ts:102-114）未配置的非主模型自动回退到 primary，向后兼容。
- **结构化输出 vendor-aware 回退链**（llm.ts:510-584）：DeepSeek 走 `tool→json_object→markdown`；GLM 走 `json_schema→tool→markdown`；thinking 模式下跳过 `tool`（`tool_choice:'required'` 不兼容）。
- **JSON 修复管线**（llm.ts:301-484）：直解析 → 去 fence → 括号匹配 → 宽松截断修复（`repairJSON` 修注释/尾逗号/引号/补括号）。
- **配额/超时分类**（llm.ts:146-180）：`QuotaExceededError`、检测 402/429 及中英文"余额不足/配额不足"，配额错误**不重试**、超时仅重试一次（保护 coding-plan 配额）。

**Why**：所有 LLM 出口集中在一处，才能统一强制重试策略、thinking 模式、JSON 健壮性与配额分类——后者正是 Quota 优雅降级能成立的前提。结构化输出不依赖运行时 schema 校验，而靠"模型尽量守约 + 4 段修复"兜底，避免校验器把合法但格式略偏的响应误拒。

---

<a id="5"></a>
## 5. 审计专用 Agent / Audit Agents

> 路径 `src/lib/agents/audit/`。

### 5.1 协议类型识别 / ProtocolTypeDetector — `audit/protocols/protocol-type-detector.ts`
- `ProtocolType`（protocols/types.ts:1-10）共 **9 种**（合并 `dex_amm`，新增 `options`、`liquid_staking`）：`dex_amm | lending | perp | yield_aggregator | bridge | stablecoin | options | liquid_staking | unknown`。
- `ProtocolClassification`（types.ts:34-42）是检测产出，含 `type/confidence/priorityVulnerabilities/criticalFunctions/riskProfile`，向下游一致传递。
- 算法 `detect()`（protocol-type-detector.ts:171-232）：纯正则评分（无 AST、无 LLM），关键词命中权重 0.6、结构签名 0.4；关键词出现次数封顶 3；整组乘以 `typeWeight`（0.7–0.9）；取最高分作为类型，`confidence = min(compositeScore/5, 1.0)`；`≤0.5 → unknown` 用通用 priorityVulns 兜底。

**Why**：静态正则评分是**确定性、瞬时、零成本**的，在花第一个 token 之前就完成；`typeWeight × 规则权重` 两级权重让作者能把领域先验（dex_amm 最易识别、stablecoin 最难）编码进数据，无需重训练。`priorityVulnerabilities` 直接驱动后续上下文过滤，天然聚焦本协议真正相关的 21 模式子集。

### 5.2 上下文构建 / ContextManager — `audit/context/context-manager.ts`
- `AnalysisContext`（context-manager.ts:8-19）：`contractCode/name/blockchain/address/classification/relevantPatterns/relevantCases/focusAreas/analysisDepth/crossContractGraph?`。
- `build()`（context-manager.ts:44-111）：
  1. 并行加载 patterns + cases；
  2. `filterRelevantPatterns` 只保留 `priorityVulnerabilities` 中的模式并赋优先级（context-manager.ts:113-139）；
  3. `filterRelevantCases` 按"链匹配 +0.3 / 模式类别关键词 +0.7"打分，standard 取 10、deep 取 20（context-manager.ts:141-190）；
  4. **RAG 语义检索**（context-manager.ts:61-83）：`memory.searchSemantic(...)` 取 3 条，合并进 cases，失败非致命；
  5. **跨合约图注入**（仅 `depth==='deep' && address`，context-manager.ts:85-97）：调用 `CrossContractTracer`，失败非致命。

**Why**：上下文只构建一次（首轮）并在后续迭代复用；把模式/案例过滤到本协议优先级子集，使 prompt 小而精准、直接压低非相关模式的误报。`standard`/`deep` 是"成本/覆盖"旋钮：deep 多取案例且做昂贵的跨合约追踪。RAG 合并是非致命的——缺失向量库永不应阻断主流程。

### 5.3 漏洞分析 Agent / VulnerabilityAnalysisAgent — `audit/vulnerability/vulnerability-agent.ts`
继承 `BaseAgent`（892 行，系统升级的核心载体）。

- 构造（vulnerability-agent.ts:120-256）：`maxIterations=5`，实例化 `detector/contextManager/promptOptimizer`，并 `this.tools.register('vulnerability_analyzer', ...)` 与 `this.tools.register('llm_summarize', ...)`（**T1 修复：LLM 调用走 ToolRegistry，不再直调**）。
- `observe()`（262-339）：第 1 轮做检测 + 上下文构建 + 记忆召回（`recall` 按 `[type, ...priorityVulns]` 取历史经验）；后续轮返回"上轮复盘"观察。
- `think()`（341-466）决策阶梯：`analyze` 或 `finalize`：
  1. 首轮 → analyze；
  2. 关键词缺口 `findUnaddressedKeywords`（713-773）→ 仍有未覆盖价敏关键字则继续；
  3. **收敛早停**（T4，392-430）：`prevCalibratedScore` 非空且 `convergenceDelta < 0.05` 且 `iteration>=2` → 通常 finalize；但"模式多样性硬化"条款在协议有 oracle/flashloan 暴露且类别覆盖<3 时强制再分析一轮，避免轻易收敛；
  4. 类别覆盖检查（仅发现 AC/TO/CL 但协议有 oracle 暴露 ⇒ 再补 LR/OD）；
  5. `checkAnalysisGaps`（799-831）只建议不强制，并明确告知"设计良好的合约可为零命中"。
- `act()`（468-587）：`finalize` 时（≥2 轮）跑 `llm_summarize`；`analyze` 时经 `PromptOptimizer` 注入（受 `optimizeSystemPrompt` 开关控制，509-524），再 `this.tools.execute('vulnerability_analyzer', ...)`（548-552）。
- `update()`（589-636）：重算 `computeCalibratedScore`（784-797，严重度加权），写入 `_meta.convergenceDelta` 与 `state.metadata`；并 `this.memory.remember(...)` 写 **episodic** 记忆（重要性 0.7）供未来 RAG 召回。
- `compileResult()`（638-711）：**合并所有轮次**的 vulnerabilities（每轮聚焦不同代码区），按 `patternId|functionName|severity` 去重（保留最详细 `attackVector`），跑 `filterProtectedFindings`，重算风险等级与置信度启发式（≥3 轮→0.9，≥2→0.8，否则 0.7；首轮到末轮 pattern 集合稳定再 +0.05）。

**Why**：这个 Agent 完整演示了"真 OTAU + ToolRegistry + MemorySystem + 收敛早停 + 逐轮 Prompt 优化 + RAG 召回 + 多模型路由"。`optimizeSystemPrompt` 布尔开关正是为了能 A/B 对照优化器与基线（风险预案里要求的回退能力）。`compileResult` 合并而非取末轮，是因为迭代式分析每轮深挖不同区域，末轮不等于全集。

### 5.4 提示词优化器 / PromptOptimizer — `audit/vulnerability/prompt-optimizer.ts`
- `optimizeSystemPrompt(classification)`（32-48）：在静态 `VULNERABILITY_SYSTEM_PROMPT` 尾部追加**按协议类型的提示块**（如 dex_amm 提示关注恒定乘积不变量、TWAP 质量、sync/skim 访问控制等），并明确"仅当相应功能存在才关注"作为**防误报护栏**。
- `optimizeUserPrompt(context, iteration, ...)`（50-175）：组装多段式 prompt（合约信息、优先级模式、迭代焦点=已发现/缺失类别/缺失模式/未覆盖价敏代码区、聚焦区、历史案例、RAG 经验警告、跨合约上下文、聚焦函数体、合约源码）。
- **Token 预算治理**（177-180，`MAX_CONTEXT_TOKENS=96000`）：`truncateCode`（447-523）先剥展平库、压 NatSpec，再"保价敏关键函数、丢样板"的两级保留策略，`wasTruncated/truncationRatio` 回传给 Agent。

**Why**：优化器是 token 预算的"总督"。LLM 上下文有限而合约可能巨大（展平后内联全部 OpenZeppelin），它保证**价格敏感函数**在截断中存活、样板被丢弃。逐轮注入"缺失类别/未覆盖关键词"正是 OTAU "观察缺口→思考→行动"循环的工程落地——每轮把 LLM 引向之前的盲区。

### 5.5 误报抑制过滤器 / protection-filter.ts
- `filterProtectedFindings(vulnerabilities, sourceCode)`（192-227）：只抑制 **CR-03**（未检查返回值）与 **TO-02**（无滑点保护）两类，且**仅当确证存在保护**时。
- `isExternalCallProtected`（103-137）：识别 `require(Contract(addr).method(...))`/`require(success)`/`if(!success)revert`/`try-catch` 四种真实保护；显式排除无关的 `require(msg.sender==owner)`。
- `hasEnforcedSlippageCheck`（150-190）：检查强制执行的用户滑点参数；**循环依赖护栏**——若函数同时读取 AMM `getReserves`，则该滑点检查被视为"循环且非真实保护"（参考价本身可被操纵），不抑制 TO-02。

**Why**：LLM 审计极易对 CR-03（任何外部调用都报）和 TO-02（任何 swap 缺滑点都报）过度报告。但接受并强制执行用户 `amountOutMin` 的合约（如 Uniswap）是正确的，不是漏洞；被 `require`/`try-catch` 包住调用的 CR-03 是误报。该过滤器是**确定性、保守、只抑制不新增**的安全网，落地系统 prompt 里"信任代码而非注释"的指令——机械核验实现确有防护，才抑制 LLM 声称缺失的告警。

---

<a id="6"></a>
## 6. 攻击重建与置信度校准 / Reconstruction & Calibration

### 6.1 三层攻击叙事 / PriceManipulationReconstructor — `audit/reconstruction/price-manipulation.ts`
- **类型词汇**（reconstruction/types.ts）：固定 6 阶段攻击生命周期 `AttackPhase = preparation|execution|manipulation|exploitation|profit|cleanup`（types.ts:1）；`actor` 为封闭联合（含 `attacker/protocol/oracle/mev_bot/insider`，TO-03 的 actor 在 T9 改为 `attacker`、OD 的 actor 改为 `protocol`）；`PatternOverlay`（types.ts:27-34）所有字段 `Partial`，只描述与基线的**增量**。
- **Layer 1 — 6 个 `CATEGORY_TEMPLATES`**（price-manipulation.ts:23-153）：每类别一套完整 6 阶段骨架（通用"哪类攻击"），避免升级前 21 个叙事几乎雷同的问题。
- **Layer 2 — 21 个 `PATTERN_OVERLAYS`**（159-451）：按完整 pattern ID 仅写差异（如 OD-01 覆盖 execution/manipulation 步骤与防御，TO-03 把 actor 覆盖为 attacker，CR-04 难度 high 且 4 跳链）。新增模式=新增一条数据，不改模板代码。
- **Layer 3 — `mergeTemplate()`（457-516）融合引擎**：base → overlay → per-finding LLM 注入。`execution` 阶段若 overlay 未给 action 则注入 `input.attackVector`；`exploitation` 注入截断后的 `input.description`；防御以 base→overlay→per-finding recommendation 顺序；难度 overlay 优先。
- **`COMBINED_CHAINS`**（520-528）：7 条预定义级联链（如 `LR-01→OD-01→LR-03`、`OD-04→OD-05`、`CR-04→CR-01`），对应价格操纵模式文档里的交叉关系。
- `assessFeasibility`（586-619）：`techScore`（低90/中70/高50）+`economicScore`（Critical90/High70/其他50），`overall = round(tech*0.4 + econ*0.6)`（经济权重更高，因真实风险由可盈利性主导）；`mevDependency` 由 `attackVector` 文本推断。
- `findHistoricalAnalogy`（621-667）：优先按 M7 的 `pattern_ids` 匹配（similarity 0.9），否则按名称+描述 Jaccard 相似度；失败优雅返回 `N/A`。

**Why**：确定性 base+overlay 保证**审计级正确、可审计、不幻觉**的结构与模式专属防御；LLM 注入的 `attackVector/description/recommendation` 提供模型真正发现的**合约-specific 细节**。三层融合使"LR-02 与 CR-03 叙事不再相同""OD-01 与 OD-04 执行步骤不同"成为数据驱动的必然结果。

### 6.2 置信度校准 / ConfidenceCalibrator — `audit/calibration/confidence-calibrator.ts`
五维加权（confidence-calibrator.ts:35-41）：

| 维度 Dimension | 权重 Weight | 评分逻辑 |
|---|---|---|
| sourceCodeAvailability | 0.25 | 有源码 0.9，否则 0.3 |
| patternMatchScore | 0.25 | 命中 priorityVulnerabilities 0.85，否则 0.5；attackVector>100 字 +0.1 |
| historicalCaseSupport | 0.20 | 有匹配案例 0.7 + min(matchedCases×0.1, 0.3)，否则 0.3 |
| crossValidationConsistency | 0.15 | 有具体代码位置 0.8，否则 0.4 |
| economicFeasibility | 0.15 | Critical 0.9 / High 0.7 / Medium 0.5 / Low 0.3 / Info 0.2 |

- `calibratedConfidence = min(raw × adjustmentFactor, 1.0)`（:57）；`adjustmentFactor`（:128-132）：≥4 轮 0.95，≥2 轮 0.85，否则 0.70——**用迭代收敛度奖励可信度**。
- 每个维度携带 `reasoning` 字符串，报告可解释"为何给这个分"。

**Why**：单一 0–1 置信度会混淆"模型是否读了源码""该模式是否本协议优先""是否见过真实案例"。拆成 5 轴后，置信度是透明加权混合而非不透明自评分；权重和=1.0，最终数字可解释。

---

<a id="7"></a>
## 7. 编排与协调 / Orchestration — `audit/orchestrator/audit-orchestrator.ts`

`AuditOrchestrator` 是**唯一**的 Agent 调度入口。

- `StageName`（29-37）：`protocol_detection | context_building | cross_contract_tracing | vulnerability_analysis | attack_reconstruction | cost_estimation | confidence_calibration | report_generation`。
- `DEFAULT_STAGE_BUDGETS`（39-55）：每阶段 ms 超时（`vulnerability_analysis: 5_000_000` 因主模型 OTAU 迭代可能 15–20 分钟；`cross_contract_tracing` 实际折叠进 `context_building`，详见下）。
- 双 LLM 客户端：`this.llm`（primary，深推理）+ `this.fastLlm`（provider `fast`，仅报告/摘要），未配置 fast 自动回退 primary（T15）。
- `runStage<T>()`（126-132）：`Promise.race([fn(), timeoutPromise])`，超时报 `StageTimeoutError`（带 `.stage`）。
- `executePipeline()`（171-316）七阶段：
  1. protocol_detection → `detector.detect`
  2. context_building（内部调 `ContextManager.build('deep')`，即含跨合约追踪）→ `AnalysisContext`
  3. vulnerability_analysis → `computeBudget(...)` 定 `maxIterations`，`VulnerabilityAnalysisAgent.run()`
  4. attack_reconstruction → `reconstructor.reconstruct`
  5. cost_estimation → 逐漏洞 `estimateAttackCost`，**失败非致命**
  6. confidence_calibration → `calibrator.calibrate`
  7. report_generation → `generateEnhancedReport()` 走 fast LLM
- **SSE / 进度**：`ProgressCallback` + `emit()`（633-635）只调用回调，与传输层解耦；`/api/analyze` 订阅后转 SSE。
- **Quota 优雅降级**：每阶段包 `try/catch`，捕获 `QuotaExceededError` 则 `buildPartialResult(...)`（610-631）而非抛错；`PartialAuditResult`（87-97）带 `partial:true, completedStages[], failedStage, error` 及所有已完成的中间结果。API 路由把它存为 `report_partial_*`，**配额耗尽不丢任何已完成工作**。
- `runFromContext()`（152-169）：**无源码**路径（三次抓取都失败），用占位代码 + 大上下文 prompt 仅从案例元数据推断，`sourceAvailable=false` 且跳过 cost_estimation。
- `generateEnhancedReport()`（490-597）：确定性 per-vulnerability 元数据（`costEstimate`、修复时限 Critical→24h/High→7d、knowledgeReferences），prompt 显式要求 LLM **"不要重新估算"**（:592），保持成本/时限确定性。

**Why**：编排器把"阶段超时、进度广播、配额降级、双模型路由、确定性报告元数据"这些横切编排逻辑集中于一处，使各 Agent 保持纯粹。partial result 设计让 LLM 配额这一外部不可控因素不会让整次分析归零——这是系统"不丢数据"承诺的核心。

---

<a id="8"></a>
## 8. 学习进化 / Learning — `audit/learning/case-ingester.ts`

`ingestAuditResult(result, blockchain, address, options)`（14-74）写入两处汇：历史案例库（`history.json`）+ 记忆系统（semantic/episodic）。

- **Tier 1 — PoC 验证学习**（22-37）：有 `pocResult.passed` 才以 `verified:'poc-pass'`、重要性 0.8 入库 + 写 episodic 记忆；未通过/未编译则不入库。
- **Tier 2 — 自主学习**（39-73）：仅筛选 `calibratedConfidence >= 0.8`（默认阈值）的漏洞；**低于阈值绝不自动入库**，避免噪声污染知识库。
- `ingestToHistory`（76-115）：按 `address + blockchain` **去重**——同一合约复审会追加 `pattern_ids` 与复审备注，而非新建重复。
- `ingestToMemory`（117-142）：写入紧凑摘要 + 元数据（patterns/riskLevel/contractName/timestamp）供未来 RAG 召回；**非致命**。
- 在 `EVAL_MODE !== 'true'` 时才调用（orchestrator.ts:289/461），**评估模式下禁用**以防自学习污染指标。

**Why**：两档门控（PoC 验证 / 高置信度）与 0.8 阈值确保自学习闭环只强化可信信号；按地址去重避免重复膨胀；评估时禁用保证指标可复现、不被系统自我教学抬高。

---

<a id="9"></a>
## 9. 跨合约追踪 / Cross-Contract Tracing — `audit/cross-contract/`

> 使命：填补"单合约分析看不见外部协议价格依赖"的盲区（Rari/ibETH 这类 CR-01/CR-04 场景）。

- `types.ts`（1-31）：`CrossContractNode`（address/contractName/source: main|external-verified|external-decompiled|unknown）、`CrossContractEdge`（callType + 可选 `runtimeVar`）、`CrossContractSummary`（graph + promptContext + 计数）。
- `cross-contract-tracer.ts`（336 行）：
  - 安全边界（7-9）：`MAX_DEPTH=2`、`MAX_NODES=10`、`MAX_SOURCE_LINES_PER_NODE=50`——跨合约扩展是指数级的，深了不划算。
  - `trace()`（35-70）→ `traceContract()`（72-139）：用 `@solidity-parser/parser` 解析（失败 swallowed，降级），`extractExternalCalls`（141-199）抽取 `.call/staticcall/delegatecall`、类型化接口调用（`IUniswapV2Pair(addr).swap()`）、以及**运行时变量接口调用**（地址是变量而非字面量，记 `runtime-interface-call` 警告边，不报错）。
  - 对每个目标地址 `fetchContractWithCache`（来自 blockchain/fetcher），建节点并递归（depth+1），`protocolRole` 由 `matchKnownProtocol` 解析。
  - `buildPromptContext()`（264-335）：把 `0x...` 解析为"Uniswap V2 Router"等人话，显式标注 OD-01/CR-01/CR-04 风险；内联外部源码片段；`truncated` 标记告知图不完整。
- `known-protocols.ts`：知名协议地址映射（Uniswap V2/3、Aave V3、Balancer、Curve、Chainlink、WETH/USDC/USDT/DAI）。

**Why**：原始 `0x...` 外部调用对 LLM 无意义；解析成"调用 Uniswap V2 `getReserves()` ⇒ 查 OD-01"才能让分析 prompt 真正识别 CR-01/CR-04。全面降级（解析失败/抓取失败/运行时变量→警告边/深度节点封顶）保证追踪永不阻断主流程。

---

<a id="10"></a>
## 10. 成本估算与迭代预算 / Cost & Iteration Budget

### 10.1 确定性成本估算 / CostEstimator — `src/lib/cost/`
- `estimateAttackCost(vuln, chainId, registry)`（estimator.ts:36）：
  ```
  baseTx = 21000
  gasCostLow  = (baseTx + gasLow)  × gasPriceLow  × 1e-9 × nativePriceUSD
  gasCostMid  = (baseTx + (gasLow+gasHigh)/2) × gasPriceMid × 1e-9 × nativePriceUSD
  gasCostHigh = (baseTx + gasHigh) × gasPriceHigh × 1e-9 × nativePriceUSD
  flashLoanCostUSD = principal(1e6) × min(aave.rate, balancer.rate)   // 攻击者理性选最便宜
  low/mid/high = round((gasCost + flashLoanCostUSD)×100)/100
  ```
  `1e-9` 把 gwei→ETH，flashLoanNeeded 由 pattern-cost-profile 或 attackVector 含 "flash loan" 触发。
- 数据来源 tool（带 TTL 缓存，失败回退常量）：
  - `gas-price.tool.ts`：Etherscan gastracker，TTL 120s；
  - `native-price.tool.ts`：CoinGecko 无 key `simple/price`，TTL 300s；
  - `flash-loan-fee.tool.ts`：Aave 5bps / Balancer 0bps 常量，TTL 3600s。
- `AttackCostEstimate`（types.ts:1）：含 `low/mid/high/currency:'USD'/asOf/breakdown(dataSource + assumptions)`，让消费者知道数据出处。

**Why**：旧版用 LLM 推断 low/medium/high 准确度差。确定性公式（gas + flashloan，取最便宜费率）给出"$120–$450"这类具体区间，且每个数字可溯源（dataSource 字段）。成本与风险量化解耦，是校准中 economicFeasibility 的可信输入。

### 10.2 自适应迭代预算 / `src/lib/iteration/budget.ts`
`computeBudget(classification, patternId, tvlUSD)`（13-25）：
```
w   = patternWeights[patternId]?.weight ?? 3     // data/pattern-weights.json
tvl = tvlUSD ?? 1e5
max = clamp(round(w × log10(tvl+1) / 2), 1, 10)
```
- `pattern-weights.json`：`weight = round((d+r+k)/3)`（检测/推理/知识三轴，1–5），CR-04=5（唯一需跨合约追踪），CL-03=4，多数 2–3。
- `log10(TVL)` 使预算随 TVL 缓慢增长（10 亿 vs 10 万贡献约 9 vs 5），乘权重除 2 后夹到 [1,10]。

**Why**：高价值复杂协议（Aave，w≈4 + 巨 TVL）值得更多 OTAU 迭代收敛；平凡 ERC20（w≈2，低 TVL）1–3 轮即可，省 token。将"迭代上限"从硬编码 5 变成由协议价值与模式复杂度驱动（T4/T11）。

---

<a id="11"></a>
## 11. LLM 接入层 / LLM Integration

> 详见 §4.5。此处补充路由与降级在工程中的位置。

- **三 provider 路由**：`primary`（深推理：协议识别、漏洞分析、攻击重建）、`medium`（可选：PoC/上下文回退）、`fast`（简单：报告生成、迭代摘要）。调用点：漏洞分析核心与重建走 `this.llm`（primary）；报告生成走 `this.fastLlm.chat(...)`（orchestrator.ts:596）；漏洞 Agent 自身摘要也走 fast（vulnerability-agent.ts:140/219-250）。
- **Quota 优雅降级链路**：`chatCompletion` 抛 `QuotaExceededError` → 编排器逐阶段 `try/catch` 捕获 → `buildPartialResult` → API 存 `report_partial_*`、状态 `partial`（非 `failed`）。批量审计在配额耗尽时**停止整批**但保留已完成结果。
- **错误重试策略**：配额错误不重试（立即上抛以便降级）；超时仅重试一次（保护 GLM coding-plan 配额）；其余错误指数退避。

**Why**：把"选模型 / 配额分类 / 重试边界"集中到 `src/lib/llm.ts` 与 `LLMClient`，是双模型路由与 Quota 降级能成立的前提；任何未配置的非主模型自动回退 primary，保证无 fast key 时行为等同升级前。

---

<a id="12"></a>
## 12. 区块链数据获取 / Blockchain Fetcher — `src/lib/blockchain/`

`fetchContractSource(address, blockchain)`（fetcher.ts:430）实现**三层级联**：
1. **Etherscan V2 API**（`fetchFromEtherscanV2`）：`etherscanUrlSafe` 强制 `chainid` 在前、`apikey` 在后（V2 要求）；`getApiKey` 按 settings→env→per-chain 解析；**代理解析** `Proxy==='1'` 时跟随 `Implementation` 抓真实逻辑合约（深度 1）；多文件源码 `{{` 展平。
2. **Sourcify**（`fetchFromSourcify`）：先 `full_match` 后 `partial_match`，仅当 `config.sourcifySupported`。
3. **Heimdall / panoramix 反编译**（`decompileWithHeimdall`）：`heimdall decode` 或 Python `panoramix`，`sourceType:'decompiled'`。

- `fetchContractWithCache`（498）：按 `blockchain:address` 内存 memoize；Sourcify 用 `AbortSignal.timeout(10000)`。
- `config.ts`：`BLOCKCHAIN_CONFIG` 7 链（ethereum/bsc/arbitrum/base/opbnb/sei/hyperliquid），各含 chainId/explorerUrl/rpcUrl/sourcifySupported；`ETHERSCAN_V2_BASE_URL='https://api.etherscan.io/v2/api'`。

**Why**：合约源码是分析的前提，但链上数据分散且可能未验证。三级回退（验证源码→开源仓库→反编译）最大化"能拿到代码"的概率；代理解析保证拿到的是真实逻辑而非代理壳；缓存避免重复 RPC 消耗。

---

<a id="13"></a>
## 13. 存储层 / Storage — `src/lib/storage/`

- `blob.ts`（64 行）：底层 `.storage` JSON 读写（`saveJSON/loadJSON/listFiles/deleteFile`），`STORAGE_DIR=process.cwd()/.storage`。
- `data.ts`（165 行）：领域加载器，零配置可运行。
  - `loadVulnerabilityPatterns`（81）：内存缓存（TTL 5min）→ **尝试 Prisma** `vulnerabilityPattern.findMany`（映射 codeFeatures/relatedAttacks JSON 回数组）→ **回退 `vulnerabilities.json`**（兼容 array 与 `{patterns}`）；Prisma 缺失时 `try/catch` 静默降级到 JSON。
  - `loadHistoryCases/saveHistoryCases`（65/70）：33 案例（含 `pattern_ids`）。
  - `saveReport/loadReport`（159/163）：写 `reports/{id}.json`。
- `settings.ts`（118 行）：`.storage/settings.json` 的 `AppSettings`（etherscanApiKey/per-chain keys/passwordHash/llmModel/jwtSecret）；`getSetting` 优先级 settings>env>default；`maskSecret` 安全显示。
- `prisma.ts`：全局 `PrismaClient` 单例（dev 热重载用 `globalThis` 守护）。

**Why**：JSON 文件是通用兜底与种子数据唯一源（`init` 路由把 `data/*.json` 拷到 `.storage`）；Prisma 作为可插拔升级路径（T6）藏在缓存之后。零 DB 配置即可运行，降低部署门槛。

---

<a id="14"></a>
## 14. 鉴权与安全 / Auth & Security

- `auth/jwt.ts`（119）：`JWT_SECRET` 来自 env（含开发硬编码回退，生产应设 env）；`verifyPassword`（bcrypt 比较，未设哈希则明文开发比对）；`createSession` 用 `jose` 签 HS256、24h、写入 **httpOnly + sameSite=strict** cookie；`verifySession/isAuthenticated/destroySession`。
- `auth/middleware.ts`：`withAuth(req, handler)` 未认证返回 401；多数路由直接 `isAuthenticated()` 守卫。
- `security.ts`：`checkRateLimit`（60s/10 次，内存）、`sanitizeAddress`（截 42 字符）、`sanitizeContractName`、`validateSourceCode`（≤500KB）。
- **密钥不入库**：所有 API key 走 env/settings，不进代码或提交。

**Why**：JWT 存 httpOnly cookie（而非 localStorage）降低 XSS 令牌窃取风险；bcrypt 抵御口令破解；速率限制 + 输入清洗 + 大小校验抵御滥用与资源耗尽；密钥环境变量化满足"禁止硬编码密钥"的约束。

---

<a id="15"></a>
## 15. API 路由 / API Routes

- **`/api/analyze/state.ts`**（74 行）：`TaskStateManager` 单例，`Map<taskId, TaskState>` + `Map<taskId, Set<TaskSubscriber>>`。`TaskState`（status/progress/stage/details/...）；`subscribe` 返回取消订阅；`cleanupStale` 每 60s 清 30 分钟以上任务。
- **`/api/analyze/route.ts`**（404 行）：
  - **POST**（31）：auth + 限流 + 解析 `formData`（`type=address|file`）；address 模式 `sanitizeAddress` + 校验 + 链支持检查 + `fetchContractSource`；file 模式读文本 + 大小校验（≤500KB）。
  - 建 `taskId`，`updateTaskStatus` 同时写**内存 Map 与 `tasks.json`**（单一状态机 + 磁盘持久）。
  - 异步 `runAnalysis` 后**立即返回 `{taskId}`**（fire-and-forget）。
  - **GET SSE**（`/{taskId}/stream`，202-247）：`ReadableStream` 立即推当前状态，再 `subscribe` 逐次推送，`completed/failed` 关闭。
  - **GET 轮询**（`?taskId=`，249）：返回内存状态，否则 `tasks.json`。
  - `runAnalysis`（273）：`onProgress` 把阶段/进度推给 `taskStates`；`new AuditOrchestrator(onProgress).run(...)`；**partial**（'partial' in result）写 `report_partial_*` + 历史；完整写 `report_*` + 中间结果；外层 `.catch` 配额→partial 否则 failed。
- **`/api/batch-audit/route.ts`**（437 行）：POST 建批 → `runBatchAudit` **顺序**执行（每 case 500ms 间隔，无 SSE 仅轮询 `batch_tasks.json`）；有源码→`orchestrator.run`，否则 `runFromContext`；配额/partial 时**停止整批**保留已完成。
- 其余路由：`cases`（案例 CRUD）、`history`（历史）、`reports`（format=html|pdf|json）、`settings`、`vulnerabilities`（暴露 21 模式）、`init`（种子 `.storage`）、`export`、`diagnose`（Etherscan `eth_blockNumber` 探活）。

**Why**：分析是长任务，fire-and-forget + 内存 pub/sub 状态机 + SSE 让前端实时显示阶段进度；磁盘 `tasks.json` 镜像保证重启后可轮询；partial 持久化与批量停机保证配额耗尽不丢数据。

---

<a id="16"></a>
## 16. 报告生成 / Report Generation

- **`report-templates/index.ts`**（534 行）：`reportLabels`（10，完整 EN/CN 标签字典）；`generateHTMLReport(report, lang='cn')`（298）是**主产物**——内联 CSS、严重度网格、漏洞卡片（含代码片段/历史案例/建议）、按严重度与按模式的风险矩阵、分阶段修复计划、`@media print`。`escapeHtml`（532）防注入。
- **`pdf/generator.ts`**（433 行）：`generateReportPDF`（14）用 `pdf-lib` + 标准 Helvetica 字体渲染 A4（标题页、严重度分布、每漏洞卡片、markdown 正文、页码）。`getSeverityColor`（384）按严重度着色，`sanitizeText`（428）ASCII-only。
- **`reports/route.ts`**：`?format=html|pdf|json` 分发到上述三种。

**Why**：HTML 是默认人机可读产物（完整双语、可打印）；PDF 因 `pdf-lib` 标准字体无法渲染中文，故为标准字体英文导出（仅作二次导出）。报告消费编排器算出的**确定性元数据**（攻击成本、修复时限、SWC/OWASP 引用），LLM 被告知"直接采用、勿重算"，保证报告数值稳定可信。

---

<a id="17"></a>
## 17. 提示词体系 / Prompts

- **`prompts/vulnerability.ts`** — `VULNERABILITY_SYSTEM_PROMPT`（380 行，21 模式权威源）：
  - 人设："资深 DeFi 审计师"，**"信任代码而非注释"**（:3）——对抗误导性的 NatSpec。
  - 工作流 5 步（架构理解→逐函数模式匹配→保护验证→历史关联→风险评级）。
  - 每模式含 `PRIMARY SCOPE / Code Features / Do NOT flag if / Related Attacks`。
  - **12 条消歧规则**（:289-303）：OD-01 vs LR-01、OD-03 vs AC-02、CL-01 范围、OD-02 vs OD-01、LR-03 范围、TO-01、TO-02 vs CL-03、CR-03 验证、OD-04 vs OD-05、CR-01 vs CR-04、AC-01/02/03、TO-03 范围——避免重复/过度报告。
  - **严格 JSON 输出契约**（:315-379）：只输出 `{summary, vulnerabilities}`，无 `findings` 键；质量优先，仅 Medium+；空数组合法。
- **`prompts/report.ts`** — `REPORT_SYSTEM_PROMPT`（143 行）：中文报告作者规范，6 段结构；显式要求**逐字消费系统算出的确定性元数据**（攻击成本区间、修复时限、SWC/OWASP 引用），"不要重新估算"。

**Why**：审计 prompt 是"降误报"的第一道防线——`PRIMARY SCOPE` + 消歧规则让模型先判函数金融角色再匹配，避免把通用整数除法误报成 CL-01。严格 JSON 契约 + 空数组合法 + "勿编造"指令，直接压低幻觉式填充。

---

<a id="18"></a>
## 18. 数据资产 / Data Assets — `data/`

| 文件 File | 结构 Schema | 角色 Role |
|---|---|---|
| `vulnerabilities.json` | 顶层 **array** 21 条，每条约 `{id, category, name, code_features[], related_attacks[], severity, references{swc, owasp}}` | 21 模式唯一源；`loadVulnerabilityPatterns` 读（Prisma 或 JSON），`GET /api/vulnerabilities` 暴露 |
| `history.json` | `{cases:[{id, time, blockchain_platform, attack_transaction, victim_contract_address, note, vulnerability_pattern(自由文本), pattern_ids[21模式ID]}]}` | 33 真实案例；全部带 `pattern_ids` 以供 historicalCaseSupport 校准 |
| `pattern-weights.json` | `{version, rubric, patterns:{<id>:{weight, scores:{d,r,k}, rationale}}}` | `budget.ts` 迭代预算输入，`weight=round((d+r+k)/3)` 夹 [1,5] |
| `pattern-cost-profiles.json` | `{fallback:{gasLow,gasHigh,flashLoanNeeded}, patterns:{<id>:{gasLow,gasHigh,flashLoanNeeded,rationale}}}` | `estimator.ts` 每模式 gas 区间 + flashloan 标志 |
| `protocol-risk-profiles.json` | `{<protocol>:{priorityVulns[], flashloanExposure, oracleDependency}}` 9 键 | 协议→优先级漏洞映射（与 detector 内置映射互补），驱动 `ContextManager` 聚焦 |

**Why**：数据资产与代码逻辑分离，使"增模式=加数据"而不动代码；`pattern_ids` 校准使历史案例支持成为可量化维度；各 profile 把"领域判断"（权重/成本/优先级）外置为可审阅、可调整的 JSON，而非散落常量。

---

<a id="19"></a>
## 19. 设计原理总结 / Design Principles

贯穿全系统的统一设计哲学（每条对应具体模块）：

1. **确定性优先于 LLM 猜测 / Determinism over LLM guesswork**：成本估算、迭代预算、协议识别、消歧规则、误报抑制——能确定性算的绝不交给模型猜。理由：可复现、可审计、不幻觉。
   - 对应：§10（成本/预算）、§5.1（正则识别）、§17（消歧）、§5.5（protection-filter）。
2. **优雅降级 / Graceful degradation**：任何外部不可控（配额、断网、未验证合约、解析失败）都降级而非崩溃。
   - 对应：§4.5（配额/超时）、§7（partial result）、§5.2（RAG/跨合约非致命）、§9（追踪降级）、§12（三层级联）。
3. **结构化数据解耦 / Decoupled via structured data**：Agent 间只传不可变结果对象，无共享可变状态，可中断恢复、可并发、可替换单阶段。
   - 对应：§3（数据流）、§7（编排器）。
4. **Token 预算治理 / Token-budget governance**：prompt 截断"保价敏函数、丢样板"，上下文只取本协议优先级子集。
   - 对应：§5.4（PromptOptimizer 截断）、§5.2（模式/案例过滤）。
5. **RAG 学习闭环 / Learning loop with guardrails**：高置信度/PoC 验证才入库，按地址去重，评估模式禁用，防知识库污染。
   - 对应：§8（case-ingester）。
6. **可序列化状态 / Serializable state**：union literal + 纯接口，状态可序列化以支持中断恢复与并发审计。
   - 对应：§4.1（类型系统）、§4.2（`getState` 浅拷贝 + `finally` 清 working）。
7. **安全默认 / Secure-by-default**：JWT httpOnly、bcrypt、密钥环境变量化、输入清洗与限流、确定性元数据不重算。
   - 对应：§14（鉴权/安全）、§16（报告消费确定性元数据）。
8. **垂直深度而非广覆盖 / Vertical depth, not breadth**：只做价格操纵 21 模式，模式级而非通用告警级，跨合约语义推理填补盲区。
   - 对应：§1（主张）、§6（重建）、§9（跨合约）。

**Why**：这些原则共同回答了"为什么是 Agent 而非单流水线"——OTAU 循环 + 收敛早停让分析可迭代深化（省 token 且更深入），编排器让各专用 Agent 各司其职，结构化数据 + 三层记忆 + RAG 让系统能"记住并复用"过往审计经验，双模型路由 + Quota 降级让昂贵推理在成本可控下可持续。

---

> 文档结束 / End of documentation. 本文件不修改任何源码，仅描述 `eval/` 之外已实现系统的实际行为。
