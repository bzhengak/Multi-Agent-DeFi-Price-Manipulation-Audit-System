# DeFi 价格操纵多 Agent 审计系统 — 实施手册（v1.2）

> 基于上一轮专家评审结论产出的可执行两轨计划。**用户手动**与**代码 Agent 任务**分轨列；总人天 26–36（约 5–7 周）。
> 命名：Mxxx = 手动任务；Txxx = 代码 Agent 任务；Hxxx = 隐藏任务。
> 路径基准：项目根目录 `/workspace/Multi-Agent-DeFi-Price-Manipulation-Audit-System/`。
> v1.2 变更：T7 已移除（Slither + TS AST 双层验证 descoped），依赖 LLM-only 推理 + 跨合约图。Mythril 方案降级到附录 C（"完整版"future work）。

---

## 0. 顶层时间线

```
Week 1     ▣ M1-M3 (环境)   ▣ H1 (SQLite)   ▣ T1 (OTAU 真实接入)         ▣ T2, T3
Week 2     ▣ T5 (结构化输出)   ▣ T4 (提前停止)   ▣ M7 (模式 ID 校准)        ▣ T6 (Prisma 迁移)
Week 3     ▣ T9 [x] (per-vuln overlay)   ▣ T10 [x] (确定性成本)   ▣ T14 [x] (SSE 状态机)

Week 5     ▣ T12 (评估 harness + 跑一次)
Week 6     ▣ T15 [x] (双模型路由 + Quota 降级)   ▣ T13 (文档定稿)  ◀  最低毕业线
Week 7     ▣ T8 (跨合约)   ▣ T11 (自适应迭代)  ◀  stretch goal
```

> 关键路径是 T1 → T2 → T8 → T12 → T13。任何一步卡住，先回来补这一步，不要往下堆。

---

## 第一部分：你必须手动做的事（M1–M7）

> 这 7 项是 **代码 Agent 没法替你做的**——要么涉及外部账户/密钥，要么涉及领域判断，要么是流程节点。每条都说明为什么要手动、要做多久、产物是什么。

### M1｜配置 LLM API 访问（30 分钟）

**为什么手动**：API key 不能进代码、不能进 commit。
**步骤**：
1. 登录智谱 / OpenAI 控制台，开通以下任一：
   - 智谱 GLM-5.1（项目当前默认，`z-ai-web-dev-sdk`），用于主力推理。
   - OpenAI GPT-4.1（用于结构化输出与对比基线）。
2. 在项目根目录 `.env`（已存在 `.env.example`）填入：
   ```
   GLM_API_KEY=...
   OPENAI_API_KEY=...
   ```
3. 设置双源 fallback：若 GLM 失败/超时，自动切 OpenAI。
**产物**：`/workspace/Multi-Agent-DeFi-Price-Manipulation-Audit-System/.env` 文件（不进 git）。
**验收**：`curl` 项目本地 `/api/diagnose` 返回 200。

### M2｜DefiLlama / CoinGecko / Etherscan V2 账户（v1.2 修订：0 操作 + 1 可选）

> **修订**：M2 实际只需要 Etherscan V2 key（项目本来就用）。DefiLlama 公共 API 完全开放，无需账户；CoinGecko 可选。

**步骤**：
1. **Etherscan V2**（必做）：沿用 M1 已经配好的 `ETHERSCAN_API_KEY`。
2. **DefiLlama**（0 操作）：直接用 `https://api.llama.fi/tvl/{slug}`，无 key。把 URL 写进 `lib/data/defillama.ts` 常量即可。
3. **CoinGecko**（可选）：`simple/price` 端点无 key 可用，限速 10–30 req/min。**只在 T12 评估时**才需要 key（防止 IP 被 ban）。如果想稳，注册 free demo key 5 分钟搞定，写入 `.env` 的 `COINGECKO_API_KEY`。
**产物**：`.env` 中 1 个 key（Etherscan，已在 M1 配）+ 1 个 URL 常量。
**验收**：
```js
// Node REPL
fetch('https://api.llama.fi/tvl/aave').then(r=>r.json()).then(console.log)
// 返回 {tvl: ..., ...}

fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd').then(r=>r.json()).then(console.log)
// 返回 {"ethereum":{"usd":...}}
```

### M3｜准备评估硬件（30 分钟）

**为什么手动**：T12（Foundry 跑 mainnet fork）对内存/磁盘要求不低。
**步骤**：
1. 检查 Docker 可用：`docker run --rm hello-world`。
2. **Slither 装在 Python venv**（不是 Docker）：
   ```bash
   pip install slither-analyzer
   slither --version  # 应 >= 0.10
   ```
3. 拉基础镜像：`docker pull mythril/myth:latest`（约 1.2 GB，留作 future work）。
4. 确认 Foundry：`curl -L https://foundry.paradigm.xyz | bash && foundryup`。
5. 准备至少 30 GB 可用磁盘（Foundry 缓存 + DeFiHackLabs 子模块）。
**产物**：本地 Slither + Foundry 都可用。
**验收**：
```bash
slither --version      # >= 0.10
forge --version        # >= 0.4.0
```

### M4｜确定 21 个 pattern 的"complexity weight"（2–3 小时）

**为什么手动**：T11 自适应迭代预算要 per-pattern 权重。这是个**领域判断**，不能 LLM 拍脑袋。
**步骤**：
1. 打开 `data/vulnerabilities.json`，打印 21 个 pattern 的列表。
2. 准备一个 Excel/Notion 表格，列：`pattern_id / category / severity / weight(1-5) / rationale`。
3. 评分参考：
   - 涉及多合约/多调用链（CR-01..04、TO-03）= 4–5
   - 涉及链上价格/时间窗口（OD-01..05）= 3–4
   - 涉及本地数学/权限（AC-01..03、CL-01..03）= 2–3
   - LR-01..03 = 3
4. 写完后产出一个 `data/pattern-weights.json`：
   ```json
   {
     "OD-01": {"weight": 4, "rationale": "Spot price direct, multi-block manipulation"},
     "OD-02": {"weight": 3, "rationale": "TWAP window is contract-defined"},
     ...
   }
   ```
**产物**：`data/pattern-weights.json`。
**验收**：每个 weight 在 1–5 区间，rationale 不为空。

