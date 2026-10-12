# Ready 卡堆积时的官方 CLI 手动分派（补充 orchestrator-scheduling-audit / cli-reference）

触发：审计发现 ready 卡长期无 worker_pid、无独立 dispatcher 进程消费。

## 步骤（官方 CLI，禁裸 SQL UPDATE）

1. `hermes kanban --board <slug> dispatch --dry-run --json` — 先确认本次会 spawn 哪些 ready 卡（不改状态）；`spawned` 数组含目标 workspace。
2. `hermes kanban --board <slug> dispatch --max 1 --json` — 逐张真分派。
3. SQLite 只读验证：`SELECT status||'|'||ifnull(worker_pid,'-') FROM tasks WHERE id='<task_id>';` — 必须 `running|<pid>` 才算接住；仅 spawn 声称成功 ≠ 真跑起来。

## 判读

- 停留 ready 无 pid = dispatcher 侧未接住，再查 gateway / dispatcher 服务，不重复 dispatch。
- 父卡仍 triage/blocked 时实现子卡被父依赖 gate 住，强制分派只起链头卡。

## 坑

- **`--board` 必须在子命令之前**：`kanban --board swarm dispatch` ✓；`kanban dispatch --board swarm` ✗ — dispatch 子命令不接收 --board，报 unrecognized arguments。
