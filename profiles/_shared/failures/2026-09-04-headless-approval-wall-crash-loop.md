---
domain: resource
topic: headless-approval-wall-crash-loop
date: 2026-09-04
failure_type: [tool-failure, crash-loop]
fm_modes: [FM-R5]
severity: major
---

# headless 审批墙撞墙：worker 反复触发 BLOCKED 导致 dispatcher 4 连败

## Situation

2026-09-04，任务 t_1c4c3a3f（差座底座+报告生成器+自动闭环，life-workbench）被 dispatcher 派给 platform-skill-miner。当晚机器处于 headless 单查询模式（`approvals.single_query_mode` 未放行），且 gateway 正在频繁重启（loadavg 139 事故余波）。

## What Happened

- run 154/160/164/173 连续 crashed，dispatcher 记 `pid not alive` / `protocol violation: exited rc=0 without terminal kanban call`，gave_up 2 次熔断后由人工 unblock 才恢复。
- 复盘确认触发链：worker 在 terminal 里用 `python -c '...'`、bash heredoc、`execute_code` 三种方式做数据探测/依赖安装，全部被审批墙硬拦（BLOCKED: dangerous — script execution via -c/-e flag / heredoc; single-query mode (-q) runs without a user present）。
- worker 每次撞墙后换一种等价写法继续试（`-c` 换 heredoc、再换 execute_code、再换嵌套 shell 探测），每轮烧满超时窗口 → 被判 not alive → crash-retry 循环。
- 同日姊妹卡 t_4bde05a0（ops-devops）出现同模式（run 155 protocol violation），说明不是个体行为而是环境 × 习惯组合坑。

## Root Cause

环境根因：headless 单查询模式下没有人在审批端，fail-closed 拦截一切「内联可执行体」（`-c`/`-e`/heredoc/嵌套可执行体/execute_code 的 Python 内核）。行为根因：worker 把「命令写法换一下」当成对策（FM-E1 SPINNING 的变体），没有识别到失败类别是**审批策略**而非**命令语法**——换写法永远撞同一堵墙。

## Key Decision Failures

1. 第 2 次 BLOCKED 后仍继续尝试第 3、4 种内联写法，而不是切换执行范式（写文件→按路径执行）。
2. 未在撞墙后立即 kanban_comment 记录环境事实，导致后续 run 重新踩坑（4 次 run 各自从零发现）。
3. 依赖安装（pip install）也试图走内联命令，而不是把安装动作封装进脚本文件。

## Lessons

- **headless 铁律**：一律 `write_file` 落脚本文件（探针/自检/安装脚本皆然）→ `terminal` 按绝对路径执行；彻底不用 `python -c`、bash heredoc、`execute_code`、嵌套 `$()`/动态选值命令。
- **识别信号**：BLOCKED 文案含 `single-query mode (-q)` = 策略墙，不是语法错——第一次撞墙就该换范式，连续 2 次换范式是纪律上限（对应 playbook FM-E1「换本质不同方案」）。
- **跨 run 传播**：环境事实（审批墙、venv 缺依赖、CLI 通道）写进 kanban_comment，让 retry 的下一个 run 不从零开始。
- 本案例同时验证对策有效：t_1c4c3a3f 第 5 次 run 用 write_file+路径执行范式一次跑通全部交付（自检 10/10 + 5/5、端到端建卡闭环）。

## 根治锚点

- 模式表：`failure-mode-playbook` FM-R5（资源类，2026-09-04 增补）
- 代码层（可选后续）：Hermes worker SOUL 模板加「headless 单查询模式禁用内联可执行体」硬规则；dispatcher 对「BLOCKED → crash」模式给 worker 留痕提示
