# JiuwenSwarm Symphony 架构深度分析

> 来源：openJiuwen-ai/jiuwenswarm (Apache-2.0)，Python ≥3.11，跨平台桌面+CLI+TUI Agent 系统。
> 分析日期：2026-07-28，基于 git clone --depth 1 源码级阅读。

## 1. 项目定位

**一句话**：让多智能体真正协作起来的 Agent 系统，通过自然语言驱动多 Agent 协作、Skill 自演进和工具调用。

**三大核心差异**：
1. **Skill 自演进** — 能力越用越强而非越跑越僵
2. **蜂群协作** — Leader 自动拆解任务、组建团队
3. **多端接入** — 覆盖主流 IM 平台

## 2. Symphony 引擎六大子系统

### 2.1 Evolution — 动态 Overlay 演进

**权重策略**（`skillgraph_linear_v1`）：
- STEP=0.05, MIN=0.2, MAX=2.0
- `weight = 1.0 + 0.05 × (success - failure)`
- needs_input 不影响权重
- Laplace 平滑: `success_rate = (success+1)/(attempt+2)`

**失败归因**：all_edges / terminal_edge / explicit / success_only

### 2.2 Experience Bank

**Pipeline**: Trace → Cluster (FAISS) → Distill (LLM) → ExperienceItem → Bank

**错误类型**: wrong_skill / skill_error / incomplete / refusal / empty

### 2.3 Evaluation — 五维评估

success_rate, latency, accuracy, completeness, compliance

### 2.4 Orchestration — Beam 编排

双向 Beam: Forward + Backward → LLM Judge → Rerank → OrchestrationPlan

### 2.5 Fingerprint — Skill 指纹

Scan → Parse → Extract (LLM) → Normalize → Incremental

### 2.6 Session Consumer

用户确认信号检测 → outcome 推断 → overlay rebuild

## 3. 融合评估

### 高价值可移植

| 能力 | Hermes 对应 | 优先级 |
|------|-----------|--------|
| 动态 overlay 权重 | hindsight_retain + kanban_comment | P0 |
| 5D 评估 | loop-engineering-gates 增强 | P0 |
| Experience Bank | hindsight + session_search | P1 |
| Beam 规划 | orchestrator decomposition | P1 |
| 错误类型分类 | pua-pressure-engine | P1 |

### 不建议移植

A2UI 协议、JiuwenBox 沙箱、分布式跨机器、Hook 生命周期 — Hermes 已有等价机制。
