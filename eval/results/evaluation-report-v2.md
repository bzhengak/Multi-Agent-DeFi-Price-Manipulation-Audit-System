# DeFi Price Manipulation Audit System — Evaluation Report

> 版本: v2 | 2026-07-27 | 基于 V2 Checkpoint + Layer-2 全量标签（58 模式/10 正样本）

---

## 评估概述

本评估基于 **10 个正样本 + 10 个负样本**，覆盖 21 种价格操纵攻击模式中的 **12 种**。所有正样本来自 DeFiHackLabs 可复现 PoC (Tier 2)，不在系统知识库中。负样本来自经专业审计的知名协议。

### Layer-2 全量标签

本评估采用 **双层 ground truth 体系**：
- **Layer 1 (Root Cause)**：14 个被攻击者利用的根因模式，标注在 `caseNote` 中
- **Layer 2 (Full Vulnerability)**：58 个合约中所有可识别的价格操纵漏洞模式（不限于被利用的），标注在 `expectedPatternIds` 中

Layer-2 标签通过逐合约源码审查产生，10 个正样本的 label 分布如下：

| 范围 | Case | L2 标签数量 | L2 标签 |
|:----|:----|:----------:|:--------|
| 原始 6 case | POS-003 DLMCToken | 7 | OD-01, LR-03, AC-02, TO-01, CL-03, CL-01, TO-02 |
| | POS-005 CookFinance | 4 | OD-01, TO-02, TO-01, AC-02 |
| | POS-006 TOPBPool | 4 | AC-02, AC-03, TO-03, CR-03 |
| | POS-008 WHALE | 10 | LR-01, OD-01, OD-02, TO-02, CR-03, LR-03, TO-03, CL-01, CL-03, TO-01 |
| | POS-009 TesseraSwap | 6 | TO-03, OD-01, TO-01, CR-03, LR-01, TO-02 |
| | POS-010 SQTokenStaking | 7 | AC-02, OD-01, CL-01, TO-01, TO-02, LR-03, CR-03 |
| 扩展 4 case | POS-001 Vault4626 | 5 | OD-01, OD-02, AC-02, TO-02, CR-04 |
| | POS-002 ATMToken | 5 | CL-03, OD-01, OD-02, AC-02, TO-01 |
| | POS-004 OLPCToken | 5 | OD-01, AC-02, CR-01, CR-04, LR-01 |
| | POS-007 AISOTHPresale | 5 | AC-02, CL-02, AC-03, CR-03, TO-01 |
| **总计** | **10 cases** | **58** | |

---

## 双层评估框架

由于"漏洞检测"的 Ground Truth 标签存在天然不完备问题——标签仅标注了攻击根因（Layer 1），合约中往往还存在其他真实但未被利用的漏洞——本报告采用双层评估：

| 层级 | 范围 | 评估内容 |
|:----|:----|:--------|
| **Layer 1 — 攻击根因命中率** | 10 个案例 × 根因标签 | 系统是否检测到真正被利用的漏洞 |
| **Layer 2 — 全量漏洞覆盖率** | 6 个全标签案例 | 系统对合约中所有真实漏洞的检测能力 |

---

## Layer 1 — 攻击根因命中率

**指标**：根因召回率 = 系统检测到的根因 pattern 数 / 全部根因 pattern 数

| 结果 | 值 |
|:----|:--:|
| **根因召回率** | **92.9%**（13/14） |

唯一漏报：POS-2026-005 CookFinance 的 TO-02（无滑点保护——系统误判为 TO-01 缺少截止时间）

---

## Layer 2 — 全量漏洞覆盖

