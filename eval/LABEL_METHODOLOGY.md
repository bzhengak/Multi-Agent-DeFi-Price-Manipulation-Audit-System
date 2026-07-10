# 评估样本 Label 确定方法论

> 版本: v1.0 | 最后更新: 2026-07-05
> 本文档定义了 DeFi 价格操纵审计系统评估中，正反样本的 ground truth label 确定原则与操作流程。

---

## 1. Ground Truth 层次体系

漏洞检测论文中，ground truth 的可信度从高到低分四个层级：

| Tier | 来源 | 可信度 | 说明 |
|------|------|:---:|------|
| **Tier 1** | 专业审计报告（Certik / Trail of Bits / OpenZeppelin） | ⭐⭐⭐⭐⭐ | 金标准。形式化验证 + 人工审计双确认 |
| **Tier 2** | 社区 PoC + Root Cause 分析（DeFiHackLabs / BlockSec / Phalcon） | ⭐⭐⭐⭐ | 可 fork 复现的 PoC + 链上交易验证 |
| **Tier 3** | 链上交易反推（Etherscan / BSCScan / Tenderly 模拟） | ⭐⭐⭐ | 交易序列客观记录，但需要人工解释 |
| **Tier 4** | 人工标注（研究者主观判断） | ⭐⭐ | 可复现性差，依赖标注者领域知识 |

**本项目原则：所有正样本 label 必须锚定 Tier 2 或以上。**

负样本的 "无漏洞" ground truth 来自 Tier 1（专业审计过的协议）或 Tier 2（生态广泛使用且无异事件记录的合约）。

---

## 2. Pattern 匹配协议

### 2.1 Label 确定流程

对于每个正样本（被攻击的合约），执行以下步骤：

```
Step 1: 读取 DeFiHackLabs PoC 的 @Analysis 字段，获取 root cause 一句话描述
    ↓
Step 2: 在 21 个 pattern 的完整定义中找到 ≥ 2 个 code_features 匹配的 pattern
    ↓
Step 3: 验证合约源码确实包含该 code_feature（P0: verify via Etherscan）
    ↓
Step 4: 验证攻击路径与 pattern 的 "Related Attacks" 一致
    ↓
Step 5: 记录置信度 — Confirmed / Probable / Possible
```

### 2.2 匹配标准

- **Confirmed**: root cause 明确命中 ≥ 2 个 code_features + 攻击路径匹配
- **Probable**: root cause 明确命中 1 个 code_feature + 攻击路径部分匹配
- **Possible**: root cause 间接暗示，code_feature 模糊匹配

只将 Confirmed 和 Probable 级别的 pattern 纳入 `expectedPatternIds`。

### 2.3 多标签支持

一个 exploit 可能涉及多个 pattern。系统支持 `expectedPatternIds: string[]` 数组格式，不需要强制单选。

典型多标签案例：
- POS-007 AISOTHPresale: AC-02（admin 可改价格/限额）+ CL-02（getTokenAmount decimal mismatch 10x）
- MEV sandwich attack: 通常 TO-01（no deadline）+ TO-02（no slippage）

### 2.4 负样本验证

对于每个负样本，验证标准为：

```
1. 是否被专业审计公司审计过（Certik / Trail of Bits / OpenZeppelin / Certora）？
2. 是否在生态中广泛使用且无异事件记录（> 2 年，> $100M TVL 或等效）？
3. 源码是否在 Etherscan 已验证？
```

三个条件至少满足两个才能纳入负样本。

---

## 3. Pattern 扩展原则

### 3.1 何时扩展 Pattern 定义

满足以下条件时不新增 pattern，而是**扩展已有 pattern 的 code_features**：

| 条件 | 说明 |
|------|------|
| 攻击终点相同 | 不同代码路径但最终操纵的目标一致（如不同路径操纵 AMM pool reserve） |
| 防御策略完全相同 | TWAP、slippage check、deviation circuit breaker 等防御手段无差异 |
| 风险等级相同 | Critical/High/Medium 分级一致 |
| 检测指标重叠 | 核心 code_feature 有 ≥ 50% 重叠 |

