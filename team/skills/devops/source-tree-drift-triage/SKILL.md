---
name: source-tree-drift-triage
version: 1.0.0
description: "Use when 源码树补丁标记消失/unknown id 复现：先三态定性再动手。"
metadata:
  hermes:
    tags: [devops, source-tree, patch-lifecycle, orchestrator]
---

# 源码树漂移三态定性（orchestrator 操作面）

> **权威源声明**：patch 生命周期完整规则在 default profile 的 `hermes-source-patch-persistence`；
> 进程内存 vs 磁盘判别在 `kanban-card-repair`；根库/unknown id 诊断在 `kanban-task-pickup-diagnosis`。
> 本件是 orchestrator 可写的操作面副本，只存定性判据与恢复动作；前台会话应把此处规则合并回
> 上述原件，合并后本件可退役。

## 三态定性：标记消失 ≠ 基线丢 patch

`grep -c <marker>` 只测工作树。定性前先 `git show HEAD:<file> | grep -c <marker>`，按组合选路：

| HEAD | 工作树 | 判定 | 动作 |
|---|---|---|---|
| 有 | 无 | 工作树被会话 checkout/管线动作回滚到 HEAD 之下 | `git apply` SPECS patch 即恢复；勿重打 commit |
| 无 | 无 | 基线真丢 | 重放 patch 后**必须 commit** |
| 无 | 有 | 未提交改动 | patch + commit 双落地，防 update 冲掉 |

Grep the HEAD copy before concluding "the update ate the patch" — another session's worktree checkout produces the same zero-count with a completely different remedy.

## 回放后 commit 报 no changes ≠ 失败

Patch 内容与 HEAD 等价 = 已到位。验证用 `git diff HEAD -- <file>` 为 0 行（或工作树 marker 计数对上），不要为「留一个 commit」空转重试。

## 坏窗第三方重启：新进程载的是剥离版代码

事故拉锯期进程可能被第三方 SIGTERM+重拉；新进程 lstart 早于修复落盘时，内存里是没有补丁的旧代码。树已修好时非紧急场景**等下次自然重启窗**，不为载补丁专门重启生产网关。判别：`ps -p <pid> -o lstart=` 对比文件 mtime。

## unknown id 复现前先验跨板 fallback 补丁在位

工具层跨板兜底是本地补丁（`~/.hermes/patches/hermes-kanban-crossboard-fallback.patch`）：不带 board 的 show/complete/comment 会搜到他板卡、报错附板名。unknown id 再现时先 `grep -c 'swarm:kanban-crossboard-fallback' ~/.hermes/hermes-agent/tools/kanban_tools.py`——0 = 补丁被冲，从 patch 文件按 SPECS 流程重放登记；>0 = 补丁在位，走卡库诊断流程。显式传 board 仍是纪律，fallback 只是兜底。
