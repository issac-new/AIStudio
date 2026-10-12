---
name: kanban-goal-card-recovery-orch
description: Use when a goal-mode kanban card dies on iteration budget.
tags: [kanban, goal-mode, recovery, orchestrator]
---

# Goal 卡死法归因与恢复（orchestrator 本 profile 副本）

> 本 profile 的 skill_manage 拒写 default profile 的 devops/goal-card-budget-recovery（三连拒实证）——按落位规则在自有目录维护本域副本。恢复包三段式机制以 default 原件为准；本文件补的是原件没有的**二次归因**纪律。

## 触发条件

- kanban goal-mode 卡 blocked：`Iteration budget exhausted (N/N)` 或 `max_runtime=0s`（展示误报，真因查 task_runs.error）
- 通知文案含 `Last judge verdict: <错误>` —— 归因分流的关键线索

## 恢复五步（先归因，再注入）

### ① 查真因

```sql
SELECT outcome, error FROM task_runs WHERE task_id='<id>' ORDER BY started_at DESC LIMIT 1;
-- Iteration budget exhausted → 继续 ②
-- 真正 wall-clock 超时 → 缩 scope 或加预算，不是恢复包问题
```

### ② 二次归因——查 task_events 的 judge verdict 流（缺这步会误诊）

- **judge 限流白烧**（task_events 连续 `judge error: RateLimitError`，verdict 被强制 continue）：judge 不可用 ≠ worker 未完成——轮数被基础设施烧掉，worker 死前进度往往已近完成。恢复包标准三段式即可收敛，但「勿重复 X」段要强调**已完成工作有效**；预防不是加预算（worker 没失控），而是发现连续 judge 错误时及早介入重派，不等熔断白烧到底。
- **worker 定位失控**（verdict 正常 continue 但阶段无实质进展）：这才是「body 写迭代预算分配 + 骨架前置」预防项的适用场景。

归因看证据不看文案：同为 budget exhausted，两种成因的恢复侧重与预防手段完全不同。

### ③ 盘点死前进度（先于一切注入）

- task_events `kind=heartbeat` 的 payload.note（worker 的结构性发现都在这）
- 工作区 `ls` / `git diff --stat` / patches 目录新文件 / 恢复包后 worker 新落盘文件
- 超时前最后几分钟的写入往往成功——逐个验存在再入清单

### ④ 恢复包写成文件落盘工作区（recovery-context.md）

### ⑤ kanban_comment 注入（board 参数显式传）

三段式：勿重复 X（点名已完成阶段）/ 已落盘工件清单（绝对路径逐条）/ 编号收尾清单（每项一轮内可执行：跑测试→贴回归证据→complete）。

## 收口失能类：活干完了、终态写不进去（orchestrator 代收尾+归档）

预算耗尽之外的第三种死法：worker 已完成实质工作（证据在 comment/工作区），但终态转移失能——`rc=0` 未调 complete、验收 gate 模块被 update 洗掉、terminal 写入被拒。处置顺序：

1. **先修失能的机制层**：被洗的 gate/guard 模块从 overlay patch 注册件恢复（py_compile + import + 全部调用点三点验收），不是绕过它收尾。
2. **独立复核后代收尾**：对照卡 body 验收项逐条实测，缺项 orchestrator 补跑，`kanban_comment` 留收尾记录（谁验的、验了什么、证据在哪）。
3. **立即 `kanban archive`**：将死或已代收尾的卡留在 blocked/ready 会被 dispatcher 反复重拾；叠加坏 workspace_path 时每轮 spawn 都白烧预算。归档是止血，不是惩罚。
4. **spawn 失败循环先查路径**：连续 `File exists` 类 spawn 报错先核对 workspace_path 是否 symlink 前缀（见 kanban-workspace-durability），修真实路径再重派。

## 相关

- default profile `devops/goal-card-budget-recovery` — 恢复包三段式原件与效果基线
- `kanban-orchestrator` — goal_mode 卡机制与双预算
