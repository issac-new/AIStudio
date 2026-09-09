---
name: rd-decompose
description: 需求拆解——生成 by 应用的 requirement 作为开发产物
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [rd, decompose, orchestrator, kanban]
    related_skills: [rd-work, rd-analyze, verify-requirement]
---

# /rd:decompose — 需求拆解

> **对应文章命令**：`/rd:decompose`（需求拆解，生成 by 应用的 requirement 做为开发产物）
> **触发**：analyze 完成后，需要拆到具体应用/profile 时
> **作用**：把跨应用需求拆成每个应用自己的 requirement.md

---

## 一、触发场景

- analyze 完成，产出应用级需求摘要
- 需求涉及 ≥2 个应用/profile
- 需要并行开发或跨 board 协同

---

## 二、工作流

### 2.1 拆解步骤

1. **确认应用边界**：每个应用负责什么，不负责什么
2. **生成应用级 requirement**：每个应用一份独立的 requirement.md
3. **建立依赖关系**：哪些应用需要先完成（parents=[...]）
4. **创建 kanban 子任务**：每个应用一个子任务

### 2.2 输出

每个应用生成 `requirement.md`：

```markdown
# requirement — <应用名>

## 目标
<本应用在本需求中的目标>

## 非目标
<本应用不涉及的场景>

## 影响
- 接口：<列表>
- 消息：<列表>
- 状态：<列表>
- 字段：<列表>

## 知识入口
- `applications/<app>.md`
- `skills/<相关 skill>`

## 代码入口
- <具体路径/模块/函数>

## 验收标准
- [ ] <可机械验证的标准 1>
- [ ] <可机械验证的标准 2>

## 依赖
- 前置任务：<task_id>
- 阻塞项：<如有>
```

---

## 三、验证清单

- [ ] 每个应用有独立的 requirement.md
- [ ] 每个 requirement 含目标/非目标/影响/入口/验收标准
- [ ] 依赖关系已用 parents=[...] 表达
- [ ] 已创建对应 kanban 子任务

---

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |