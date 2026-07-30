# DeFi Price Manipulation Analyzer — 用户手册

> **文档版本**: v3.7.0 | 对应代码: `src/app/page.tsx` (3029 lines), `src/app/api/*`, `src/lib/*`
> **适用对象**: 最终用户、运维人员、系统管理员

---

## 1. 快速开始

```bash
# 1. 安装依赖
bun install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 ETHERSCAN_API_KEY、OPENAI_API_KEY、USER_PASSWORD_HASH

# 3. 启动开发服务器
bun run dev

# 4. 浏览器打开 http://localhost:3000
```

**首次使用**:
1. 页面首次加载自动调用 `POST /api/init` 初始化数据
2. 自动调用 `GET /api/auth/check` 检查登录状态
3. 输入密码登录（默认 `admin123`，见 `.env.example`）
4. 登录后自动加载仪表盘数据

---

## 2. 登录页面

代码位置: `src/app/page.tsx:351-480` (3029行 SPA)

### 视觉设计
- **背景**: 深色渐变 (`from-slate-950 via-slate-900 to-slate-950`)，叠加两层装饰
  - 径向渐变光晕: 左上角 rgba(16,185,129,0.15) 绿色、右下角 rgba(34,211,238,0.15) 青色
  - 网格纹理: 40px 间距白色线条 3% 透明度，经纬线交叉
- **浮动粒子**: 6 个绿色圆点，Y 轴浮动动画 (3-5.5s 循环)，随机水平位置 (15%-90%)
- **Shield 图标**: 悬停放大 1.05x + 旋转 5°；box-shadow 呼吸动画 (3s 循环)

### 交互元素
| 元素 | 位置 | 行为 |
|------|------|------|
| 密码输入框 | 表单第一项 | 聚焦时 emerald-500/50 发光边框 |
| 显示/隐藏按钮 | 输入框右侧 | `Eye` / `EyeOff` 图标切换 |
| 提交按钮 | 表单底部 | 加载态显示 spinner + "验证中..."，禁用态 50% 透明度 |
| 错误提示 | 按钮上方 | 红色背景条 + `XCircle` 图标 + 从上方滑入动画 |
| 系统状态 | 表单外底部 | 绿色脉冲圆点 + "系统运行正常" |
| 版本信息 | 最底部 | `v3.4` + 功能标签 |

### 认证流程
```
POST /api/auth/login { password }
  → 200: {success:true} + Set-Cookie (session_token, httpOnly, 24h)
  → 401: {error:"密码错误"}
  → 500: {error:"登录失败"}
```

**密码验证优先级**: `.storage/settings.json` 中 bcrypt 哈希 > `USER_PASSWORD_HASH` 环境变量
**支持格式**: bcrypt (以 `$2` 开头) 或明文（开发环境）

---

## 3. 顶栏导航 (Header)

代码位置: `src/app/page.tsx:485-602`

### 布局
- **左侧**: Shield 图标 + "DeFi Analyzer" → 点击回到仪表盘
- **中间 (桌面)**: 5 个导航按钮
  | 快捷键 | 页面 | 图标 |
  |--------|------|------|
  | `1` | 仪表盘 | LayoutDashboard |
  | `2` | 案例库 | Database |
  | `3` | 漏洞模式 | Bug |
  | `4` | 合约分析 | Search |
  | `5` | 分析历史 | Clock |
- **右侧**: 设置齿轮 → 通知铃铛 → Admin 徽章 → 退出按钮 → 汉堡菜单 (移动端)

### 交互细节
- 当前激活项底部有 `layoutId="activeTab"` 动画条 (Framer Motion)
- 设置页面时齿轮图标高亮为 emerald 色
- 通知铃铛显示红色角标：显示 `history.records.length`，超过 9 显示 "9+"
- 退出按钮悬停变红色 (`hover:bg-red-500/10 hover:text-red-400`)
- 移动端菜单：展开/收起的 height 动画 (AnimatePresence)，点击项后自动关闭

---

## 4. 仪表盘 (Dashboard)

代码位置: `src/app/page.tsx:608-1058`

