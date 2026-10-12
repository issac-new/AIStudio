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
| dirty 数千且几乎全为 ` D`（索引有盘上无）+ 盘上文件全是未追踪 | worktree add 超时打断的半成品 checkout，非真实改动；归档未追踪文件后即可回收 |

回收前归档未追踪文件（先存档再删）：

```bash
mkdir -p <archive>/$tid
(cd $wt && git ls-files --others --exclude-standard -z | xargs -0 -I{} rsync -R -a "{}" <archive>/$tid/)
```

批量回收后 `git worktree prune`，`git worktree list | wc -l` 出终态数。

### 批量脚本三坑（2026-09 实战，36 个 worktree / 216G 回收验证）

- **锁文件在主仓不在 worktree**：locked 标记在 `<main>/.git/worktrees/<tid>/locked`，worktree 自己的 `.git` 只是一行 gitdir 指针。`grep locked $wt/.git` 永远查不到 → unlock 从未执行 → remove 全 FAIL（报 cannot remove a locked working tree）。批量脚本应无条件 `git worktree unlock "$wt" 2>/dev/null`（未锁时无害）再 remove --force。
- **zsh 不做词分割**：`for tid in $LIST`（LIST 空格分隔）在 zsh 里整串当一个词，循环静默零执行，无报错易误判成功。用 `while IFS= read -r tid; do ... done < list.txt` 或 `${=LIST}` 强制分词。
- **僵尸 worktree（.git 指针文件丢失）**：remove --force 报 `validation failed ... .git does not exist`。直接 `rm -rf <dir>` + `git worktree prune`；目录内容只是 checkout 副本，未追踪部分照常归档。

## 定性判据补充（2026-09-21 十四户清理实战）

- **半成品户机械判定**：worktree 内 `git ls-files | wc -l` = 0（索引空）+ 盘上文件数远小于主仓文件数 + `git status --porcelain` 的 D 行数≈主仓文件数 → 超时打断的 checkout 残骸，非真实改动。dirty 分解 `D`（假删除）vs other（`??` 未追踪）后再判，勿见 dirty>0 就 HOLD。
- **归档只存「HEAD 树之外」的文件**：半成品户索引为空，`git ls-files --others` 会把 checkout 副本全报成未追踪（228 个），照单全收=归档黑洞。先 `git ls-tree -r --name-only HEAD` 取树集合，只归档盘上不在树内的文件，且与主仓同名同内容（md5）的跳过。
- **任务状态双库对账**：中央根库 `~/.hermes/kanban.db` 与旧布局 `~/.hermes/kanban/boards/<slug>/kanban.db` 都要查——FPA 合流前的卡只在板库，中央库 NOT_FOUND ≠ 无卡。
- **unmerged>0 且交付物不在 main**：先 `git ls-tree <branch> -- <交付目录>` 验内容，不在 main 就 `git branch archive/<tid>-<desc> wt/<tid>` 转档保内容，再回收 worktree。已验证 15 个 security/ 交付文件经此保住。
- **清理完≠spawn 不再超时**：worktree add 耗时的另一根因是 HEAD 树体量（pack 10GiB 级时 checkout 本身>60s，与 worktree 表膨胀无关）。清理后必须实测 `time git worktree add` 对照 dispatcher 60s 超时，仍超就得治 HEAD 树（大文件出库）或调 dispatcher 超时，勿宣称清理根治。
- **HEAD 树瘦身的标准动作**（2026-09-21 实战：8.46GiB→0.72GiB，worktree add 75.4s→5.5s）：①≥100MB 清单用 `git ls-tree -r -l HEAD | awk '$4>=104857600'`；②`.gitignore`（精确路径）与 `git rm --cached` **同一 commit** 落地——auto-backup 类脚本用 `git add -A`，隔 commit 就会回吸；③盘上实体不动（下游脚本有路径引用），历史 blob 保留（可回溯）；④收尾必做 `git check-ignore -v` 逐文件验证防回吸 + 二次 worktree add 实测。

## Pitfalls

- **半成品 checkout 里禁用裸 `git add`**：worktree add 超时被打断后，目录可能留下「index 引用 2100+ 文件但盘上只 checkout 了部分」的半成品状态（status 显示大量未暂存 ` D` 删除）。此时任何裸 `git add` 都会触发全索引刷新，把全部缺失文件登记为 staged 删除——一次 commit 就能制造百万行假删除。只提交自己的文件用底层管道命令：`git update-index --add --cacheinfo 100644,$(git hash-object <file>),<path>`（不刷新其他条目），并在 commit 前用 `git diff --cached --numstat` 门禁校验（staged 文件数正确且删除列全为 0；注意用 `awk '$2 != 0'` 判删除列，`grep -cv '^4\t0'` 这类字面模式会误报）。万一已提交假删除：`git reset --soft HEAD~1` + `git reset -q`（mixed 清 index，缺失文件回到未暂存 ` D` 原状）+ update-index 重来；soft/mixed reset 不触碰工作区文件，历史遗留的 ` D` 原样保留。
- **归档去重（防归档本身成磁盘大户）**：批量回收半成品 worktree 时，同一大产物常被每份 worktree 各拷一遍（如 7G 加密档案 × 24 份 = 147G）。入档前对每个未追踪文件先与主仓同名文件 `cmp`，**主仓已有且内容相同就跳过**，仅主仓没有或内容不同的才写档；档内跨 tid 再 `diff -rq` 去一次重。否则「先存档再删」的保险网反成新的空间黑洞。
- **locked "initializing" 是超时残留**：正常锁有任务理由，这个锁是 worktree add 被杀时留下的；unlock+remove-force 是唯一出路，勿绕过。
- **分支名≠目录名**：remediation/ 下的 worktree 目录名是功能名（F-2-xxx）而分支名是 wt/<task-id>——对账脚本要按 worktree list 实际路径遍历，不能拼目录名。
- **回归预防**：定期（如每月）跑一次对账，或推动 done 卡自动 prune——等 spawn 超时再清说明已影响派工。（2026-09-21 起已并入统一夜间 Loop Graph v3.2 每日 02:02：`sweep` 步=workspace ≥100MB 大文件出库（engine `~/.hermes/scripts/workspace_bigfile_sweep.py`，gitignore 托管块防回吸）→ 紧随 `reclaim` 步=本 skill 对账三分法的正典实现 `~/.hermes/profiles/orchestrator/scripts/worktree-daily-reclaim.sh`（归档分支保留/僵尸 tar/保留期清理）。历史独立排程已退役：bigfile 专用 launchd 09:23 删除；reclaim 原 04:00 cron 从 jobs.json 删除（定义备份 .bak）并列入 cron_paused_watchdog BANNED 黑名单（BANNED 语义=已删除 tripwire——未删仅禁用的 job 仍在 cron list 输出里，进 BANNED 会每轮巡检误报）。日志：`~/.hermes/logs/bigfile-sweep.log` + `~/.hermes/logs/worktree-reclaim.log`，步状态入 `unified_loop_YYYYMM.log` 快照。）