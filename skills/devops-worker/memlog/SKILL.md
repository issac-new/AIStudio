---
name: memlog
description: "append-only 盲写记忆日志：一行一条、只追加、无状态位、写时不回读。用于 kanban 长任务/多轮 run 的跨会话事实来源与恢复。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, memory, append-only-log, kanban-recovery, bmad-fusion]
    related_skills: [kanban-worker, hindsight, evidence-based-retro]
---

# Memlog（Append-Only 盲写记忆日志）

> 来源：BMAD-METHOD v6 `memlog.py` 的不变量设计（append-only / blind-write / no-status-flag），适配 Hermes kanban 任务工作区。
> 定位：**执行中防线**——kanban 任务跨 run/跨会话恢复的事实来源，补足 hindsight（长期记忆）与 session_search（会话检索）之间的"任务内工作记忆"空档。

## 触发条件 / When to Use

- kanban 任务预期多轮 run（goal_mode / 长任务 / 可能被 reclaim）
- worker 需要在 run 之间传递"我做到哪了、下一步是什么"而不依赖 LLM 记忆
- 证据驱动 retrospective 需要完整事件轨迹时

## 核心内容

### 1. 五条不变量（BMAD 原设计，一字不改）

| # | 不变量 | 理由 |
|---|---|---|
| 1 | **一行一条**：每条事件单独一行，含时间戳 | 机器可解析，grep/tail 友好 |
| 2 | **只追加**：绝不修改/删除历史行 | 历史不可篡改，审计可信 |
| 3 | **盲写**：写时不回读文件内容 | 避免 LLM 被自己的历史污染决策 |
| 4 | **无状态位**：完成/阻塞本身作为 event 条目记录，不设"当前状态"字段 | 状态由读者从事件流推导，不写者维护 |
| 5 | **原子写**：先写临时文件再 rename | 防崩溃半行 |

### 2. 事件格式

```
[2026-08-06T11:45:23] <event-kind> | <payload>
```

event-kind 枚举：`start` / `finding` / `decision` / `file-created` / `file-patched` /
`test-run` / `block` / `resume` / `complete` / `note`

示例：
```
[2026-08-06T11:40:12] start | run_id=12 task=t_25432cc9
[2026-08-06T11:42:03] finding | bmad-report: 17 portable capabilities, 4-line classified
[2026-08-06T11:50:44] file-created | ~/.hermes/skills/devops/scale-adaptive-routing/SKILL.md
[2026-08-06T11:55:01] test-run | pytest tests/test_x.py → 8 passed
[2026-08-06T12:01:30] block | kind=needs_input reason="缺 API key"
[2026-08-06T12:30:05] resume | run_id=13, last-event=block@12:01
```

### 3. 落盘位置

- kanban 任务工作区：`$HERMES_KANBAN_WORKSPACE/.memlog.md`
- 跨 run 持久：workspace_kind=dir/worktree 时文件随工作区存活；scratch 工作区在
  `kanban_complete` 时把 .memlog.md 作为 artifact 上传

### 4. 读写协议

**写**（任何时候）：
```bash
echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] <kind> | <payload>" >> "$HERMES_KANBAN_WORKSPACE/.memlog.md"
```
写时**不 cat、不 tail、不 grep** 这个文件——盲写。

**读**（仅两个时机）：
1. **resume 时**：新一轮 run 开始，`kanban_show` 之后 `tail -50 .memlog.md` 恢复上下文
2. **retrospective 时**：任务收尾，通读全文做证据驱动复盘（见 `evidence-based-retro` skill）

### 5. 与 kanban 状态机的关系

- memlog 是**任务内**事件流；kanban DB 是**任务间**状态机
- `kanban_block` / `kanban_complete` 是状态转换，同时记一条 memlog event
- memlog 不替代 kanban comment（comment 是给下游的结构化交接；memlog 是给自己的工作记忆）

## 与其他 skill 的联动

- `kanban-worker`：worker 标准循环增补"start/resume 时 memlog，关键事件 memlog"
- `evidence-based-retro`：retrospective 的事实来源
- `hindsight`：memlog 是任务内短期记忆；跨任务长期事实仍走 hindsight_retain
- `loop-engineering-gates`：kanban_complete 前的 memlog 审计作为 finalize 第一步（BMAD C3）

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| `$HERMES_KANBAN_WORKSPACE/.memlog.md` | 落盘位置 |
| `kanban_show` 后 | resume 时 tail 恢复 |
| `kanban_block` / `kanban_complete` 前 | 各记一条 event |
| `kanban_complete(artifacts=[...])` | scratch 工作区把 .memlog.md 上传为 artifact |