### 数据加载
```typescript
// 顺序加载，每步间隔 500ms，防止沙箱环境 OOM
await new Promise(r => setTimeout(r, 500));
const cases = await apiCall('/api/cases?pageSize=50');
await new Promise(r => setTimeout(r, 500));
const patterns = await apiCall('/api/vulnerabilities');
await new Promise(r => setTimeout(r, 500));
const history = await apiCall('/api/history');
```

**加载态**: 4 个骨架卡片 + 2 个骨架图表区域，脉冲动画。

### 五状态统计卡 (StatCard)
| 卡片 | 值来源 | 格式 | 颜色 |
|------|--------|------|------|
| 历史案例 | `cases.length` | `N+` | emerald |
| 严重漏洞 | `criticalCount` | `N个` | red |
| 漏洞模式 | `patterns.length` | `N类` | orange |
| 已完成分析 | `history.length` | `N次` | cyan |
| 预估损失 | `estimatedLoss` | `N$M` | yellow |

**预估损失**: 硬编码 lossMap (CASE-002 ~ CASE-032)，最大 CASE-027 = 42M。
**动画**: 数字从 0 递增，easeOut cubic，1200ms 持续。如果目标值为 0 则保持 0。

### SVG 风险评分仪表盘
- **评分公式**: `min(100, round((critical*15 + high*8 + criticalPatterns*5) / totalCases * 50))`
- **颜色阈值**: ≥70 红色 (`#ef4444`)，≥40 黄色 (`#eab308`)，<40 绿色 (`#10b981`)
- **圆圈**: 周长 `2πr = 314`，`strokeDasharray = score*3.14 314`，1000ms transition
- **子指标**: 严重 N / 高危 N / 其他 N

### 区块链网络状态
7 个链全部显示绿色脉冲圆点（**装饰性**，不实际检测连通性）：
Ethereum · BSC · Arbitrum · Base · opBNB · Sei · Hyperliquid
标签: "Etherscan V2 API · 统一端点"

### 审计覆盖率
- SVG 小圆环 (80×80)，周长 201
- 颜色: 全部覆盖绿色，部分橙色，无灰色
- 细节: 已审计 / 上下文推断 / 源码不可用 计数
- 未覆盖完时显示 "前往批量审计" 快捷链接

### 图表区

| 图表 | 组件 | 数据 | 备注 |
|------|------|------|------|
| 攻击时间线 | Recharts BarChart | 近12月案例数 | X轴只显示月份MM，radius=[4,4,0,0] |
| 链分布 | Recharts PieChart (环形) | 各链案例数 | inner=50, outer=80, padding=3 |
| 漏洞模式分布 | Recharts RadarChart | pattern × caseCount | 标签只显示 ID (OD-01) |
| 最近活动 | 自定义列表 | 5条分析记录 + 3条案例 | 可点击跳转 |
| Top 5 攻击模式 | 动画进度条 | 5种常见模式 | 延迟 0.3s 展开 |
| 攻击热力图 | 自定义 84 格 | **随机数据**，纯装饰 | 12月×7天，四档颜色 |

### 快捷操作
三卡片渐变色按钮: 开始分析 / 浏览案例库 / 漏洞模式
- 悬停 `scale-[1.02]`，点击 `scale-[0.98]`
- 图标 `group-hover:scale-110`

---

## 5. 案例库 (Cases)

代码位置: `src/app/page.tsx:1248-1512`

### 功能清单
- **搜索**: 300ms 防抖，全字段搜索
- **严重度筛选**: 下拉框 (全部/Critical/High/Medium)
- **链筛选**: 按钮组，选中 emerald 高亮
- **视图切换**: List / Grid 按钮
- **分页**: 10条/页，显示 "1 / N"

### 列表视图
每行: ID (灰色等宽) → 链徽章 → 严重度徽章 → 日期 → 描述 (最多2行省略)

### 网格视图
卡片: 左侧 border-l-2 emerald 色条 → 链+严重度徽章 → 描述(3行) → ID+日期

### 案例详情弹窗
点击案例弹出模态框:
| 字段 | 展示 |
|------|------|
| 标题 | ID + 链徽章 |
| 日期 | Clock 图标 + 日期 |
| 区块链 | ChainBadge |
| 漏洞模式 | SeverityBadge + 模式名称 |
| 攻击详情 | 描述文本 |
| 攻击交易 | 链接 (target=_blank) |
| 攻击合约 | 链接 + 复制按钮 |
| 受害合约 | 链接 + 复制按钮 |

关闭: 点击蒙层 (onClick setSelectedCase(null)) 或 X 按钮。

---

## 6. 漏洞模式 (Patterns)

代码位置: `src/app/page.tsx:1063-1243`

### 页面
- **标题**: "漏洞模式库 · 21种已识别的DeFi价格操纵漏洞模式 (6大类别)"
- **搜索**: 按名称/ID/类别搜索

### 严重程度分布
横向条形图 (Critical/High/Medium)，animated `initial={{width:0}}`

### 模式关联矩阵
21×21 网格:
- 对角线: `intensity = 0.6` (深绿)
- 相邻 (abs(i-j) ≤ 2): `0.2 + random * 0.15`
- 其他: `random * 0.1`
- 颜色: `rgba(16, 185, 129, intensity)`

### 模式卡片 (可展开)
折叠态: ID 徽章 → 名称 → 严重度徽章 → 箭头旋转 180° 动画
展开态: 类别 → 代码特征列表 → 关联攻击类型 → 合规溯源 (SWC/OWASP)

---

## 7. 合约分析 (Analyze)

代码位置: `src/app/page.tsx:1548-1878`

### 输入模式

**A — 合约地址**: 选链 → 输入 0x... → 显示三级获取策略说明:
```
优先级1: Etherscan V2 API → 已验证真源码
优先级2: Sourcify 仓库 → 独立验证源码
优先级3: Heimdall 反编译 → 未验证合约伪代码
```

**B — 文件上传**: 虚线拖拽区 (hover emerald) → 点击选择 .sol/.zip (500KB 限制) → 显示文件名

**Demo 模式**: 加载内置 `VulnerableDEX.sol` (含 OD-01 + TO-03 漏洞) → 自动切到文件模式 → 显示代码预览 (可收起)

### 分析深度
当前仅 "深度审计" (7阶段管道, ~3-5min)

### 7 阶段进度指示器
```
[步骤1] → [步骤2] → [步骤3] → [步骤4] → [步骤5] → [步骤6] → [步骤7]
  识别       构建      分析      重建       成本       校准       报告
```
- 已完成: 绿色实心 + 白色勾号 → 绿色连接线
- 进行中: emerald 边框 + 脉冲动画 → 灰色连接线
- 未开始: 灰色圆 + 灰色图标 → 灰色连接线

**阶段标签映射**:
| 内部阶段 | 前端显示 |
|----------|---------|
| protocol_detection | 协议识别中 - AI正在分析合约类型 |
| context_building | 上下文构建中 - 正在准备针对性分析策略 |
| vulnerability_analysis | 漏洞分析中 - AI正在深度分析合约代码（多轮迭代） |
| attack_reconstruction | 攻击重建中 - 正在重建攻击场景与资金流向 |
| cost_estimation | 攻击成本估算中 - 正在计算确定性成本区间 |
| confidence_calibration | 置信度校准中 - 正在评估分析结果可信度 |
| report_generation | 报告生成中 - AI正在撰写增强版审计报告 |

### 进度通信
**首选 SSE**: `EventSource(/api/analyze/{taskId}/stream)` → 实时推送 `{status, progress, stage, details}`
**降级轮询**: SSE 出错时 → 3秒间隔 `GET /api/analyze?taskId=xxx`

### 三种结果状态
| 状态 | UI | 操作 |
|------|----|------|
| analyzing | spinner + 阶段名 + 进度条 (渐变绿→青) + "Agent v2.0" | — |
| completed | 绿色勾号 + "分析完成" | "查看报告" |
| failed | 红色 X + 错误信息 | "重新分析" |
| partial | 同 completed, 但标题 "分析部分完成" | "查看报告" |

---

## 8. 报告 (Report)

代码位置: `src/app/page.tsx:1884-2220`

### 操作栏
| 按钮 | 功能 |
|------|------|
| ← 返回 | 回分析历史 |
| 中文 / EN | 切换标签语言 |
| 分享 | 复制页面 URL |
| 下载 → | HTML (推荐, 支持中文) / PDF (仅英文) / JSON |
| 打印 | `window.print()` |

**下载下拉菜单**: 点击外部自动关闭 (`document.addEventListener('click', handler)`)，使用 `download-dropdown-container` class 判断

### 三标签页

**概览**:
- 环形饼图 (内半径40, 外半径65), 四色
- 整体风险等级 + 严重度计数色块
- 合约信息表: 名称/源码类型/链/地址/分析时间/代码质量评分
- 修复建议列表 (绿色勾号)

**漏洞详情**:
每个漏洞可展开，含: 严重度徽章 → Pattern ID → 描述 → 代码位置 (文件:行号:函数) → 代码片段 (语法高亮 + 复制按钮) → 攻击向量 → 影响 → 匹配历史案例 (含相似度%) → 修复建议

**完整报告**:
自建 Markdown 渲染器 (`renderMarkdown`)，支持: 标题 (#/##/###)、无序列表 (-/*)、代码块 (``` 含语言标签+复制按钮)、粗体、内联代码

---

## 9. 分析历史 (History)

代码位置: `src/app/page.tsx:2225-2488`

### 统计行
总计 / Critical (红) / High (橙) / Medium (黄) / Low (蓝)

### 批量审计
- 触发: "案例库全量审计" 按钮
- 流程: POST → 轮询 (2s 首次延迟, 3s 间隔)
- 进度: 百分比 + 完成数/总数 + 进度条 + 当前案例名
- 配额耗尽: 任务 `stopped`, 已完成案例保存

### 筛选与操作
- 搜索 (名称/链) + 风险等级筛选
- 多选复选框 + 批量删除 (需 confirm)
- 单条操作: 查看报告 / 删除 (需 confirm)

### 记录条目
`复选框 → 风险图标 → 合约名 → 链徽章 → 源码徽章 → 漏洞数 → 严重度徽章 → 日期 → 查看 → 删除`

### 空态/无匹配
- 无记录: 圆形图标 + "暂无分析记录" + "开始一次合约分析..."
- 筛选无匹配: "没有匹配的记录"

---

## 10. 系统设置 (Settings)

代码位置: `src/app/page.tsx:2493-2897`

### 标签页1: 区块链 API Key
- **V2 统一端点说明**: 绿色醒目提示框
- **四个 Key 字段**: Etherscan / BscScan / Arbiscan / BaseScan
  - 密码输入类型
  - 状态指示器 (CheckCircle 绿色=已配置 / XCircle 灰色=未配置)
  - "申请" 外部链接
  - 包含 `••` 时不覆盖保存
- **优先级提示**: 设置页面 > .env 环境变量

### 标签页2: 密码管理
- 当前密码 / 新密码 / 确认密码
- 最小 4 字符，实时一致性验证 (红色 X / 绿色 ✓)
- "密码已设置" 状态指示
- 密码修改后立即生效，无需重启

### 标签页3: LLM 模型
- 文本输入框 + 4 快捷按钮: qwen3.5-plus / qwen-plus / qwen-turbo / qwen-max
- LLM 调用链路信息: 4 步流程图

---

## 11. 小功能设计合集

### 11.1 LLM 配额优雅降级
配额耗尽时（HTTP 402/429 / 含 quota/insufficient/billing 消息 / 中文 "余额不足/配额不足/频率限制"）:
1. `llm.ts` 抛出 `QuotaExceededError`, **不重试**
2. `AuditOrchestrator` 捕获 → `buildPartialResult()`:
   - 包含已完成 stages 和中间结果
   - 标识失败 stage
3. `route.ts` 保存为 `report_partial_xxx.json`
4. 写入历史记录 (`addAnalysisRecord()`)
5. 前端显示 "分析部分完成" + 可查看部分报告
6. 批量审计中: 任务状态 `stopped`, 已完成的保留

### 11.2 三级源码获取
```
Etherscan V2 → Sourcify → Heimdall 反编译
```
- 代理合约解析: 自动跟随 Implementation 地址 (最大 1 层深度)
- 多文件合约: 解析 `{{...}}` JSON 标准格式
- 内存缓存: `Map<string, FetchContractResult>`

### 11.3 双模型 LLM 路由
| 层级 | 用途 | 环境变量 |
|------|------|---------|
| primary | 漏洞分析、协议识别、攻击重建 | `OPENAI_API_KEY` |
| medium (可选) | PoC 生成、上下文降级 | `OPENAI_API_KEY_MEDIUM` |
| fast (可选) | 报告生成、摘要 | `OPENAI_API_KEY_FAST` |

未配置时自动降级到 primary。

### 11.4 JSON 解析四层策略
1. 直接 `JSON.parse()`
2. 提取 ```json ... ``` 围栏
3. 括号匹配 `{...}` 或 `[...]`
4. 宽松截断修复 (补引号、转义换行、补括号)

### 11.5 JSON 修复七层启发式
1. 转义字符串内控制字符
2. 去除注释 (//, /* */, #)
3. 修复尾随逗号和多重逗号
4. 修复 DeepSeek 缺失引号键
5. 补全未引号键
6. 单引号转双引号 (仅结构位置)
7. 补全闭括号 (栈深度)

### 11.6 SSE + 轮询双轨制
首选 SSE 实时推送，`EventSource.onerror` 时 3 秒轮询降级

### 11.7 任务状态持久化
内存 Map + `tasks.json` 文件双重写入，重启可恢复

### 11.8 上下文推断审计
三级源码全失败时，基于案例元数据 (攻击描述、漏洞模式) 让 LLM 推断漏洞:
- 占位代码 + 协议类型推断
- 置信度降级 (`hasSourceCode: false`)
- 代码质量评分 `F`，位置标记为 `0`/`unknown`

### 11.9 密码即时生效
`PUT /api/settings` → 写入 `.storage/settings.json` bcrypt 哈希 → 下次登录生效 (无需重启)

### 11.10 前端细节
1. Demo 模式: 一键加载含漏洞的演示合约
2. 通知角标: 显示记录数, >9 显示 "9+"
3. 动画计数器: easeOut cubic, 1200ms
4. SVG 仪表盘: 颜色随分数动态切换
5. 搜索防抖: 300ms
6. 骨架屏: 5 种不同场景
7. 视图切换: 列表/网格
8. 实时密码验证: 输入确认时立即反馈 ✅/❌
9. 复制反馈: "已复制" 2 秒恢复
10. 键盘快捷键: 1-5 导航, Esc 回首页
11. 下载菜单: 点击外部自动关闭
12. 模态框: 点击蒙层关闭
13. 页面切换: Framer Motion 淡入淡出
14. 顺序加载: 仪表盘 500ms 间隔防 OOM
15. 批量进度: 显示当前案例名 + 进度条

### 11.11 学习进化
审计完成后 (`EVAL_MODE` 非 true 时) 调用 `ingestAuditResult()`, 将高价值结果写入 `data/history.json`

### 11.12 源码截断检测
超 LLM 窗口时截断并记录 `codeTruncated` + `codeTruncationRatio`, 报告中生成截断警告

### 11.13 确定性成本估算
`gasCostUSD + flashLoanCostUSD`, 5 分钟 TTL 缓存, 失败非致命

### 11.14 自适应迭代预算
`max(1, min(10, round(patternComplexity * log10(tvlUSD + 1) / 2)))`

### 11.15 置信度提前停止
`delta < 0.05 && iteration >= 2` 时提前终止, 节省 token

---

## 12. 路由与键盘快捷键

```typescript
type Page = 'dashboard' | 'cases' | 'patterns' | 'analyze' | 'history' | 'report' | 'settings';
```

**快捷键**: `1`-`5` 跳转对应页面 (input/textarea/select 焦点不触发), `Esc` 回仪表盘

**页面切换动画**: `AnimatePresence mode="wait"`, 250ms, opacity + y 轴偏移

**初始化流程**:
1. `POST /api/init` 初始化数据 (静默失败)
2. `GET /api/auth/check` 检查认证
3. 认证后加载 history 计数

---

## 13. API 参考

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | `{password}` → Set-Cookie (24h, httpOnly, sameSite=strict) |
| POST | `/api/auth/logout` | 清除 cookie |
| GET | `/api/auth/check` | `{authenticated: boolean}` |

### 分析
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analyze` | FormData (type/chain/address或file) → `{taskId}` |
| GET | `/api/analyze?taskId=xxx` | 轮询: `{status, progress, stage, ...}` |
| GET | `/api/analyze/{id}/stream` | SSE 实时流 |

**status 枚举**: `pending → analyzing → completed | failed | partial`

### 报告
| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| GET | `/api/reports` | `id`, `format` (html/pdf/json), `lang` (cn/en) | 获取或下载 |

### 其他
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cases` | `page, pageSize, chain, search` → 分页案例 |
| GET | `/api/history` | 分析历史列表 |
| DELETE | `/api/history` | `id` → 删除 (含报告文件) |
| POST | `/api/batch-audit` | `{caseIds?}` → `{taskId}` |
| GET | `/api/batch-audit` | `taskId` → 批量进度 |
| GET | `/api/settings` | 获取设置 (mask 密钥) |
| PUT | `/api/settings` | `{action, ...}` 更新设置 |
| GET | `/api/vulnerabilities` | 21 种漏洞模式 |
| POST | `/api/init` | 数据初始化 (幂等) |
| GET | `/api/diagnose` | 健康检查 |
| GET | `/api/export` | 数据导出 |

### 速率限制
`/api/analyze` POST: 10次/分钟/IP, 超出 429 + `Retry-After` 头

---

## 14. 存储目录

```
.storage/
├── reports/
│   ├── report_xxx.json          # 完整报告
│   ├── report_partial_xxx.json  # 部分报告 (配额耗尽)
│   └── report_failed_xxx.json   # 失败报告 (源码不可用)
├── analysis_history.json        # 分析历史
├── tasks.json                   # 任务状态持久化
├── batch_tasks.json             # 批量任务状态
├── settings.json                # API Key / 密码 / LLM 模型
├── history.json                 # 案例库 (33案例)
└── vulnerabilities.json         # 漏洞模式 (21种)
```

`.storage/` 已在 `.gitignore` 中排除，Docker 中使用命名卷持久化。

---

## 15. 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `USER_PASSWORD_HASH` | ✓ | — | 登录密码 (bcrypt 或明文) |
| `JWT_SECRET` | ✓ | `defi-analyzer-jwt-secret-key-2026` | JWT 签名密钥 |
| `ETHERSCAN_API_KEY` | ✓ | — | 合约源码获取 |
| `OPENAI_API_KEY` | ✓ | — | 主要 LLM |
| `OPENAI_BASE_URL` | — | `https://api.deepseek.com` | 主要 LLM 端点 |
| `LLM_MODEL` | — | `deepseek-chat` | 主要模型 |
| `OPENAI_API_KEY_FAST` | — | — | 快速 LLM |
| `OPENAI_BASE_URL_FAST` | — | `https://api.deepseek.com` | 快速 LLM 端点 |
| `LLM_MODEL_FAST` | — | `deepseek-chat` | 快速模型 |
| `LLM_THINKING` | — | `disabled` | `enabled`/`auto`/`disabled` |
| `LLM_OUTPUT_MODE` | — | `markdown` | `tool`/`json_schema`/`markdown` |
| `EVAL_MODE` | — | — | 设为 `true` 禁用 learning ingest |

---

## 16. 故障排除

### 登录失败
- 确认密码: `node -e "const b=require('bcryptjs');console.log(b.hashSync('your-password',10))"`
- 默认开发密码: `admin123`

### 源码获取失败
- 三级级联均失败时生成报告，风险 `Low`, 评分 `F`
- Sei/Hyperliquid 仅支持文件上传

### 分析超时
- 总超时 2h (7,200,000ms)
- 分阶段预算: protocol_detection(5s) + context(10s) + vuln(5,000s) + reconstruction(600s) + cost(15s) + calibration(5s) + report(600s)

### LLM 配额耗尽
- 不重试 → 保存部分结果 → 任务状态 `partial`
- 批量审计: 任务 `stopped`，已完成案例保留

### 重置数据
```bash
rm -rf .storage/
# Docker:
docker-compose down -v && docker-compose up -d
```
