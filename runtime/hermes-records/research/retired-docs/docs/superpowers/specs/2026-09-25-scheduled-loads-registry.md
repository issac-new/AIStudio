# 调度负载唯一登记台账

日期：2026-09-25
状态：生效（边界设计 §6-T3 交付物）
规则：**一负载一登记处**。任何"按时间自动触发动作"的负载上线前必须先在本表登记（谁触发、间隔、数据登记在哪、与谁互斥）；重复登记同一负载即为双调度缺陷。退役负载标注退役原因，不删行（审计留痕）。

## 负载清单（2026-09-25 全量盘点）

| # | 负载 | 触发者 / 间隔 | 数据登记处 | 边界备注 |
|---|---|---|---|---|
| L1 | gateway cron jobs | hermes InProcessCronScheduler 60s tick（`cron/scheduler_provider.py`）| `~/.hermes/cron/jobs.json`（单写者=hermes cron CLI，patch 411） | 与 L4/L5 禁止同负载双登记 |
| L2 | misfire 兜底 | gateway housekeeping 每 5 tick ≈ 300s（`gateway/run.py`） | 同 L1 | L1 的补偿通道，非独立负载 |
| L3 | gateway housekeeping | 60s/轮（runtime 心跳/投递排空/媒体/ticker 监督/curator/state.db 维护/checkpoint prune 分频） | gateway_state.json、state.db | 基础设施，不承载业务负载 |
| L4 | loop run 发起（RunSpawner） | 30s poll 到期 idle loop → compile → startRun（`loop/graph/run-spawner.ts`） | `.loop/STATE.json` / PG / Matrix 三态 | loop run 负载唯一发起点；legacy Scheduler（见 #L5）退役候选。**T3b 桥接（2026-09-25）**：`LOOP_SCHEDULER=cron` 时不启内部 interval，改由 hermes cron no-agent 脚本每分钟回调 `/api/loop/cron-bridge/tick` 驱动 poll——同一时刻只有一个 timer 生效（spec：2026-09-25-loop-cron-bridge-design.md） |
| L5 | loop run 发起（legacy Scheduler） | 每 loop cron `setTimeout`（`loop/engine/scheduler.ts`） | 同 L4 | 与 RunSpawner 二选一由 GRAPH_ENGINE 分流（缺省 legacy→本项；on→L4），同一时刻只有一个生效 |
| L6 | daily-brief | 30s poll + cron `0 9 * * *`（`loop/graph/daily-brief.ts`，LOOP_BRIEF_CRON） | graph-events.db `run.started` 水位 | 与 L1 禁止重复登记日报类负载 |
| L7 | interrupt 超时扫描 | 30s（`loop/graph/interrupt-timeout.ts`；72h 超时/24h 重发） | loop 事件日志 | L3 同类辅助扫描 |
| L8 | shadow-runner | 30s（仅 GRAPH_ENGINE=shadow） | graph-shadow.db + shadow-report.jsonl | 影子模式专用，无副作用 |
| L9 | kanban watcher | `hermes kanban watch` 子进程 per board + 60s reaper（`loop/kanban-overview.ts`） | kanban.db | 只读观察+通知，不改任务状态 |
| L10 | kanban daemon/dispatch | `hermes kanban daemon` 60s（`kanban_ops.py`） | kanban.db tasks | 任务执行派生唯一通道 |
| L11 | session heartbeat | gateway 单例 poller 5s（`gateway/run_goals.py`/`heartbeat.py`） | state.db | 常驻目标验收 |
| L12 | goal / loop wakeup | 常驻扫 SessionDB `loop:*` + goal 每 turn judge | state.db | 常驻目标 |
| L13 | fleet-events | 1.5s tick WS 推送（`loop/fleet-events.ts`） | 无持久登记（内存快照） | 纯展示 |

## 退役/候选区

| 负载 | 状态 | 处置 |
|---|---|---|
| CentralizedScheduler（`loop/engine/centralized-scheduler.ts`） | 退役候选：生产零接线，仅测试消费 | 新代码禁止引用；测试随 RunSpawner 语义迁移完成后删（代码内已加退役头注） |
| 每日 0:00 复跑 crontab（推演期） | 已退役（2026-09-25 删除） | P2 人工驱动，禁止重建 |

## 与其它台账的关系

- 负载的数据写权见《三系统能力边界设计》§2 归属终表（jobs.json/kanban/记忆各有单写者）。
- 跨集群不设共享 job：跨机工作由 owner orchestrator 经 Matrix 协议派工（分布式设计 §6），各机只跑本机负载。
