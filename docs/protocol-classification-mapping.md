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
| **dex** | VP001, VP005, VP006, VP007, VP008 |
| **amm** | VP001, VP007, VP008, VP005, VP006 |
| **lending** | VP001, VP002, VP003, VP004 |
| **perp** | VP001, VP002, VP004, VP006 |
| **yield_aggregator** | VP002, VP003, VP006 |
| **bridge** | VP003, VP004, VP008 |
| **stablecoin** | VP001, VP002, VP003 |
| **unknown** | VP001, VP002 |

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
| VP001 (Oracle Manipulation) | dex, amm, perp, lending |
| VP002 (Flash Loan Attack) | dex, amm, perp, lending, yield_aggregator |
| VP003 (Reserve Manipulation) | lending, bridge |
| VP004 (Price Calculation Flaw) | perp, lending |
| VP005 (Liquidity Pool Manipulation) | amm, dex |
| VP006 (Slippage Bypass) | amm, dex, perp |
| VP007 (TWAP Manipulation) | amm, dex |
| VP008 (AMM Exploitation) | amm, dex |

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
