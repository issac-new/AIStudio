---
name: worktree-lifecycle-hygiene
description: "Use when git worktree add times out or worktrees pile up."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [git, worktree, kanban-workspace, hygiene]
    related_skills: [kanban-crash-recovery, orchestrator-worker-failure-triage, kanban-workspace-durability]
---

# Worktree Lifecycle Hygiene（worktree 生命周期卫生）

> 症状：kanban 卡 spawn 失败 `git worktree add ... timed out after 60 seconds`，或 `git worktree list` 显示 40+ 条目。
> 根因：done 卡的 worktree 从不回收，主仓 worktree 表膨胀后 `worktree add` 初始化超时；新卡重派还会撞上 locked "initializing" 僵尸 worktree。

## 症状处置（先通再治）

1. `git worktree list` 找目标卡的 worktree；若标 `locked`（reason: initializing）→ `git worktree unlock <path>` → `git worktree remove --force <path>` → `git worktree prune`。
2. 卡会因 workspace 失败 spawn_failed/crashed——修完环境后 kanban_comment 注入恢复包（根因已修勿重复排查 + 写入目标是 ~/.hermes 绝对路径与 worktree 无关 + 纪律重申），等 dispatcher 重派。

## 周期性对账清理（一次脚本化流程）

对每个 worktree 对账三元组，再分流：

```bash
tid=<task-id>; wt=.worktrees/$tid
dirty=$(git -C $wt status --short | wc -l)
unmerged=$(git -C $wt log --oneline main..HEAD | wc -l)
status=$(sqlite3 "file:$HOME/.hermes/kanban/boards/<board>/kanban.db?immutable=1" \
  "SELECT status FROM tasks WHERE id='$tid'")
```

| 三元组读数 | 处置 |
|---|---|
| done/archived + dirty=0 + unmerged=0 | 直接回收：`git worktree remove --force` + `git branch -D wt/<tid>` |
| done + unmerged>0 | **先合并**（`git merge <tip>`）或审内容后转 `archive/<tid>-<desc>` 分支，再回收 worktree |
| NO-CARD（卡已归档不可查）+ dirty 仅有临时脚本/生成物 | 内容打包进 `archive/<tid>-*` 分支后回收 |
| dirty 有未审视产物 | 单独列出待裁决，勿批量删 |
| remediation/ 等特殊前缀目录 | 同法对账；merged_into_main 用 `git branch --contains <tip> | grep main` 判 |

批量回收后 `git worktree prune`，`git worktree list | wc -l` 出终态数。

## Pitfalls

- **半成品 checkout 里禁用裸 `git add`**：worktree add 超时被打断后，目录可能留下「index 引用 2100+ 文件但盘上只 checkout 了部分」的半成品状态（status 显示大量未暂存 ` D` 删除）。此时任何裸 `git add` 都会触发全索引刷新，把全部缺失文件登记为 staged 删除——一次 commit 就能制造百万行假删除。只提交自己的文件用底层管道命令：`git update-index --add --cacheinfo 100644,$(git hash-object <file>),<path>`（不刷新其他条目），并在 commit 前用 `git diff --cached --numstat` 门禁校验（staged 文件数正确且删除列全为 0；注意用 `awk '$2 != 0'` 判删除列，`grep -cv '^4\t0'` 这类字面模式会误报）。万一已提交假删除：`git reset --soft HEAD~1` + `git reset -q`（mixed 清 index，缺失文件回到未暂存 ` D` 原状）+ update-index 重来；soft/mixed reset 不触碰工作区文件，历史遗留的 ` D` 原样保留。
- **merge 撞 .gitignore 冲突**：worktree 分支常带自己的 .gitignore 增补——冲突行双方都合理就都保留（union 语义），不要丢任一侧。
- **locked "initializing" 是超时残留**：正常锁有任务理由，这个锁是 worktree add 被杀时留下的；unlock+remove-force 是唯一出路，勿绕过。
- **分支名≠目录名**：remediation/ 下的 worktree 目录名是功能名（F-2-xxx）而分支名是 wt/<task-id>——对账脚本要按 worktree list 实际路径遍历，不能拼目录名。
- **回归预防**：定期（如每月）跑一次对账，或推动 done 卡自动 prune——等 spawn 超时再清说明已影响派工。