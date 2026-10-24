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

> 两条独立但同根的纪律：**①卡引用的产物必须持久存活；②单源转述文必须回源**——
> 两者共同根因是「交付物对未来会话（含 dispatcher 派出的 worker）必须可读可回溯」。

## When to Use

- orchestrator / worker `kanban_create` 派卡时，body 的「必读 context」引用了上游任务产物
- 任何 scratch（`$TMPDIR`、profiles 的 cache/scratch）里的产物被后续任务引用
- 微信转述文请求「深入调研并落地 / 复刻 / 融合」类任务

## 纪律 1：卡引用的上游产物先复制到持久层

scratch 目录（`$TMPDIR`、profiles 的 cache/scratch）默认 24h 无访问即清理。
**派卡时 body 里写 scratch 绝对路径 = 埋延迟地雷**——dispatcher 派出的 worker 两小时
后启动可能读不到上游产物，开工即坏，白烧一轮。

**建卡必做**（把上游调研/分析产物落进共享 workspace 持久层）：

```bash
# 源 scratch 产物 → 共享 workspace 持久层（卡片 body 引用此持久路径）
cp -r <scratch>/<run-slug> /Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/research/<run-slug>/
```

**何时触发**：任何 orchestrator / worker 把前一任务的产物写进后续卡 body 的「必读
context」清单时；只要产物当前在 scratch 或任何临时目录。已在共享 workspace 的不必复制。

**配套**（已在 `kanban-worker-spawn-breakage-desktop-app-gateway` 有同型判例）：
dispatcher 多轮重试耗尽（gave_up）后卡上 `tasks.block_kind` 为 NULL 不写值——不要按
字段判受害面，按事件时间线逐板扫 `task_events` 找同窗口 gave_up 的 `t_` 卡。

## 纪律 2：单源微信转述文必须先回源

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
