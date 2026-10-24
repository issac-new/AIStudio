---
name: long-session-hygiene
description: "Use when 长会话/goal-mode 卡/多轮任务的稳定性与指令遵循保障：状态外置落盘纪律、压缩后恢复、HIGH_RISK 会话收卡加严。"
version: 1.0.0
tags: [long-session, context-compression, discipline, kanban-acceptance]
---

# 长会话状态外置纪律（long-session-hygiene）

**核心原则：不信任上下文的持久性。** Hermes 内置压缩器是有损摘要（中段压到 20%，`summary_target_ratio=0.20`），多次压缩损失复合，指令约束与验收标准最先被丢。长任务的关键状态一律落盘，压缩后靠 re-read 文件恢复，不靠摘要记忆。

## When to Use

- kanban goal-mode 卡、预估 ≥40 轮的长任务
- 任何已知会经历上下文压缩的多轮会话
- 收卡验收：判断会话是否退化高风险

## 纪律（worker 侧）

1. **骨架先落盘**：任务开始前 10 个工具调用内，把「目标 / 约束 / 验收清单」写入 workspace 的 `task-state.md`。此后边做边写，不攒到最后。
2. **阶段推进即追加**：每完成一个阶段，向 `task-state.md` 追加「当前状态 + 关键产物路径 + 下一步」。
3. **压缩后恢复靠文件**：察觉上下文被压缩（或不确定早期细节）时，第一步 re-read `task-state.md` 与关键产物文件，禁止凭记忆继续。
4. **主动引导压缩**：会话变长时主动 `/compress <当前阶段目标>`，focus topic 写当前阶段——不等自动压缩随机丢。
5. **拆卡优先于加预算**：预估超 60 轮的任务应拆成 2-3 张依赖卡，而非堆轮次。

## 收卡加严（orchestrator/验收方侧）

- **HIGH_RISK 判定**：单会话压缩 ≥3 次 = 退化高风险。查询工具：`~/.hermes/bin/compression-report.py --recent 20`（T3a 产物；若未交付，用 state.db `parent_session_id` 链手工回溯）。
- HIGH_RISK 卡收卡时：worker 自述不作数，按 `worker-completion-independence-verification` 逐项机械复核验收清单；重点核对早期约束是否仍被遵守（退化最先表现为遗忘早期约束）。
- goal-mode 卡建卡时 body 必须含「迭代预算分配」（调查 ≤X 轮 / 收尾 ≥Y 轮）与「编号收尾清单」——见 `goal-card-budget-recovery` 的预防节。

## 落地命令

```bash
# 查最近 20 个会话压缩排行（HIGH_RISK = ≥3 次）
python3 ~/.hermes/bin/compression-report.py --recent 20

# 查单会话压缩链
python3 ~/.hermes/bin/compression-report.py <session_id>

# 无脚本时的手工回退（只读）
sqlite3 file:$HOME/.hermes/state.db?immutable=1 \
  "SELECT id, parent_session_id FROM sessions ORDER BY started_at DESC LIMIT 10"
```

## Related

- `context-degradation-ops` — 运行时机制速查（压缩器源码事实、决策顺序）
- `goal-card-budget-recovery` — 迭代预算耗尽的恢复包与预防（骨架落盘先例来源）
- `worker-completion-independence-verification` — 收卡独立核验手法
