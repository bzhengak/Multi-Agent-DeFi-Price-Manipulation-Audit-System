# Multi-Agent DeFi Price Manipulation Audit System

A multi-agent system that automatically audits DeFi smart contracts for price manipulation vulnerabilities, covering 21 attack patterns across 6 categories (Oracle Dependency, Liquidity & Reserve, Transaction Ordering, Access Control, Calculation Logic, Composability).

## Key Results

| Metric | Result |
|--------|--------|
| Hit Rate (attack detection) | **100%** (10/10 recent attack cases) |
| Safe-Contract Precision | **100%** (0 false positives on 10 audited safe protocols) |
| Verified Precision (source-code confirmed) | **77.6%** (45/58 detections are real vulnerabilities) |
| vs. Raw LLM baseline | +40pp hit rate improvement (same model, no Agent loop) |
| vs. Slither | Slither detects 0% of DeFi semantic patterns |

## Architecture

The system uses a **seven-stage pipeline** coordinated by an audit orchestrator. Each stage delegates to a specialized agent following a cognitive **Observe-Think-Act-Update (OTAU)** loop:

```
Stage 1: Protocol Identification    → Classify into 8 DeFi protocol types
Stage 2: Context Building            → Assemble analysis context + cross-contract call graph
Stage 3: Vulnerability Analysis      → Iterative multi-round pattern matching (OTAU)
Stage 4: Attack Reconstruction       → Per-vulnerability attack narrative generation
Stage 5: Cost Estimation             → Deterministic on-chain cost calculation
Stage 6: Confidence Calibration      → 5-dimension confidence scoring
Stage 7: Report Generation           → Dual-model routing (primary + fast provider)
```

**Core innovations:**
- **Adaptive iteration budget** — TVL-aware iteration count (1–10 rounds)
- **Convergence-based early stopping** — terminates when confidence stabilizes
- **Cross-contract tracing** — builds external call graph up to depth 2
- **AST-based protection filter** — deterministic suppression of false positives
- **Learning evolution** — cross-session knowledge accumulation via RAG retrieval
- **Dual-model routing** — GLM 5.2 / DeepSeek V4 Pro for analysis, Flash for reports

## Quick Start

### Prerequisites

- **Node.js** 20+ or **Bun** 1.1+
- An LLM API key (DeepSeek or GLM/ZhipuAI)
- An Etherscan API key (for contract source fetching)

### Installation

```bash
git clone https://github.com/bzhengak/Multi-Agent-DeFi-Price-Manipulation-Audit-System.git
cd Multi-Agent-DeFi-Price-Manipulation-Audit-System
bun install
```

### Configuration

Copy `.env.example` to `.env` and fill in your keys:

```bash
# Required
OPENAI_API_KEY=your-deepseek-api-key        # or GLM API key
ETHERSCAN_API_KEY=your-etherscan-key        # Get at etherscan.io/myapikey

# Model configuration (defaults shown)
LLM_MODEL=deepseek-v4-pro                   # Primary model for analysis
OPENAI_BASE_URL=https://api.deepseek.com    # Or ZhipuAI endpoint

# Optional: faster model for report generation
OPENAI_API_KEY_FAST=your-fast-api-key
LLM_MODEL_FAST=deepseek-v4-flash

# Optional: enable thinking mode for deeper reasoning
# LLM_THINKING=auto                          # 'auto' = primary only, 'enabled' = all, 'disabled' = off

# Structured output mode
LLM_OUTPUT_MODE=tool                        # 'tool' | 'json_schema' | 'markdown'
```

### Run the Web UI

```bash
bun run dev
# Open http://localhost:3000
```

Enter a contract address (e.g., `0x...` on Etherscan), select the chain, and click **Analyze**. The system will fetch the source code, run the 7-stage pipeline, and display the audit report.

### Run the Evaluation

```bash
# Full evaluation (10 positive + 10 negative cases)
EVAL_MODE=true bun run eval

# Regenerate report from existing checkpoint (no re-audit)
bun run eval:report

# Run baselines only (Raw LLM + Slither)
bun run eval:baselines
```