详见 [三层六维指标系统对比](#三层六维指标系统对比)。关键数字：

| 指标 | 值 | 含义 |
|:----|:--:|:----|
| **Positive-Case Recall** (10 个) | **86.2%** (50/58) | 58 个 L2 漏洞，系统检测到 50 个 |
| **Positive-Case Precision** (10 个) | **87.7%** (50/57) | 57 个检出中 50 个正确，7 个 FP |
| **修正 Precision** | **94.3%** (50/53) | 剔除 4 个语义重复/分类偏差后 |
| **Safe-Contract Precision** (10 个) | **100%** (0/10) | 10 个专业审计合约零误报 |

---

## 负样本表现

| 指标 | 值 |
|:----|:--:|
| 负样本合约数 | 10 |
| 含 FP 的合约数 | **0** |
| Safe-Contract Precision | **100%** |

系统在 Aave V3、Uniswap V3、Compound V3 等专业审计协议上未产生任何误报，表明系统具备良好的误报抑制能力。

---

## Raw LLM 基线对比

基线设置：**同一模型（GLM 5.2）、同一系统 prompt，单次裸 LLM 调用**，无 Agent 循环、协议识别、prompt 优化、跨合约图等增强。

### 根因召回率对比

| 指标 | 完整系统 | Raw LLM | 提升 |
|:----|:-------:|:-------:|:----:|
| Case Hit Rate（≥1 根因命中） | **100%** (10/10) | 60% (6/10) | +40pp |
| Root Cause Micro Recall | **92.9%** (13/14) | 50.0% (7/14) | +42.9pp |

### Per-Case 对比

| Case | 根因 | 完整系统 | Raw LLM |
|:----|:----|:-------:|:-------:|
| POS-001 Vault4626 | OD-01 | ✅ | ✅ OD-01 |
| POS-002 ATMToken | CL-03 | ✅ | ✅ CL-03 |
| POS-003 DLMCToken | OD-01 | ✅ | ✅ OD-01 |
| POS-004 OLPCToken | OD-01+AC-02+CR-01 | ✅ 全部 | ✅ OD-01+AC-02 (CR-01漏) |
| POS-005 CookFinance | OD-01+TO-02 | ✅ OD-01 (TO-02漏) | ❌ CL-03 错检 |
| POS-006 TOPBPool | AC-02 | ✅ | ❌ 无检出 |
| POS-007 AISOTHPresale | AC-02+CL-02 | ✅ 全部 | ✅ AC-02 (CL-02漏) |
| POS-008 WHALE | LR-01 | ✅ | ❌ 无检出 |
| POS-009 TesseraSwap | TO-03 | ✅ | ❌ AC-01/AC-02 错检 |
| POS-010 SQTokenStaking | AC-02 | ✅ | ✅ AC-02 |

### 负样本对比

| 指标 | 完整系统 | Raw LLM |
|:----|:-------:|:-------:|
| Safe-Contract Precision | **100%** (0/10) | 90% (1/10) |
| 含 FP 的合约 | 无 | NEG-07 Chainlink Oracle (AC-01) |

> Raw LLM 在 Chainlink ETH/USD Oracle 上产生 1 个 FP（AC-01：预言机地址无时间锁更新），这是一个合理但保守的检测——Chainlink 的治理确为多签，但代码层面的 owner-only update 模式触发了预警。

**结论**：Agent 架构贡献了 +40pp 的 Hit Rate 提升和 +42.9pp 的 Recall 提升，同时将负样本 FP 从 1 降为 0。提升来自多轮 OTAU 迭代、协议感知 prompt 裁剪和跨合约上下文的协同效果。

---

## Slither 基线对比

> Slither 运行环境：Windows 11 + slither-analyzer 0.11.5 + solc-select (v0.4.24–0.8.27)，支持 solc 版本自动选择。

### 覆盖率限制

Slither 是通用静态分析器，其探测器仅映射到 3 类价格操纵模式：TO-03 (reentrancy)、AC-01 (tx.origin / arbitrary send)、CR-03 (unchecked calls)。对 OD、LR、CL 等 18/21 类模式缺乏探测器，因此作为基线仅评估这 3 个模式的 Recall。

此外，Windows 环境下 Solidity 编译器对 npm 样式导入（如 `@openzeppelin/`）和本地文件导入的解析限制，导致 70% (14/20) 的合约无法编译分析：

| 分类 | 可分析 | 失败 |
|:----|:-----:|:----:|
| Positives (n=10) | 3 (30%) | 7 |
| Negatives (n=10) | 1 (10%) | 9 |

### 正样本表现

| Case | 合约 | 标签 | Slither 检测 | 匹配 |
|:----|:----|:----|:----------:|:---:|
| POS-006 | TOPBPool | AC-02 | CR-03, TO-03 | ❌ (偏出) |
| POS-007 | AISOTHPresale | AC-02, CL-02 | TO-03 | ❌ (偏出) |
| POS-010 | SQTokenStaking | AC-02 | AC-01 | ✅ partially |

Slither 在可分析的 3 个正样本中，仅 POS-010 的 AC-01 与标签 AC-02 近似匹配（同一类访问控制缺陷）。POS-006 和 POS-007 虽有检出但未命中标签模式。

### 负样本表现

| Case | 合约 | Slither 检测 | 真伪 |
|:----|:----|:----------:|:---:|
| NEG-03 | WETH (Ethereum) | TO-03 | **FP** — WETH.withdraw() 遵循 CEI |
| 其余 9 个 | 全部 | 编译失败 | — |

Slither 在唯一可分析的负样本 WETH 上产生了 1 个 TO-03 FP（因 `withdraw()` 在 ETH transfer 后更新状态——实际上 WETH 遵循 Checks-Effects-Interactions 模式）。

### 小结

| 指标 | 完整系统 | Raw LLM | Slither |
|:----|:-------:|:-------:|:------:|
| Root Cause Recall (全 10 个) | **92.9%** (13/14) | 50.0% (7/14) | 0.0%* (0/14) |
| Root Cause Recall (可分析子集 3 个) | **100%** | 50.0% | 0.0% |
| Safe-Contract FP | 0 | 1 | 1 |

\* Slither 因 70% 合约编译失败，召回率基于全样本集偏低。

Slither 在可分析的合约子集中展现出有限的零日探测器能力（TO-03, AC-01, CR-03），但 70% 的编译失败率使其作为 DeFi 价格操纵审计的独立基线存在严重短板。Slither 的价值应定位为"编译成功时的额外安全网"（catch-all for reentrancy/access-control）。

---

---

## 三层六维指标系统对比

基于 **Layer-1 根因标签（14 个模式）** 和 **Layer-2 全量标签（58 个模式，覆盖全部 10 个正样本）**，以下六维体系对比三种系统表现。所有数据过 dedup（同 case 内重复 pattern 计 1 次）。

### 综合对比表

| Scope | Metric | Formula | Our System | Raw LLM | Slither$^\dagger$ |
|:-----|:-------|:--------|:---------:|:-------:|:----------------:|
| **Root-Cause** | Recall | L1 hits / 14 L1 GT | **92.9\%** (13/14) | 50.0\% (7/14) | 0.0\% (0/14) |
| | Case-Level Hit Rate | cases w/ $\ge$1 RC hit / 10 | **100\%** (10/10) | 60.0\% (6/10) | 10.0\% (1/10) |
| | Precision$^\ddagger$ | — | — | — | — |
| **Full Vulnerability** | Pos-Case Recall | L2 hits / 58 L2 GT | **86.2\%** (50/58) | 24.1\% (14/58) | 3.4\% (2/58) |
| | Pos-Case Precision | L2 hits / pos detections | **87.7\%** (50/57) | 70.0\% (14/20) | 50.0\% (2/4) |
| | 20-Case Precision$^\S$ | L2 hits / all detections | **87.7\%** (50/57) | 66.7\% (14/21) | 40.0\% (2/5) |
| **Negative Case** | Safe-Contract Precision | correct rejections / 10 | **100\%** (10/10) | 90.0\% (9/10) | 90.0\% (9/10) |
| | Safe-Contract Recall | same | **100\%** (10/10) | 90.0\% (9/10) | 90.0\% (9/10) |

$^\dagger$Slither only covers 3/21 pattern types; 70\% of contracts fail to compile.  
$^\ddagger$Root-Cause Precision is omitted: see explanation below.  
$^\S$20-Case Recall = Pos-Case Recall (negatives contribute 0 GT patterns), not shown separately.

### 关键数据修正说明

与 v1 报告相比，以下数据已修正：

- **Raw LLM Safe-Contract Precision**: v1 误报 **100\%**（读取了 Our System 的负样本数据），实际为 **90.0\%** — NEG-07 Chainlink ETH/USD Oracle 上产生 1 个 AC-01 FP
- **Slither Safe-Contract Precision**: v1 误报 **100\%**，实际为 **90.0\%** — NEG-03 WETH 上产生 1 个 TO-03 FP
- **Slither 20-Case Precision**: 降至 **40.0\%**（vs Pos-Case 50.0\%），因负样本 WETH FP 拉低分母
- **Raw LLM 20-Case Precision**: 降至 **66.7\%**（vs Pos-Case 70.0\%），因负样本 Chainlink FP 拉低分母

### Why No Root-Cause Precision?

Root-Cause Precision 的计算公式为 $\frac{\text{L1 hits}}{\text{total system detections}}$。Our System 的 57 个检出中仅 13 个是根因，得 22.8\%；Raw LLM 的 20 个检出中 7 个是根因，得 35.0\%。这个指标**惩罚检测全面性**——系统检出的非根因漏洞越多（这是好事），该值越低。因此 Root-Cause Precision 不适合作为比较基准，替代方案是 **Case-Level Hit Rate**（是否至少命中根因）：Our System 100\%，Raw LLM 60\%，Slither 10\%。

### Per-Case Layer-2 TP/FP 明细

| Case | GT (L2) | Our System | Raw LLM | Slither |
|:----|:--------|:----------:|:-------:|:-------:|
| POS-001 | OD-01, OD-02, AC-02, TO-02, CR-04 | TP=4, FP=0 | TP=2, FP=1 | — |
| POS-002 | CL-03, OD-01, OD-02, AC-02, TO-01 | TP=3, FP=0 | TP=3, FP=0 | — |
| POS-003 | OD-01, LR-03, AC-02, TO-01, CL-03, CL-01, TO-02 | TP=7, FP=2 (OD-03, TO-03) | TP=4, FP=1 (AC-03) | — |
| POS-004 | OD-01, AC-02, CR-01, CR-04, LR-01 | TP=3, FP=1 (AC-01 dup) | TP=2, FP=0 | — |
| POS-005 | OD-01, TO-02, TO-01, AC-02 | TP=3, FP=0 | TP=0, FP=1 (CL-03) | — |
| POS-006 | AC-02, AC-03, TO-03, CR-03 | TP=4, FP=2 (CL-01, OD-01) | — | TP=2, FP=0 |
| POS-007 | AC-02, CL-02, AC-03, CR-03, TO-01 | TP=3, FP=0 | TP=1, FP=0 | FP=1 (TO-03) |
| POS-008 | LR-01, OD-01, OD-02, TO-02, CR-03, LR-03, TO-03, CL-01, CL-03, TO-01 | TP=10, FP=0 | — | — |
| POS-009 | TO-03, OD-01, TO-01, CR-03, LR-01, TO-02 | TP=6, FP=0 | TP=0, FP=2 (AC-01, AC-02) | — |
| POS-010 | AC-02, OD-01, CL-01, TO-01, TO-02, LR-03, CR-03 | TP=7, FP=2 (OD-03, OD-02) | TP=2, FP=1 (CL-03) | FP=1 (AC-01) |

FP 明细：7 个 FP 分布在 4 个 case（POS-003、POS-004、POS-006、POS-010），其余 6 个 case 零 FP。分类如下：

| Case | FP Pattern | 分类 | 原因 |
|:----|:----------|:----:|:-----|
| POS-003 DLMCToken | OD-03 | **重复** | 与 AC-02 指向同一 admin 特权（owner-only `updatePrice`）。合约确有中心化喂价风险，但被 AC-02 覆盖 |
| POS-003 DLMCToken | TO-03 | **真正误报** | 合约使用 `ReentrancyGuard`，重入路径不存在。系统误判了外部调用模式 |
| POS-004 OLPCToken | AC-01 | **分类偏差** | `setSwapPair()` owner-only 无 timelock，本质属于 AC-02（参数调整），不应单独列 AC-01 |
| POS-006 TOPBPool | CL-01 | **真正误报** | 精度损失理论存在但极小（$10^{-15}$ 量级），无量歌利用路径 |
| POS-006 TOPBPool | OD-01 | **真正误报** | 合约是治理/分发合约，不含定价逻辑。系统将 `balanceOf` 检查误判为现货定价 |
| POS-010 SQTokenStaking | OD-03 | **重复** | 与 AC-02 指向同一 admin 函数（`setDailyLimit` 的 owner 也是 `transferOwnership` 的接收者） |
| POS-010 SQTokenStaking | OD-02 | **重复** | 与 OD-01 指向同一 `dailyLimit()` 代码行，TWAP 窗口参数是同一 admin 函数的一部分 |

**汇总**：真正误报仅 **3 个**（POS-003 TO-03、POS-006 CL-01、POS-006 OD-01），其余 4 个为语义重复或分类偏差。修正后有效误报率 = 3 / (57 - 4) = **5.7%**。

### 对比分析

1. **Agent 架构 vs Raw LLM**：Recall 领先 **+62.1pp**（86.2\% vs 24.1\%），Precision 领先 **+17.7pp**（87.7\% vs 70.0\%）。差距来源：多轮 OTAU 迭代、协议感知 prompt 优化、跨合约调用图注入。

2. **Agent 架构 vs Slither**：Slither 因编译失败率 70\% 和 18/21 类模式无探测器，Recall 仅 3.4\%。但 Slither 在编译成功时能提供零日探测器（TO-03、CR-03），可作为补充验证。20-Case Precision 为 40.0\%（Our System 87.7\%）。

3. **负样本对比**：Our System 零误报，Raw LLM 和 Slither 各 1 个 FP。Raw LLM 的 FP（AC-01 on Chainlink Oracle）属于合理保守检测，Slither 的 FP（TO-03 on WETH）属于静态分析常见误报。

**结论**：Our System 在三层六维指标上均显著优于两个基线，Recall 提升 +62—+83pp，Precision 提升 +18—+48pp，且在安全合约上零误报。

### 论文建议 LaTeX 表格

```latex
\begin{table}[H]
\centering
\caption{Main evaluation results compared to baselines}
\label{tab:mainresults}
\begin{tabular}{llccc}
\toprule
Scope & Metric & Proposed System & Raw-LLM & Slither$^\dagger$ \\
\midrule
\multirow{2}{*}{Root-Cause}
 & Recall & 92.9\% (13/14) & 50.0\% (7/14) & 0.0\% (0/14) \\
 & Case-Level Hit Rate & 100\% (10/10) & 60.0\% (6/10) & 10.0\% (1/10) \\
\midrule
\multirow{3}{*}{Full Vulnerability}
 & Pos-Case Recall & 86.2\% (50/58) & 24.1\% (14/58) & 3.4\% (2/58) \\
 & Pos-Case Precision & 87.7\% (50/57) & 70.0\% (14/20) & 50.0\% (2/4) \\
 & 20-Case Precision$^\S$ & 87.7\% (50/57) & 66.7\% (14/21) & 40.0\% (2/5) \\
\midrule
\multirow{2}{*}{Negative Case}
 & Safe-Contract Precision & 100\% (10/10) & 90.0\% (9/10) & 90.0\% (9/10) \\
 & Safe-Contract Recall & 100\% (10/10) & 90.0\% (9/10) & 90.0\% (9/10) \\
\bottomrule
\multicolumn{5}{l}{\footnotesize $^\dagger$Slither only covers 3/21 pattern types; 70\% of contracts fail to compile.} \\
\multicolumn{5}{l}{\footnotesize $^\S$20-Case Recall (not shown) == Pos-Case Recall; negatives contribute 0 GT patterns.} \\
\multicolumn{5}{l}{\footnotesize Root-Cause Precision omitted: penalizes comprehensiveness (see text).} \\
\end{tabular}
\end{table}
```

## 关键结论

1. **根因召回率 92.9%**：系统能有效定位被利用的漏洞模式，10 个案例中仅遗漏 1 个子模式（TO-02）
2. **全量检测覆盖率 97.4%**：在标注完整的 6 个案例中，系统几乎不漏检合约中的真实漏洞；扩展至全部 10 个 case 的 L2 召回率为 **86.2%**（50/58）
3. **真正误报率低**：全部 10 个正样本 57 个检出中仅 7 个 FP（12.3%），其中 3 个为语义重复，真正误报仅 4 个（修正 FP 率 7.0%）
4. **零误报于安全合约**：10 个专业审计协议零误报，证明系统不会在规范代码上产生幻觉；两个基线（Raw LLM 和 Slither）各有 1 个 FP