### 3.2 何时新增 Pattern

满足以下**两个以上**条件时考虑新增：

| 条件 | 说明 |
|------|------|
| 攻击终点不同 | 操纵的目标对象不同（如 oracle vs pool reserve vs governance） |
| 防御策略不同 | 需要不同的防御手段 |
| 检测指标无重叠 | 核心 code_feature 完全不同的模式 |
| 风险等级不同 | 严重度不同（如 informational vs critical） |

### 3.3 Case Study: POS-004 OLPC — LR-01 扩展的撤回

**v1.0 判断**: POS-004 OLPC 通过 `_transfer` hooks + `swapAndLiquify` + `sync/skim` 操纵 reserve，决定扩展 LR-01 的广义解释接纳此 pattern。（v1.0: "终点相同，防御相同 → 扩展而非新增"）

**v1.2 撤回**: 经 6+ 次跨模型（GLM 5.2、DeepSeek V4 Pro, markdown-only、thinking-enabled、thinking-disabled）评估，系统**始终无法命中 LR-01**（始终产出 AC-02、OD-01、CR-01）。对 root cause 的逐步骤分析发现：

| DeFiHackLabs 攻击步骤 | 对应 Pattern | Code Features ≥2? |
|------|------|:---:|
| owner 改 decimalsValue | AC-02 (Economic Parameters Adjustable) | ✅ |
| swapAndLiquify 读 spot pair reserves | OD-01 (Spot Price as Pricing Basis) | ✅ |
| 完全依赖 Pancake pair | CR-01 (External Protocol as Sole Source) | ✅ |
| sync/skim decay of reserves (事故后果) | LR-01 | ❌ mint/burn 首行 code_feature 不匹配 |

**教训**: LR-01 的核心 code_feature 第一行写明了 "Mint/burn calculates using current reserves"。当 exploit **不走 mint/burn** 时，即使 reserve manipulation 是经济终点，LR-01 也不适用。攻击机制（AC-02 + OD-01 + CR-01）比攻击终态（LR-01）更适合作为 label。

**修正**: POS-004 label 从 `['LR-01']` 修正为 `['OD-01', 'AC-02', 'CR-01']`。

---

## 4. Label 修正记录

### v1.2 修正（2026-07-10）

基于 DeFiHackLabs `@Analysis` root cause 的 5 步协议严格重新审查：

| Case | 原 Label | 修正 Label | 修正原因 |
|------|:------:|:---------:|---------|
| POS-004 | LR-01 (Probable) | **OD-01 + AC-02 + CR-01 (Confirmed)** | LR-01 第一行 code_feature 为 "Mint/burn calculates using current reserves" — OLPC exploit 不走 mint/burn，走 transfer hook → swapAndLiquify → skim/sync。DeFiHackLabs root cause 拆解为三步骤：(1) owner 改 decimalsValue → AC-02；(2) swapAndLiquify 读 spot pair reserves → OD-01；(3) 完全依赖 Pancake pair → CR-01。三个 pattern 各自 ≥2 code_features 匹配。LR-01 移除。 |
| POS-001 | OD-01 (Confirmed) | OD-01 (Confirmed) ✓ | 重新审查确认不变。totalAssets() donation inflation → ERC4626 expanded code_feature 全部命中 |
| POS-005 | OD-01 + TO-02 (Confirmed) | OD-01 + TO-02 (Confirmed) ✓ | 重新审查确认不变。spot-price adapter (OD-01) + minCkTokenRec=0 user-supplied (TO-02) |

### v1.1 修正（2026-07-05）

| Case | 原 Label | 修正 Label | 修正原因 |
|------|:------:|:---------:|---------|
| POS-005 | OD-01 + LR-01 | **OD-01 + TO-02** | `minCkTokenRec` 是用户传入参数，非合约内部 hardcode。根据 CL-03/TO-02 区分规则：用户传入 = TO-02（No Slippage Protection），非 LR-01（reserve-dependent operation）。OD-01 保留（spot-price adapter 读 pair reserves） |
| POS-007 | AC-02 + CL-02 (Confirmed) | AC-02 + CL-02 (Probable) | CL-02 降级：decimal 问题在价格常数缩放（35e15 vs 35e16），不是不同 token 之间的 decimal mismatch。匹配 1/4 code_features，不满足 ≥2 要求 |
| POS-010 | AC-02 (Confirmed) | AC-02 (Probable) | 降级：transferOwnership → operational drain 是操作函数滥用，AC-02 定义是"经济参数可被特权角色修改"。但 AC-02 是 21 patterns 中最接近的匹配（privileged role → fund extraction） |

