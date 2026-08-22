---
name: kanban-triage-stall-recovery
description: "triage 卡不拾取时手动 promote+验证 worker spawn。"
version: 1.0.0
metadata:
  hermes:
    tags: [kanban, triage, dispatcher, orchestration, troubleshooting]
    related_skills: [kanban-orchestrator, kanban-worker, local-skill-fusion-routing, gateway-smart-routing]
---

# Kanban Triage 卡死排查与恢复

> 2026-08-06 实例提炼：orchestrator 按 routing 规则用 `triage=True` 创建 3 个调研卡，
> 15 分钟后用户问进度才发现全部 stuck——dispatcher 不拾取 triage 状态的卡。
> "kanban_create 成功返回" ≠ "任务会执行"。

## When to Use

- 用 `kanban_create(triage=True)` 创建任务后需要它真正被执行
- 用户问"子任务进度如何"但看板显示任务从未启动
- 排查"卡创建了但 worker 一直没跑"类问题
- 需要对 kanban DB 做原始 SQL 操作（多 board 路径、schema 差异）

## 核心事实

| 状态 | dispatcher 行为 |
|------|----------------|
| `ready` | 正常拾取并 spawn worker |
| `todo`（有未完成 parent） | parent 全 done 后自动 promote 到 ready |
| `triage` | **永不拾取**——triage 是给 specifier 工作流用的（specifier profile 先补全 body 再开工），无 specifier 时卡死 |

## 标准恢复流程

### 1. 定位正确 DB

多 board 部署下，卡落在 `kanban_create(board=...)` 指定的 board 库，**不在根库**：

```bash
# 根库（常常为空）
~/.hermes/kanban/kanban.db
# 各 board 库（卡实际在这里）
~/.hermes/kanban/boards/<board>/kanban.db
# 当前 board 指针
cat ~/.hermes/kanban/current
```

找不到卡时**遍历所有 board 库**，别只查根库或 current board。

### 2. Promote triage → ready

```bash
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "UPDATE tasks SET status='ready' WHERE id='<tid>' AND status='triage';"
```

⚠️ **tasks 表无 `updated_at` 列**（schema 里是 `created_at`/`started_at`/`completed_at` 等 INTEGER 时间戳），写进 UPDATE 会报 `no such column: updated_at`。

### 3. 验证 worker 真的 spawn（关键，不可省）

promote 后等 ~15s，确认 dispatcher 已拾取：

```bash
sleep 15
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "SELECT id,status,worker_pid,started_at FROM tasks WHERE id='<tid>';"
# 期望：status=running 且 worker_pid 非空
```

只有验证到 running + PID 后，才能向用户报告"已启动"。批量 promote 时逐卡验证。

### 4. dispatcher 活性排查（worker 没被 spawn 时）

```bash
# dispatcher/gateway 进程
ps aux | grep -iE 'hermes.*(dispatch|kanban|gateway)' | grep -v grep
# config 里 dispatcher 是否显式启用（not set ≠ 不跑，看进程为准）
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/config.yaml')); print(c.get('kanban',{}).get('dispatcher',{}))"
# worker 日志（按时间排，新 spawn 应有新日志）
ls -lt ~/.hermes/kanban/logs/t_*.log | head -5
```

## 预防：创建时就避免卡死

按优先级选一种：

1. **省略 `triage` 参数**（推荐）——routing 规则要求 triage 语义时，创建后立即按上面 §2-3 promote+验证，把"promote+验证"当作 triage 创建的必要后置步骤
2. 用 `initial_status="running"` 让 dispatcher 直接按正常流程 spawn（跳过 triage）
3. 若确实需要 specifier 先补 body：确认有 specifier profile 在看该 board，否则 triage 就是死胡同

## 排查 checklist（用户问进度时）

1. 查卡的 `status`/`worker_pid`/`started_at`（遍历所有 board 库）
2. status=triage 且无 specifier → 卡死，走 §2-3 恢复
3. status=ready 长时间无 PID → dispatcher 不活，走 §4
4. status=running → 看 worker 日志 `tail ~/.hermes/kanban/logs/t_<id>.log` 和产出物文件是否存在

## Pitfalls

- **只查根库报"卡不存在"**：卡在 board 子库，根库 `~/.hermes/kanban/kanban.db` 通常不含业务卡。
- **UPDATE 带 updated_at**：tasks 表无此列，报错后 UPDATE 未生效，status 仍是 triage——易误判为"已 promote"。
- **promote 后不验证就向用户报"已启动"**：dispatcher 可能不活，卡 promote 到 ready 后依然不跑。验证到 running+PID 才算数。
- **triage 与 ready 混用**：一批卡里部分 triage 部分 ready，用户看到的"部分在执行"不代表全部健康，逐卡查 status。
