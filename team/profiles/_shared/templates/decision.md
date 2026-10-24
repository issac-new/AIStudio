---
template_id: TPL-DECISION-V1
template_type: decision
template_status: OFFICIAL
template_updated: 2026-08-25
template_owner: orchestrator
template_source: deepseek-harness .agents/notes/ 制度 + Hermes 经典 ADR 实践
---

# Decision（ADR）文档模板

> 用途：架构决策记录（ADR）的强约束模板。任何进入 `_shared/knowledge/candidate/` 且 `type=decision` 的文档必须套本模板。
> 强约束：缺 Context/Decision/Consequences 三段 = 文档禁止入库。

---

## YAML Front Matter（参照 knowledge.md 的 11 个必填字段）

新增字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `decision_status` | enum | `proposed` / `accepted` / `superseded` / `deprecated`（与原 ADR 字段一致）|
| `affected_profiles` | list[string] | 受影响的 profile 列表 |
| `affected_boards` | list[string] | 受影响的 board 列表 |
| `superseded_by` | string | 取代本决策的新 decision id |

---

## 正文模板

```markdown
# ADR: <决策标题>

> **决策者**：<profile 名 或 人名>
> **影响范围**：<哪些 profile/board/skill>

## Context（背景）

为什么要做这个决策？遇到了什么问题？有哪些约束？

## Decision（决策）

具体做了什么决定？选择了什么方案？

## Alternatives Considered（备选方案）

考虑过但没选的方案，以及没选的原因。

### 方案 A: <名称>（rejected/accepted）

- **理由**：<为什么不选 / 为什么选>

### 方案 B: <名称>（rejected/accepted）

- **理由**：同上

## Consequences（后果）

### 正面

1. <收益 1>
2. <收益 2>

### 负面 / 风险

1. <风险 1 + 缓解措施>
2. <风险 2 + 缓解措施>

### 后续行动

- <行动 1>
- <行动 2>

## Correction Update（复盘修正，<日期>，可选）

如果决策后做了修正，必须如实记录。

### 源码验证结论

| 声明 | 源码验证 | 结果 |
|---|---|---|
| <断言> | <验证证据> | ✅/❌ |

## Related（关联）

- 调研 session: <session id>
- 源码: <URL>
- 论文: <URL>
- 关联文件:
  - <路径 1>
  - <路径 2>

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | YYYY-MM-DD | 初版 | <owner> |
```

---

## 写入前自检清单

- [ ] YAML Front Matter 11 个必填字段 + 4 个 decision 字段全有
- [ ] Context 段有具体问题/约束（非空泛"需要改进"）
- [ ] Decision 段有明确动作/选择（非模糊"考虑"）
- [ ] Alternatives ≥ 1 个（含被拒绝方案 + 拒绝理由）
- [ ] Consequences 同时含正面 + 负面
- [ ] Related 段含至少 1 个可追溯锚点（路径/URL/session ID）

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |