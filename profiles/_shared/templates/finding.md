---
template_id: TPL-FINDING-V1
template_type: finding
template_status: OFFICIAL
template_updated: 2026-08-25
template_owner: orchestrator
template_source: ontology.md §1.4 Finding 对象模型 + output-contract.md §2 Findings 段
---

# Finding（调研/事故发现）文档模板

> 用途：任何"调研/事故/审计/复盘"发现的强约束模板。Kanban `kanban_complete` 的 `findings` 字段可独立展开为完整 Finding 文档。
> 强约束：缺 Source / Severity / Description 三段 = Finding 禁止入库。

---

## YAML Front Matter

| 字段 | 类型 | 说明 |
|---|---|---|
| `finding_id` | string | 唯一编号：`F-<DOMAIN>-<YYYY-MM-DD>-<SEQ>` |
| `category` | enum | `bug` / `insight` / `risk` / `opportunity` / `anti-pattern` |
| `severity` | enum | `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `INFO` |
| `confidence` | enum | `high` / `medium` / `low` |
| `source` | string | 产出源（kanban task id / session id / 调研报告 URL） |
| `discovered_by` | string | 发现者 profile 名 |
| `discovered_at` | date | 发现日期 |
| `affected_components` | list[string] | 受影响的组件（profile / skill / file） |

---

## 正文模板

```markdown
# Finding: <一句话描述>

> **类别**：<category>
> **严重程度**：<severity>
> **置信度**：<confidence>
> **发现时间**：<date>

## 现象（What）

<具体看到了什么，包括可观察的证据>

## 影响（Impact）

<这个 finding 影响什么范围 / 造成什么后果>

## 根因（Root Cause，optional）

<为什么会出现，按 5-why 或 费曼式解剖>

## 修复建议（Recommended Fix）

<具体的修复动作，包括优先级 + 风险评估>

## 验证方式（How to Verify）

<如何确认这个 finding 已被修复>

## 证据

| 类型 | 来源 | 说明 |
|---|---|---|
| <code / log / test / doc / human> | <路径或引用> | <具体证据描述> |

## 关联

- 关联 finding: <finding_id>
- 关联 task: <kanban task id>
- 关联 skill / profile: <路径>
```

---

## severity 严重程度判定标准

| severity | 含义 | 处置时限 |
|---|---|---|
| CRITICAL | 生产事故 / 数据丢失 / 安全漏洞 | 立即修复 |
| HIGH | 重大功能缺陷 / 影响跨 board 协作 | 24h 内 |
| MEDIUM | 一般缺陷 / 流程问题 | 1 周内 |
| LOW | 改进建议 / 文档问题 | 1 季度内 |
| INFO | 信息性发现 / 无需立即处置 | 仅记录 |

## 写入前自检清单

- [ ] YAML Front Matter 8 个字段全有
- [ ] 现象段有具体证据（数据 / 日志 / 测试结果）
- [ ] 影响段有范围估计（profile / file / 任务数）
- [ ] 修复建议有具体动作（非"需要改进"模糊说法）
- [ ] 验证方式可执行（非"看看是否好了"）

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |