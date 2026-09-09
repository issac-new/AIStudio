---
name: kanban-blocked-card-disposition
version: "1.0.0"
description: "Use when 处置 blocked/gave_up 卡：核验产物后按三分法补完成/重派/归档。"
metadata:
  hermes:
    tags: [kanban, orchestrator, dispatch, nightly-ops]
---

# Kanban 阻塞卡处置三分法（orchestrator）

blocked 卡先分类再动手。三分依据 = 产物实证 + crash 根因是否已消失，两问都要答。

## 第一步：定性（读证据，不猜）

1. `gave_up` 事件 payload 的 `"pid N not alive"` 只说明 worker 进程死了，**不代表任务本身有问题**。真实死因看 `task_runs.error` 原文——区分三类：供应商熔断窗（外部瞬态）/ 协议违规 rc=0 无 terminal call（工作可能已做完）/ 任务自身报错（真失败）。
2. 独立核验产物，不信卡面状态：
   - 文件存在 + 有效性实测（PDF 用 pymupdf 数页数、读首页文本；register 用 grep 查对应条目的 status/resolved_fix 是否已回填）。
   - workspace_path 目录列内容：空目录 = 真未执行。
3. 对照同期同类卡：故障时间窗之后同模板卡是否正常完成——是则根因（熔断窗等）已消失。

## 第二步：三分处置

| 判定 | 处置序列 |
|---|---|
| 产物已落盘 + 验收项已勾，仅缺完成调用 | `kanban_unblock` → 逐项核验 → `kanban_complete`(summary+metadata) → comment 留核验记录 |
| workspace 空、真未执行 + 根因已消失 | `kanban_unblock` → comment 留重派依据 → 等一个 dispatcher tick（60s）确认拾取（status→running + current_run_id + last_heartbeat_at 刷新） |
| 真未执行 + 根因仍在，或外部依赖不可解 | 归档，或 `kanban_block(kind="capability")`，comment 留终态依据 |

根因仍在时禁止重派——重派只会再烧一轮重试预算回到 blocked，同一张卡反复 gave_up 会触发升级。

## Pitfalls

- **`kanban_complete` 不收 blocked 态**（报 unknown id or already terminal）——补完成前必须先 `kanban_unblock`。
- **`kanban_heartbeat` 只对自己 claim 的 running 卡有效**：对派给 worker 的卡代打心跳报 "unknown id or not running"；worker 卡活性看 `last_heartbeat_at`，不代打。
- **tasks 表无 `error` 列**：失败摘录在 `last_failure_error`，run 级完整错误在 `task_runs`（status/outcome/error/metadata）；评论表叫 `task_comments`（无 comments 表）——新库先 `.tables` 再写 JOIN，`2>/dev/null` 会把 no-such-table 变成静默空结果伪健康。
- 补完成的 complete 要带 `reason: work_done_but_completion_missing` 类 metadata，让下游知道这是代补而非原始执行。

## 关联

- 检测与健康审计：`orchestrator-scheduling-audit`（blocked ≠ 僵尸判读、依赖链全景）。
- crash 根因分类与 worker 恢复：`kanban-crash-recovery`、`orchestrator-worker-failure-triage`。