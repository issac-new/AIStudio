# SkillProposal: signal-consumer-chain-closure [create]

> **产出**： platform-skill-miner · 2026-10-05 · 补跑窗口扫描（2026-09-20~10-05，220 张 done 卡，7 board 全量；补 0921/0928 两轮缺失窗口）
> **状态**： ⏳ 待图爸最终裁决
> markings: [TLP:GREEN, EYES-ONLY:platform]

### SkillProposal: signal-consumer-chain-closure [create]

**触发条件**: 发现某个信号/标记/告警/登记项**持续产生但无人消费**——日志里有告警行、register 里有条目、标签有数据，但零 job 消费、零 dispatch 接线、零回流字段；或投递链路存在但 deliver 目标不可解析、告警静默零送达。

**证据链**（3/220，跨 platform/swarm/ops 三板，三种形态同构）:
  - task_id=t_79c77398, board=platform, snippet="失败标签/签名数据从未回流成 _shared/failures/ 案例（3 案例全为人工复盘）"——产生端（failure-label-check 统计四标签）与消费端（案例资产化）断链；修复=gap_register 补 reopened_date/reopen_reason 字段+回开门+selftest 断言，"done 显式重开需带 reopen_reason" 防 done 掩盖回归
  - task_id=t_786fc6b7, board=swarm, snippet="gap register 漏斗管线治理：写入端去重守门+积压 digest+dispatch 消费 open 接线"——open 167 条零消费（81 占位+43 llm_advice 同源对未裁决）；修复=dispatch 升级消费 open(age>7d+medium+substantive)+needs_adjudication 字段；端到端验证=fixture canary 卡建卡回填+4 批放行 13 卡
  - task_id=t_a6609a0b, board=ops, snippet="STALE_BACKUP 零消费方 + deliver 无投递目标：告警送达链路补全"——tupang-auto-push.sh 写 STALE_BACKUP 告警行进日志，无任何 job grep 消费；dr-drill job deliver=all 报 "no delivery target resolved"；修复=新建消费方 cron job a794cec53f0d(0 */6,no_agent,deliver=weixin)+deliver all→weixin 修复+邮件兜底腿；端到端=注入→检出 exit 2→SMTP→IMAP INBOX 到达
  - （邻接观察，不计入频率）task_id=t_c933c57d, board=swarm：自引用 symlink 校验脚本已落盘但无周期调用方——能力无消费者，同族形态

**频率**: 3 / 220（本窗口），跨 3 板 3 assignee，三种断链形态（回流字段缺失 / dispatch 未接线 / 消费方 job 不存在）同构

**四段式内容**:
  1. 触发条件 → grep 到持续新增的告警行/登记条目/标签数据，但 `crontab -l`/jobs.json 无消费方 job、dispatch 无对应接线、目标字段从未被写入。「产生端健康」与「消费端沉默」并存即触发。
  2. 标准步骤 → ①实证信号存在（日志行原文+时间戳/条目数/写入脚本行号）②盘点消费端（jobs.json grep 关键词 / gap_register dispatch 状态 / 回流字段 grep）③判定断链层：无消费方 job / deliver 目标不可解析 / schema 缺字段 / dispatch 未覆盖该状态④补消费链——按最小形态：缺 job 则新建（no_agent+deliver=可达通道+水位去重）；缺字段则补 schema+回开门+selftest 断言；未接线则升级 dispatch 消费对应状态⑤端到端验证（fixture 注入→检出→投递→收件端确认；canary 卡→回填断言）。
  3. 陷阱 → `deliver=all` 不可解析（gateway 未连齐全部平台时恒报 no delivery target）；weixin 腿等会话激活，邮件腿才是可达兜底（09-21 用户裁定邮件=唯一完整送达通道）；dispatch 对真实大库直跑=为尸体建卡（fixture/--dry-run 先行，复判裁决清完再真跑）；纯文本相似度抓不到同源对（0.03~0.31），按 evidence 前缀规则标记；「检出成功」≠「送达成功」（iLink session not ready 是投递被拒，last_delivery_error 才是投递真相）；水位去重防重复投递。
  4. 验证 → 注入 fixture 行→消费方检出 exit 2→投递发起→收件端（IMAP INBOX/微信）确认正文含原文行；selftest 新增断言全绿；canary 卡 kanban_task_id 回填成功；寄存器计数守恒；负路径（健康态 exit 0 静默、>24h 老行不重放）。

**与既有 skill 关系**: 新增。`radar-quality-control`（报告内容质量）、`operational-status-reporting`（汇报证据纪律）、`nightly-radar-runbook`（雷达管道韧性/幂等补跑）均不覆盖「消费端断链修复」；与 09-25 终裁的 6 份提案（崩溃恢复/审批拦截/供应商熔断象限）正交。

**预期收益**: 0914 挖掘报告已把「失败资产化断链」列为 platform 域 findings，本窗 3 卡修复合计约 15 个 run；标准化后同类修复可压至 1-2 卡；防「告警静默零投递」类事故长期潜伏（STALE_BACKUP 断链自写入机制上线起持续存在，直到 10-03 才被发现——断链越久，积压信号越多，发现成本越高）。
