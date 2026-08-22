# Kanban 进阶（Kanban Advanced — 共享参考）

> kanban_create 的进阶用法：派生子任务、表达依赖、绑定 worker profile

## 派生子任务模板

```python
# 在你自己的 run 里派生子任务（而不是用 delegate_task 拼盘）
kanban_create(
    title="<子任务标题>",
    assignee="<目标 worker profile>",   # 必须是真实存在的 profile
    body="<完整 spec，含验收标准>",
    parents=["<本任务id>"],            # 表达依赖：本任务 done 才能 ready
    workspace_kind="worktree",         # 必填，禁止 scratch
    workspace_path="~/.worktrees/<task-id>（相对 default_workdir，勿写绝对路径）",
)
```

## 关键约束

### assignee 必须真实存在

`hermes profile list` 先确认 profile 名。**未知 assignee 的任务被 dispatcher 静默丢弃**（永远停在 ready）。

### 依赖用 parents 表达，不用 prose

```python
# ❌ 错：在 body 写"等待任务 Y 完成"
body="等待任务 Y 完成后再开始"

# ✅ 对：用 parents
parents=["<任务Y id>"]  # 子任务自动等 Y done 后变 ready
```

### workspace_kind 禁止 scratch

- `worktree`：默认值，git worktree 模式，产物持久化
- `dir`：非代码任务目录模式（教学方案、调研报告）
- ❌ `scratch`：禁用，产物自动删除 = 任务未完成

## 跨 board 路由校验

跨 board 路由时（如 `kanban_create(board="hack", ...)`），必须校验目标 assignee
的 clearances 是否满足 parent tasks 继承的 markings（合取 AND）。不满足 →
`kanban_block(kind="capability", reason="marking clearance 不足: 需 <marking>")`。

详见 `~/.hermes/profiles/_shared/marking-rules.md`。

## SOUL 内单行引用

```
Kanban 进阶（详见 _shared/kanban-advanced.md）：assignee 必须真实存在 + parents 表达依赖 + workspace_kind 禁 scratch。
```