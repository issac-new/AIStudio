---
template_id: TPL-ARTIFACT-V1
template_type: artifact
template_status: OFFICIAL
template_updated: 2026-08-25
template_owner: orchestrator
template_source: ontology.md §1.2 Artifact 对象模型
---

# Artifact（产出物）记录模板

> 用途：任何"代码 / 报告 / 配置 / 数据 / 脚本 / 二进制 / 图表"产出物的元数据模板。
> 强约束：Artifact 跨 board 引用时必带完整 front matter，否则 marking 校验失败。

---

## YAML Front Matter

| 字段 | 类型 | 说明 |
|---|---|---|
| `artifact_id` | string | 唯一编号：`A-<DOMAIN>-<YYYY-MM-DD>-<SEQ>` |
| `artifact_type` | enum | `code` / `report` / `config` / `data` / `script` / `binary` / `diagram` |
| `path` | string | 文件绝对路径 |
| `size_bytes` | int | 文件大小（bytes） |
| `content_hash` | string | SHA256 摘要（用于跨引用去重） |
| `created_by` | string | 产出者 profile 名 |
| `created_at` | datetime | 产出时间 |
| `verified` | bool | 是否经验证（语法检查 + 实际运行） |
| `markings` | list[string] | 安全标记（TLP:GREEN / TLP:AMBER / TLP:RED / PII / EYES-ONLY 等） |
| `derived_from` | list[string] | 派生自哪些 artifact / finding |

---

## 正文模板

```markdown
# Artifact: <文件名 / 描述>

> **类型**：<artifact_type>
> **路径**：<绝对路径>
> **大小**：<X bytes>
> **SHA256**：<hash>

## 用途

<这个 artifact 解决什么问题 / 用于什么场景>

## 来源

- 产出任务: <kanban task id>
- 派生自: <artifact_id / finding_id>

## 验证状态

- [ ] 文件存在（`ls <path>` 验证）
- [ ] 语法检查通过（如适用）
- [ ] 实际执行验证（如适用）
- [ ] 无 secret 泄漏（`git diff` 检查）

## 关联

- 上游：<引用 / 派生 自>
- 下游：<被哪些任务 / skill / 报告使用>

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | YYYY-MM-DD | 初版 | <owner> |
```

---

## 与 ontology.md 的关系

本文档对应 `ontology.md §1.2 Artifact` 对象模型。Artifact 在 `kanban_complete` 的 metadata 中以 `artifacts_produced` 字段引用：

```json
{
  "metadata": {
    "artifacts_produced": [
      {
        "path": "/abs/path/to/file",
        "type": "code|report|config|data|script|binary|diagram",
        "size_bytes": 12345,
        "content_hash": "sha256:..."
      }
    ]
  }
}
```

## 写入前自检清单

- [ ] 10 个 YAML Front Matter 字段全有
- [ ] `path` 是绝对路径（不是相对路径）
- [ ] `content_hash` 是真实 SHA256（不是占位符）
- [ ] `markings` 与父 task 一致（markings 传播规则）
- [ ] `verified=True` 仅在完成验证后设置

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |