---
name: delegation-brief-format
description: "委派任务书格式规范：kanban_create body 模板（任务ID/验收标准/必读context清单/WHAT-not-HOW/交付格式）。用于 orchestrator 分解任务与 worker 派生子任务。"
version: 1.1.0
metadata:
  hermes:
    tags: [devops, delegation, kanban, brief-format, maestro-fusion]
    related_skills: [kanban-orchestrator, scale-adaptive-routing, mission-coordination]
---

# Delegation Brief Format（委派任务书格式规范）

> 来源：shariqriazz/maestro `Maestro-mode.md §3` 委托消息结构规范 + 显式最小上下文注入纪律，适配 Hermes kanban_create。
> 增补（2026-08-16）：LongHorizon-Harness 任务契约 12 项精简版嵌入（详见 `~/.hermes/profiles/_shared/task-contract-guard.md`），`## 任务` 段从"一句话目标"升级为结构化契约。
> 定位：**执行前防线**——保证下游 worker 拿到自包含、可验收、不越界的任务卡。
> 版本：1.1.0

## 触发条件 / When to Use

- orchestrator `kanban_create` 分解重型任务时
- 任何 worker `kanban_create` 派生子任务时
- 任务卡 body 被 reviewer 打回"信息不全"时对照检查

## 核心内容

### 1. 任务卡 body 七要素模板

```markdown
## 任务
<一句话目标 + 可度量验收标准>

## 必读 context（开工前按序读完，未读不开工）
1. <绝对路径或 kanban task id> — <读它的目的>
2. <上游 handoff / 文件 / 文档> — <精确到段落或行号区间，若适用>

## 依赖
- parents: [task-id 列表]
- 前置条件: <什么必须为真才能开工>

## 约束与非功能需求
- <范围边界：只改什么、不改什么>
- <安全/隐私/性能约束>

## 交付格式
- 产出物：<文件绝对路径 / kanban metadata 字段>
- handoff：kanban_comment 四段（变更/验证/实现方式/决策）

## WHAT-not-HOW
- 本卡定义 WHAT 与验收；HOW（技术选型/实现路径）由 assignee 决定
- 例外：<上游已锁定的技术决策，若有>
```

### 2. 任务契约段（LongHorizon-Harness 12 项精简版）

重型任务（研究/编码/部署/跨卡依赖）的 `## 任务` 段必须包含以下 6 项核心契约（完整 12 项见 `task-contract-guard.md` 第一节）：

```markdown
## 任务契约（防偷换目标）
- 目标解释：精确对象/文件名/路径/格式/交付形态（保留原题全部限制词）
- 最终成功状态：完成落在的真实载体（文件/数据库/服务状态/导出产物），非自然语言声明
- 验收约束：逐条 [原题依据 | 必须条件 | 验证方式]；计划或替代目标不算
- 状态产生流程：允许的真实操作路径（官方API/正常编辑），禁止伪造完成标记
- 权威输入：关键输入来源清单；缺失→blocker，禁止发明相似输入
- 不可接受捷径：明令禁止路径（如：直接patch状态/手写完成文件/绕过应用流程）
```

**限制词入约束**：原题的"不要改变/保持不变/只使用/同一目录/精确文件名/不要多做"必须进入验收约束；放宽只放宽实际修饰部分。

**第一轮纪律**：契约初版的环境事实（文件存在性/服务状态）标"待验证"，审计确认后才可写"已验证"。

### 3. 必读 context 清单纪律（maestro 核心创新）

- **强制语**："未读不开工"——worker 的 kanban_show 后第一步是按清单 read_file
- **显式最小注入**：列举必读文件，而不是让 worker 自由漫游整个仓库
- **精确到行**：对长文档标注行号区间（如 `SKILL.md:87-99`）
- 与 BMAD M2 "Extract-don't-ingest" 联动：上游已提取 digest 的，清单指向 digest 而非原文

### 4. WHAT-not-HOW 原则

- orchestrator/父任务**只定义验收标准和约束**，不规定实现路径
- 技术决策权留给 assignee（除非是上游架构师已锁定的契约）
- 例外条款必须显式写出（"使用 pytest 不用 unittest"这类已锁定决策）

### 5. 协调者禁做技术决策（maestro 治理规则）

orchestrator **禁止**在任务卡中擅自指定：
- 技术栈选型（语言/框架/库版本）
- 架构模式（除非引用上游架构师产物）
- 数据库 schema 决策

涉及技术决策的任务卡必须 `parents=[架构师/需求分析师任务]`，由专家产出决策后再路由到执行 worker。
对应 maestro："YOU MUST NEVER make assumptions about or decide the technology stack"。

## 与其他 skill 的联动

- `scale-adaptive-routing`：路由门判定任务规模后，用本模板写 body
- `mission-coordination`：多 worker 编组时每个子卡都用本模板
- `requirement-analysis`：需求分析师的产出物是本模板"必读 context"的首要来源

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_create(body=...)` | 按七要素模板写 |
| `kanban_create(parents=[...])` | 技术决策类任务必须 parents 到专家卡 |
| `kanban_block(kind="needs_input")` | worker 发现 body 缺要素时的标准出口 |
| `kanban_comment` | 父任务记录拆分理由 + deferred-work |
