---
name: grilling
description: "结构化需求拷问：frontier 轮次机制榨干设计树每个分支，事实 agent 查、决策用户定。触发：需求澄清、方案评审前的对齐、用户说 grill/拷问/把需求问透。融合自 mattpocock/skills grilling。"
version: 1.0.0
author: Hermes Agent (adapted from mattpocock/skills)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [requirements, clarification, elicitation, interview, design-tree, fusion]
    related_skills: [rd-clarify, delegation-brief-format, kanban-orchestrator]
  provenance:
    source: https://github.com/mattpocock/skills
    source_path: skills/productivity/grilling/SKILL.md
    fused: 2026-09-02
---

# Grilling — 结构化需求拷问

## Overview

最常见的失败模式是**错位**：你以为对方（用户/上游）说清楚了，做完才发现完全理解偏了。修复方式不是更努力地猜，而是**访谈到底**——把设计树每个分支问到无假设残留。

**Core principle:** 拷问产出的是**共识**，不是信息收集。frontier 空了才算完，完之前不动手。

## When to Use

- 用户说"grill / 拷问我 / 把需求问透 / 帮我想清楚"
- 重型任务 kanban_create 之前，orchestrator 对模糊需求做澄清（与 rd-clarify 互补：rd-clarify 清单式找信息缺口，本 skill 结构化逐轮逼近共识）
- 方案评审前，把"每个分支都解决了吗"过一遍

**与 rd-clarify 的分工**：rd-clarify 是信息缺口清单（找什么没说清）；本 skill 是**轮次推进机制**（怎么逐轮收敛到共识）。可以先 rd-clarify 列缺口，再用本 skill 逐轮榨干。

## The Design Tree & The Frontier

把理解映射为一棵**设计树**：每个决策挂着依赖它的子决策。

用**轮次**推进。**frontier** = 前置条件已解决的全部决策——即现在就能问、不用猜的问题。每轮把整个 frontier 一次问完：给每个问题编号 + 给出你的推荐答案。然后停下等用户回答。

轮次格式：

```
❓ **Q1** - **<问题标题>**: <问题正文，可多段，可含选项>

➡️ <你的推荐答案>

---

❓ **Q2** - **<问题标题>**: <问题正文>

➡️ <你的推荐答案>
```

每轮用户的回答重塑树：已解决的决策把 frontier 向外推，解锁依赖它们的问题。重算 frontier，进入下一轮。一个问题的答案还依赖本轮另一个未决问题 → 属于**下一轮**，不是本轮。

## 事实是你的工作，决策是用户的工作

frontier 问题需要环境事实（文件、配置、工具输出、看板状态）时，**自己查，别问用户**：

- 文件/代码 → read_file / search_files
- 集群状态 → kanban_list / kanban_show / terminal(sqlite3)
- 外部事实 → web_search / web_extract

查证进行中不阻塞：一个还在跑的探索只是未决前置，只让下游的问题等它，其余 frontier 照常发问。**决策**必须交给用户，每个都等用户拍板。绝不自问自答替用户做决策（HITL 纪律）。

## Completion Criterion

frontier 空了：设计树每个分支都走到，没有留下任何隐性假设。**用户确认达成共识之前，不执行任何动作**。

## Hermes 落地钩子

- 共识达成后，结论直接固化为 kanban_create body 的验收标准（frozen: true）——拷问的输出就是验收标准的上游
- frontier 中"事实类"问题若需要子代理查询，用 delegate_task 派发（短推理子任务），不占当前上下文
- 每轮问题数控制在用户一次能回答的量（经验值 ≤5）；frontier 更宽时按优先级截断并在下轮续问

## 变更历史

| 版本 | 日期 | 变更 | 来源 |
|---|---|---|---|
| 1.0.0 | 2026-09-02 | 初版，融合自 mattpocock/skills grilling（frontier 机制+事实/决策分治为原文，落地钩子为 hermes 化增补） | orchestrator |
