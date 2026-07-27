---
name: kanban-worktree-workspace
title: Kanban Worktree Workspace Strategy
description: >-
  Configure kanban board rules to default all tasks to git worktree workspaces
  for persistence and parallel execution. Covers the global_kanban_rules.md
  update pattern, orchestrator_rules.md sync, main repo initialization, and
  the worktree lifecycle (auto-branch creation, worker git commit discipline,
  branch-based recovery after workspace cleanup).
triggers:
  - "kanban workspace worktree"
  - "worktree default workspace"
  - "kanban持久化"
  - "并行workspace"
  - "workspace_kind worktree"
---

# Kanban Worktree Workspace Strategy

## When to Use

- You want all kanban tasks to use git worktree workspaces by default (not
  scratch or dir) for persistence and parallel execution
- You need to initialize a main git repo as the worktree base
- You're updating global_kanban_rules.md or orchestrator_rules.md to change
  the default workspace_kind

## Overview

By default, Hermes kanban tasks use `workspace_kind="scratch"` (disposable
temp directories). This means task outputs are lost after the workspace is
cleaned. Switching the default to `workspace_kind="worktree"` gives each
task its own git branch — outputs are persisted as git commits, multiple
tasks run in parallel without file conflicts, and the work can be reviewed
or merged after completion.

## Prerequisites

### 1. Initialize the Main Git Repo

The worktree base must be a git repository. Initialize it before changing
the default workspace_kind:

```bash
cd ~/hermes-docker-sandbox/workspace
git init
git add -A
git commit -m "init: base repo for kanban worktree workspaces"
# Add .gitignore to exclude build artifacts
cat > .gitignore << 'EOF'
*.pyc
__pycache__/
.DS_Store
nohup.out
*.log
.venv/
EOF
git add .gitignore && git commit -m "chore: add .gitignore"
```

The main repo path (`~/hermes-docker-sandbox/workspace/`) is referenced in
`global_kanban_rules.md` and `orchestrator_rules.md` as the worktree base.

### 2. Understand Hermes Worktree Mechanics

When `workspace_kind="worktree"` is set on a kanban task:
- The dispatcher creates `.worktrees/<task-id>/` under the main repo
- A branch `wt/<task-id>` (or `<project-slug>/<task-id>` with project) is
  created and checked out in the worktree
- The worker's `$HERMES_KANBAN_WORKSPACE` points to this directory
- The worker operates in a full git working copy on its own branch

## Files to Update (3 files)

### File 1: `~/.hermes/global_kanban_rules.md`

This is the shared rules file loaded by all agents. Change the default
`workspace_kind` from `"dir"` to `"worktree"`:

Key changes:
- Default value: `workspace_kind="worktree"` (was `"dir"`)
- `workspace_path` no longer needed for worktree mode (system auto-creates
  `.worktrees/<task-id>` under the main repo)
- `workspace_kind="dir"` becomes a special-case option for non-Git tasks
- Add a "Worktree Working Mechanism" section explaining persistence +
  parallel execution benefits
- Bump rule version (e.g. v1.1 → v2.0)

### File 2: `~/.hermes/profiles/orchestrator/orchestrator_rules.md`

The orchestrator's rules file mirrors the global rules. Update §3.5
"workspace 类型设置" with the same changes:

- Default: `workspace_kind="worktree"`
- Add §3.5.3 "Worktree 持久化与并行执行" explaining:
  - Persistence: git commits on independent branches survive workspace cleanup
  - Parallel: multiple tasks on separate branches, no file conflicts
- Update ALL code examples: `workspace_kind="dir"` → `workspace_kind="worktree"`
- Update version annotation at the bottom

### File 3: `~/.hermes/profiles/orchestrator/email_kanban_rules.md`

If email routing creates kanban tasks, update its code examples too:
- `workspace_kind="dir"` → `workspace_kind="worktree"` in all examples

## Example Rule Text for global_kanban_rules.md

```markdown
## workspace_kind 强制规则

所有 kanban 任务创建时，必须显式设置 workspace_kind 参数。

### ❌ 禁止项
- workspace_kind="scratch" — 不允许

### ✅ 默认值
- workspace_kind="worktree" — 默认值，Git worktree 模式，支持持久化和并行执行

### Worktree 工作机制

主仓库路径: ~/hermes-docker-sandbox/workspace/（已初始化 Git 仓库）

任务被 dispatch 时，系统自动在主仓库下创建 .worktrees/<task-id> 子目录
和对应分支。Worker 的 git 提交保留在独立分支上，workspace 清理后仍可恢复。
多个任务各自在独立分支上并行工作，互不干扰。
```

## Worker Discipline in Worktree Mode

Workers entering a worktree workspace should:
1. `cd $HERMES_KANBAN_WORKSPACE` — enter the worktree directory
2. The directory is a full git working copy on an independent branch
3. Encourage `git add` + `git commit` for intermediate outputs
4. At task completion, outputs are on the worktree branch — reviewable via
   `git log` / `git diff`
5. Merging back to main branch is by orchestrator/reviewer decision

## When to Use dir Instead

`workspace_kind="dir"` remains valid for:
- Non-Git tasks (file operations, data processing)
- Tasks needing a fixed shared path
- Temporary file operations that don't need version control

## Interaction with Docker Terminal Backend

When `terminal.backend: docker` is enabled (privacy hardening), worktree
workspaces work seamlessly — the Docker container mounts the entire
`~/hermes-docker-sandbox/workspace/` directory, which includes `.worktrees/`.
Workers operate inside the container on their worktree branch without
any special configuration.

The Docker volume mount in config.yaml:
```yaml
terminal:
  docker:
    volumes:
      - ~/hermes-docker-sandbox/workspace:/opt/workspace
```

This mounts the git main repo AND all worktrees. Workers `cd` into their
`$HERMES_KANBAN_WORKSPACE` (which resolves to a `.worktrees/<task-id>/` path)
and operate normally inside the container.

## Related Skills

- **privacy-hardening** — Docker terminal backend setup, config-level isolation
- **kanban-orchestrator** — decomposition playbook and anti-temptation rules
- **kanban-worker** — worker lifecycle and workspace handling
- **hermes-profile-config** — managing shared rules via environment_hint