### M5｜从 DeFiHackLabs 选 5–10 个 PoC（3–4 小时）

**为什么手动**：选哪些攻击当正样本决定了你论文的 credible。
**步骤**：
1. `git clone https://github.com/zeke-02/DeFiHackLabs`，浏览 `src/test/`。
2. 对照你的 21 个 pattern 表，每个 pattern 至少挑 1 个真实事件：
   - 偏好 2024–2025 事件（更新鲜）。
   - 必须有 Foundry 测试 + 攻击 tx hash。
   - 排除 2022 年以前的（形态可能不符合当前 Solidity 版本）。
3. 产出清单 `eval/dataset/positives-additional.csv`：
   ```csv
   pattern_id,protocol,date,tx_hash,source_url,foundry_path
   OD-01,Harvest,2020-10-26,0x...,https://...,src/test/2020-10/Harvest_exp.sol
   ...
   ```
4. 与 `data/history.json` 的 33 个 case 求并集，去重。
**产物**：`eval/dataset/positives-additional.csv`。
**验收**：合计正样本 ≥ 40，单个 pattern ≥ 2 个。

### M6｜选 5 个负样本（2 小时）

**为什么手动**：负样本的"辣度"决定你 FP rate 的可信度。
**步骤**：
1. 准备清单：
   - Aave V3 PriceOracle：`0x54586E75E2d4f47e2F8B6d16F3D8a4C7e2a3C1e2`（Ethereum mainnet, Certora 审计过）
   - Uniswap V3 core：直接拉源码（[github.com/Uniswap/v3-core](https://github.com/Uniswap/v3-core)）
   - Compound cETH：源码 + 地址清单
   - OpenZeppelin ERC20 v5 + ERC4626 v6
   - MakerDAO PSM-USDC：`0x89...` 链上
   - **辣样本**：从 [awesome-openzeppelin](https://github.com/OpenZeppelin/awesome-openzeppelin) 里挑一个用 `getReserves()` 做 accounting 的 NFT 项目（不是 DEX！），验证系统不会把 `getReserves()` 调到处都报 OD-01。
2. 对每个负样本准备：合约地址（或源码路径）、链 ID、为什么它不该报 Positive。
**产物**：`eval/dataset/negatives.csv`。
**验收**：5–6 行；每个负样本有明确"无漏洞"依据。

### M7｜校准 33 个历史 case 的 `vulnerability_pattern` 字段到 21 个 pattern ID（4–6 小时）

**为什么手动**：当前 `data/history.json` 的 `vulnerability_pattern` 是自由文本（"Flash Loan Attack" / "Oracle Manipulation"），T6 之后必须对齐到 OD-01..CR-04 的具体 ID，否则 Stage 3 的 `historicalCaseSupport` calibration 维度失效。
**步骤**：
1. 打开 `data/history.json`。
2. 对每个 case 读 `note` 字段，判断对应哪个 pattern ID（一个 case 可能对应多个，用 `pattern_ids: ["OD-01", "TO-01"]` 数组形式）。
3. 加一个 `pattern_ids` 字段到每个 case 对象（保留原 `vulnerability_pattern` 自由文本字段以防兼容）。
4. 用 `pnpm tsx scripts/validate-pattern-ids.ts` 跑一遍校验（这一步是 T6 写的小工具；先在草稿里手写校验）。
**产物**：更新后的 `data/history.json`。
**验收**：每个 case 至少有 1 个 `pattern_ids`；统计后每个 pattern 至少对应 1 个 case。

---

## 第二部分：交给代码 Agent 的任务（T1–T15 + H1）

> 每个任务**都可由代码 Agent 在单 PR 内完成**。任务卡片下方是手把手可读的 spec。
> 提交规范：每个任务一个 feature branch（如 `feat/t1-otau-loop`），跑通验收标准后提 MR。

---

### H1｜MemorySystem 改为 SQLite 后端（隐藏工作 · 0.5 天 · S 难度）

**问题**：`core/memory/memory.ts` 的 `episodic` 层用文件 + JSON 序列化，并发审计时 race condition；T1 之前必须修。

**Spec 给代码 Agent**：
- **新增** `lib/memory/sqlite-store.ts`：
  - 用 `better-sqlite3`（`pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3`）。
  - 单表 `episodic(agent_id TEXT, session_id TEXT, ts INTEGER, kind TEXT, payload TEXT, PRIMARY KEY(agent_id, session_id, ts))`。
  - 提供 `append(record) / query(agentId, sinceTs) / clear(agentId)` 三个方法。
- **改** `core/memory/memory.ts`：
  - `episodic` 从文件后端切换到 SQLite。
  - 默认 DB 路径 `.storage/memory.sqlite`，加入 `.gitignore`。
- **改** `core/memory/storage-adapter.ts`：保留 API 不变。
- **不动的**：`working` / `semantic` 保持原样。
- **测试**：
  ```ts
  // __tests__/memory/sqlite-store.test.ts
  test('并发写不丢', async () => {
    const store = new SqliteStore(':memory:');
    await Promise.all(Array(100).fill(0).map((_,i) => store.append({agent_id:'a',session_id:'s',ts:i,kind:'observation',payload:JSON.stringify({i})})));
    expect(store.query('a',0).length).toBe(100);
  });
  ```

**验收**：`pnpm vitest run memory` 全部通过；本地跑 3 个并发 `/api/analyze`，`episodic` 记录数 = 3 × 实际轮数。

---

### T1｜OTAU 循环真正接通 ToolRegistry + MemorySystem（2 天 · M 难度）

**问题**：`VulnerabilityAnalysisAgent.act()` 直接调 `this.llm.getJSON(...)`，绕过 `ToolRegistry` 与 `MemorySystem`；OTAU 是装饰性的。5 个 future work 的前提不成立。

**Spec**：
- **改** `audit/vulnerability/vulnerability-agent.ts`：
  - 构造时 `this.tools.register('llm_analyze', this.llmCallTool)`、`this.tools.register('llm_summarize', this.llmSummarizeTool)`。
  - `act(thought)` 改为：
    ```ts
    if (thought.action === 'finalize') return { ... };
    const result = await this.tools.execute('llm_analyze', {
      system: this.promptOptimizer.optimizeSystemPrompt(meta.classification!),
      user: this.buildAnalysisPrompt(meta, this.state.iteration),
    });
    meta.iterationResults.push(result.data);
    return { action: thought, success: true, output: result.data, duration: ... };
    ```
  - `update(result)` 写 episodic memory：
    ```ts
    await this.memory.remember({
      kind: 'iteration',
      iteration: this.state.iteration,
      thought, action, result,
    });
    ```
- **新增** `core/tools/llm-tool.ts`：`LlmAnalyzeTool` 与 `LlmSummarizeTool` 的封装，wrap 现有 `llm.getJSON`。
- **不动的**：`BaseAgent.run()` 的循环框架、`AgentState` schema。
- **测试**：
  ```ts
  test('act() 通过 ToolRegistry 调用', async () => {
    const spy = vi.spyOn(tools, 'execute');
    await agent.act(thought);
    expect(spy).toHaveBeenCalledWith('llm_analyze', expect.any(Object));
  });
  test('update() 写 episodic memory', async () => {
    await agent.update(result);
    const mems = await memory.recall({ kind: 'iteration' });
    expect(mems.length).toBe(1);
  });
  ```

**验收**：`pnpm vitest run vulnerability-agent` 通过；本地跑 `/api/analyze`，日志里看到 `tool.execute llm_analyze`；`.storage/memory.sqlite` 里出现迭代记录。

---

### T2｜PromptOptimizer 实例化 + 接入 act()（0.5 天 · S 难度）

**问题**：`audit/vulnerability/prompt-optimizer.ts` 写好了但零调用。8 种协议同系统 prompt 是 Stage 3 命中率的天花板。

**Spec**：
- **改** `audit/vulnerability/vulnerability-agent.ts`：
  - 加 `private promptOptimizer = new PromptOptimizer();`
  - 构造时不需要参数。
  - `act()` 中（接 T1）：
    ```ts
    const sys = this.promptOptimizer.optimizeSystemPrompt(meta.classification!);
    ```
  - 同时把 `VulnerabilityAnalysisAgent` 的 config 加一个 `optimizeSystemPrompt: boolean` 开关（默认 `true`），方便 A/B 对比。
- **测试**：
  ```ts
  test('dex_amm 增强 prompt 含 "恒定乘积不变量"', () => {
    const prompt = optimizer.optimizeSystemPrompt({type:'dex_amm', ...} as ProtocolClassification);
    expect(prompt).toMatch(/恒定乘积不变量|invariant/);
  });
  test('lending 增强 prompt 含 "清算"', () => {
    const prompt = optimizer.optimizeSystemPrompt({type:'lending', ...} as ProtocolClassification);
    expect(prompt).toMatch(/清算|liquidation/);
  });
  ```

**验收**：vitest 通过；本地跑同一份 ERC20 借贷合约，Stage 3 命中的 priority vuln 数 ≥ baseline（用 T1 之前的代码对比）。

---

### T3｜Per-stage 超时（0.5 天 · S 难度）

**问题**：`AuditOrchestrator` 总超时 1,000,000 ms 粗粒度，调试时看不出哪个 stage 慢。

**Spec**：
- **改** `audit/orchestrator/audit-orchestrator.ts`：
  - 构造时接收 `stageBudgets?: Partial<Record<StageName, number>>`，默认：
    ```ts
    {
      protocol_detection: 5_000,
      context_building: 10_000,
      vulnerability_analysis: 600_000,
      attack_reconstruction: 60_000,
      confidence_calibration: 5_000,
      report_generation: 60_000,
    }
    ```
  - 每个 stage 的实际执行包成 `Promise.race([stageFn(), timeoutAfter(budget)])`。
  - 超时错误带 `stage` 字段，UI 友好。
- **改** `app/api/analyze/route.ts`：透传 `stageBudgets` 参数（可选）。
- **测试**：
  ```ts
  test('Stage 3 超时抛带 stage 字段', async () => {
    const orch = new AuditOrchestrator(undefined, { vulnerability_analysis: 1 });
    await expect(orch.run('contract', 'C', 'ethereum')).rejects.toThrow(/vulnerability_analysis/);
  });
  ```

**验收**：vitest 通过；手动给 Stage 3 注 1s budget，能在错误信息里看到 `stage: 'vulnerability_analysis'`。

---

### T4｜置信度差值提前停止（0.5 天 · S 难度）

**问题**：`maxIterations: 5` 是硬常量；一个简单 ERC20 跑 5 轮浪费 token；一个 Aave V3 5 轮可能不够。

**Spec**：
- **改** `audit/vulnerability/vulnerability-agent.ts`：
  - 加私有字段 `prevCalibratedScore: number | null`。
  - `update(result)` 增加：
    ```ts
    const currScore = this.computeCalibratedScore(result);
    const delta = this.prevCalibratedScore === null ? 1 : Math.abs(currScore - this.prevCalibratedScore);
    this.prevCalibratedScore = currScore;
    this._meta.convergenceDelta = delta;
    ```
  - `think()` 末尾判断：若 `delta < 0.05 && this.state.iteration >= 2` → 返回 `{ action: 'finalize', confidence: 0.85, reasoning: 'converged' }`。
- **可观测**：每轮的 `convergenceDelta` 写入 `AgentState.metadata`，方便 UI 显示。
- **测试**：
  ```ts
  test('简单合约 2 轮内 finalize', async () => {
    const agent = new VulnerabilityAnalysisAgent(simpleERC20Source, 'C', 'ethereum', undefined, 5);
    const r = await agent.run();
    expect(r.iterations).toBeLessThan(5);
  });
  ```

**验收**：用 OpenZeppelin ERC20 跑审计，`iterations ≤ 3`；`convergenceDelta` 字段在 final report 中可查。

---

### T5｜LLM 改为结构化输出（1 天 · M 难度）

**问题**：当前 `llm.getJSON(system, user)` 剥 markdown 围栏再 parse JSON，脆弱。LLM 升级或多 step 推理后 JSON 解析失败率 ~20%。

**Spec**：
- **改** `core/llm-client.ts`：
  - 新增方法 `getStructuredJSON<T>(system, user, jsonSchema, options)`：
    - 优先用 OpenAI `tools: [{type:'function', function:{name:'emit', parameters: jsonSchema}}]`，`tool_choice: {type:'function', function:{name:'emit'}}`。
    - 备选：OpenAI `response_format: { type: 'json_schema', json_schema: { ... } }`。
    - 最后 fallback：保留旧 `getJSON`（剥围栏）。
  - 每种模式用 env var 切换：`LLM_OUTPUT_MODE=tool|json_schema|markdown`。
- **改** `audit/vulnerability/vulnerability-agent.ts`：T1 的 `llm_analyze` tool 改用 `getStructuredJSON`，传 `VulnerabilityAnalysisResult` 的 Zod schema。
- **改** `core/llm-client.ts` 的 LLM 客户端 wrapper：检测到 z-ai-web-dev-sdk 不支持 `tools` 时降级到 `json_schema`。
- **测试**：
  ```ts
  test('结构化输出 100 次无解析失败', async () => {
    const llm = new LLMClient();
    for (let i = 0; i < 100; i++) {
      const r = await llm.getStructuredJSON(sys, prompt, schema);
      expect(schema.safeParse(r).success).toBe(true);
    }
  });
  ```

**验收**：vitest 通过（100 次连续无失败）；本地审计 5 个真实合约，console 无 `JSON parse error`。

---

### T6｜模式搬进 Prisma + CLI ingest 脚本（2 天 · M 难度）

**问题**：`data/vulnerabilities.json` 是静态资产，更新需重新部署；中期报告 §5 第 1 条 future work 的前置依赖。

**Spec**：
- **改** `prisma/schema.prisma`：新增模型
  ```prisma
  model VulnerabilityPattern {
    id            String   @id           // e.g. "OD-01"
    category      String                  // "Oracle Dependency" 等
    name          String
    codeFeatures  String                  // JSON
    relatedAttacks String                 // JSON
    severity      String                  // "Critical" | "High" | "Medium" | "Low"
    swcRefs       String?                 // "SWC-123"
    owaspRefs     String?                 // "SC03:2026"
    updatedAt     DateTime @updatedAt
  }
  ```
- **新增** `scripts/ingest-patterns.ts`：
  - 读 `data/vulnerabilities.json`，逐条 upsert 到 DB。
  - 校验：每个 pattern 的 `id` 唯一，`category` ∈ 6 大类之一。
  - 校验失败 exit 1。
- **改** `lib/storage/data.ts`：把 `loadVulnerabilities()` 改为从 Prisma 读，加内存缓存（5 分钟 TTL）。
- **新增** `scripts/regenerate-patterns-json.ts`：从 DB 导出回 `data/vulnerabilities.json`（保证 source of truth 单向）。
- **改** `package.json` scripts：
  ```json
  "ingest:patterns": "tsx scripts/ingest-patterns.ts data/vulnerabilities.json",
  "regenerate:patterns": "tsx scripts/regenerate-patterns-json.ts"
  ```
- **不动的**：`data/vulnerabilities.json` 本身（继续作为单源数据）。
- **测试**：
  ```ts
  test('ingest 21 条 + 重复 idempotent', async () => {
    await ingest('./data/vulnerabilities.json');
    expect(await prisma.vulnerabilityPattern.count()).toBe(21);
    await ingest('./data/vulnerabilities.json');  // 再跑一次
    expect(await prisma.vulnerabilityPattern.count()).toBe(21);
  });
  ```

**验收**：
- `pnpm prisma migrate dev --name add_vulnerability_pattern` 通过。
- `pnpm ingest:patterns` 成功，`prisma.vulnerabilityPattern.count() === 21`。
- 跑 `/api/vulnerabilities` 返回的列表与原 JSON 完全一致。

---

### T8｜跨合约污点子 Agent（5–8 天 · L 难度）

**问题**：中期报告 §5 第 2 条 future work。当前完全没有 call graph / 依赖图。Rari/ibETH 这种"通过外部合约 fallback 间接操纵"是当前系统的盲区。

**Spec**：
- **新增** `lib/agents/audit/cross-contract/cross-contract-tracer.ts`：
  - 用 `@nomicfoundation/solidity-analyzer`（`pnpm add @nomicfoundation/solidity-analyzer`）解析源码。
  - 抽出所有 `.call(...)` / `IERC20(0x...)` / `IPool(0x...)` / `IOracle(0x...)` 形式的外部调用，得到 `(from, selector, target_address, type)` 列表。
  - 调用现有 `lib/blockchain/fetcher.ts` 批量拉取 `target_address` 的源码（带缓存 + 30 s 超时 + 失败重试）。
  - 递归深度上限 2（再深就 exponential，不值得）。
- **改** `audit/context/context-manager.ts`：
  - `build()` 中调用 tracer，得到 `crossContractGraph: { nodes: Contract[], edges: Call[] }`。
  - 把图注入 `AnalysisContext`。
- **改** `audit/vulnerability/vulnerability-agent.ts`：
  - 在 `buildAnalysisPrompt` 中追加：
    ```
    ## 外部调用上下文
    本合约引用了以下外部合约：
    - 0xABC... (ERC20 USDT)
    - 0xDEF... (Uniswap V3 Pool)
    ...
    请特别检查 CR-01..04 跨协议价格依赖类漏洞。
    ```
  - 源码在 prompt 里用引用号代替：`[1] 0xABC...: <line 1-10>`、`[2] 0xDEF...: <line 1-30>`，每个引用给 50 行上下文。
- **改** `audit/orchestrator/audit-orchestrator.ts`：
  - 在 Stage 2 与 Stage 3 之间插入 progress 事件：`stage: 'cross_contract_tracing'`。
  - tracer 失败时（断网、未验证合约）降级为单合约分析，不报错。
- **测试**：
  ```ts
  test('Rari 风格合约生成跨合约图', async () => {
    const ctx = await contextManager.build(rariSource, 'Rari', 'ethereum', classify, undefined, 'deep');
    expect(ctx.crossContractGraph.nodes.length).toBeGreaterThan(0);
  });
  ```

**验收**：
- 喂入 Rari 风格合约（可从 [BlockSec@ZHU write-up](https://zhuanlan.zhihu.com/p/372037729) 拿），报告里出现 CR-04 finding。
- 喂入单文件 ERC20，tracer 输出 `nodes: []`，无报错。

---

### T9｜攻击重建改为 per-vulnerability 覆盖模板（Data-Driven Overlay + LLM Hybrid）（1 天 · M 难度 → 已实现）

**问题**：`audit/reconstruction/price-manipulation.ts` 的 `CATEGORY_TEMPLATES` 按 `OD/LR/TO/AC/CL/CR` 组织，CR-03 和 LR-02 报告的叙事几乎一样。

**实现方案（三层架构）**：

```
Layer 1: 6 CATEGORY_TEMPLATES    → 骨架（6-phase 步骤流）
Layer 2: 21 PATTERN_OVERLAYS     → 每模式差异（step/defense/fundFlow 覆盖）
Layer 3: Per-Finding LLM 注入     → attackVector→execution step, description→exploitation
         ↑ mergeTemplate() 运行时融合
```

**Spec（已实现）**：
- **改** `audit/reconstruction/types.ts`：加 `PatternOverlay`、`TemplateInput` 接口。
- **改** `audit/reconstruction/price-manipulation.ts`：
  - 保留 6 个 `CATEGORY_TEMPLATES`（经 DeFi 审计专家优化：actor 统一、phase 语义修正、defenses 去耦合）
  - 新增 `PATTERN_OVERLAYS: Record<patternId, PatternOverlay>`（21 个 key，每个 10-25 行数据式覆盖）
  - 新增 `mergeTemplate(category, input)` 函数实现三层融合：base → overlay → per-finding LLM 注入
  - `reconstruct()` 改为调用 `mergeTemplate()` 而非直接 `CATEGORY_TEMPLATES[prefix].steps(vuln)`
  - `assessFeasibility()` 改为使用 per-pattern difficulty（overlay.difficulty 覆盖 base）
  - `findHistoricalAnalogy()` 优先匹配 `pattern_ids` 字段（M7 产出），次选文本相似度
  - 新增 `COMBINED_CHAINS`：Stale Oracle Cascading Chain (OD-04→OD-05)、Cross-Protocol Indirect Chain (CR-04→CR-01)

**Category 模板优化点**：
| 优化 | 前 | 后 |
|------|-----|-----|
| OD manipulation actor | `oracle`（语义不清） | `protocol`（协议读取被操纵的预言机值） |
| TO-03 actor | `mev_bot`（概念错误） | overlay 覆盖为 `attacker`（重入型攻击） |
| AC cleanup | `Cover tracks`（链上不可能） | `Exit protocol; transaction trail visible on-chain` |
| CL defenses | 含 CL-01 特定项（全部模板共用） | def 去耦合，per-pattern overlay 注入 |
| CR narratives | 单跳叙事 | CR-04 多跳级联 dependency graph |

**测试**：
  ```ts
  test('同一条 LR-02 与 CR-03 报告的攻击叙事不同', () => {
    const lr = reconstructor.reconstruct([lr02Vuln], classify);
    const cr = reconstructor.reconstruct([cr03Vuln], classify);
    expect(lr.attacks[0].steps).not.toEqual(cr.attacks[0].steps);
  });
  test('OD-01 与 OD-04 的 execution step 不同（overlay 覆盖生效）', () => { ... });
  test('mergeTemplate 在无 overlay 时正确兜底到 category base', () => { ... });
  ```

**验收**：npx tsc --noEmit 通过；vitest 通过；本地审计同一份"概念上同时有 LR-02 和 CR-03"的合约，两条 finding 报告的攻击叙事不再相同；OD-01 与 OD-04 的攻击步骤不同。

---

### T10｜确定性攻击成本估算（1–2 天 · S 难度）

**问题**：当前 Stage 5/6 用 LLM 推断"low/medium/high"成本，准确度差；中期报告里也承认了"limited accuracy"。

**Spec**：
- **新增** `lib/cost/estimator.ts`：
  - `estimateCostUSD(vuln: Vulnerability, classification: ProtocolClassification): Promise<CostEstimate>`。
  - 计算公式：
    ```
    gasCostUSD = gasPrice_gwei × estimatedGas × ethPrice_usd
    flashLoanCostUSD = (flashLoanPrincipal × flashLoanFeeRate)
    totalUSD = gasCostUSD + flashLoanCostUSD
    ```
  - 数据来源：
    - `gasPrice_gwei`：`eth_gasPrice` via Etherscan V2
    - `ethPrice_usd`：CoinGecko `simple/price?ids=ethereum&vs_currencies=usd`（无 key 可用）
    - `flashLoanFeeRate`：Aave V3 `getReserveData(asset)` 返回的 `currentLiquidityRate`
    - `estimatedGas`：vuln.report 给的 fallback `300_000`；或 Phase 2 接 Tenderly API
  - 返回 `{ low: number, mid: number, high: number, breakdown: {...} }`。
- **改** `audit/orchestrator/audit-orchestrator.ts`：Stage 5/6 调 `costEstimator.estimateCost(vuln)`，把 LLM 推断的成本覆盖。
- **缓存**：Cost 数据按 5 分钟 TTL 缓存（gas 价格变化快）。
- **测试**：
  ```ts
  test('估算结果是有理数 + 区间合理', async () => {
    const r = await estimator.estimate(mockVuln, mockClassify);
    expect(r.low).toBeGreaterThan(0);
    expect(r.mid).toBeGreaterThan(r.low);
    expect(r.high).toBeGreaterThan(r.mid);
  });
  ```

**验收**：本地审计报告里的"成本"字段是 `$120–$450` 之类具体数字区间，不是 "low/medium"。

---

### T11｜自适应迭代预算（3–5 天 · M 难度）

**问题**：`maxIterations: 5` 硬编码，TVL 高/漏洞复杂的合约迭代不够，TVL 低/简单合约浪费。

**Spec**：
- **新增** `lib/iteration/budget.ts`：
  - `computeBudget(classification, patternComplexity, tvlUSD): { maxIterations: number, confidenceThreshold: number }`。
  - 公式：
    ```ts
    const max = Math.max(1, Math.min(10,
      Math.round(patternComplexity * Math.log10(tvlUSD + 1) / 2)
    ));
    return { maxIterations: max, confidenceThreshold: 0.85 };
    ```
- **改** `audit/vulnerability/vulnerability-agent.ts`：
  - 构造时接收 `iterationBudget: number` 替代 `maxIterations: 5`。
  - 同时接 `patternComplexity: number`（由调用方传入）。
- **改** `audit/orchestrator/audit-orchestrator.ts`：
  - 在调用 `new VulnerabilityAnalysisAgent(...)` 之前，先调 `computeBudget`：
    - `tvlUSD`：调 DefiLlama `https://api.llama.fi/tvl/{protocol_slug}`，失败回退 `null` → 用 fallback `5`。
    - `patternComplexity`：从 `data/pattern-weights.json` 取。
- **测试**：
  ```ts
  test('Aave V3 (高 TVL) 给 8 轮', () => {
    const r = computeBudget(classifyAave, 4, 18e9);
    expect(r.maxIterations).toBeGreaterThanOrEqual(7);
  });
  test('OpenZeppelin ERC20 (低 TVL) 给 2 轮', () => {
    const r = computeBudget(classifyOZ, 2, 1e6);
    expect(r.maxIterations).toBeLessThanOrEqual(3);
  });
  ```

**验收**：vitest 通过；审计 Aave V3 PriceOracle 与 OpenZeppelin ERC20，前者 `iterations ≥ 7`，后者 `iterations ≤ 3`。

---

### T12｜评估 harness（v1 必做 1.5–2 天，v2 加分 2–3 天 · M 难度）

**问题**：中期报告 §4 说"experiments have not yet been run"——这是**关键路径风险**。

#### v1 最小可交付（必做 · 1.5–2 天）

只跑你的系统，不跑 baseline，**不跑 PoC 复现**：

- **新增** `eval/dataset/positives.ts`：整合 `data/history.json`（M7 标完 `pattern_ids` 之后）的 33 个 case。
- **新增** `eval/run-agent.ts`：跑 33 个正样本，导出每个 finding 的 `patternId`。
- **新增** `eval/metrics.ts`：算 per-pattern P/R/F1 + 整体 P/R。
- **新增** `eval/report.ts`：输出 `eval/results/evaluation-v1.md`（一个表格 + 一段 prose）。

**v1 验收**：
- 整体 precision ≥ 30%、recall ≥ 50%。
- 每个 pattern 至少 1 个 case 命中。
- 不要求"高于 Slither"——v1 没 baseline。

#### v2 完整版（加分 · 2–3 天）

加 3 件事：
1. **Slither + Mythril 作为 baseline 对比**（Slither 已集成在 run-baselines.ts 中，Mythril 留待未来）。
2. **5 个负样本**（M6）+ **5–10 个 DeFiHackLabs 新增**（M5），扩到 ~50 个 case。
3. **PoC 复现率**：让 `forge test` 跑 LLM 报告的 PoC 代码。

**v2 验收**（即原 T12 验收）：
- CR 模式 recall ≥ 50%。
- PoC 复现率 ≥ 30%。

**取舍**：v1 跑完你**已经能写评估章节**（论文里写"v1 covers 33 CVE-confirmed protocols, baseline-free"是合法的），v2 是论文 defense 时的"加分项"。

**目录结构**：
```
eval/
├── dataset/
│   ├── positives.ts            # 整合 history.json + M5 新增
│   └── negatives.ts            # M6
├── run-agent.ts                # 跑你的系统
├── run-baselines.ts            # 跑 Slither + Mythril
├── metrics.ts                  # 计算 per-pattern P/R/F1
├── pocs/run-forge.ts           # Foundry PoC 复现
└── report.ts                   # 生成 Markdown 评估章节
```

---

### T13｜文档定稿（1–2 天 · S 难度）

**Spec**：
- **改** `interim_report.pdf`（最终报告 §3.3 表）：加 OD-05 "Oracle Update Heartbeat / Delay Tolerance Missing" 行。
- **改** `AGENTS.md`：协议映射表加 OD-05；版本号 v3.6.0。
- **新增** `docs/architecture.md`（如果还没有）：
  - 1 张系统图（用 Mermaid 或 draw.io）
  - 6 阶段流水线的 ASCII 图
  - T1–T14 改动后的最终架构
- **新增** `docs/evaluation.md`：从 `eval/results/evaluation.md` 引用。
- **新增** `docs/verification.md`：评估方法说明与 21 种模式的覆盖详情。
- **改** `README.md`：badge + 截图（如果 T12 跑出漂亮数字）。

**验收**：文档里的 pattern 表行数 = 21；评估章节有具体数字；verification 章节有 mapping 表 + 覆盖度数字。

---

### T14｜`/api/analyze` 单一状态机（1 天 · S 难度）

**问题**：`app/api/analyze/route.ts` 同时维护 `tasks.json` 轮询和 `OrchestratorProgress` 事件，调试时容易脱节。

**Spec**：
- **新增** `app/api/analyze/state.ts`：
  - 单例 `Map<taskId, TaskState>`，内存维护。
  - 任务完成 / 失败时清理。
- **改** `app/api/analyze/route.ts`：
  - 选 SSE：客户端用 `EventSource('/api/analyze/{taskId}/stream')` 收 progress。
  - `/api/analyze` 立即返回 `taskId`，不阻塞。
  - 删 `tasks.json` 文件相关代码。
- **改** 前端 `src/app/page.tsx`：把 `setInterval` 轮询改为 `EventSource`。

**验收**：审计进行时浏览器 devtools Network → EventStream 实时显示阶段；并发 2 个审计互不干扰。

---

### T15｜双模型路由 + Quota 优雅降级（1 天 · S 难度）

**问题**：所有 LLM 调用共享同一模型（GLM 5.2），简单任务（报告生成、摘要）浪费 token 且消耗 GLM 配额。配额耗尽时，已有分析结果全部丢失。

**Spec**：（已实现）

**双模型路由**：
- **GLM 5.2**（primary）：复杂任务（漏洞分析核心、协议识别、上下文分析）
- **DeepSeek V4 Flash**（fast）：简单任务（报告生成、分析摘要/总结）
- 调用点：`vulnerability-agent.ts:180`（摘要用 fast）、`orchestrator.ts:556`（报告生成用 fast）
- fast provider 未配置时自动降级到 primary（向后兼容）

**Quota 优雅降级**：
- `executePipeline()` 中每个 stage 独立 try-catch `QuotaExceededError`
- 配额耗尽时，返回 `PartialAuditResult`（含已完成 stages 的所有中间结果）
- `route.ts` 将 partial result 保存为 `report_partial_*`
- `eval/run-agent.ts` 检测到配额耗尽后立即停止后续 case，使用已有结果计算指标

**新增 env vars**（可选）：
```bash
OPENAI_API_KEY_FAST=...    # DeepSeek API key
OPENAI_BASE_URL_FAST=...   # DeepSeek endpoint (default: https://api.deepseek.com)
LLM_MODEL_FAST=...         # Model name (default: deepseek-chat)
```

**改动文件**：
- `src/lib/llm.ts`：双 OpenAI client（primary + fast）
- `src/lib/agents/core/llm-client.ts`：provider 路由
- `src/lib/agents/audit/vulnerability/vulnerability-agent.ts`：摘要用 fast
- `src/lib/agents/audit/orchestrator/audit-orchestrator.ts`：PartialAuditResult + 报告用 fast + quota catch
- `src/app/api/analyze/route.ts`：保存 partial result
- `src/app/api/batch-audit/route.ts`：处理 partial result
- `eval/run-agent.ts`：评估时配额耗尽停止后续
- `eval/types.ts`：EvalResult 加 partial 字段
- `.env.example`：新增 fast provider 配置

**验收**：
- 配置 `OPENAI_API_KEY_FAST` 后，报告生成和摘要使用 DeepSeek Flash
- 未配置 fast provider 时，所有调用 fallback 到 GLM 5.2（向后兼容）
- GLM 5.2 限额时：已完成阶段结果被保存，任务状态为 `partial` 而非 `failed`
- 评估时配额耗尽：停止后续 case，基于已完成 case 生成指标
- `npx tsc --noEmit` 通过（仅剩 2 个 eval/poc 预存错误）

---

## 第三部分：实施顺序与依赖图

```
M1 ─┐
M2 ─┤
M3 ─┼─► T1 ─► T2 ─► T5 ─► T8 ─► T12 ─► T13 ◄── 最低毕业线
M4 ─┤              ▲                           
M5 ─┤              │
M6 ─┼─► T6 ───────┘──► T8 ─► T11 ◄── stretch goal
M7 ─┘
        H1 → T1 (前置)
        T3, T4, T9, T10, T14, T15 ──► 任何时候可做，并行
```

**关键依赖**：
- T1 是所有其他 Agent 改造的前置。
- T5（结构化输出）→ T8（跨合约分析依赖稳定的 JSON 输入）。
- T6（Prisma 迁移）→ T8（跨合约需要 DB 中的 pattern 索引）。
- T12（评估）可直接运行（T7 已 descope）。
- T13（文档）必须等 T12 完成才有数据可写。

---

## 第四部分：周计划（推荐）

| 周 | 你（手动） | 代码 Agent |
|---|------------|------------|
| **第 1 周** | M1, M2, M3 完成；M4 pattern 权重开始 | H1, T1, T2, T3 并行 |
| **第 2 周** | M4, M5, M6, M7 完成 | T5, T4, T6, T9, T14 并行 |
| **第 3 周** | 检查 T10 是否数据齐全 | T10 完成, T12-v1 准备 |
| **第 4 周** | 准备评估数据集（eval/dataset/ 整理） | T12-v1 跑一次 |
| **第 5 周** | 跑 T12-v1 看数字 | T12-v1 收尾, T8 启动（stretch）|
| **第 6 周** | 校准 / 调 prompt 反复跑 T12 | T13 文档定稿 ◀ 最低毕业线 |
| **第 7 周** | （可选）stretch goal | T11（如选做）, T12-v2 PoC 复现 |

**最低毕业线**：T1, T2, T3, T5, T6, T8, T12-v1, T13 = **~12–15 人天 = 3 周**。

---

## 第五部分：风险 & 立刻要回退的信号

> 出现任一信号，**立刻停**当前任务，回去修：

1. **T1 完成后 Stage 3 仍报 LLM 直调**：检查 `act()` 是否真的走了 `tools.execute`，不要相信命名。
2. **T12 跑出"系统全面弱于 Slither"**：立刻收窄论文 claims，把 Stage 3 定位为 "triage layer"。但**不要为了数字好看改 baseline**。
3. **M4 pattern 权重 2 天写不完**：先用 1–3 简化权重 + 标"approximate"塞进 JSON，不阻塞 T11。
4. **T1 + T2 改动后 Stage 3 命中率反而下降**：先 revert T2，只留 T1。PromptOptimizer 增强 prompt 可能反而让 LLM 偏离 — 这种情况先关掉 `optimizeSystemPrompt` 开关跑 baseline 对比。

---

## 附录 A：完整文件改动清单（v1.2）

> 代码 Agent 接任务时按这个清单定位文件。

```
src/
├── app/api/analyze/
│   ├── route.ts                      [T14] 改 SSE [T15] partial result 保存
│   ├── state.ts                      [T14] 新增
│   └── batch-audit/route.ts          [T15] partial result 处理
├── lib/
│   ├── agents/
│   │   ├── core/
│   │   │   ├── base-agent.ts         —  不改
│   │   │   ├── llm-client.ts         [T5] 加 getStructuredJSON [T15] provider 路由
│   │   │   ├── memory/memory.ts      [H1] 切 SQLite
│   │   │   ├── memory/storage-adapter.ts [H1] 保留 API
│   │   │   ├── memory/sqlite-store.ts    [H1] 新增
│   │   │   ├── tools/registry.ts     —  不改（已 OK）
│   │   │   ├── tools/llm-tool.ts     [T1] 新增
│   │   │   └── types.ts              —  不改
│   │   ├── audit/
│   │   │   ├── context/context-manager.ts   [T8] 加 crossContractGraph
│   │   │   ├── cross-contract/cross-contract-tracer.ts  [T8] 新增
│   │   │   ├── vulnerability/vulnerability-agent.ts   [T1, T2, T4, T5, T8, T15] 改
│   │   │   ├── vulnerability/prompt-optimizer.ts      —  不改（已写好）
│   │   │   ├── reconstruction/price-manipulation.ts   [T9] 改 per-vuln
│   │   │   ├── reconstruction/types.ts                [T9] 加 PatternOverlay + TemplateInput
│   │   │   ├── calibration/confidence-calibrator.ts   —  不改（保持5维）
│   │   │   └── orchestrator/audit-orchestrator.ts     [T3, T6, T8, T10, T11, T15] 改
│   │   └── prompts/                  —  不改
│   ├── blockchain/fetcher.ts         —  不改
│   ├── cost/
│   │   ├── types.ts                 [T10] 新增
│   │   ├── chain-native-token.ts    [T10] 新增
│   │   ├── cost-registry.ts         [T10] 新增
│   │   ├── tools/
│   │   │   ├── gas-price.tool.ts    [T10] 新增
│   │   │   ├── native-price.tool.ts [T10] 新增
│   │   │   └── flash-loan-fee.tool.ts [T10] 新增
│   │   └── estimator.ts             [T10] 新增
│   ├── iteration/budget.ts           [T11] 新增
│   ├── storage/data.ts               [T6] 改读 Prisma
│   └── llm.ts                        [T15] 双 OpenAI client
├── prisma/
│   └── schema.prisma                 [T6] 加 VulnerabilityPattern
├── scripts/
│   ├── ingest-patterns.ts            [T6] 新增
│   └── regenerate-patterns-json.ts   [T6] 新增
└── eval/
    ├── types.ts                      [T15] EvalResult 加 partial
    ├── run-agent.ts                  [T15] quota 停止
    ├── ...                           [T12] 整个目录

data/
├── vulnerabilities.json              [T6] 仍是 single source
├── history.json                     [M7] 加 pattern_ids 字段
├── pattern-weights.json             [M4] 新增
└── pattern-cost-profiles.json       [T10] 新增 per-pattern gas 区间

package.json                          [T6, T12] 加 scripts
.env.example                          [M1, M2] 加新 key
```

---

## 附录 B：交付前 checklist

- [ ] `pnpm prisma migrate dev` 通过，T6 21 条 pattern 全量
- [ ] `bun test` 全部通过（H1, T1, T2, T3, T4, T5, T6, T8, T9, T10, T11, T15 都有 vitest）
- [ ] T7 已移除（Slither + TS AST 双层验证 descoped）
- [ ] `pnpm eval:v1` 跑完，整体 P ≥ 30%、R ≥ 50%
- [ ] T15 双模型路由配置验证：fast provider 可用时报告用 DeepSeek；未配置时降级到 primary
- [ ] T15 Quota 降级验证：审计中途模拟配额耗尽，确认 partial result 保存、任务状态为 `partial`
- [ ] `data/history.json` 每个 case 有 `pattern_ids`
- [ ] `data/pattern-weights.json` 21 条权重完整
- [ ] `docs/architecture.md` 含新系统图
- [ ] `docs/verification.md` 含 mapping 表 + 16/21 覆盖度说明
- [ ] 报告中 §3.3 表 21 行（含 OD-05）
- [ ] 论文 introduction/abstract 突出三个 claim：(a) price-manipulation narrow vertical coverage、(b) PoC reproducibility（v2 才有）、(c) cross-contract semantic reasoning
- [ ] 论文 §5.3 写 "Secondary Verification Coverage"，含 Slither + TS AST mapping 表
- [ ] `.env` 不进 git，`.env.example` 进 git

---

## 附录 C：Mythril 完整版（Future Work · 留作毕业后 / PhD 阶段）

> 这部分**不**在 v1.2 实施计划内，是 "未来工作" 章节的素材。论文里可以引用作为 future work。

### 何时升级到 Mythril

- 你的论文需要 property-based verification（不是 pattern-based）
- 你需要给出"对某个 finding 的具体可利用 input"作为证据
- 发现 CR-04 等跨协议模式的 recall 仍低，需要更强的 oracle 类验证

### Mythril 升级路径

**Spec**：

**新增** `lib/symbolic/mythril-runner.ts`（在现有 `lib/symbolic/` 目录下）：

- 通过 Python sidecar 调 Mythril：
  ```bash
  docker run --rm -v ${cwd}/contracts:/contracts \
    mythril/myth analyze /contracts/Target.sol \
    --solv 0.8.20 --execution-timeout 30 -o json
  ```
- 解析输出：找出 `Likelihood: High/Medium` + `Severity: High/Critical` 标记的 finding。
- 返回 `{ verified, findings: MythrilFinding[], durationMs }`。

**新增** `lib/symbolic/properties/`：

- 9 个 property 文件（`.json` 格式），每个对应 1 个 DeFi 特有 pattern：
  - `OD-01.json`："this contract should never let `getReserves() * x` exceed 1.5 × true market value"
  - `LR-01.json`："`mint()` must not depend on instantaneous `getReserves()` ratio"
  - `CR-04.json`："protocol B's price should not be a direct function of protocol A's reserve ratio without deviation check"
  - ...

**修改** `lib/symbolic/verifier-orchestrator.ts`：

- 加 `enableMythril: boolean` 配置开关（默认 `false`）
- 启用时：对 High/Critical finding，先跑 Slither + TS AST（如有），再跑 Mythril property
- 三个 verifier 都 verified → 高置信度 verified；只有 Mythril verified → 中等

### Mythril 真实工作量

- 9 个 property 文件 × 0.5–1 天调试 = **4.5–9 天**
- Docker 集成 + 错误处理 = **1 天**
- Z3 调参（state space 爆炸、timeout 处理）= **1–2 天**
- **总：6.5–12 天**（不是 4–6 天——是 8–15 天）

### 论文 future work 章节怎么写

> **Section 7.2: Future Work — Property-based Symbolic Verification**
> 
> Our system currently relies on LLM-only reasoning for vulnerability detection, complemented by a cross-contract graph for dependency analysis. To further improve detection precision and reduce false positives, we plan to integrate Mythril's concolic execution engine. Mythril's Z3-based symbolic execution can express "this contract should never violate X" as a property and automatically generate counterexamples when violated. This property-based approach would add a verifiable layer on top of our LLM-based detection, providing concrete exploit paths rather than probabilistic pattern matching. The integration challenge is writing high-quality property files for DeFi-specific patterns, estimated at 8–15 person-days of additional work.

---

## 版本历史

- **v1.2**（2026-06-11）：T7 已移除（Slither + TS AST descoped），M2 简化为 0 操作 + 1 可选。Mythril 完整版移到附录 C。
- **v1.1**（2026-06-11）：M2 / T12 轻量化修订初版。
- **v1.0**（2026-06-11）：初始版本。
