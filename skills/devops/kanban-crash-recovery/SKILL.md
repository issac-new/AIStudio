---
name: kanban-crash-recovery
description: Use when kanban worker crashes mid-task or retries exhaust.
---

# Kanban Worker 崩溃恢复（写入已落盘场景）

> 来源：2026-09-04 t_313de14a 实例——run20 写入 6 项全部落盘后崩溃于验收阶段，run21 重试又异常退出，重试耗尽显示「已放弃」，orchestrator 外部分级验收后亲自 complete 收口。

## 处置流程

1. **kanban_show(task_id)** 读 events：crashed 事件前的 heartbeat note = 写入进度快照（判断写到了哪一步、还差什么）。
2. **search_files/grep 核验目标文件**是否已有本任务条目——搜任务 body 中的关键原话锚点（如日期标题、原话金句、里程碑关键词）。
3. 三分支：
   - **已写入且完整** → 不重写。外部分级验收通过后，orchestrator 亲自 kanban_complete，metadata.crash_recovery 注明 run 序列与验收结论。
   - **部分写入** → patch 定点补缺项，勿整段重插。
   - **完全未写入** → 正常等重派，无需干预。
4. **卡片仍在自动重试中** → kanban_comment 留防重留言给重试 worker「先 grep 查重，已存在只验收不重写；同一 X 条目出现两份 = 任务失败」。
5. **重试耗尽显示「已放弃」但写入已落盘** → orchestrator kanban_complete 收口（卡片可正常 complete，owner=worker 不阻碍 orchestrator 收口）。

## 外部分级验收清单（不满足则不收口）

- [ ] 条目数恰为预期值（防重复）
- [ ] 章节归属正确（防错位）
- [ ] 相关表行数各 1 条（防漏插）
- [ ] 任务 body 关键原话锚点 grep 命中（防缩改）
- [ ] 文件总行数变化合理，结构未破坏

## 红线

- 同一条目出现两份 = 档案污染 = 任务失败。任何增量写入（含重试 worker 的写入）前必须查重。
- 卡片状态显示「放弃」≠ 工作未完成。以磁盘实际内容为准，不以卡片状态为准。
- 验收工具用 hermes_tools.terminal 跑 grep（多次出现次数用 grep -c），比 search_files 更精确判重。