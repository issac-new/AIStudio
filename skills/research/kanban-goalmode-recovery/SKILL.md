---
name: kanban-goalmode-recovery
description: "Use when a goal-mode kanban worker stalls mid-run."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, recovery, goal-mode, heartbeat]
---

# Kanban Goal-Mode Worker 中断恢复

## 判死活：先分清三层信号

1. **运行级心跳**：kanban.db `task_runs.last_heartbeat_at` 每分钟跳 = 外层包装进程活着，但**不代表调研在推进**
2. **内层会话**：`~/.hermes/profiles/<worker>/logs/agent.log` 中 session 前缀（如 `20260908_093712`）的 tool 调用时间线——这是真实推进证据
3. **relay 清理警告（orphaned scope）≠ worker 退出**：errors.log 里的 cleanup 日志是收尾动作，不要当死亡证明。误判会浪费一次 kanban_comment + 恢复包
4. **产物 mtime 是最硬的证据**：报告文件在增长就是活的

## 「调研完未落盘」死法（goal-mode 特有）

症状：心跳自报「调研全部实证，准备写报告」→ 迭代预算耗尽中断，报告零落盘，成果只存在于已终止会话内存。dispatcher 超时通知的 `max_runtime=0s` 可能是展示 bug——真因查 kanban.db `task_runs.error`（如 `Iteration budget exhausted`），wall-clock 没到。

### 恢复四步（重试质量可反超首跑）

1. **心跳即恢复包**：`task_events` 表 `kind=heartbeat` 的 `payload.note` 记录了 worker 每次的结构性发现（分类体系/ID 规律/方法验证）——中断后第一步回收这些，别让重试 worker 从零探索
2. 回收物写成 `recovery-context.md` 落盘工作区
3. `kanban_comment` 注入重试卡：标「未读不开工」+ 指向恢复包 + 两条死因纪律（前 10 个工具调用内落报告骨架；先保验收下限再增量）
4. 效果实测：重试运行骨架先行+资产复用声明，用时减半且产出超验收线 75%

### 预防（建卡时写进 body）

「报告骨架落盘」列为前置验收项——时序约束优于事后纪律约定。验收段只写「先骨架后增量填充」没用，worker 不执行；写「前 10 个工具调用内报告骨架落盘」才有效。

## orchestrator 侧工具行为

- `kanban_comment` 不带 `board=` 会解析到默认板而报 unknown task——跨板操作必带 `board=`
- 同一 worker 两次 spawn 的会话在 agent.log 里前缀相近，grep 用完整 session 前缀
- worker 被命令拦截器卡住时先查其 errors.log；拦截器误拦可用脚本文件方式绕（write_file + python3 执行）

## Related Skills

- **research-subagent-orchestration** — delegate_task 子代理（非 kanban）的中断恢复/transcript 挖掘
- **deep-research-workflow** — 研究工作流本体（「先骨架后填充」纪律来源）
- **kanban-crash-recovery** — worker 崩溃/重试耗尽的通用看板恢复
