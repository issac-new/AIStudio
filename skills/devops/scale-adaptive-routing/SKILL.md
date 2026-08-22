---
name: scale-adaptive-routing
description: "编排路由门：blast-radius+multi-goal 判定任务走 one-shot 还是完整环路，含 readiness gate 与 READY-FOR-DEV 六条标准。用于 orchestrator 分解任务前与 worker 开工前。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, orchestration, routing, readiness-gate, bmad-fusion]
    related_skills: [kanban-orchestrator, pua-methodology-router, requirement-analysis, cognition-self-check]
---

# Scale-Adaptive Routing（规模自适应路由门）

> 来源：BMAD-METHOD v6.10.0 `bmad-build step-01-clarify-and-route` + `sprint_plan.py` readiness gate + READY-FOR-DEVELOPMENT 六条标准，适配 Hermes kanban。
> 定位：**执行前防线**——orchestrator 创建任务卡时与 worker-coder 开工前的双向路由门。

## 触发条件 / When to Use

- orchestrator 在 `kanban_create` 前判定任务应走 one-shot 还是完整 plan-code-review 环路
- worker-coder 在 `kanban_show` 后判定任务卡是否达到 READY-FOR-DEV，未达到就 `kanban_block(kind="needs_input")`
- 任务卡明显包含多目标（multi-goal）需要拆分时

## 核心内容

### 1. 路由门（在第一步用提示词判断，不需要独立分类器）

| 判定项 | One-shot 轨道 | Plan-Code-Review 轨道 |
|---|---|---|
| blast radius | 零爆炸半径：单文件、无 API/契约变更、无共享状态 | 任何跨文件/跨模块/跨 profile 影响 |
| multi-goal | 单一用户目标 | 多目标 → 必须拆分，被拆目标记入 deferred-work |
| 可逆性 | 本地可逆 | 影响共享状态/不可逆 → 强制走完整环路 |

**路由门实现位置**：orchestrator 分解任务时直接在 prompt 里做 blast-radius + multi-goal 检查，
**不需要**独立分类器服务。多目标时必须拆分成多个 `kanban_create`，并在父任务 comment 记录
deferred-work（source_spec/summary/evidence 三字段）。

### 2. Readiness Gate（开工前对规划产物做可实现性审查）

| 等级 | 含义 | 动作 |
|---|---|---|
| PASS | 任务卡 body 完整、验收标准可执行、依赖已就绪 | 开工 |
| CONCERNS | 有小缺漏但可推断 | 开工 + `kanban_comment` 记录 concerns |
| FAIL | 验收标准不可测/依赖未就绪/规模超 SCOPE | `kanban_block(kind="needs_input")` + findings 落盘 |

**headless 契约**：歧义处一律 blocked，绝不猜（与 BMAD headless blocked 契约、Hermes kanban_block 语义同构）。

### 3. READY-FOR-DEV 六条标准（worker 开工前逐条过）

| # | 标准 | 检查问题 |
|---|---|---|
| 1 | actionable | 任务卡说清了做什么，不是口号？ |
| 2 | logical | 步骤之间有逻辑顺序？ |
| 3 | testable | 每条验收标准都能 pass/fail？ |
| 4 | complete | 需要的上下文（上游 handoff/文件路径）都在？ |
| 5 | sufficient | 规模在 SCOPE STANDARD 内（见下）？ |
| 6 | coherent | 与上下游任务不冲突？ |

任一条不满足 → 不开工，`kanban_block` 并指出具体哪条失败。

### 4. SCOPE STANDARD（任务卡粒度量化标准）

- 单任务卡 body 目标 **900–1600 tokens**、**单一用户目标**
- 超过 1600 tokens → 拆卡（context-rot 防线）
- 多目标 → 拆卡 + deferred-work 记录

### 5. 状态早退（EARLY EXIT）恢复协议

worker 被重试/恢复时，按任务卡当前状态（comments/runs/prior attempts）跳到对应步骤，
不从头重做。BMAD 的 spec frontmatter 状态机映射到 Hermes：kanban task 的
`status` + 历史 `runs` + `comments` 就是状态源。

## 与其他 skill 的联动

- `pua-methodology-router`：路由门决定**走哪条轨道**；methodology-router 决定**用哪种方法论**。两者正交，先过路由门再选方法论。
- `cognition-self-check`：执行前防线的前置——先自检再判路由。
- `requirement-analysis`：READY-FOR-DEV 六条可作为需求分析师产出任务卡的验收前置。
- `kanban-orchestrator`：orchestrator 分解规则的路由门增补。

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_create` | orchestrator 创建前过路由门（blast-radius + multi-goal + SCOPE） |
| `kanban_create(body=...)` | body 写作遵循 SCOPE STANDARD（900-1600 tokens，单目标） |
| `kanban_block(kind="needs_input")` | readiness FAIL 的标准出口 |
| `kanban_comment` | CONCERNS 落盘 + deferred-work 记录（source/summary/evidence） |
| worker-coder 开工 checklist | READY-FOR-DEV 六条逐条过 |
