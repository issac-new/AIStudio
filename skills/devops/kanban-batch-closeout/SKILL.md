---
name: kanban-batch-closeout
description: "Use when 一波派发卡需监督收尾：settle 对账+registry 守恒+canary+限流尾批+终账。"
version: 1.0.0
metadata:
  hermes:
    tags: [kanban, batch, closeout, gap-register, orchestration]
    related_skills: [worker-completion-independence-verification, orchestrator-worker-failure-triage, kanban-task-pickup-diagnosis]
---

# Kanban 批量派发卡的收尾监督

适用：一波 N 张 gap/执行卡派发后，orchestrator 监督到全部终态并出终账。单卡验收纪律见
`worker-completion-independence-verification`，worker 崩溃分诊见 `orchestrator-worker-failure-triage`，
调度/拾取问题见 `kanban-task-pickup-diagnosis`——本 skill 只管「批量」维度的程序。

## 程序

1. **派发时落 settle 映射**：卡号↔gap 条目↔assignee 的映射写进 workspace 持久层
   （如 `research/gap_settle_<date>.py`：内嵌映射 + `status` 子命令一键读全卡状态与 registry 计数）。
   禁写 scratch——24h 清理会吞掉收尾证据。
2. **ETA 用硬速率推导**：从 worker `logs/agent.log` 的 `API call` 时间戳算 calls/min，
   乘剩余工作量出区间；禁拍脑袋单点值。限流期并发帽生效时按串行化重排 ETA。
3. **registry 守恒算术（每次对账必过）**：前后两次计数满足——总数不变；
   done/dropped/open/todo 的增量之和为零（in_progress 活动项单列）。对不上=有写入丢失
   或双写，停下先对账再报告，禁带着不守恒的数字出终账。
4. **被跳过的门事后补**：worker 上游断流后直接跑完、跳过卡面规定的抽样送审门时，
   orchestrator 必须亲自补做抽样复核（判定 vs 落库一致性）才可收卡，卡上留补验记录。
5. **canary 验证端到端**：管线/门禁改造后，派 1 张真实小卡走全链
   （建卡→拾取→complete→registry 回填）逐段机械验证；门禁的阳性对照必须取 active 条目
   成对——与 done/dropped 历史条目同文本的输入常被按设计豁免（防「已实现→退回→误拒」），
   命中豁免不算门失效，换 active-active 对重测再下结论。
6. **限流尾批不干预**：429 波（账户级 code 1302，`attempt 3/3` 重试耗尽）是自愈回压——
   卡回 ready、计数归零、下个 60s tick 重派、并发帽串行化。观察 2 个 tick 确认换班轮转即收口；
   长尾卡留队列自然消化（registry/产物有落盘，零损失），勿复位熔断/切流/手改状态。
7. **终账**：registry 前后对比表 + 逐卡处置（done/归档/残留）+ 重复簇残留清单，写进父卡
   comment 与持久层报告，禁只报口头结论。

## 陷阱

- **多行 python 探测写脚本文件再跑**（write_file 落盘），不要塞 heredoc——shell/python 引号
  嵌套会静默改坏路径，撞出「库不存在」假象后才暴露。
- **库路径双事实源**：活库是根级 `~/.hermes/kanban.db`；`~/.hermes/kanban/kanban.db` 是
  0 字节占位。settle/对账脚本拼接路径后必 `stat` 验 size>0 再查；`~` 在裸环境不展开时
  用完整 expanduser 链。
- **批间重复流**：确认前一批卡身份时，「全库搜索」只扫 `kanban/**` 子树会漏根库活卡，
  把真实派发误判为幻报并重建=双流双烧。判活用 `ps aux | grep hermes_cli` 对照卡号；
  去重 = kill 重复进程 + archive 重复卡 + 验目标产物 mtime 早于被杀进程（无半成品污染）。
- **worker 报「已同步 N 处落点」不等于改过**：逐落点比 mtime 或 grep 内容锚点，任一落点
  时间戳早于 worker run 即未兑现；个别落点未兑现由 orchestrator 按卡面验收标准代补落，
  卡上留验收记录，全部皆旧才升级虚报处理。

## 验证

- 每波收尾：守恒算术通过 + 每张 done 卡至少 1 项声明有独立验证记录 + canary 全链绿
- 限流波：2 tick 后无 blocked 卡、失败计数归零、队列单调下降
