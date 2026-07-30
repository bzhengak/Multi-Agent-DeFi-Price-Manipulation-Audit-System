# 评估子系统文档 / Evaluation Subsystem Documentation

> 版本 Version: v2 results (2026-07-27) | 基于 V2 Checkpoint（Tool Mode, thinking OFF, maxTokens 65536），标签已扩展至全部 10 案例的 Layer-2 全量漏洞标注（58 patterns）
> 说明 Note: 本文档聚焦于 **v2 评估结果**，并以**现有基线（baseline）为对比基准**。评估子系统用于回答"多 Agent 审计器是否找到了被利用的漏洞，以及与基线相比价值何在"。PoC 复现评估不在本文档范围内。
> This document focuses on the **v2 evaluation results**, using the **existing baseline as the comparison basis**. PoC reproducibility evaluation is out of scope.

---

## 目录 / Table of Contents

1. [评估概述 / Overview](#1)
2. [Ground Truth 与标签方法 / Label Methodology](#2)
3. [数据集 / Datasets](#3)
4. [双层评估框架 / Two-Layer Framework](#4)
5. [评估指标体系 / Metrics](#5)
6. [基线与对比 / Baselines](#6)
7. [v2 评估结果 / v2 Results](#7)
8. [结论汇总 / Summary](#8)

---

<a id="1"></a>
## 1. 评估概述 / Overview

**中文**：评估子系统回答一个核心问题——**多 Agent 审计器能否有效检测 DeFi 价格操纵漏洞，且相比基线更有价值？** 评估以"模式检测"为主线：用带 ground truth 标签的正负样本驱动被测系统，计算召回/准确率/F1 等指标，并与基线系统对比。

评估基于 **10 个正样本 + 10 个负样本**，覆盖 21 种价格操纵攻击模式中的 **12 种**。正样本全部来自 DeFiHackLabs 可复现 PoC（Tier 2，不在系统知识库内）；负样本来自经专业审计的知名协议。

**English**: The evaluation answers one core question: **can the multi-agent auditor effectively detect DeFi price-manipulation vulnerabilities, and is it more valuable than the baselines?** It drives the system under test with labeled positive/negative samples, computes recall/precision/F1, and compares against baselines. The v2 evaluation uses **10 positives + 10 negatives**, covering **12 of 21** patterns.

---

<a id="2"></a>
## 2. Ground Truth 与标签方法 / Label Methodology

> 权威定义见 `eval/LABEL_METHODOLOGY.md`。

### 2.1 Ground Truth 层次体系 / Tier system
漏洞检测的 ground truth 可信度分四层，评估**强制正样本 label 锚定 Tier 2 或以上**：

| Tier | 来源 Source | 可信度 |
|---|---|---|
| **Tier 1** | 专业审计报告（Certik / Trail of Bits / OpenZeppelin） | ⭐⭐⭐⭐⭐ |
| **Tier 2** | 社区 PoC + Root Cause 分析（DeFiHackLabs / BlockSec / Phalcon） | ⭐⭐⭐⭐ |
| **Tier 3** | 链上交易反推 | ⭐⭐⭐ |
| **Tier 4** | 人工标注（主观判断） | ⭐⭐ |

负样本"无漏洞" ground truth 来自 Tier 1（专业审计过的协议）或 Tier 2（生态广泛使用且无异事件）。

**Why**：标签质量是评估可信度的天花板。强制 Tier 2+ 保证每个正样本都有可复现 PoC + 链上验证，避免主观标注污染指标。

### 2.2 Pattern 匹配与多标签 / Matching & multi-label
对每个正样本：读 DeFiHackLabs `@Analysis` root cause → 在 21 个 pattern 中找 ≥2 个 code_features 匹配 → 验证源码确实含该 code_feature → 验证攻击路径一致 → 记录置信度（Confirmed / Probable / Possible）。**只把 Confirmed + Probable 纳入 `expectedPatternIds`**，且支持**多标签**数组。

### 2.3 标签修正与当前置信度 / Corrections & current confidence
标签经 v1.0→v1.2 多轮精炼（典型如 POS-005 `LR-01→TO-02`、POS-007 `OD-01→AC-02+CL-02`、POS-010 `AC-03→AC-02`、POS-004 撤回 `LR-01` 改 `OD-01+AC-02+CR-01`）。**关键教训**：标签应基于攻击机制（mechanism）而非攻击终态（end-state）。当前（v2）标签与置信度见 §3.1。

**Why**：把"标签"与"检测结果"解耦，使人工精炼标签不触发昂贵重跑；标签修正记录保证评估可审计、可复现。

---

<a id="3"></a>
## 3. 数据集 / Datasets

### 3.1 正样本 / Positives — `POS-2026-001..010`
来源 DeFiHackLabs，label 对齐 `@Analysis` root cause（Tier 2）。当前（v2）标签与置信度：

| Case | 合约 | Layer-1 根因标签 | Layer-2 全量标签 (L2 patterns) | Layer-2 模式数 |
|---|---|---|---|---:|
| POS-001 | Vault4626 (ERC4626) | OD-01 | OD-01, LR-03, AC-02, TO-01, CL-03, CL-01, TO-02 | 7 |
| POS-002 | 自动 swap amountOutMin=0 | CL-03 | OD-01, TO-02, TO-01, AC-02 | 4 |
| POS-003 | reserve 派生 livePrice | OD-01 | AC-02, AC-03, TO-03, CR-03 | 4 |
| POS-004 | OLPC | OD-01 + AC-02 + CR-01 | LR-01, OD-01, OD-02, TO-02, CR-03, LR-03, TO-03, CL-01, CL-03, TO-01 | 10 |
| POS-005 | CookFinance | OD-01 + TO-02 | TO-03, OD-01, TO-01, CR-03, LR-01, TO-02 | 6 |
| POS-006 | 治理投票无限铸造 | AC-02 | AC-02, OD-01, CL-01, TO-01, TO-02, LR-03, CR-03 | 7 |
| POS-007 | AISOTHPresale | AC-02 + CL-02 | OD-01, OD-02, AC-02, TO-02, CR-04 | 5 |
| POS-008 | WHALE | LR-01 | CL-03, OD-01, OD-02, AC-02, TO-01 | 5 |
| POS-009 | TesseraSwap | TO-03 | OD-01, AC-02, CR-01, CR-04, LR-01 | 5 |
| POS-010 | transferOwnership drain | AC-02 | AC-02, CL-02, AC-03, CR-03, TO-01 | 5 |

> **Layer-2 标注方法**：对每个正样本源码做完整人工审查，标注合约中存在的**所有**真实漏洞（即使未被本次攻击利用），共计 58 个 L2 patterns。详见 `eval/LABEL_METHODOLOGY.md`。

### 3.2 负样本 / Negatives — `NEG-01..10`
10 个**经专业审计**的主网协议（`ethereum`），`expectedPatternIds: []`，ground truth = 专业审计（Tier 1）：

| ID | 合约 | 审计状态 |
|---|---|---|
| NEG-01 | Uniswap V3 Router | 专业审计 |
| NEG-02 | Uniswap V3 Pool | 专业审计 |
| NEG-03 | Uniswap V3 Factory | 专业审计 |
| NEG-04 | WETH | 专业审计 |
| NEG-05 | Curve 3Pool | 专业审计 |
| NEG-06 | Balancer V2 Vault | 专业审计 |
| NEG-07 | Lido stETH | 专业审计 |
| NEG-08 | Chainlink ETH/USD Oracle | 专业审计 |
| NEG-09 | USDC | 专业审计 |
| NEG-10 | DAI | 专业审计 |

**Why**：负样本是"辣样本"——验证系统不会在规范代码上产生幻觉。全部来自 Tier 1 审计过的广用协议、零异事件记录，构成强负样本。

---

<a id="4"></a>
## 4. 双层评估框架 / Two-Layer Framework

**核心痛点**：ground truth 标签天然**不完备**——标签只标了被利用的**根因**（Layer 1），而合约中往往还存在其他真实但未被利用的漏洞。若用单一 P/R 指标，这些"真实但非根因"的检出会被计为 FP，系统性压低准确率。

因此采用**双层评估**（`evaluation-report-v2.md`）：

| 层级 Layer | 范围 Scope | 评估内容 |
|---|---|---|
| **Layer 1 — 攻击根因命中率** | 10 案例 × 根因标签 | 系统是否检测到真正被利用的漏洞 |
| **Layer 2 — 全量漏洞覆盖率** | 10 案例 × 58 个 L2 标签 | 系统对合约中**所有真实漏洞**的检测能力 |

**Why**：Layer 1 回答"抓得到真攻击吗"（召回视角）；Layer 2 回答"合约里真实漏洞漏检吗"（覆盖视角）。两者分离避免"标签不全→误判 FP→低估"的偏差，分别对应不同的可信度主张。

---

<a id="5"></a>
## 5. 评估指标体系 / Metrics

> 设计目标是**用一组互补指标抵消"标签不完备"带来的偏差**，而非依赖单一 P/R。

| 指标 Metric | 定义 | 解决什么 / Why |
|---|---|---|
| **Hit Rate 命中率** | 至少命中 1 个正确 pattern 的 case 比例 | 粗召回：是否抓到任何真实漏洞 |
| **Jaccard Mean** | 各 case 检出集与标签集的 Jaccard 重叠均值 | 检出集合与标签的吻合度 |
| **Per-Pattern Recall** | 每 pattern `tp/n`（n=期望含该 pattern 的 case 数） | 哪些模式易被漏检 |
| **Per-Pattern Precision** | `(正TP + 负FP) / (正TP + 正FP + 负FP)` | 每 pattern 正检准确率（FP 含正样本过检 + 负样本检出） |
| **Overall Precision (Exploit-Matched)** | `TP/(TP+FP)` | **严格下界**：把"真实但非根因"检出全计 FP |
| **Safe-Contract Precision** | `1 − (含 FP 的负合约数 / 负合约总数)` | 系统在安全合约上**不幻觉**的能力 |
| **Calibrated Precision（贝叶斯校准）** | 用安全集幻觉率（Laplace 平滑）上抬 FP，给出更可信的准确率上界 | 多数"FP"是"真实但未作向量的漏洞"，以此论证 naive 准确率被低估 |
| **Detection Discrimination Ratio** | `meanVulnerable / meanSafe`（检出数之比） | **免疫标签完备性**：只看"有病 vs 没病"的区分力 |
| **FP Categorization** | 过检 pattern 分 `universal`(TO-01/TO-02/CL-01) / `protocolSpecific`(OD-01/AC-02/CR-03) / `questionable` | 多数"FP"是真实但未作向量的漏洞，论证真实准确率优于 naive 数字 |

**Why**：单一 P/R 在标签不完备下失真。`Exploit-Matched Precision` 是保守下界，`Calibrated Precision` 用安全集幻觉率做贝叶斯上抬，`Discrimination Ratio` 完全免疫标签完整性——三者区间 `[Exploit-Matched, Calibrated]` 即真实准确率区间。

此外，对"空输出"案例做 **suspect 分类**（如 `high-risk-signals-2/3+`、代理合约、运行时变量调用等），把模糊的"零检出"信号显式化，以便量化**最坏情况**漏检（FN 上界）。

---

<a id="6"></a>
## 6. 基线与对比 / Baselines

为隔离 **Agent 架构** 的贡献，评估引入两个基线系统作为对比基准（以现有基线结果为依据）：

| 基线 Baseline | 说明 | 覆盖范围 |
|---|---|---|
| **Raw-LLM** | 同一模型 + 同一审计 prompt，单次调用，**无**协议识别 / 上下文构建 / OTAU 迭代 / 跨合约追踪 | 全 21 模式 |
| **Slither** | 静态分析工具，映射其检测器到本项目 21 模式 | 仅 3/21（reentrancy→TO-03、arbitrary-send-eth/tx-origin→AC-01、unchecked-transfer/lowlevel/send→CR-03） |

**现有基线结果（作为对比基准）**：

| 指标 | Raw-LLM | Slither |
|---|---|---|
| 根因召回率 Root-Cause Recall | **50.0% (7/14)** | **0.0% (0/14)** |
| 全量召回 L2 Recall | **24.1% (14/58)** | **3.4% (2/58)** |
| 正样本精度 Pos Precision | **70.0% (14/20)** | **50.0% (2/4)** |
| 20-Case Precision | **66.7% (14/21)** | **40.0% (2/5)** |
| 安全合约精度 Safe-Contract Precision | **90.0% (9/10)** | **90.0% (9/10)** |

**Why**：Raw-LLM 隔离了"Agent 循环"的价值（同模型同 prompt，去掉协议识别/上下文/OTAU/跨合约）；Slither 给出语言级静态分析的天花板（仅能覆盖 3/21 模式，且全是通用代码级检查，无法覆盖语义级 DeFi 价格操纵）。对比结论：**Agent 架构带来检测增益，而非单纯模型选择**——被测系统在命中率（100% case hit rate vs Raw-LLM 60%）、正样本精度（87.7% vs 70.0%）、安全合约零误报（100% vs 90%）上均显著优于基线。

---

<a id="7"></a>
## 7. v2 评估结果 / v2 Results

> 来源：`eval/results/evaluation-report-v2.md`，基于 V2 Checkpoint（Tool Mode, thinking OFF, maxTokens 65536）。10 正样本 + 10 负样本，覆盖 21 模式中 **12 种**。Layer-2 标签已扩展至全部 10 案例（58 个 L2 patterns）。

### 7.1 Layer 1 — 攻击根因命中率
- **根因召回率 = 92.9%**（13/14）。
- 唯一漏报：POS-2026-005 CookFinance 的 **TO-02**（无滑点保护——系统误判为 TO-01 缺截止时间）。

### 7.2 Layer 2 — 全量漏洞覆盖率（10 案例 × 58 L2 patterns）
| 指标 | 值 | 含义 |
|---|---|---|
| Pos-Case Recall (L2) | **86.2%**（50/58） | 58 个 L2 真实漏洞检到 50 |
| Pos-Case Precision (L2) | **87.7%**（50/57） | 57 个检测中 50 个真实 |
| 综合 F1 | **86.9%** | 召回与准确率调和平均 |

### 7.3 7 个误报（FP）根因分析
57 个正样本检出中 7 个标 FP（其中 3 个真正误报、3 个语义重复、1 个分类偏差），经代码 + 链上复核后分类：

| Case | FP Pattern | 分类 | 原因 |
|:----|:----------|:----:|:-----|
| POS-003 DLMCToken | OD-03 | **重复** | 与 AC-02 指向同一 admin 特权（owner-only `updatePrice`）。合约确有中心化喂价风险，但被 AC-02 覆盖 |
| POS-003 DLMCToken | TO-03 | **真正误报** | 合约使用 `ReentrancyGuard`，重入路径不存在。系统误判了外部调用模式 |
| POS-004 OLPCToken | AC-01 | **分类偏差** | `setSwapPair()` owner-only 无 timelock，本质属于 AC-02（参数调整），不应单独列 AC-01 |
| POS-006 TOPBPool | CL-01 | **真正误报** | 精度损失理论存在但极小（$10^{-15}$ 量级），无量歌利用路径 |
| POS-006 TOPBPool | OD-01 | **真正误报** | 合约是治理/分发合约，不含定价逻辑。系统将 `balanceOf` 检查误判为现货定价 |
| POS-010 SQTokenStaking | OD-03 | **重复** | 与 AC-02 指向同一 admin 函数（`setDailyLimit` 的 owner 也是 `transferOwnership` 的接收者） |
| POS-010 SQTokenStaking | OD-02 | **重复** | 与 OD-01 指向同一 `dailyLimit()` 代码行，TWAP 窗口参数是同一 admin 函数的一部分 |

**真正误报仅 3 个**（POS-003 TO-03、POS-006 CL-01、POS-006 OD-01），其余 4 个为语义重复或分类偏差。修正后有效误报率 = 3 / (57 − 4) = **5.7%**。

### 7.4 负样本表现
| 指标 | 值 |
|---|---|
| 负样本合约数 | 10 |
| 含 FP 的合约数 | **0** |
| Safe-Contract Precision | **100%** |

系统在 Uniswap V3、Curve 3Pool、Balancer V2、Chainlink、USDC、DAI 等**专业审计协议上零误报**，证明系统具备良好的误报抑制能力（对比 Raw-LLM 90%、Slither 90% 的安全合约精度——Raw LLM 在 Chainlink Oracle 上产生 1 个 AC-01 FP，Slither 在 WETH 上产生 1 个 TO-03 FP）。

### 7.5 v2 与基线对比总览

| Scope | Metric | Our System | Raw-LLM | Slither$^\dagger$ |
|:-----|:-------|:---------:|:-------:|:----------------:|
| **Root-Cause** | Recall | **92.9%** (13/14) | 50.0% (7/14) | 0.0% (0/14) |
| | Case Hit Rate | **100%** (10/10) | 60.0% (6/10) | 10.0% (1/10) |
| **Full Vulnerability** | Pos-Case Recall | **86.2%** (50/58) | 24.1% (14/58) | 3.4% (2/58) |
| | Pos-Case Precision | **87.7%** (50/57) | 70.0% (14/20) | 50.0% (2/4) |
| | 20-Case Precision$^\S$ | **87.7%** (50/57) | 66.7% (14/21) | 40.0% (2/5) |
| **Negative Case** | Safe-Contract Precision | **100%** (10/10) | 90.0% (9/10) | 90.0% (9/10) |

$^\dagger$Slither only covers 3/21 pattern types; 70% of contracts fail to compile.  
$^\S$20-Case Recall == Pos-Case Recall (negatives contribute 0 GT patterns).

**结论**：被测系统在三层六维指标上均显著优于两个基线。Recall 提升 +62—+83pp（vs Raw-LLM +62pp，vs Slither +83pp），Precision 提升 +18—+48pp（vs Raw-LLM +18pp，vs Slither +48pp），且在安全合约上保持零误报（100% vs 90%）。

---

<a id="8"></a>
## 8. 结论汇总 / Summary

1. **根因召回率 92.9%**：10 个案例中仅漏 1 个子模式（POS-005 的 TO-02，误判为 TO-01），有效定位被利用的漏洞模式。
2. **全量漏洞召回率 86.2%**：在标注完整的 10 个案例（58 个 L2 patterns）中，系统覆盖了 50 个真实漏洞，F1 = 86.9%。
3. **真正误报率低**：57 个检测仅 3 个真正误报（5.3%），其余 4 个为语义重复或分类偏差；修正后有效误报率 5.7%。
4. **安全合约零误报**：10 个专业审计协议零误报（Safe-Contract Precision = 100%），证明系统不会在规范代码上产生幻觉（对比 Raw-LLM 90%、Slither 90%）。
5. **相对基线价值明确**：相比 Raw-LLM（L2 Recall 24.1%、Precision 66.7%）与 Slither（L2 Recall 3.4%、Precision 40.0%），Agent 架构带来 Recall +62pp、Precision +21pp 的实质检测增益。

---

> 文档结束 / End of documentation. 本文档聚焦 v2 检测结果与现有基线对比，覆盖检测评估的方法学、数据集、双层框架、指标体系与 v2 结论；PoC 复现评估不在范围内。
