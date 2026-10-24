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
8. **能力阶梯收口（T4 类合并裁决卡的强制下游）**：合并裁决卡产出 `[capability-gap]` 缺口清单时，
   orchestrator 必须在 T4 收卡后**当面**把缺口落成 RSI R2 补全卡，不等后续会话发现：
   统一建在 `platform` 板、`assignee=platform-skill-miner`、`idempotency_key=rsi:<原域>:<T4卡号>:R2`
   （防同缺口重复建卡）；跨板依赖走 body 引用 `rsi:src=<board>:<T4卡号>`，**不写跨板 parents**；
   待激活产物交付后，收卡验收必含「staged 提案态零越权」反向 grep（见 §陷阱「激活门禁的合规形态判定」）。

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
- **CLI 会话层故障 ≠ worker 停跑**：`hermes kanban show` 报 `kanban_write_sanctioned` 等
  SQL/UDF 错误时，先用 `stat -f kanban.db` 看 mtime——秒级在更新即 worker 活跃，再直读
  `task_events` 判推进；禁把 CLI 会话层故障误报为「板坏了/卡死了」而采取干预动作。
  查库用 `sqlite3 "file:$HOME/.hermes/kanban/boards/<board>/kanban.db?immutable=1"`——
  裸路径打开 WAL 活跃库会锁库，immutable URI 只读绕锁。
- **僵尸进程名 ≠ 活监控**：`ps aux` 里挂 `watch_*.py` 名字的进程可能是早先已被 kill
  的旧 watcher（名字不随死消失）。判活用 PID 活性 + `tail` 日志是否有近期快照行，
  双信号皆无才判定监控已死并重启。
- **后台 watcher 两连被回收后转前台分片轮询**：launchd 会话收尾会 SIGTERM 无期限后台
  轮询（两连收 = 常态），第三次起不再重启长 watcher——改前台 `for i in 1..N; do sleep 45;
  sqlite3 读状态; done` 分片盯（单片 ≤6 分钟防超时截断），单片末打印进度行，跨片续跑不重复。
- **TUI 无外部投递通道**：本机会话无 gateway 时 watcher 完成通知进不了会话，收卡核验必须
  靠前台轮询亲眼看到 status=done 才终验；禁凭 watcher 的退出通知反推任务状态。
- **skill 产物按目标板 profile 树挂载，按消费方树验收**：R2 补全卡（platform 板）生成的技能
  落在平台侧共享树 `~/.hermes/skills/<team>/`（worker 有写权），由消费方 profile 经 symlink
  挂载读。orchestrator 自验 skill_view 报 not found **不构成验收失败**——先查消费方
  `~/.hermes/profiles/<worker>/skills/<team>` symlink 是否指到真身、真身文件是否在位，
  在位即过；验收跑在产物树（find/grep/frontmatter 解析），不依赖任何单一 profile 的可见性。
- **激活门禁的合规形态判定**：staged 提案态 SKILL.md 必含 frontmatter `staged: true` 节 + 文内
  `staged_note: 待晨报人审 mark-active 三关，未激活` 字样（或等义「待审公告」）。终验收 grep
  `mark-active|已激活|ACTIVE` 命中禁词时**必读上下文**：version 标 `1.0.0-staged` + 公告节在场 =
  合规休眠声明，非越权激活；只有实质功能内容/无 staged 标记才算违例。机械零命中标准会
  误伤合规的「待审公告」文本。
- **worker 验收自检发现的挂起属实现纪律良好，非故障信号**：worker 自述「验收脚本挂起，
  正在复现定位」且日志显示在读源码/跑 timeout 复现时，让 worker 跑完自修流程，不 steer
  不重派；joblib 类并行池在受限 fork 环境的挂起常靠改用 spawn 上下文或加超时兜底解。

## 验证

- 每波收尾：守恒算术通过 + 每张 done 卡至少 1 项声明有独立验证记录 + canary 全链绿
- 限流波：2 tick 后无 blocked 卡、失败计数归零、队列单调下降
