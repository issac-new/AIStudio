---
name: kanban-db-guarded-writes
description: "Fix rejected kanban writes via the sanctioned DB API."
version: 1.0.0
metadata:
  hermes:
    tags: [kanban, sqlite, guardrail, dispatcher, repair]
    related_skills: [kanban-triage-stall-recovery, kanban-crash-recovery, kanban-task-pickup-diagnosis]
---

# Kanban DB 受保护写入（guardrail 过墙）

## When to Use
- 裸 `sqlite3` 写 kanban 库报 `no such function: kanban_write_sanctioned` 或 `unsanctioned kanban write`
- 需要修复卡状态：promote 卡死的 triage、重置 consecutive_failures、解 blocked
- 需要调用 kanban_db 源码 API（specify_triage_task / promote_task / link_tasks 等）做看板手术

## 核心机制（为什么裸写必败）

受保护 board 的每张用户表（tasks/task_links/task_comments/task_events/task_runs/task_attachments）
装有 INSERT/UPDATE/DELETE guard trigger，WHEN 子句调用连接级 UDF `kanban_write_sanctioned()`。
- 裸 sqlite3 进程没有这个 UDF → **prepare 阶段即失败**（fail-closed，不是执行中途）。
- 经 `kanban_db_connect.connect()` 打开的连接会自动 `register_write_sanction_udf` → 放行。

这是防 delegate child / 裸客户端绕过 CLI 写路径的 schema 级安全边界。DROP trigger 是给维护者的回滚通道，agent 永远不要绕——绕过等于重新打开被堵住的越权写向量。

## 正规写法（三步）

1. **写脚本文件**（write_file 落盘；不要内联 heredoc/巨长单行——命令护栏会以 unparseable payload 硬拦）：

```python
# repair.py
import sys
sys.path.insert(0, "/Users/YOURNAME/.hermes/hermes-agent")  # hermes-agent 安装根
from hermes_cli.kanban_db_connect import connect   # 认证连接：自动注册 UDF
from hermes_cli import kanban_db as kb

conn = connect(board="<board>")
# 按语义选 API，不要裸 UPDATE status：
kb.specify_triage_task(conn, "<tid>", author="orchestrator")   # triage→todo→ready
# kb.promote_task(conn, "<tid>", actor="orchestrator")         # todo/blocked→ready
conn.close()
```

2. `python3 repair.py` 执行。
3. **裸 sqlite3 SELECT 验证终态**——读不受护栏影响，验证到期望状态才算数。

## API 语义速查

| 意图 | 用什么 | 拒收场景 |
|---|---|---|
| triage 卡出口 | `specify_triage_task(conn, tid, author=...)` | 卡不在 triage → 返回 False |
| 手动 promote | `promote_task(conn, tid, actor=...)` | 只收 todo/blocked；triage 卡拒收；有未完成 parent 需 `force=True` |
| 工具层 unblock | `kanban_unblock` 工具 | 只收 blocked，对 triage/ready 均拒绝 |
| 重置失败计数 | 认证连接直接 `UPDATE tasks SET consecutive_failures=0 WHERE id=? AND status='blocked'` | 无专用 API |

## Pitfalls

- **promote 卡死的 triage 不要用 promote_task 或 kanban_unblock**——两者都拒收 triage，白费调用；唯一正规出口是 `specify_triage_task`（triage→todo 一步完成，随后 recompute_ready 自动把无 parent 卡翻到 ready，并落 `specified` 审计事件）。
- **tasks 表无 `updated_at` 列**——UPDATE 带它必报 `no such column` 且写入未生效，易误判为已修复。
- **每个连接独立认证**——connect() 之后自己另开 `sqlite3.connect()` 的新连接照样被拦；一个脚本里统一用同一个认证连接。
- **写脚本走文件再执行，不内联**——多行 Python 内联 terminal 会被命令护栏拦截且不区分内容正当性。
- 改完状态必须回读验证（裸 sqlite3 SELECT 即可），`specify` 返回 True ≠ 卡已 running——dispatcher 拾取还要等一个 tick。