## 21 Vulnerability Patterns

| Category | Patterns | Focus |
|----------|----------|-------|
| **Oracle Dependency** (OD) | OD-01~05 | Spot price, short TWAP, centralized feed, stale data, missing heartbeat |
| **Liquidity & Reserve** (LR) | LR-01~03 | Mint/burn reserves, collateral ratio, TVL-driven rewards |
| **Transaction Ordering** (TO) | TO-01~03 | Missing deadline, no slippage, reentrancy-type |
| **Access Control** (AC) | AC-01~03 | Oracle address update, parameter adjustment, mint/burn privilege |
| **Calculation Logic** (CL) | CL-01~03 | Rounding, decimal mismatch, AMM curve misconfiguration |
| **Composability** (CR) | CR-01~04 | Sole external source, LP token value, unchecked calls, cross-protocol dependency |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, RSC) |
| Language | TypeScript 5 (strict mode) |
| Runtime | Bun (dev) / Node.js 20+ (prod) |
| LLM | DeepSeek V4 Pro / GLM 5.2 (OpenAI-compatible API) |
| Parser | @solidity-parser/parser (AST analysis) |
| Storage | SQLite (Prisma) + file system |
| UI | Tailwind CSS 4 + shadcn/ui |
| Testing | Vitest (79 tests) |

## Project Structure

```
src/
├── app/                          # Next.js App Router (API + pages)
│   ├── api/analyze/              # SSE-based audit endpoint
│   └── page.tsx                  # Main SPA
├── lib/
│   ├── agents/                   # Multi-agent system
│   │   ├── core/                 # BaseAgent, ToolRegistry, MemorySystem, LLMClient
│   │   ├── audit/                # 7-stage pipeline agents
│   │   │   ├── protocols/        # Protocol type detection
│   │   │   ├── context/          # Context building + cross-contract tracing
│   │   │   ├── vulnerability/    # OTAU analysis + prompt optimization + protection filter
│   │   │   ├── reconstruction/   # Attack narrative generation
│   │   │   ├── calibration/      # Confidence calibration
│   │   │   └── orchestrator/     # Stage coordination + timeout management
│   │   └── prompts/              # 21-pattern vulnerability prompt
│   ├── blockchain/               # Etherscan V2 source fetcher
│   ├── cost/                     # Deterministic cost estimation (T10)
│   └── llm.ts                    # Dual-provider LLM client + JSON recovery
eval/
├── dataset/                      # 10 positive + 10 negative evaluation cases
├── results/                      # Checkpoints, reports, baseline data
├── run-eval.ts                   # Full evaluation runner
└── report.ts                     # Report generator with multi-layer metrics
data/
├── vulnerabilities.json          # 21 pattern definitions (single source of truth)
└── history.json                  # 33 historical attack cases (knowledge base)
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server (http://localhost:3000) |
| `bun run build` | Production build |
| `bun run lint` | ESLint code check |
| `bun run test` | Run Vitest test suite |
| `EVAL_MODE=true bun run eval` | Full evaluation (20 cases) |
| `bun run eval:report` | Regenerate report from checkpoint |
| `bun run eval:baselines` | Run Raw LLM + Slither baselines |
| `bun run ingest:patterns` | Ingest pattern definitions into Prisma DB |

## Evaluation Methodology

The system is evaluated on a balanced 10+10 dataset:

- **Positive samples**: 10 recent DeFi attacks (Apr–Jun 2026) from DeFiHackLabs, covering 8 patterns across BSC, Ethereum, and Base. These cases are absent from the system's knowledge base to prevent data leakage.
- **Negative samples**: 10 professionally audited safe protocols (Uniswap V3, Aave V3, Compound V3, Curve, Balancer, etc.) with >$1B TVL.

**Metrics address the label completeness problem** inherent in vulnerability detection — ground-truth labels identify only the exploited vulnerability, not all vulnerabilities present. The system reports exploit-matched precision (conservative lower bound) alongside verified precision (source-code confirmed).

## License

MIT

## Author

ZHENG Bowen — ARIN6900 Capstone Project
