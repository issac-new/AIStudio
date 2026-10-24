---
name: repo-bigfile-hygiene
description: "Use when workspace git repo/HEAD tree bloats with big files."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [git, bigfile, gitignore, launchd, hygiene]
    related_skills: [worktree-lifecycle-hygiene, kanban-workspace-durability, cron-job-management]
---

# Repo Bigfile Hygiene（仓库大文件治理与定时出库）

> 症状：`git ls-tree -r -l HEAD` 体积合计到 GiB 级、pack 上十 GiB、`time git worktree add` 超派工超时线（默认 60s）、磁盘被大产物吃满。
> 根因：共享 workspace 是所有 agent 的落盘层，归档/加密包/安装包被 auto-backup 的 `git add -A` 成批吸进库，只进不出。

## 一次性瘦身（≥100MB 出库标准动作）

1. **清单三路齐查**：HEAD blob `git ls-tree -r -l HEAD`（按 size 过滤）+ index 暂存（`git ls-files -s` 取 sha 后 `git cat-file --batch-check` 批查大小）+ 盘上 walk（剪枝 `.git`/`.worktrees`）。只查 HEAD 会漏掉「已 add 未 commit」的最大险情。
2. **`.gitignore`（精确路径）与 `git rm --cached` 同一 commit 落地**——auto-backup 类脚本用 `git add -A`，ignore 隔一个 commit 就把出库文件吸回索引，瘦身白做。
3. **盘上实体不动，历史 blob 保留**：下游脚本常有绝对路径引用（挪实体=断链）；出库只断追踪，旧版本经历史 blob 仍可回溯。
4. **验收两件**：`git check-ignore -v` 逐文件验证防回吸 + `time git worktree add` 二次实测对照超时线——不实测勿宣称根治（HEAD 树体量与 worktree 表膨胀是两个独立根因）。

## 机制化（launchd 定时清扫，参照 ~/.hermes/bin/workspace_bigfile_sweep.py）

- **三路候选收集**同上，且每路都过 `git check-ignore` 过滤——已出库的盘上实体不重复处理。
- **托管块模式**：`.gitignore` 用 `# >>> <sweeper> managed (auto) >>>` … `<<<` 标记块写精确路径；upsert 前读全文件按行去重，块外内容原样保留（人工条目不被清扫器洗掉）。
- **提交纪律**：`rm --cached` + 托管块 + `git add .gitignore` 一个 commit（`--no-verify`），message 带文件数与体积便于审计。
- **worktree 回收政策**（完整三分法见 worktree-lifecycle-hygiene，勿在此重复）：卡状态**双库对账**（中央根库 `~/.hermes/kanban.db` + `boards/<slug>/kanban.db` 都查）；done/archived + clean + unmerged=0 直接回收；无卡但 mtime ≥48h 先归档 HEAD 树外新产物再回收；**无卡且 <48h 只 HOLD**——无卡新 worktree 可能是卡尚未落库的进行中 spawn，误删在途工作不可逆。
- **自保设计**：mkdir 锁防重入（锁龄 >2h 视为上次崩溃残留，可破）；只用标准库——launchd 拉起的是 `/usr/bin/python3`，venv 依赖不可用；非 0 退出码=异常，正常含「无事可做」。
- **plist**：StartCalendarInterval 错开既有整点任务防共振；装载后 `plutil -lint` + `launchctl list | grep <label>`（退出码列=上次运行结果）双验。

## 装载前故障注入验收（无人值守机制：存在 ≠ 在跑）

脚本崩了只在日志留一行，无人报警——装载前手动注入 fixture 跑全分支：

| 注入 | 预期 |
|---|---|
| staged 一个 ≥100MB 文件 | 自动出库+自动提交；盘上实体在；旧 ignore 条目不受扰 |
| 造假僵尸 worktree（无卡、clean、新建） | HOLD（年龄门拦截，不误杀） |
| 同 worktree `touch -t` 回古过年龄门 | NO-CARD 归档（0 文件也是合法输出）后回收 |

跑完删注入物，并**同步清托管块死条目**后单独提交——测试大文件若只删实体不删条目，残留会进每次 auto-backup 提交永续污染。

## Pitfalls

- **批量脚本抓子进程输出统一用 `subprocess.run`**：它回 (rc, out, err) 三元组；`Popen().communicate()` 只回二元组，按 run 的形状解包 Popen 必 ValueError——无人值守场景要到首次定时触发才爆，装载前人工跑一遍即可当场暴露。
- **托管块是清扫器与人工的共同领地**：清扫器只增删自己块内条目，upsert 以「全文件现有非注释行」为去重集，防止把人工维护的 ignore 规则当重复项洗掉。
