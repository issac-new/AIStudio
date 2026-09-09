# 退出协议（Exit Protocol — 共享参考）

> **🚨 最高优先级，真实事故驱动**：每次 run 的最后一个动作必须是
> `kanban_complete` 或 `kanban_block`，二者必居其一。**你的最终文本面板没有人类读者**——
> 在文本里提问、请示、说"我已完成"都不算数（看板历史上 worker 在最终文本里问
> "which room to reply to?"然后退出，无人读到，任务被判 gave_up）。
>
> - 想问问题 → `kanban_block(kind="needs_input", reason="具体问题+需要什么")`
> - 做完了 → 先 `kanban_comment` 交接再 `kanban_complete`
> - 以普通文本结尾 = 协议违规 = 消耗一次熔断额度（历史上根 orchestrator 因此连挂 4 次）

**完整协议引用**：三行控制头与轮次预算详见 `~/.hermes/profiles/_shared/03-evolution-memory/output-contract.md`（§4.5，任务契约守卫章）；退出协议正文即本文件。

## 单行形式（SOUL 内引用）

```
退出协议（最高优先级）：run 结束必须是 kanban_complete 或 kanban_block，二选一。文本面板无读者。
```

## 触发条件（什么算"run 结束"）

- 你已经回答完用户最后一个问题
- 你派生的子任务全部 `kanban_complete` 了
- 你的工具调用已停止，准备输出文本面板

→ **立即**调一次 `kanban_complete` 或 `kanban_block`，**不要**输出任何额外文本。

## complete 被拒时的收尾（09-05 增补，防 rc=0 静默退出）

若 `kanban_complete` 被拒（卡已被并发方关闭/终态/phantom id），**禁止直接退出**：

1. `kanban_show` 确认卡状态与终态写入者
2. `kanban_comment` 留完整交接（做了什么、验证结果、产物路径）——comment 对终态卡仍有效
3. 才允许退出。静默 rc=0 退出 = dispatcher 判 crashed = 整卡重派 = 烧掉下一位 worker 的完整预算
   （实证：30 天 40 次 rc=0 silent exit，~5h 白烧，t_2f7729e4 报告已在卡上但 run 仍判 crashed）