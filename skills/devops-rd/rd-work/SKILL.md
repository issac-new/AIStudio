---
name: rd-work
description: RD 路由命令——根据输入自动引导下一步（clarify/analyze/decompose/apply）
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [rd, routing, orchestrator, workflow]
    related_skills: [verify-prd, verify-requirement, rd-clarify, rd-analyze, rd-decompose]
---

# /rd:work — RD 路由命令

> **对应文章命令**：`/rd:work`（通用路由命令，其他命令作为原子能力）
> **触发**：orchestrator 接到任何 RD 类任务输入时
> **作用**：根据输入和当前上下文，自动推断当前意图，给出下一步引导

---

## 一、触发场景

orchestrator 收到以下输入时，跑 `/rd:work`：
- 新需求 / PRD / Bug / 变更
- 已有 requirement 需要继续
- 不确定当前处于哪个阶段

**原则**：用户只需要输入 `/rd:work`，由本 skill 决定下一步。

---

## 二、工作流

### 2.1 状态判定

```
输入 → 检查 rd/requirements/{id}/ 或 kanban 任务状态
  ├─ 无 requirement → 新建 → verify-prd
  ├─ 有 requirement 但未 clarify → rd-clarify
  ├─ 已 clarify 但未 analyze → rd-analyze
  ├─ 已 analyze 但未 decompose → rd-decompose
  ├─ 已 decompose 但未 apply → 路由到对应 profile 的 rd-apply
  ├─ 已 apply 但未 validate → rd-validate
  └─ 已 validate → code-review → release-plan
```

### 2.2 输出

```markdown
# /rd:work 路由报告 — <任务标题>

## 当前状态
- 阶段：<verify-prd / clarify / analyze / decompose / apply / validate / review / release>
- 已有产物：<列出已有文件>
- 缺失产物：<列出缺失文件>

## 建议下一步
- 命令：`/rd:<next-step>`
- 理由：<为什么是这个阶段>
- 预计耗时：<X 分钟>

## 阻塞项（如有）
- <阻塞项 + 原因>
```

---

## 三、验证清单

- [ ] 已检查当前任务状态（kanban / rd/requirements/）
- [ ] 已给出明确的下一步命令
- [ ] 已列出已有/缺失产物
- [ ] 如有阻塞项，已列出原因

---

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |