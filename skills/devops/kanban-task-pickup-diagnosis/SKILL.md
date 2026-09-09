---
name: kanban-task-pickup-diagnosis
description: "kanban 卡建成功但从未被 dispatcher 拾取时用：根库陷阱 + triage 父卡连锁死锁诊断与迁移重建。"
version: 1.0.0
metadata:
  hermes:
    tags: [kanban, dispatcher, troubleshooting, root-db-trap]
    related_skills: [kanban-triage-stall-recovery, kanban-orchestrator]
---

# Kanban 卡不被拾取：落点诊断与迁移重建

> 2026-09-01 实例：TUI 会话建 5 卡任务链（父 triage + 4 子卡），kanban_create 全部 ok、
> kanban_list 全部可见 → 20 分钟零进度。双重死锁：卡写进 dispatcher 不扫的根库 +
> 父卡 triage 永不 done 锁死子卡 parent-gate。

## 核心事实

| 卡所在位置 | dispatcher 是否拾取 |
|---|---|
| `~/.hermes/kanban/boards/<board>/kanban.db`（board 分库） | ✅ 正常 |
| `~/.hermes/kanban.db`（**根级库**，与 kanban/ 目录同级） | ❌ 永不——会话 kanban_* 工具 board=default 时写这里 |
| `~/.hermes/kanban/kanban.db` | 0 字节占位，无业务卡 |

状态维度：`ready` 正常拾取；`todo` 等全 parent done；`triage` **永不拾取**（无 specifier 时）。

**卡不被拾取 = 位置错误 或 状态错误，两者可叠加成死锁。**

## 诊断流程（建卡后 ~2 分钟无 running 即跑）

```bash
# 1. 先定位卡真实落点（三个位置 + 最近被写的库）
for d in ~/.hermes/kanban/boards/*/; do
  sqlite3 "$d/kanban.db" "SELECT id,status FROM tasks WHERE id='<tid>';" 2>/dev/null
done
sqlite3 ~/.hermes/kanban.db "SELECT id,status FROM tasks WHERE id='<tid>';"
find ~/.hermes -name 'kanban.db*' -newermt 'today' 2>/dev/null   # 谁刚被写

# 2. 分库命中但无 running → 查 worker_pid/started_at + 日志
ls -lt ~/.hermes/kanban/boards/<board>/logs/t_*.log | head -5

# 3. 根级库命中 → 根库陷阱，走迁移重建
# 4. 分库命中且 status=triage → promote；父卡 triage 则先修父卡（子卡 gate 才能释放）
```

**反直觉点**：`kanban_list`/`kanban_show` 能读回卡 ≠ 卡会被执行——工具与写入方同库即可见，dispatcher 扫描范围才是执行前提。

## 恢复：迁移重建（根库卡原地 SQL promote 无用——dispatcher 根本不看该库）

1. 根库旧卡归档留痕（不删，保审计）：
   ```bash
   sqlite3 ~/.hermes/kanban.db "UPDATE tasks SET status='archived', \
     result='[superseded] 写入 board=default 根库，dispatcher 不扫根库；已迁往 <board> 重建: <新id列表>' \
     WHERE id IN (...);"
   ```
2. 在真实 board 重建任务链：无依赖卡**不设 parents/triage**（直接落 ready 被立即拾取）；依赖用 parents 表达
3. sleep ~70s 后验证：分库 status=running + worker_pid 非空 + 日志有实质工具调用，才可向用户报「已启动」
4. 向用户报告附事故复盘（误判根因 + 修正后预估），不等用户二次催问

## 预防
- 建卡后立即 SQL 确认落点是 board 分库（一条 SELECT 的事）
- 分解壳父卡**不用 triage**；确需 triage 语义则建完立刻 SQL promote+验证（kanban_complete 对 triage 卡会报 unknown id）
- 带依赖的下游卡用 parents；建卡漏链的用 kanban_link 补

## Pitfalls
- `cat ~/.hermes/kanban/current` 报 Is a directory——current 是指向 board 目录的**符号链接**，用 `readlink` 读
- 首轮进度报告只看 kanban_list 状态不验 DB 落点 = 把死锁报成「正常等待」，20 分钟后用户二次催问才暴露
- 根库 UPDATE 后仍要重建——别以为 promote 根库卡就能被拾取
- **kanban_comment 也会撞根库陷阱**：卡写进根库后，`kanban_comment` 工具若走 board 参数（如 swarm 板库）会报 `unknown task t_xxx`——不是卡丢了，是查错库。诊断顺序同 tasks 表：先确认卡真实落点（根库 vs board 分库），再选对通道写入。CLI 通道（`hermes kanban --board <slug> comment`）或 kanban_comment(board=) 参数必须与卡的实际所在库一致。

## 坑：`no such function: kanban_write_sanctioned`（护栏代码-DB 时序窗，2026-09-04 实例）

- 机制：guard 触发器持久在 **DB 侧**，UDF 注册在**代码侧**；代码缺失的窗口期 = 全部写路径阵亡（含 dispatcher `claim_task`，现象为 ready 队列持续零 spawn + cron 任务同死）。
- 典型引爆：`hermes update` autostash 收走未提交的护栏代码 → 重启进程跑上游代码撞持久化触发器。**护栏类改动必须即改即 commit**，否则每次 update 复炸。
- 诊断三步：① 哪些库有触发器（`sqlite_master WHERE name LIKE 'kanban_guard%'`）② 磁盘代码是否已修（`grep register_write_sanction_udf hermes_cli/kanban_db.py` + `git log`）③ 哪些进程启动早于修复 commit（`ps` 对时间）——滞留旧代码的进程继续炸。
- 修复 = **重启滞留进程**（launchd: `launchctl kickstart -k`；裸进程: kill → 等 `.dispatcher.lock` 释放 → terminal(background=true) 重拉 gateway），**不是修数据**——claim 的 INSERT 无论数据如何都撞触发器。
- 会话内 kanban_* 工具全挂时：CLI 通道（`hermes kanban --board <slug> ...`）是合法恢复路径（terminal 子进程无 delegate 标记，护栏放行）；必须带 `--board`（会话 env 默认 default=根库，叠加根库陷阱）。CLI 命令挂起时加 timeout，先查 DB 是否已生效再重试。
- triage 卡出口是 `kanban specify`（promote 只认 todo/blocked；complete 对 triage 卡报 unknown id）。

## 关联
- 完整时间线与 runbook：`_shared/failures/2026-09-04-kanban-udf-stale-process-incident.md`
- triage 语义与状态机细节、供应商熔断/rc=0 协议违规 → `kanban-triage-stall-recovery`（default profile；跨 profile patch 被拒时先 `hermes curator adopt` 或直接编辑源文件）