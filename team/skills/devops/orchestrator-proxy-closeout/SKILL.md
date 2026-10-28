---
name: orchestrator-proxy-closeout
description: "Use when worker 活干完但死在收尾时代为补完成：证据保全、参数形状、worktree 摘除次序。"
version: 1.2.0
platforms: [macos]
metadata:
  hermes:
    tags: [orchestrator, kanban, closeout, evidence, worktree]
    related_skills: [kanban-blocked-card-disposition, cross-session-durable-deliverable, worktree-lifecycle-hygiene, kanban-batch-closeout, orchestrator-profile-skill-writeback]
---

# 代为收口（worker 死在收尾时）

> **权威源在 default profile**：`~/.hermes/skills/devops/kanban-blocked-card-disposition`（三分处置）、
> `cross-session-durable-deliverable`（证据保全）、`worktree-lifecycle-hygiene`（worktree 生命周期）、
> `kanban-batch-closeout`（批量收尾）。本件只补 default 侧缺的四条，已验证可复现；**冲突时以 default 原件为准**。

## 适用判据

worker 在**最后一刻**死亡的一种高频形态：`task_runs.error` 写 `Iteration budget exhausted (N/N)`
或 `rate-limited … exit 75`，而盘上产物与判定文件齐全——**活干完了，只差完成接口**。
这不是任务失败，重派会白烧一轮预算。判据两条同时成立才走代收口：

1. 事件流里终止前有新鲜的 productive 心跳（非 dispatcher 机械盖章）。
2. 目标产物文件实测在位、内容含结论段（不只信卡面自述）。

机制成因也要读出来并写进收尾报告：多 run 里反复撞配额墙会压缩有效执行窗口，
使「收尾调用」成为最先被挤掉的一步——这是预算分配问题，不是 worker 能力问题。

## 顺序门（不可反）

**先证据、再补完成、最后摘 worktree。** worktree 是唯一一份在盘的产物，反序即永久丢失。

```bash
tid=<task-id>; ws=<worktree-path>/<evidence-dir>
# 1) 铺三处：卡片附件 + 共享 workspace 持久层 + 冷盘存档（写 MANIFEST.md 含来源/原因/结论）
# 2) 逐文件字节校验（cmp 逐个比，禁止只对文件数——数字对得上不等于内容对）
for f in $(cd "$ARC" && find . -type f); do cmp -s "$WS/$f" "$ARC/$f" || echo "差异: $f"; done
# 3) 报告挂卡片附件（走 CLI 传路径）
hermes kanban --board <b> attach $tid <report.md> --author orchestrator
# 4) kanban_complete（metadata 点明「代补完成」+ 机制成因）
# 5) 确认终态后才 git worktree remove --force
```

## 工具形状坑

- **`kanban_complete` 只认 7 个参数**：`artifacts` `board` `created_cards` `metadata` `result`
  `summary` `task_id`。把 `verification`/`findings`/`decisions` 提到顶层会报
  `unknown parameter(s): verification` 且**整次调用不落库**（metadata 一并丢），表现为白跑一次。
  富信息必须嵌进 `metadata.verification` / `metadata.findings` / `metadata.decisions`。
- **长文件挂附件走 CLI 传路径，禁手抄 base64**：`kanban_attach` 的 `content_base64` 靠逐字复制，
  长文必被静默截断产出损坏附件——且截断在调用层看不出异常，须比对字节数才发现。
- **补完成后别立刻摘 worktree**：先回读卡态确认 done（complete 可能被拒而卡面已变更），
  再处理工作区。

## pack 收不动时先分清活内容与垃圾

`git gc --prune=now` 后松散对象归零但 `size-pack` 不降，是两类占用混在一起：

- **分支扇出型**（unreachable from main，被 `archive/t_*` / `backup/*` / `wt/*` 引用）——可回收，
  走 bundle 存档 → 删分支 → reflog expire → gc。
- **主线历史内的活 blob**（逆向数据集、被 `git add -A` 扫进仓库的 venv、证据目录里的二进制
  产物）——`unreachable=0`，prune 永远收不动，因为是真实提交内容。

一行判据：`git count-objects -vH` 看两个读数——gc 后 `count: 0` 而 `size-pack` 不降 = 剩下的全是
活内容，停止尝试。定位归属：

```bash
git rev-list --objects <ref> | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  awk '$1=="blob" && $3>=104857600 {printf "%.0f MB  %s\n", $3/1048576, $4}'
```

打印每个大 blob 的体积与路径；再判该路径在盘上是否还在——**盘上已无的路径就是纯历史残留**，
要清只能改写历史（filter-repo），属需用户裁决的动作，**绝不自动跑**。gc 必须等所有 worktree
（含外置卷上的）都不在跑时再做：运行中卡的 `wt/*` 分支会 pin 住对象，先删分支再 gc 会看到回收为零。

## Pitfalls

- **报「代为补完成」不报「重派成功」**：元数据里写清代补身份，下游 worker 才不会误认为原始执行。
- **准入检查报 ignored 文件**：摘除前用 `git ls-files --others`（不带 `--exclude-standard`）
  兜底，否则 gitignore 命中的交付物不进保全范围。
- **收尾报告把处置失误一笔带过**：删了什么、怎么恢复的、落在哪、校验值多少，单列一段。
- **blocked 态卡代收口**：complete 工具对 blocked 卡直接拒；CLI `hermes kanban complete --result` 可生效但生效判定要看 task_events（最新 kind 出现 completed）——CLI 报 Completed 后立即查卡状态仍显 blocked 是写路径缓存延迟，勿连环重试；对 blocked 卡的第二次 complete/unblock 报 "not blocked" 恰是首次已生效的旁证。MCP 工具与 CLI 对终态判定的时点不一致，以 task_events 为准。
- **「等用户条件」的卡先机械验证条件是否已满足再维持等待**：卡的挂起前提（如「用户须完成某登录/首跑」）可能早已被用户日常操作满足——用卡 body 里的机械判据实测（cookie 存在性/encrypted_len/文件 mtime），满足即 unblock 放行复验，勿因卡面写着「等待用户」就跳过验证。