---
name: to-tickets
description: "把计划/spec/会话拆成 tracer-bullet 垂直切片任务：每张卡端到端可验证、声明阻塞边（kanban parents）、宽重构走 expand-contract。触发：拆需求为 kanban 卡、任务分解、说拆成 tracer bullet/垂直切片。融合自 mattpocock/skills to-tickets。"
version: 1.0.0
author: Hermes Agent (adapted from mattpocock/skills)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [decomposition, vertical-slice, tracer-bullet, expand-contract, kanban, fusion]
    related_skills: [kanban-orchestrator, delegation-brief-format, grilling]
  provenance:
    source: https://github.com/mattpocock/skills
    source_path: skills/engineering/to-tickets/SKILL.md
    fused: 2026-09-02
---

# To Tickets — Tracer-Bullet 任务分解

## Overview

把一个计划、spec 或已对齐的会话拆成一组**垂直切片**任务：每张卡都是一条窄但**完整**穿过所有层的路径，并显式声明它被哪些卡阻塞。

**与 kanban-orchestrator 的分工**：kanban-orchestrator 讲编排纪律（何时建卡、依赖链管理、防死锁）；本 skill 讲**切片方法论**（怎么切、切多粗、宽重构怎么办）。分解时两者并用。

## Process

### 1. Gather context

从会话上下文出发。用户给了引用（spec 路径、卡号、issue）就先取全文读，包括评论线程。

### 2. Explore the codebase (optional)

没探索过代码库就先探索。卡标题和描述用项目领域词汇（见 domain-modeling），尊重所在区域的既有决策。寻找**prefactoring 机会**："先让改变容易，再做容易的改变。"

### 3. Draft vertical slices

<vertical-slice-rules>

- 每片窄但**完整**穿过每一层（schema、API、UI、测试）：垂直，不是某一层的水平切片
- 完成的片**自身可演示或可验证**
- 每片大小以**一个新鲜上下文窗口**能装下为准（worker 单次 run 能完成）
- prefactoring 排在最前

</vertical-slice-rules>

给每张卡声明**阻塞边**：必须先完成的卡。无阻塞的卡立即可开工。Hermes 映射：阻塞边 = `kanban_create(parents=[...])`，无阻塞则不带 parents。

**宽重构是垂直切片的例外。** 宽重构 = 一个机械变更（改列名、改共享符号类型）的**爆炸半径**横跨整个代码库，单次编辑同时破坏上千个调用点，任何垂直切片都无法独立变绿。不要硬塞进 tracer bullet，按 **expand–contract** 排序：

1. **Expand**：新旧形式并存，什么都不破坏
2. **Migrate**：按爆炸半径分批迁移调用点（按包、按目录），每批一张卡、都阻塞在 expand 上；旧形式还在，CI 批批绿
3. **Contract**：无调用者残留后删除旧形式，阻塞在所有 migrate 批之上

批次连绿都做不到时，保持序列但共享一条集成分支，全部阻塞在一张最终 integrate-and-verify 卡上，绿只承诺在那一处。

**Hermes 映射**：expand/migrate 批/contract 各是普通 kanban 卡，parents 表达阻塞；contract 卡 parents=[expand, migrate批次…]。

### 4. Quiz the user

把分解草案按编号列表呈给用户。每张卡展示：

- **Title**：短描述名
- **Blocked by**：哪些卡必须先完成（kanban parents）
- **What it delivers**：这张卡让什么端到端行为成立

问用户：

- 粒度对吗？（太粗/太细）
- 阻塞边对吗：每张卡是否只依赖真正闸住它的卡？
- 有该合并或再拆的吗？

迭代到用户认可。**这是 grilling 的一轮应用**：先对齐再建卡，避免返工。

### 5. Publish to kanban

用 `kanban_create` 逐张建卡（依赖序，阻塞者先建），`parents=[...]` 接边。卡 body 用 delegation-brief-format 七要素模板。验收标准 `frozen: true`。

**不要**写具体文件路径或代码片段——它们很快过时。例外：若原型产出过一段编码了决策的代码（状态机、schema、类型形状），内联进相关决策并注明来源，裁到只剩决策密集部分。

<local-ticket-template（kanban body 骨架）>

```markdown
## 任务
<这张卡让什么端到端行为成立——用户视角，不是逐层实现清单>

## 验收标准（frozen: true）
- [ ] 标准 1
- [ ] 标准 2

## 依赖
- parents: [<卡 id 列表>] 或 None（可立即开工）

## 约束
<边界、非目标、必须遵守的项目决策>
```

</local-ticket-template>

**不修改、不关闭父卡。** 分解产出的子卡由各自 assignee 走完生命周期。

## Work the frontier

建完卡后按 **frontier** 推进：所有阻塞都已完成的卡。纯线性链即自顶向下。dispatcher 自动处理 parents 解锁；orchestrator 只需保证依赖边在创建时就接对。

## 变更历史

| 版本 | 日期 | 变更 | 来源 |
|---|---|---|---|
| 1.0.0 | 2026-09-02 | 初版，融合自 mattpocock/skills to-tickets（tracer-bullet/expand-contract/frontier 为原文；kanban parents 映射与 quiz-grilling 衔接为 hermes 化增补） | orchestrator |
