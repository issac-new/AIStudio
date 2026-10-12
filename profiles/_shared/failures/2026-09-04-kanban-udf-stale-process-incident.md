# 2026-09-04 kanban_write_sanctioned 故障（护栏层提交时序 + 旧进程滞留）

> 一句话：护栏层 09-01 以未提交改动存在 → 09-03 `hermes update` autostash 收走 → 重启进程跑上游代码撞 DB 里持久化的 guard 触发器全线炸 → 09-04 01:25 正式提交修复 → **但 01:25 前启动的进程（我的 TUI 会话 + 双 gateway）滞留旧代码继续炸**。

## 故障时间线

| 时间 | 事件 |
|---|---|
| 09-01 | 护栏层（21 guard triggers + UDF 注册）以**未提交本地改动**落地，当晚进程内存里有代码，可用 |
| 09-03 白天 | loadavg 冲 139，gateway 反复重启（watchdog 3×liveness miss + 1×OOM）；update autostash 收走未提交改动 |
| 09-03 20:44 | 重启后的进程跑上游代码（connect 慢路径不注册 UDF）→ 有 guard 触发器的库初始化必炸，dispatcher 全板 tick failed（421 次） |
| 09-04 01:25 | 护栏层正式提交 `9996e5931b`（connect() 慢路径注册 UDF，kanban_db.py:2629） |
| 09-04 02:18 | 持 dispatcher 锁的 [已移除] gateway 仍是旧代码 → claim_task INSERT 撞触发器 → **dispatcher stuck（ready 队列 6 tick 零 spawn）**，cron 任务同死于此路径 |
| 09-04 02:27-02:29 | launchctl kickstart orchestrator + 重拉 [已移除] → 新代码 dispatcher spawned=1，链路恢复 |

## 根因分层（防"只修表症"）

1. **表层**：`no such function: kanban_write_sanctioned` —— 触发器 prepare 时连接无 UDF。
2. **机制层**：护栏的 UDF 注册是**代码侧**，触发器是 **DB 侧持久**；代码侧缺失的窗口期 = 全部写路径阵亡（fail-closed 设计的代价面）。
3. **时序层**：`hermes update` autostash 会在「护栏代码入库前」制造这个窗口期；不提交 = 下次 update 再炸一次。
4. **进程层**：修复提交 ≠ 修复生效——**滞留旧代码的进程继续故障**，必须重启加载。

## 修复动作清单（可复用 runbook）

```bash
# 1. 确认磁盘代码已修（修复已提交？）
git -C ~/.hermes/hermes-agent log --oneline -1   # 找 guardrail commit
grep -n 'register_write_sanction_udf' ~/.hermes/hermes-agent/hermes_cli/kanban_db.py

# 2. 找出滞留旧代码的进程（启动时间早于修复 commit 时间）
ps aux | grep 'gateway run' | grep -v grep

# 3. worker 空窗确认后重启（launchd 管的 kickstart；裸的 kill + 后台重拉）
launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-orchestrator
# [已移除] 裸进程: kill <pid> → 等锁释放(lsof .dispatcher.lock 为空) → terminal(background=true) 拉 gateway run

# 4. 验证链路：dispatcher spawn 非零 + 卡转 running
tail ~/.hermes/profiles/[已移除]-orchestrator/logs/gateway.log | grep 'dispatcher.*spawned'
```

## 新增教训（skill 已同步）

- **TUI 会话的 kanban_* 工具故障时，CLI 通道（`hermes kanban --board <slug> ...`）是合法恢复路径**（terminal 子进程无 delegate 标记 → 护栏放行）。注意必须带 `--board`：会话 env 默认 board=default=根库（根库陷阱叠加）。
- **CLI comment/complete/specify 可能挂在通知钩子上**——长命令永远加 timeout；complete 卡住时先查 DB 是否已生效再决定重试。
- **triage 卡必须走 `specify` 出口**（promote 只认 todo/blocked；kanban_complete 对 triage 报 unknown id）。
- 数据侧无法绕过 UDF 检查（claim 的 INSERT 无论数据如何都撞触发器）——**别在数据侧空转，直接修进程**。
- 后台进程用 `terminal(background=true)` 承载；裸 `nohup &` 会被本工具会话回收。

## 关联

- 根库陷阱 / triage 死锁：`kanban-task-pickup-diagnosis`
- gateway 重启姿势（SwarmStudio/launchd/kickstart）：`hermes-gateway-operations`
- 09-01 原始事故：`2026-09-01-evals-incident.md`（本次是其 R1+R2 护栏的时序后果）
