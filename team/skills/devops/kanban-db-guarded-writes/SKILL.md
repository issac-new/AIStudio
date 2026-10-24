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
| 手动 promote | `promote_task(conn, tid, actor=...)`，返回 `(ok, reason)` 元组 | 只收 todo/blocked；triage 卡拒收；有未完成 parent 需 `force=True` |
| 工具层 unblock | `kanban_unblock` 工具 | 只收 blocked，对 triage/ready 均拒绝 |
| 重置失败计数 | 认证连接直接 `UPDATE tasks SET consecutive_failures=0 WHERE id=? AND status='blocked'` | 无专用 API |
| 收口状态滞留的已验卡 | `kb.complete_task(conn, tid, summary=..., force=True)` | 卡非 running 需 `force=True`；**签名无 `actor=`**（传入即 TypeError），可选 keyword 只有 `result`/`summary`/`metadata`/`created_cards`/`expected_run_id`/`fire_lifecycle_hook`/`force` |

## Pitfalls

- **promote 卡死的 triage 不要用 promote_task 或 kanban_unblock**——两者都拒收 triage，白费调用；唯一正规出口是 `specify_triage_task`（triage→todo 一步完成，随后 recompute_ready 自动把无 parent 卡翻到 ready，并落 `specified` 审计事件）。
- **orchestrator 自建的路由/分解卡在 triage 会卡死全部子卡**——卡创建者填的是 orchestrator 自己，在 TUI 会话中没有任何 dispatcher 会来拾取它，于是它永远停在 triage，子任务因 parent 未完成全部停在 todo。此时 `kanban_unblock`（只收 blocked）、`kanban_block`（只收 running/ready）、`kanban_complete`（对非 running 的已存在卡可能报 unknown id）三条工具路都走不通。恢复步骤：① `specify_triage_task(conn, tid, author="orchestrator")` 把父卡从 triage 出口到 todo→ready；② 对每个子卡 `promote_task(conn, tid, actor="orchestrator", force=True)` 强制提升（子卡报 unsatisfied parent 是预期，force 即过）；③ 裸 `sqlite3 SELECT` 回读验证每张卡状态。注意：只 force 那些无依赖或依赖已完成的子卡——绝不要 force 一个仍被 parent 门控的综合/集成卡（见 kanban-orchestrator 的对应 pitfall）。
- **tasks 表无 `updated_at` 列**——UPDATE 带它必报 `no such column` 且写入未生效，易误判为已修复。
- **每个连接独立认证**——connect() 之后自己另开 `sqlite3.connect()` 的新连接照样被拦；一个脚本里统一用同一个认证连接。
- **写脚本走文件再执行，不内联**——多行 Python 内联 terminal 会被命令护栏拦截且不区分内容正当性。
- 改完状态必须回读验证（裸 sqlite3 SELECT 即可），`specify` 返回 True ≠ 卡已 running——dispatcher 拾取还要等一个 tick。
- **父卡 done 而子卡状态滞留 running/todo（worker 中途死亡但证据已齐）**——先按 `worker-completion-independence-verification` 独立验收（commit + 测试亲跑）确认工作真实落地，再对每张子卡 `complete_task(conn, tid, summary=<验收实测结果>, force=True)` 批量收口，最后裸 SELECT 按 status 分组回读确认整板归零。绝不为收口裸 UPDATE status（触发 guard），也不要在未验收前为消板强关。
- **修复落地后卡仍 blocked ≠ 修复无效——先判 gave_up 熔断**——dispatcher 按 consecutive_failures 达上限即熔断（gave_up → blocked），此后不再自动 retry，修复再好卡也永久滞留。修复冒烟通过后手动重入队：① `UPDATE tasks SET consecutive_failures=0 WHERE id=? AND status='blocked'`（认证连接直写，无专用 API）；② `promote_task(conn, tid, actor="orchestrator")`（blocked 是合法入参）；③ 裸 sqlite3 SELECT 回读 `ready` 才算入队。重入队后若再秒死同一错误，勿原地重复同一修法——升级到 gateway 进程 env 层（`ps eww <gateway_pid>` 实测环境块、`launchctl kickstart -k` 重载）。
- **重入队证据纪律：核 task_runs.started_at 而非通知到达时刻**——dispatcher 的重试波可能整波启动于修复落地之前，crash 通知因 run 结束才送达而滞后。时间线上 crash run 早于修复落地时刻 = 修复前旧环境重试，属同一根因而非修复失效；勿据此回滚已验证的修复或重启归因。把「crash 时刻 vs 修复时刻 + 冒烟退出码」写进 `[requeue]` comment 留时间线证据，防下一轮误判。
- **orchestrator 在 TUI 自建自执行卡（assignee=orchestrator，2026-10-08 ste-zh 判例）**——建卡即被 dispatcher 平行拾取：建卡者本人的 `kanban_complete` 因不持有 run 归属被守门拒收（报 unknown id / stale run，但 sqlite 直查卡在且 running），派出的 worker 又可能 crash 进重试循环并重装覆盖已交付产物。处置：① 先备份已交付产物到 workspace 持久层；② 留交接 comment（`kb.add_comment(conn, tid, author=..., body=...)`，注意签名是位置参数 author 在前）告知勿覆盖；③ worker 再 crash 后独立核验（md5 对备份 + 验收命令 fresh 重跑）确认落地，`complete_task(force=True)` 收口阻断重试。预防：TUI 直执行任务建卡留痕时，预期 dispatcher 会拾取——要么接受让派工 worker 做完（自己只守门），要么建卡后立即完成实施并在其 crash 后按上述三步收口。
