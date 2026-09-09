---
# ==================== 模板元数据 ====================
template_id: TPL-KNOWLEDGE-V1
template_type: knowledge          # knowledge / decision / finding / report / artifact
template_status: OFFICIAL
template_updated: 2026-08-25
template_owner: orchestrator
template_source: workspace/research/taobao-rd-harness/analysis-report.md
---

# Knowledge 文档模板（main / applications / personal 通用）

> 用途：任何进入 `knowledge/main/`、`knowledge/applications/`、`knowledge/personal/` 的 .md 文档必须套本模板。
> 强约束：YAML Front Matter 字段缺失 = 文档禁止入库（owner review 时直接退回）。

---

## YAML Front Matter 字段说明

### 必填字段（缺一不可入库）

| 字段 | 类型 | 说明 | 示例 |
|---|---|---|---|
| `id` | string | 知识唯一编号，格式：`KB-<LAYER>-<DOMAIN>-<SEQ>` | `KB-APPLICATION-HACK-AUDITOR-001` |
| `type` | enum | `knowledge-base` / `knowledge-candidate` / `application` / `decision` / `finding` / `report` / `artifact` | `application` |
| `domain` | string | 业务域 | `hack` / `[已移除]` / `[已移除]` / `hermes-cluster` |
| `status` | enum | `DRAFT` / `CANDIDATE` / `OFFICIAL` / `DEPRECATED` | `OFFICIAL` |
| `sourceType` | enum | `official`（团队共识）/ `ai-assisted`（AI 提取后人工确认）/ `personal`（个人经验） | `ai-assisted` |
| `owner` | string | 负责人（profile 名 或 人名） | `hack-auditor` |
| `version` | int | 版本号（从 1 开始） | `1` |
| `updatedAt` | date | 最后更新日期（YYYY-MM-DD） | `2026-08-25` |
| `confidence` | enum | `high` / `medium` / `low`（AI 引用时应优先 high） | `high` |
| `stability` | enum | `stable`（长期不变）/ `evolving`（业务演进）/ `volatile`（快变） | `stable` |
| `evidence` | list | 至少 1 条证据（code / doc / human） | `[{doc: ..., human: ...}]` |

### 选填字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `tags` | list[string] | 标签列表，供搜索 |
| `anchors` | list[string] | 锚点列表（`CATEGORY:NAME` 格式），供 ROUTING.md 关联 |
| `supersedes` | string | 取代的旧 KB id |
| `deprecatedAt` | date | 废弃日期（status=DEPRECATED 时必填）|
| `deprecatedReason` | string | 废弃原因（status=DEPRECATED 时必填）|

---

## 正文模板

```markdown
# <知识标题>

> 来源：<文章/调研/事故/会议>
> 适用场景：<AI 在什么场景下应该读这份知识>
> 关键入口：<具体 skill / 文件路径>
> 关联知识：<锚点列表>

## AI 使用摘要

- **适用场景**：<什么情况下读这份知识>
- **关键入口**：<关键 skill / 命令 / 文件>
- **关键规则**：<最重要的 3-5 条规则>
- **使用前必须核对**：<哪些事必须回到代码/当前状态确认>

## <主题一>

<内容 + 表格 + 列表>

## <主题二>

<内容 + 表格 + 列表>

## 证据来源

| 类型 | 来源 | 说明 |
|---|---|---|
| code | <路径> | <代码核对说明> |
| doc | <文档> | <文档来源说明> |
| human | <确认人+时间> | <人工确认说明> |

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | YYYY-MM-DD | 初版 | <owner> |
```

---

## 写入前自检清单

- [ ] YAML Front Matter 11 个必填字段全有
- [ ] `id` 全局唯一（不与已有 KB 冲突）
- [ ] `status` 流转合法（DRAFT → CANDIDATE → OFFICIAL → DEPRECATED）
- [ ] `evidence` ≥1 条且至少 1 条可定位（code/doc/human）
- [ ] 正文 ≥3 段，每段有具体内容（非空壳）
- [ ] `tags` + `anchors` 至少各 1 条（除非确无可分类）
- [ ] 如 status=DEPRECATED：含 `deprecatedAt` + `deprecatedReason`

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版（强约束模板）| orchestrator |