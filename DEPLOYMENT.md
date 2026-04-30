# DeFi Price Manipulation Analyzer — 部署指引

> 本文档提供从零开始的完整部署流程，覆盖本地开发、Docker 部署和云平台（Render.com）部署三种方式。

---

## 一、系统架构概览

```
用户浏览器
    │
    ▼
Next.js App (port 3000)
    │
    ├── /api/analyze → AuditOrchestrator（6 阶段 Agent 流水线）
    │     ├── ProtocolTypeDetector     协议识别
    │     ├── ContextManager           上下文构建
    │     ├── VulnerabilityAnalysisAgent  多轮漏洞分析
    │     ├── PriceManipulationReconstructor  攻击重建
    │     ├── ConfidenceCalibrator     置信度校准
    │     └── LLMClient → 报告生成
    │
    ├── /api/auth/*    → JWT 认证
    ├── /api/reports/* → 报告下载
    └── /api/cases/*   → 案例库
          │
          ▼
    .storage/          本地文件存储
      ├── reports/     审计报告
      ├── memory/      Agent 记忆系统
      │   ├── working/
      │   ├── episodic/
      │   └── semantic/
      └── tasks.json   任务状态

LLM 调用（二选一）:
  - Z.ai SDK 模式（Z.ai 平台内部署）
  - OpenAI 兼容 API 模式（外部部署，支持 DeepSeek/OpenAI/任何兼容端点）
```

---

## 二、环境要求

| 依赖 | 最低版本 | 推荐版本 | 说明 |
|------|---------|---------|------|
| Node.js | 20.0 | 20.x LTS | 生产运行时 |
| Bun | 1.0 | latest | 开发时包管理+构建 |
| npm | 10.0 | latest | 备选包管理器 |
| Git | 2.0 | latest | 代码管理 |
| Docker | 24.0 | latest | 容器化部署 |
| Docker Compose | 2.20 | latest | 容器编排 |

---

## 三、本地开发部署

### 3.1 克隆项目

```bash
git clone <your-repo-url>
cd DeFi-Price-Manipulation-Analyzer-Auditor-main
```

### 3.2 安装依赖

**方式 A：使用 Bun（推荐）**
```bash
# 安装 Bun（如未安装）
powershell -c "irm bun.sh/install.ps1 | iex"   # Windows
curl -fsSL https://bun.sh/install | bash        # macOS/Linux

# 安装依赖
bun install
```

**方式 B：使用 npm**
```bash
npm install
```

### 3.3 配置环境变量

```bash
# 复制示例配置
cp .env.example .env
```

编辑 `.env` 文件，填入以下必填项：

```env
# ============ 必填 ============

# 登录密码（开发环境可用明文，生产环境必须用 bcrypt hash）
# 生成 hash: node -e "const b=require('bcryptjs');console.log(b.hashSync('你的密码',10))"
USER_PASSWORD_HASH=admin123

# JWT 密钥（生产环境必须改为随机长字符串）
JWT_SECRET=change-me-to-a-random-string-in-production

# Etherscan V2 API Key（合约源码获取必需）
# 免费申请: https://etherscan.io/myapikey
ETHERSCAN_API_KEY=你的Etherscan密钥

# ============ LLM 配置（二选一）============

# 方式 A：OpenAI 兼容 API（推荐，外部部署用）
OPENAI_API_KEY=你的API密钥
OPENAI_BASE_URL=https://api.deepseek.com    # DeepSeek 端点
LLM_MODEL=deepseek-chat                      # 模型名称

# 方式 B：Z.ai 平台模式（在 Z.ai 平台内部署时，无需配置，自动可用）
# 不设置 OPENAI_API_KEY 即自动使用 Z.ai 模式

# ============ 可选 ============

# ZHIPU API Key（opencode.ai 代理使用）
# ZHIPU_API_KEY=你的智谱密钥

# GitHub Token（MCP GitHub 集成，可选）
# GITHUB_TOKEN=你的GitHub令牌
```

### 3.4 LLM 模式选择指南

| 模式 | 何时使用 | 配置项 | 费用 |
|------|---------|--------|------|
| **DeepSeek** | 外部部署，性价比最高 | `OPENAI_BASE_URL=https://api.deepseek.com` + `LLM_MODEL=deepseek-chat` | ¥1/百万token |
| **OpenAI** | 需要最佳质量 | `OPENAI_BASE_URL=` + `LLM_MODEL=gpt-4o-mini` | $0.15/百万token |
| **Z.ai** | 在 Z.ai 平台内部署 | 无需配置 | 平台内免费 |
| **智谱 GLM** | 国内合规场景 | `OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4` + `LLM_MODEL=glm-4-flash` | 按量计费 |

### 3.5 初始化数据

```bash
# 首次运行时自动初始化，也可手动触发
curl -X POST http://localhost:3000/api/init
```

### 3.6 启动开发服务器

```bash
bun run dev
# 或
npm run dev
```

访问 http://localhost:3000，使用 `USER_PASSWORD_HASH` 中设置的密码登录。

### 3.7 验证 Agent 系统工作

1. 在「合约分析」页面，输入一个已知有漏洞的合约地址（如 BSC 链上的合约）
2. 或上传 `VulnerableDEX.sol` 演示文件
3. 观察进度条显示 6 阶段：识别 → 构建 → 分析 → 重建 → 校准 → 报告
4. 查看报告中是否包含攻击重建、置信度校准等 Agent v2.0 新增内容

---

## 四、Docker 部署

### 4.1 构建并启动

```bash
# 构建镜像
docker-compose build

# 启动服务（后台运行）
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 4.2 配置环境变量

编辑 `docker-compose.yml` 中的环境变量：

```yaml
environment:
  - NODE_ENV=production
  - USER_PASSWORD_HASH=你的bcrypt哈希    # 必改！
  - JWT_SECRET=你的随机密钥               # 必改！
  - ETHERSCAN_API_KEY=你的Etherscan密钥  # 必填！
  - OPENAI_API_KEY=你的API密钥
  - OPENAI_BASE_URL=https://api.deepseek.com
  - LLM_MODEL=deepseek-chat
```

### 4.3 持久化数据

`docker-compose.yml` 已配置 `app-storage` 卷挂载到 `/app/.storage`，包含：
- 分析报告
- Agent 记忆数据
- 用户设置

容器重启不会丢失数据。

### 4.4 常用操作

```bash
# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 更新代码后重新构建
docker-compose build --no-cache
docker-compose up -d

# 进入容器调试
docker-compose exec app sh
```

---

## 五、Render.com 云平台部署

### 5.1 准备工作

1. 注册 Render 账号：https://dashboard.render.com
2. 将代码推送到 GitHub 仓库
3. 准备好 API Key（Etherscan + LLM）

### 5.2 一键部署（Blueprint）

```bash
# 安装 Render CLI
npm install -g render-cli

# 使用 Blueprint 部署
render blueprint deploy
```

### 5.3 手动部署步骤

1. 在 Render Dashboard 中点击 **New → Web Service**
2. 连接 GitHub 仓库
3. 配置如下：

| 配置项 | 值 |
|--------|-----|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `node .next/standalone/server.js` |
| Plan | Starter（需要持久化磁盘）|

4. 添加环境变量（Environment → Add Environment Variable）：

| Key | Value | 说明 |
|-----|-------|------|
| `NODE_ENV` | `production` | |
| `USER_PASSWORD_HASH` | bcrypt 哈希 | **必须手动设置** |
| `JWT_SECRET` | 随机长字符串 | **必须手动设置** |
| `ETHERSCAN_API_KEY` | 你的 Key | 合约源码获取 |
| `OPENAI_API_KEY` | 你的 Key | LLM 调用 |
| `OPENAI_BASE_URL` | `https://api.deepseek.com` | 可选 |
| `LLM_MODEL` | `deepseek-chat` | 可选 |
| `ZHIPU_API_KEY` | 你的 Key | 可选 |

5. 添加持久化磁盘：

| 配置项 | 值 |
|--------|-----|
| Name | `defi-storage` |
| Mount Path | `/opt/render/project/src/.storage` |
| Size | 1 GB |

6. 点击 **Create Web Service** 开始部署

### 5.4 生成生产级密码哈希

```bash
# 本地运行
node -e "const b=require('bcryptjs');console.log(b.hashSync('你的安全密码',10))"

# 复制输出的 $2a$10$... 字符串到 USER_PASSWORD_HASH
```

### 5.5 自定义域名（可选）

1. Render Dashboard → Settings → Custom Domains
2. 添加你的域名
3. 在 DNS 提供商添加 CNAME 记录指向 Render 提供的地址

---

## 六、安全检查清单

部署前逐项确认：

- [ ] `USER_PASSWORD_HASH` 使用 bcrypt 哈希，非明文密码
- [ ] `JWT_SECRET` 设置为 32+ 字符的随机字符串
- [ ] `.env` 文件未被提交到 Git（确认 `.gitignore` 包含 `.env`）
- [ ] API Key 未硬编码在代码中
- [ ] 速率限制已启用（`src/lib/security.ts`，默认 10 次/分钟/IP）
- [ ] 输入验证已启用（合约地址清洗、源码大小限制 500KB）
- [ ] Agent 超时保护已配置（Orchestrator 默认 600 秒总超时）
- [ ] 生产环境 `ignoreBuildErrors` 已设为 `false`（`next.config.ts`）
- [ ] `noImplicitAny` 已设为 `true`（`tsconfig.json`）

---

## 七、Agent 系统配置调优

### 7.1 漏洞分析迭代次数

在 `AuditOrchestrator` 中调整 `VulnerabilityAnalysisAgent` 的 `maxIterations`：

```typescript
// 默认 5 轮迭代，可在 3-10 之间调整
const vulnAgent = new VulnerabilityAnalysisAgent(
  sourceCode, contractName, blockchain, address, 5  // ← 修改此处
);
```

| 值 | 效果 | Token 消耗 | 适用场景 |
|----|------|-----------|---------|
| 3 | 快速扫描 | ~3x | 快速初筛 |
| 5 | 均衡（默认） | ~5x | 日常分析 |
| 8 | 深度分析 | ~8x | 高价值合约 |

### 7.2 Orchestrator 总超时

```typescript
// 默认 600 秒（10 分钟）
const orchestrator = new AuditOrchestrator(onProgress, 600000);
```

### 7.3 LLM 参数

通过环境变量 `LLM_MODEL` 控制模型选择。Agent 系统内部硬编码的参数：
- `temperature: 0.1` — 低随机性，确保分析一致性
- `maxTokens: 8192` — 单次输出上限
- `maxRetries: 3` — 自动重试次数

---

## 八、故障排查

### 8.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 登录失败 | 密码哈希不匹配 | 确认 USER_PASSWORD_HASH 格式正确 |
| 合约源码获取失败 | Etherscan Key 无效/余额不足 | 检查 ETHERSCAN_API_KEY，确认账户余额 |
| LLM 调用超时 | 网络问题或模型负载高 | 检查 OPENAI_BASE_URL 连通性，增加超时 |
| 分析结果为空 | LLM 返回格式错误 | 查看日志，确认模型支持 JSON 输出 |
| Docker 构建失败 | 内存不足 | 设置 `NODE_OPTIONS=--max-old-space-size=4096` |

### 8.2 日志查看

```bash
# 本地开发
cat dev.log

# Docker
docker-compose logs -f app

# Render
# Dashboard → Logs 实时查看
```

### 8.3 重置数据

```bash
# 清除所有存储数据（报告、历史、设置）
rm -rf .storage/

# Docker 环境
docker-compose down -v  # 删除卷
docker-compose up -d    # 重新启动
```

---

## 九、版本更新

### 从旧版 Workflow 升级到 Agent v2.0

本项目已完成从固定 Workflow 到 Agent 系统的升级。关键变更：

1. **分析流程**：3 阶段 → 6 阶段 Agent 流水线
2. **API 兼容**：`/api/analyze` 接口格式不变，内部路由到 Agent 系统
3. **报告格式**：新增 `classification`、`reconstruction`、`calibratedResult` 字段
4. **前端**：进度展示从 4 步更新为 6 步
5. **存储**：新增 `.storage/memory/` 目录用于 Agent 记忆

旧版报告格式完全兼容，无需数据迁移。