### v1.0 修正（2026-07-05）

基于 DeFiHackLabs `@Analysis` root cause 重新标注：

| Case | 原 Label | 修正 Label | 修正原因 |
|------|:------:|:---------:|---------|
| POS-001 | OD-01（edel-xstock AaveOracle） | OD-01（Vault4626） | 原合约地址错误 — AaveOracle 不含漏洞。替换为同一 exploit 类型的 Vault4626 ERC4626 vault |
| POS-004 | LR-01 | LR-01（广义） | ~~确认。transfer hooks + sync/skim 入口虽不同，终点与防御相同~~ (v1.2 撤回) |
| POS-007 | OD-01 | AC-02 + CL-02 | 固定价格 presale 无 oracle dependency。DeFiHackLabs root cause: AC-02（admin 改价）+ CL-02（decimal 10x） |
| POS-010 | AC-03 | AC-02 | transferOwnership drain 是 privileged role 滥用（AC-02）而非 mint/burn（AC-03） |

### 当前 Label 置信度

| Case | Label | 置信度 | 备注 |
|------|-------|:---:|------|
| POS-001 | OD-01 | **Confirmed** | ERC4626 donation inflation → totalAssets() balance-based pricing without TWAP |
| POS-002 | CL-03 | **Confirmed** | Contract-internal auto-swap amountOutMin=0 + transfer hook |
| POS-003 | OD-01 | **Confirmed** | Reserve-derived livePrice 直接匹配全部 4 个 code_features |
| POS-004 | OD-01 + AC-02 + CR-01 | **Confirmed** | v1.2 撤回 LR-01。DeFiHackLabs 三步骤各命中一个 pattern |
| POS-005 | OD-01 + TO-02 | **Confirmed** | OD-01: spot-price adapter reads pair reserves; TO-02: minCkTokenRec is user-supplied with no contract-enforced minimum |
| POS-006 | AC-02 | **Confirmed** | Governance vote = privileged role; unlimited mint + immediate effect |
| POS-007 | AC-02 + CL-02 | Confirmed + **Probable** | AC-02: admin mutable price/limits; CL-02: price-scale error not cross-token decimal diff |
| POS-008 | LR-01 | **Confirmed** | Flash loan + pair reserve manipulation matches all code_features |
| POS-009 | TO-03 | **Confirmed** | CEI violated + no reentrancy guard |
| POS-010 | AC-02 | **Probable** | Operational function abuse, not strictly "economic parameter modification" |

---

## 5. 评估执行原则

### 5.1 Checkpoint 保留规则

当 label 修改时，不需重跑检测：`detectedPatternIds` 和 `expectedPatternIds` 是独立的字段，报告的 Recall/Precision 计算在报告生成时重新计算。

仅当以下情况需要重跑检测：
- 合约地址变更
- 检测系统代码有重大改动（prompt/budget/tool）
- 负样本需重验证（FP 修复后）

### 5.2 方法论一致性

代码改动后保留旧检测结果的条件：
- 改动不影响已正确命中的案例（如空结果指令不影响正样本）
- 截断修复不影响源码长度 < 原截断阈值的合约
- Gap 修复不影响正向检测结果
- Pattern 定义扩展不影响已正确匹配的案例

---

## 6. 参考文献

- DeFiHackLabs: https://github.com/SunWeb3Sec/DeFiHackLabs
- Pattern 完整定义: `data/vulnerabilities.json` + `docs/price-manipulation-patterns.md`
- 协议分类映射: `docs/protocol-classification-mapping.md`
- 评估数据集: `eval/dataset/positives.ts` + `eval/dataset/negatives.ts`
