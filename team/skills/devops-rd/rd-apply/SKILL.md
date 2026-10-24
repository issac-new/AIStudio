---
name: rd-apply
description: 按 requirement 实现代码——编码执行
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [rd, apply, coding, implementation]
    related_skills: [verify-requirement, code-review, rd-validate]
---

# /rd:apply — 按 requirement 实现代码

> **对应文章命令**：`/rd:apply`（使用 requirement 进行代码实现）
> **触发**：verify-requirement 通过，开始编码时
> **作用**：按 requirement 契约一项项推进实现

---

## 一、触发场景

- verify-requirement 全部通过
- requirement.md 已明确目标/非目标/影响/入口/验收标准
- 无 blocked 项

---

## 二、工作流

### 2.1 实现步骤

1. **读取 requirement**：确认目标和验收标准
2. **按项推进**：做完一项勾掉一项
3. **遇到问题标 blocked**：做不下去就标 blocked，不硬撑
4. **需求变化更新 requirement**：不偏离契约

### 2.2 编码纪律

- 先读知识库相关入口（`applications/<app>.md`）
- 先读代码入口，再动手
- 严格按 requirement 实现，不擅自扩展
- 每完成一项，标记 done

### 2.3 输出

编码完成后，跑 `code-review` skill 检查 Diamond 6 门。

---

## 三、验证清单

- [ ] 已读取 requirement.md
- [ ] 已读取相关 KB 入口
- [ ] 已读取代码入口
- [ ] 每个验收项有对应实现
- [ ] 无 blocked 项未标注
- [ ] 编码完成后已跑 code-review

---

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |