---
name: goal-card-budget-recovery
description: "Use when a goal-mode kanban card dies on iteration budget."
version: 1.0.0
metadata:
  hermes:
    tags: [kanban, goal-mode, iteration-budget, recovery, re-dispatch]
    related_skills: [kanban-orchestrator, kanban-crash-recovery, research-subagent-orchestration, deep-research-workflow]
---

# Goal 卡迭代预算耗尽：恢复包与预防

## 触发条件

- kanban 卡超时通知（文案可能是 `timed_out (max_runtime=0s)`——这是展示误报）
- `task_runs.error` 实际为 `Iteration budget exhausted (90/90)`
- 重试已由 dispatcher 自动派发，需要决定如何让重试不重蹈覆辙

## 恢复包注入（dispatcher 重试前/后立即做）

1. **盘点已落盘工件（先于一切）**：
   - 调研卡：`task_events` 表 `kind=heartbeat` 的 `payload.note` —— worker 每次的结构性发现都在这里（分类体系、ID 规律、方法验证）
   - 修复/根治卡：工作区 `ls`、源码树 `git diff --stat`、patches 目录新文件、取证/探针脚本目录
   - 双保险：超时前最后几分钟的写入往往成功（postmortem 在超时前 2 分钟落盘的判例）
2. **恢复包写成文件**（`recovery-context.md` 落盘工作区），内容=回收的结构性成果
3. **`kanban_comment` 注入重试卡**（board 参数必须显式传），三段式：
   - 「勿重复 X」——点名已完成的阶段（定位/采集/根因分析），禁止重做
   - 已落盘工件清单——绝对路径逐条列出
   - **编号收尾清单**——每项一轮以内的可执行动作（跑测试 → 导出 patch → 贴回归证据 → complete）
4. **效果基线**：照此办理的重试，一例 27 分钟完成且产出超验收线 75%，一例把 90 轮的剩余工作压成纯收尾

## 预防（建卡时写进 body，优于事后恢复）

凡 frozen 验收同时要求「深度调查」和「书面交付物 + 回归验证」的 goal-mode 卡：

- body 里写明**迭代预算分配**：调查/采集 ≤X 轮，交付与收尾 ≥Y 轮（两例事故共性：定位阶段吃掉 90 轮大头，收尾轮空）
- body 里写**编号收尾清单**：跑测试 → 导出 patch → 贴回归证据 → complete——任何一次重试照单执行即是纯收尾
- 「报告骨架落盘」设为前置验收项（时序约束优于事后纪律约定）：前 10 个工具调用内先落骨架，此后边采边写

## 判定真因

`max_runtime=0s` 是展示 bug。真因查询：
```sql
SELECT outcome, error FROM task_runs WHERE task_id='<id>' ORDER BY started_at DESC LIMIT 1;
-- Iteration budget exhausted → 本 skill
-- 真正 wall-clock 超时 → 缩 scope 或加预算，不是恢复包问题
```

## 相关

- `kanban-orchestrator` — goal_mode 卡机制与双预算（goal_max_turns vs 迭代预算）
- `deep-research-workflow` §5 — 调研卡版死法细节
- `kanban-crash-recovery` — crash 写入已落盘场景的分级验收
