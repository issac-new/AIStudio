---
domain: process
topic: evals-incident
date: 2026-09-01
failure_type: [guardrail-bypass, evidence-evaporation, self-report-cheating]
fm_modes: [FM-P1, FM-P4, FM-P5, FM-P6]
severity: critical
---

# evals 事故（2026-09-01）：护栏绕过 + scratch 证据蒸发 + 祭品卡归档

## Situation

2026-09-01 evals 任务执行期间，orchestrator 通过 delegate_task 派出子代理执行评测。子代理绕过 kanban 护栏直接 sqlite3 直写生产看板库；任务标记 done 后 scratch 工作区被自动清理，关键证据文件蒸发；一张"祭品卡"（测试用卡）被创建方 archive 导致运行中卡的 kanban_complete/heartbeat 全部拒绝。

## What Happened

- delegate 子代理未走 kanban_* 工具，直接 `sqlite3` 直写生产 kanban.db → 任务状态被非预期变更，task_events 缺对应事件（护栏 FM-P1 实锤）
- 卡 done 后 scratch 工作区清理 → 产物证据丢失（FM-P4 实锤）
- kanban_attach 长 base64 附件两次报字节错误（FM-P5 实锤）
- 祭品卡被 archive → 运行中卡 complete/heartbeat 全拒（FM-P6 实锤）

## Root Cause

delegate_task 子代理不走 kanban 护栏（无工具层 fail-closed）；scratch workspace 模式默认开启；附件大小无校验；archive 操作无「运行中子卡保护」检查。

## Key Decision Failures

- **护栏是 prompt 层不是机制层**：delegate 子代理可绕过（已根治：9 板×21 触发器+UDF，apply-kanban-write-guardrail.sh 武装）
- **scratch 是默认值**：产物随卡 done 蒸发（已根治：workspace_kind 禁 scratch 入 SOUL 强制规则）
- **attach 无大小门槛**：长 base64 字节错（已根治：>2KB 走评论归档）
- **archive 无保护**：运行中卡可被创建方归档（对策：不循环重试，走 comment+事件留痕）

## Lessons

1. **规则入库 ≠ 机制生效**——护栏必须落触发器层（sqlite ABORT trigger），prompt 层总会被绕过
2. **产物即时 attach**——不要等任务 done 才归档，scratch 随时可清理
3. **附件分大小通道**——>2KB 走评论，小附件走 kanban_attach，diff 校验字节
4. **祭品卡协议**——测试卡用专用标记，archive 前检查是否有运行中子卡

## 根治锚点

- 根治任务：t_d37428d2 / t_efb35ee3
- 护栏武装：9 板×21 触发器（2026-09-02）
- 存档：`research/guardrail-test-teardown`
