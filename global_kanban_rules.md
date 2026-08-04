# Global Kanban Rules (所有 agent 生效)

## workspace_kind 强制规则

所有 kanban 任务创建时（通过 `kanban_create()`），**必须显式设置 workspace_kind 参数**。

### ❌ 禁止项
- **`workspace_kind="scratch"`** — 不允许使用 scratch 类型（包括省略参数依赖默认值）

### ✅ 默认值
- **`workspace_kind="worktree"`** — **默认值**，Git worktree 模式，每个任务在独立分支上工作，天然支持持久化和并行执行

### Worktree 工作机制

所有 worktree 任务共享同一个 Git 仓库作为主仓库（main repo）。任务被 dispatch 时，系统自动在主仓库下创建 `.worktrees/<task-id>` 子目录和对应分支 `<project-slug>/<task-id>`（若无 project 则用 `wt/<task-id>`）。

**主仓库路径**: `~/hermes-docker-sandbox/workspace/`（已初始化 Git 仓库，含 `.gitignore`）

### 隐私保护（全局强制）

> ⚠️ 所有 agent 的文件系统访问**仅限** `~/hermes-docker-sandbox/workspace/` 及其子目录（通过 SOUL.md 隐私规则约束，详见各 profile SOUL.md「隐私保护规则」）。
> 在 Docker 可用环境中，建议设置 `terminal.backend: docker` 实现 OS 层面的终端隔离。
> 禁止读取/暴露用户个人信息、设备信息、IP/密钥信息。

### 调用示例

```python
# 默认场景 — worktree 模式（推荐，省略 workspace_kind 时即为 worktree）
kanban_create(
    title="...",
    workspace_kind="worktree",  # 显式声明（推荐）
    # workspace_path 无需指定 — 系统自动在主仓库下创建 .worktrees/<task-id>
    ...
)

# 项目关联场景 — worktree + project
kanban_create(
    title="...",
    workspace_kind="worktree",
    project="my-project",  # 分支名前缀变为 <project-slug>/<task-id>
    ...
)

# 特殊场景 — 固定目录（非 Git 任务、临时文件操作等）
kanban_create(
    title="...",
    workspace_kind="dir",
    workspace_path="~/hermes-docker-sandbox/workspace/<task-specific-subdir>",
    ...
)
```

### Worktree Worker 操作须知

Worker 进入 worktree workspace 后：
1. `cd $HERMES_KANBAN_WORKSPACE` — 进入 worktree 目录
2. 该目录已是一个完整的 Git 工作副本（独立分支 checkout）
3. **鼓励** worker 在工作过程中 `git add` + `git commit` 保存中间产出
4. 任务完成时，worker 的产出物已在 worktree 分支上，可通过 `git log` 审查
5. 如需将产出合并回主分支，由 orchestrator 或 reviewer 评估后执行 `git merge`

> 规则版本: 2.0
> 生效日期: 2026-07-24
> 变更: workspace_kind 默认值从 "dir" 改为 "worktree"，主仓库初始化于 ~/hermes-docker-sandbox/workspace/
> 适用范围: 所有 agent profile (orchestrator + swarm 9 + hack 6)
