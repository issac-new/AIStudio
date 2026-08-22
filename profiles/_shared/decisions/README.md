# Architecture Decision Records（架构决策记录）

> 灵感来源：deepseek-ai/deepseek-harness `.agents/notes/` 制度 + 经典 ADR（Architecture Decision Record）实践。
> 适用范围：Hermes 集群的重大架构决策（共享规则变更、ontology 修订、新增治理层、跨 board 策略调整等）。
> 目标：为每个不可逆的架构选择留下 rationale 审计追踪，新 worker 可理解决策背景。

## 为什么需要 ADR

Hermes 的 session_search 能追溯对话，hindsight 能语义检索记忆，但两者都是**对话粒度**的。当一个新 worker 问"为什么 loop-engineering-gates 要分三层？"或"为什么 markings 用合取 AND？"，对话搜索的结果是一堆讨论碎片，而非结构化的决策记录。

ADR 补充了这个缺口：每个重大决策有独立的 dated 文件，包含 Context / Decision / Consequences 三段式。

## ADR 文件格式

文件命名：`~/.hermes/profiles/_shared/decisions/YYYY-MM-DD-<kebab-title>.md`

```markdown
# ADR: <决策标题>

**日期**: YYYY-MM-DD
**状态**: proposed | accepted | superseded | deprecated
**决策者**: <profile 名 / 用户>
**影响范围**: <哪些 profile/board/skill>

## Context（背景）

为什么要做这个决策？遇到了什么问题？有哪些约束？

## Decision（决策）

具体做了什么决定？选择了什么方案？

## Alternatives Considered（备选方案）

考虑过但没选的方案，以及没选的原因。

## Consequences（后果）

这个决策带来的正面和负面影响。后续需要注意什么。

## Related（关联）

- 关联的文件路径
- 关联的 session ID
- 关联的看板 task ID（内部参考）
```

## 何时写 ADR

| 场景 | 写 ADR？ | 理由 |
|------|---------|------|
| 新增 `_shared/` 规则文件 | ✅ 是 | 全集群生效，不可逆 |
| ontology 对象/属性修订 | ✅ 是 | 影响所有 metadata 契约 |
| 新增治理层（如七层管线） | ✅ 是 | 架构级变更 |
| markings 传播规则调整 | ✅ 是 | 权限决策不可逆 |
| 跨 board 路由策略变更 | ✅ 是 | 影响任务分配 |
| 单个 skill 创建/修改 | ❌ 否 | skill 自身有 frontmatter 追踪 |
| 单个 SOUL.md 增量编辑 | ❌ 否 | git diff 可追溯 |
| workspace 内文件操作 | ❌ 否 | 天然可弃 |
| kanban 任务执行 | ❌ 否 | kanban DB 自带审计 |

## ADR vs kanban_complete metadata

| 维度 | ADR | kanban metadata |
|------|-----|-----------------|
| 粒度 | 架构决策 | 任务执行结果 |
| 受众 | 未来 worker | 当前 orchestrator |
| 生命周期 | 永久（superseded 也不删） | 任务完成即冻结 |
| 内容 | Context/Decision/Consequences | changed_files/tests_run/findings |

## 目录结构

```
~/.hermes/profiles/_shared/decisions/
  README.md                                    ← 本文件
  2026-08-13-deepseek-harness-fusion.md        ← 首份 ADR
  ...
```

## 维护规则

1. **ADR 不可删除** — 被 supersede 的 ADR 标记状态为 `superseded`，保留历史
2. **引用闭环** — ADR 引用的文件变更时，在 ADR 底部追加 update note
3. **定期审计** — 配合 harness-entropy-management，每季度检查 ADR 是否仍 current
