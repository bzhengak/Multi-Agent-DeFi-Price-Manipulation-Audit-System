# 协议类型识别映射

> 本文档定义了协议类型识别引擎（ProtocolTypeDetector）使用的完整映射关系，由 `@docs/protocol-classification-mapping.md` 引用加载。

---

## 一、协议类型定义

| ProtocolType | 中文名称 | 操纵目标 | 风险等级 |
|---|---|---|---|
| `dex` | 去中心化交易所 | oracle | high |
| `amm` | 自动做市商 | liquidity_pool | critical |
| `lending` | 借贷协议 | oracle | high |
| `perp` | 永续合约 | margin_trading | critical |
| `yield_aggregator` | 收益聚合器 | yield_farm | medium |
| `bridge` | 跨链桥 | cross_chain | critical |
| `stablecoin` | 稳定币 | oracle | critical |
| `unknown` | 未知 | oracle | medium |

---

## 二、代码模式识别映射

### DEX 识别模式

| 模式类型 | 正则表达式 | 权重 |
|----------|-----------|------|
| 关键字 | `/\bswap\b/i` | 0.6 |
| 关键字 | `/\bexchange\b/i` | 0.6 |
| 关键字 | `/\btrade\b/i` | 0.6 |
| 关键字 | `/\border\b/i` | 0.6 |
| 结构特征 | `/function\s+\w*swap\w*/i` | 0.4 |
| 结构特征 | `/function\s+\w*exchange\w*/i` | 0.4 |
| **类型权重** | | **0.8** |

### AMM 识别模式

| 模式类型 | 正则表达式 | 权重 |
|----------|-----------|------|
| 关键字 | `/\bliquidity\b/i` | 0.6 |
| 关键字 | `/\bpool\b/i` | 0.6 |
| 关键字 | `/\binvariant\b/i` | 0.6 |
| 关键字 | `/\bk\s*=\s*x\s*\*\s*y\b/i` | 0.6 |
| 结构特征 | `/getReserves\(\)/` | 0.4 |
| 结构特征 | `/kLast/` | 0.4 |
| 结构特征 | `/fee.*\bswap\b/i` | 0.4 |
| **类型权重** | | **0.9** |

### Lending 识别模式

| 模式类型 | 正则表达式 | 权重 |
|----------|-----------|------|
| 关键字 | `/\bborrow\b/i` | 0.6 |
| 关键字 | `/\bcollateral\b/i` | 0.6 |
| 关键字 | `/\bliquidation\b/i` | 0.6 |
| 关键字 | `/\binterest\b/i` | 0.6 |
| 关键字 | `/\bhealth.*factor\b/i` | 0.6 |
| 结构特征 | `/liquidate\w*\(/i` | 0.4 |
| 结构特征 | `/borrow\w*\(/i` | 0.4 |
| 结构特征 | `/repay\w*\(/i` | 0.4 |
| 结构特征 | `/healthFactor/` | 0.4 |
| **类型权重** | | **0.85** |

### Perp 识别模式

| 模式类型 | 正则表达式 | 权重 |
|----------|-----------|------|
| 关键字 | `/\bperpetual\b/i` | 0.6 |
| 关键字 | `/\bfunding.*rate\b/i` | 0.6 |
| 关键字 | `/\bindex.*price\b/i` | 0.6 |
| 关键字 | `/\bmark.*price\b/i` | 0.6 |
| 关键字 | `/\bleverage\b/i` | 0.6 |
| 结构特征 | `/openPosition/` | 0.4 |
| 结构特征 | `/closePosition/` | 0.4 |
| 结构特征 | `/liquidatePosition/` | 0.4 |
| 结构特征 | `/fundingRate/` | 0.4 |
| **类型权重** | | **0.88** |

### Yield Aggregator 识别模式

| 模式类型 | 正则表达式 | 权重 |
|----------|-----------|------|
| 关键字 | `/\byield\b/i` | 0.6 |
| 关键字 | `/\bharvest\b/i` | 0.6 |
| 关键字 | `/\bstrategy\b/i` | 0.6 |
| 结构特征 | `/harvest\(/` | 0.4 |
| 结构特征 | `/earn\(/` | 0.4 |
| 结构特征 | `/reportProfit/` | 0.4 |
| **类型权重** | | **0.75** |

### Bridge 识别模式

| 模式类型 | 正则表达式 | 权重 |
|----------|-----------|------|
| 关键字 | `/\bbridge\b/i` | 0.6 |
| 关键字 | `/\brelay\b/i` | 0.6 |
| 关键字 | `/\bcross.*chain\b/i` | 0.6 |
| 结构特征 | `/relay\(/` | 0.4 |
| 结构特征 | `/executeMessage/` | 0.4 |
| 结构特征 | `/verifyProof/` | 0.4 |
| **类型权重** | | **0.8** |

### Stablecoin 识别模式

| 模式类型 | 正则表达式 | 权重 |
|----------|-----------|------|
| 关键字 | `/\bstable\b/i` | 0.6 |
| 关键字 | `/\bpeg\b/i` | 0.6 |
| 关键字 | `/\bcollateral.*ratio\b/i` | 0.6 |
| 结构特征 | `/mint\(/` | 0.4 |
| 结构特征 | `/burn\(/` | 0.4 |
| 结构特征 | `/updatePeg/` | 0.4 |
| **类型权重** | | **0.7** |

---

## 三、函数签名 → 协议类型映射

| 函数名模式 | 映射协议类型 |
|-----------|------------|
| `borrow`, `repay`, `liquidate`, `deposit`, `withdraw`, `collateral` | lending |
| `swap`, `exchange`, `trade`, `addLiquidity`, `removeLiquidity` | dex |
| `mint`, `burn`, `sync`, `skim`, `getReserves` | amm |
| `openPosition`, `closePosition`, `liquidate*`, `settleFunding`, `getPosition` | perp |

---

## 四、协议类型 → 优先漏洞映射

| 协议类型 | 优先检测漏洞（按优先级排序） |
|----------|---------------------------|
| **dex** | OD-01, OD-02, OD-03, TO-01, TO-02, LR-01, LR-03, CL-01, CL-03, CR-03 |

| **amm** | OD-01, OD-02, OD-03, LR-01, LR-03, TO-01, TO-02, TO-03, CL-01, CL-03, CR-03 |

| **lending** | OD-01, OD-02, OD-03, LR-01, LR-02, TO-01, TO-03, CL-02, CR-01 |

| **perp** | OD-01, OD-02, OD-03, LR-01, LR-02, TO-01, TO-02, CL-02, CR-01, CR-03 |

| **yield_aggregator** | LR-01, LR-03, TO-01, CR-01, CR-02, CR-03 |

| **bridge** | LR-03, CL-02, CR-01, CR-02, CR-03, AC-02 |

| **stablecoin** | OD-01, OD-02, OD-03, LR-03, TO-01, AC-02, AC-03, CR-01 |

| **unknown** | OD-01, OD-02, LR-01, TO-01, TO-02 |

---

## 五、协议类型 → 关键函数映射

| 协议类型 | 关键函数列表 |
|----------|------------|
| **dex** | `swap`, `getAmountOut`, `getAmountIn`, `swapExactTokensForTokens` |
| **amm** | `swap`, `mint`, `burn`, `sync`, `getReserves`, `skim` |
| **lending** | `liquidate`, `borrow`, `repay`, `withdraw`, `deposit`, `accrueInterest` |
| **perp** | `openPosition`, `closePosition`, `liquidate`, `settleFunding`, `getPosition` |
| **yield_aggregator** | `harvest`, `earn`, `withdraw`, `deposit` |
| **bridge** | `relay`, `execute`, `verify`, `mint`, `burn` |
| **stablecoin** | `mint`, `burn`, `redeem`, `updatePeg` |

---

## 六、协议类型 → 风险画像映射

| 协议类型 | manipulationRisk | flashloanExposure | oracleDependency | liquiditySensitivity |
|----------|-----------------|-------------------|-----------------|--------------------|
| dex | high | true | true | high |
| amm | critical | true | true | high |
| lending | high | true | true | medium |
| perp | critical | true | true | high |
| yield_aggregator | medium | true | false | low |
| bridge | critical | false | false | low |
| stablecoin | critical | true | true | high |
| unknown | medium | false | false | low |

---

## 七、漏洞模式 → 适用协议反向映射

| 漏洞模式 | 适用协议类型 |
|----------|------------|
| OD-01 (Oracle Spot Price) | dex, amm, perp, lending |
| OD-02 (Short TWAP) | amm, dex |
| OD-03 (Centralized Feed) | dex, amm, perp, lending, stablecoin |
| OD-04 (Stale Oracle) | dex, amm, perp, lending |
| LR-01 (Instant Reserve) | amm, dex, perp, lending |
| LR-02 (Collateral Ratio) | lending, perp |
| LR-03 (TVL-Driven) | amm, dex, bridge, stablecoin, yield_aggregator |
| TO-01 (Missing Deadline) | amm, dex, perp, stablecoin, yield_aggregator |
| TO-02 (No Slippage) | amm, dex, perp |
| TO-03 (Reentrancy Price) | amm, lending |
| AC-01 (Oracle Update) | all |
| AC-02 (Parameter Adjust) | bridge, stablecoin, all |
| AC-03 (Mint/Burn Privilege) | stablecoin |
| CL-01 (Rounding) | amm, dex |
| CL-02 (Decimal Mismatch) | perp, lending, bridge |
| CL-03 (AMM Misconfig) | amm, dex |
| CR-01 (Sole External Source) | lending, perp, yield_aggregator, bridge, stablecoin |
| CR-02 (LP Token Value) | yield_aggregator, bridge |
| CR-03 (Cross-Protocol Call) | amm, dex, perp, yield_aggregator, bridge |

---

## 八、识别算法参数

### 综合评分公式

```
compositeScore = codePatternScore × 0.7 + signatureScore × 0.3
```

### 确认阈值

- `compositeScore > 0.5`：确认类型，使用识别到的 ProtocolType
- `compositeScore ≤ 0.5`：标记为 `unknown`，使用通用分析策略

### 置信度计算

```
confidence = min(compositeScore / 5, 1.0)
```

注意：置信度最大值为 1.0，compositScore 除以 5 是因为最大可能得分的归一化。
