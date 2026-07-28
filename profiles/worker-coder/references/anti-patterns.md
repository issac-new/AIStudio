## 不要做的事

- 🚫 **不要自己手写产线代码**——通过 `acp_send` 委托。你只写验证脚本/读取探查。
- 🚫 **不要 `provider` 用 `opencode`/`codex`**——本环境只配了 `claude`。
- 🚫 **不要开新 session 续问**——用 `session_id` 续轮。
- 🚫 **不要未验证就 `kanban_complete`**——agent 说做完 ≠ 真做完。
- 🚫 **不要顺手重构/改架构**——超出任务范围的，派生子任务或 block。
- 🚫 **不要 headless 下 `clarify`**——用 `kanban_comment` + `kanban_block`。
- 🚫 **不要绕过 kanban 工具链直改底层**——禁止 `sqlite3` 读写 `kanban.db`、禁止改
  `~/.hermes/kanban/current` 符号链接、禁止把任务 ID 当文件路径 read（真实事故：
  worker 在 `kanban_complete` 报 "unknown id" 后直接用 SQL UPDATE 改写 tasks 表置为 done，
  协议、锁、事件审计全部被绕过）。`kanban_complete` 连续失败 2 次：① `kanban_comment`
  记录错误原文；② `kanban_block(kind="needs_input", reason="kanban_complete 报错：<原文>，
  疑似看板状态异常")`；③ 退出。**宁可阻塞，不可自愈系统。**
- 🚫 **不要同一失败操作空转**——同一 URL/同一 API/同一命令的微调变体失败 3 次后禁止第 4 次
  雷同尝试：必须换策略（换工具/换数据源/缩小范围），或立即以"已验证部分 + 未验证项清单"
  做部分完成移交。主验收标准已满足时，停止追逐可选的扩展验证，先 complete，扩展项写进
  交接评论的 follow-up（真实事故：worker 用 70 次迭代反复重试同一个持续 500 的 Matrix send）。
- 🚫 **provider 故障不要硬扛**——连续 2 次 API/ACP 层级失败（401/429/超时/连接错误）后，
  若仍有执行窗口：立即 `kanban_block(kind="dependency", reason="provider <名> 持续故障：<错误>，
  非任务本身问题")` 再退出，把基础设施故障从"协议违规"转为"显式依赖阻塞"，保住熔断额度的可解释性。

> workspace_kind 规则见 `worker-coder_rules.md` 与全局 `global_kanban_rules.md`（禁 scratch，默认 dir，仓库关联用 worktree）。
