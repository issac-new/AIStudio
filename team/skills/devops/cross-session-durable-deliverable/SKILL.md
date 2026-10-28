---
name: cross-session-durable-deliverable
description: "跨会话持久交付：scratch 产物须复制到持久层再被卡引用；单源微信转述文须先回源。"
version: 1.0.0
platforms: [macos]
tags: [deliverable, persistence, kanban, wechat, research]
metadata:
  hermes:
    tags: [deliverable, persistence, kanban, wechat, research]
    related_skills: [wechat-article-research, kanban-worker-spawn-breakage-desktop-app-gateway, delegation-brief-format]
---

# 跨会话持久交付（cross-session durable deliverable）

> 三条同根纪律：**①卡引用的产物必须持久存活；②worktree 回收前交付物必须已保全；
> ③单源转述文必须回源**——三者共同根因是「交付物对未来会话（含 dispatcher 派出的
> worker）必须可读可回溯」。

## When to Use

- orchestrator / worker `kanban_create` 派卡时，body 的「必读 context」引用了上游任务产物
- 任何 scratch（`$TMPDIR`、profiles 的 cache/scratch）里的产物被后续任务引用
- 回收 done 卡的 git worktree 前（`.worktrees/<task-id>`）
- 微信转述文请求「深入调研并落地 / 复刻 / 融合」类任务

## 纪律 1：卡引用的上游产物先复制到持久层

scratch 目录（`$TMPDIR`、profiles 的 cache/scratch）默认 24h 无访问即清理。
**派卡时 body 里写 scratch 绝对路径 = 埋延迟地雷**——dispatcher 派出的 worker 两小时
后启动可能读不到上游产物，开工即坏，白烧一轮。

**建卡必做**（把上游调研/分析产物落进共享 workspace 持久层）：

```bash
# 源 scratch 产物 → 共享 workspace 持久层（卡片 body 引用此持久路径）
cp -r <scratch>/<run-slug> /Volumes/nvme2230/lab/hermes-docker-sandbox/workspace/research/<run-slug>/
```

**何时触发**：任何 orchestrator / worker 把前一任务的产物写进后续卡 body 的「必读
context」清单时；只要产物当前在 scratch 或任何临时目录。已在共享 workspace 的不必复制。

**配套**（已在 `kanban-worker-spawn-breakage-desktop-app-gateway` 有同型判例）：
dispatcher 多轮重试耗尽（gave_up）后卡上 `tasks.block_kind` 为 NULL 不写值——不要按
字段判受害面，按事件时间线逐板扫 `task_events` 找同窗口 gave_up 的 `t_` 卡。

## 纪律 2：worktree 回收以「完成回执 artifacts」为唯一交付物清单

纪律 1 的反向场景：orchestrator 回收 done 卡的 worktree 时删掉了该卡的交付物。
`git status --short | wc -l` 的 dirty 计数**不是**交付物清单——实测反例：回执声明 8 个
artifacts，dirty 只报 2，实际 8 个文件全部未提交且未追踪，`--force` 摘除一次全删，
而看板附件区当时为空。漏报的两个机制：`git status` 对 gitignore 命中文件不列
（`--others --exclude-standard` 同样漏），且 dirty 行数与 artifacts 条数是两套口径
（一份 md 改动算 1 行，整个未追踪目录可能折叠成 1 行）。

**删除前闸门（顺序不可调）**：

```bash
tid=<task-id>; wt=<worktree-path>; arc=<archive-dir>
# 1) 取回执声明的 artifacts 全集（权威清单，不是 git）。
#    位置：completed 事件 payload 的 artifacts 键。tasks 表没有 artifacts 列，
#    result 列在纯 summary 完成回执下是 NULL——两处都读不到，别按列名猜。
sqlite3 "file:$HOME/.hermes/kanban/boards/<board>/kanban.db?immutable=1" \
  "SELECT json_extract(payload,'\$.artifacts') FROM task_events \
   WHERE task_id='$tid' AND kind='completed' ORDER BY created_at DESC LIMIT 1"
# 2) 保全：gitignore 命中的也要兜底（--others 不带 --exclude-standard = 含 ignored）
(cd $wt && git ls-files --others -z | xargs -0 -I{} rsync -R -a "{}" $arc/$tid/)
# 3) 逐条比对上一步列出的路径是否已进 $arc，缺件不许 remove --force
git worktree remove --force $wt
```

**artifacts 指向 worktree 内路径时不等于已持久化**：清单列的是 worktree 里那份，
卡片附件区可能同时为空（worker 没 attach，orchestrator 也没补）——摘除那一刻两份
都没了。所以「回执有 artifacts 声明」不能当成「产物已保全」的证据，必须另查附件区
（`hermes kanban --board <b> attachments $tid`）再动手。

**已删怎么救**：worker 每次 `write_file` 的全文留在 assignee profile 的 `state.db`
会话库 `messages.tool_calls` JSON 里——worktree 与 git 对象都没了也能按原路径重放还原，
git 恢复不了未提交文件，这里能。跑 `scripts/recover-worker-writes.py`（本 skill 下，
`--profile <assignee> --list-sessions` 先摸底，再 `--session <id> --dest <dir>` 还原）。
还原后必须落三处才算补完：卡片附件（`hermes kanban --board <b> attach <tid> <file>`）、
共享 workspace 持久层、冷盘存档。只补附件区不够——原路径会随下一次摘除一起消失。

**汇报纪律**：处置失误属用户必须知情项，收尾报告里单列一段说清「删了什么、怎么恢复的、
落在哪、校验值多少」，不要混进成果段落一笔带过。

## 纪律 3：单源微信转述文必须先回源

微信技术文常是外文（arXiv/X 长文/博客）的中文转述。**只拿转述文当唯一源做融合/复刻
= 吸收残缺版**——转述常省略代码示例、实现细节、尾节实操清单，且作者可能误读原意。

**回源纪律**（按 `wechat-article-research` 的「原文回源」节执行，此处只补判例确认的路径）：

1. **转述文内找原文链接**：文首/文末常带「原文作者 + 原文链接」；无链接时用原标题 +
   作者名 web_search 定位。
2. **arXiv 直抓**：`https://arxiv.org/pdf/<id>` 用 web_extract 直接抓，返回干净 markdown
   正文（本机已实证多轮）。无需走 threadnavigator 镜像。
3. **回源后原文落盘存档**（如 `research/<topic>/original-*.txt`）再开始分析——分析/融合
   引用以原文锚点为准，转述差异显式声明（哪节是转述独有、哪节原文有更全细节）。
4. **转述文仍是合法源**：用于初步理解 + 抓原文线索，不用于直接做落地决策。

**何时触发**：单篇微信文章请求「深入调研并落地/复刻/融合」类任务。

## 判例

- 派卡引用 scratch 调研包：dispatcher 派出的 worker 两小时后才启动读不到上游产物
  → 开工即坏。把产物复制进共享 workspace 后再在 body 里引用持久路径，worker 顺利跑通。
- 微信转述文声称介绍 RRSI 框架：只读转述文会漏 arXiv 尾节 + 误读实现细节；回源
  arXiv:2609.24972v3 后原文落盘做保真度对照，缺口清单的精确度显著提升。

## 相关 skill

- `wechat-article-research`：抓取/回源的方法层（curl+regex、X 镜像、Sogou 发现通道）。
- `kanban-worker-spawn-breakage-desktop-app-gateway`：dispatcher 多轮重试的受害卡清理。
