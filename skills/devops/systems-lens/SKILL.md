---
name: systems-lens
description: "Use when decomposing tasks or structural changes."
version: 1.1.0
metadata:
  hermes:
    tags: [systems-theory, four-lenses, architecture, decomposition]
    related_skills: [cybernetics-dual-lens, information-lens, kanban-orchestrator]
---

# Systems Lens（系统论透镜）

> v1.1 融合表达重写（用户纠偏：工程实践为体、认识论为名）：架构工程就是系统论的工程化，本透镜把两边的概念一一接上线。

**等价对照**：模块边界 = 系统边界界定（Parnas 信息隐藏：边界处的接口契约即系统的边）；分层架构 = 层次划分；依赖图 = 关系分析；上下游服务与环境约束 = 环境分析；接口变更的 blast radius = 牵连面分析。微服务拆分之所以难，因为它是纯粹的边界界定问题——拆错边的代价是分布式单体：耦合还在，通信成本却已付出。

## 触发场景速查表

| 场景 | 判据/动作 | 架构工程同构 |
|---|---|---|
| 重型任务分解 | 先划子系统边界与接口（命名/schema/API 定死写入子卡 body），再 parents 依赖 | 契约优先设计（contract-first）；边界没划不动手 |
| 结构性变更（编制/名册/技能库/SOUL 契约） | 走 `structure-evolution-rollback.md` 五步闭环：信用分配→牵连面清单→快照→三验→commit/rollback | schema migration 纪律；运行时适配≠持久演化 |
| 跨域牵连评估 | 改 A 前机械列出受牵连面（能力图/依赖链/派单名册三面核对），禁顺手重构 | 依赖图分析：改接口前 grep 全部调用方，不凭记忆列举 |
| 事故影响面（blast radius） | 从故障点沿 task_links 依赖链递归列下游受害者；下游只重放不重诊 | 舱壁隔离（bulkhead）；根因修复 vs 症状重放分离 |
| 新 agent 入编 | 四维能力圈（toolset/skill 白名单/clearance/SOUL 纪律）编制时定死 | 最小权限原则（least privilege）；不靠事后行为约束 |
| 层次化设计 | 架构→模块→单元逐层定义，约束自上而下传导、接口自下而上兑现 | 自顶向下分解 + 依赖倒置：上层定接口，下层兑现 |
| 环境交互分析 | 系统与环境的边界即反馈变量的采集面 | 防腐层（ACL）：外部依赖在边界处适配；密级沿使用链传播（S2 同源） |

## 使用规则

1. 分解/结构性变更落稿前过一遍上表相关行，finding 写进任务卡或设计文档「系统自检」段。
2. 牵连面清单必须机械可查（grep/sqlite/capability-graph 工具），不凭记忆列举——记忆列举=0 信息量自检。
3. 与信息问衔接：边界划完后，反馈变量从边界上的接口取（先划界，再定测什么）。

## 不可迁移边界

不建第二套本体——对象名词（是什么）归 `_shared/02-org-orchestration/ontology.md`，本透镜只管分析方法（怎么划界、怎么列牵连面）；不引入社会学宏大叙事套用；不引入新数学工具。

## 证据状态

Wired（2026-09-08 用户裁决提前固化，v1.1 融合表达重写）。Exercised 判据：orchestrator 系统问实判 ≥3 次且留有可 grep 记录（任务卡/设计文档）；达标前引用本 skill 结论须注明「待实判验证」。
