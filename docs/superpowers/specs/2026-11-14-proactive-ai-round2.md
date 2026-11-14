# Proactive AI 综述第二轮吸收（全文版）：发现测试、反事实差值、standing agenda、earned autonomy、机制级监督

日期：2026-11-14
状态：in-progress（分支 `feat/proactive-ai-round2`，worktree `proactive-ai-r2`，自 origin/main 1bc799ca4 起）
触发：用户「深入调研 https://mp.weixin.qq.com/s/p_OenOwaSqhFLG55RPQM-A 完善 AIStudio」＋「全做」裁决（五批 P1-P5 全量执行）。
调研正本：`docs/reports/2026-11-14-proactive-ai-fulltext-round2.md`（论文全文 11,652 行三路深读；首轮 2026-11-03 只有摘要版 3.8k 字，本轮是同论文升级吸收）。
论文：《Proactive AI for Superintelligent Agents》（UIUC/Google/Stanford/Berkeley/CMU）。

## 变更

### P1 发现测试（discovery 形态评测）——清偿首轮第二批挂账#1

论文锚点 §6.1.5：现有基准「很少要求智能体自己决定什么值得关注」；FixedBench 实证行动偏差（问题已解决仍改代码）；终极评估环境评「发现/调度/执行/守护」并**奖励正确沉默**。

- `custom/server/eval/types.ts`：`EvalSet` 增 `kind?: 'task' | 'discovery'`（缺省 task）与 `discovery?: DiscoverySpec`。`DiscoverySpec = { scenario: string（工作域+委托目标）; expectedFindings?: ExpectedFinding[]（期望发现清单，空=开放域只判 precision）; resolvedConcerns?: ResolvedConcern[]（已解决问题集，考正确沉默）; maxFindings?: number（人工验证负担上限） }`。
- `custom/server/eval/fingerprint.ts`：`contentFingerprint` 入参扩为 `Pick<EvalSet, 'tasks' | 'discovery'>`，discovery 并入 canonical 序列化（`canonicalize` 已滤 undefined——老集合无此字段，hash 不变，向后兼容实证由测试锁定）。
- `custom/server/eval/store.ts`：校验分支化——`kind` 缺省或 `task` 时维持「tasks 至少 1 条」；`discovery` 形态下 tasks 允许空数组、`discovery` 必填且 scenario 非空。
- 新增 `custom/server/eval/discovery-score.ts`：判分纯函数——`discoveryPrecision`（发现条目带 evidenceRefs 且命中期望或 judge 判真；**无锚点发现直接判 unsupported**，对齐仓内「结论无锚点不成立」红线）、`discoveryRecall`（期望命中比例，无期望置 undefined 不计）、`correctSilencePenalty`（对 resolvedConcerns 重复报告条数＝行动偏差）、`verificationBurden`（findings 数对 maxFindings 超限比例）。
- run 提交面：discovery 形态的 run 收 `{ findings: Array<{ description: string; evidenceRefs: string[]; severity?: string }> }`，判分走 discovery-score。
- simharness 接线：`mx-capability-probes.mjs` 组 1 增 discovery 两端点探测（发现集列举+判分端点），退出码语义不变（负例仍须 400/404）。

### P2 反事实差值（act-minus-abstain）——清偿首轮第二批挂账#3

论文锚点 4.2.3：干预价值＝行动世界与弃权世界的期望结果差；同一差值兼作解释（「我避免的未来」）。论文自警：反事实校准错误直接污染仲裁门、预演耗延迟与时机门冲突——故 fail-open 与快慢分离是硬约束。

- 新增 `custom/server/proactivity/anticipation-preview.ts`：`previewIntervention(candidate, context)` 构造 act/abstain 两分支轻量 LLM 预演（复用 eval judge 的模型调用通道），返回 `{ delta: number（-1..1）; actOutcome: string; abstainOutcome: string; explanation: string（「我避免的未来」一句话）; confidence: 'low'|'medium'|'high' } | null`（null＝预演失败，fail-open）。
- 接线 `custom/server/proactivity/interventions-service.ts`：候选评分从单一 `SUGGESTION_PROFILE` 静态表升级为「预演差值优先、静态表 fallback」——candidate 带预演结果时 benefit=delta（低置信减权），预演 null/关闭时用静态表现值。**SUGGESTION_PROFILE 从主路径降级为 fallback 路径**（机制预算配对项）。
- 快慢分离：预演只在 `POST /interventions/sync` 批处理时做，单 sync 上限 `ANTICIPATION_PREVIEW_MAX`（缺省 5）条；critical 必达候选跳过预演直接投递（不等待慢通道）；预演结果缓存进 candidate，治理者裁决读快照。
- 环境开关 `ANTICIPATION_PREVIEW=off` 可整体关闭回纯静态表现状。

### P3 standing agenda（触发条件注册→挂起→条件恢复）

论文锚点 4.3.2：standing agenda＝跨会话存活的持久意图（注册触发条件→挂起→条件触发重新激活）；世界漂移用 plan repair 而非全量重规划；6.1.4 stewardship「保住这项工作仍然值得做的理由」。Cursor 自驾实验教训（§6.1.2）：静态依赖图僵硬、卡最慢 worker。

- 新增域 `custom/server/standingagenda/`（A 类纯新增，不触上游）：
  - `agenda-store.ts`：`StandingAgendaRecord = { id; title; mandateGoal（委托目标语句——为什么值得做）; evidence: string[]（立案证据锚点）; resumeCondition: AutomationSourceFilter（复用 automations 四源过滤器语义：file/kanban/git/webhook + 匹配器）; parkedAt: number; status: 'parked'|'resumed'|'done'|'dropped'; resumeCount: number; lastResumeAt?: number; sessionId?（溯源） }`，JSONL append-only 落盘（先例 intervention-ledger）。
  - `agenda-matcher.ts`：`matchResume(events: AutomationEvent[], record)` 纯函数——事件流匹配 resumeCondition。
  - `agenda-controller.ts`：REST CRUD＋`POST /api/hermes/standing-agenda/:id/match`（喂事件批，返回恢复建议）。
- **恢复动作走既有治理链，不自建旁路**：matcher 命中→产出一条「恢复建议」投 interventions 面（治理者四门裁决＋两轴模型判权限），不直接建看板卡、不直接唤醒 agent——恢复建议携带 parkedAt 时的 evidence 与 mandateGoal，goal-alignment 新鲜度 stale 时建议附「先重对齐再恢复」（plan repair 语义的最小实现：恢复前复核「仍然值得做」）。

### P4 earned autonomy（track record 档位建议器）

论文锚点 4.6.3：自主是「人类基于已证明可靠性授予的权限」，分级、以证据索引、随绩效历史调整；§7.1.2「逐渐挣得、失去或重新协商」。与首轮 D7 不冲突：D7 否决自动改用户注意力偏好；本批只对权限档位产出建议，默认不动档。

- 新增 `custom/server/executioncontract/earned-autonomy.ts`：
  - `aggregateTrackRecord(profile)`：读 approval-ledger JSONL（fail-soft，文件缺席返回 null 不猜数），按 profile 聚合 `{ sampleSize; resolvedAuto; resolvedUser; deniedCount; riskEscalationCount }`。
  - `recommendMode(current: ModeId, record)`：纯函数——冷启动 `sampleSize < 20` 不出建议；`deniedShare > 0.2` → 收紧一挡建议（plan←build←guarded←yolo 方向）；`sampleSize ≥ 50 ∧ deniedCount = 0 ∧ resolvedAutoShare > 0.9` → 放宽一挡建议。返回 `{ direction: 'tighten'|'loosen'|'hold'; target: ModeId; evidence: string }`。
  - 执行语义：**默认只建议**（REST `GET /api/hermes/execution/earned-autonomy?profile=` 呈现）；`EARNED_AUTONOMY_AUTO_TIGHTEN=1` 时收紧建议自动写会话档，**放宽永远须人确认**（对齐 enforcement-policy「只收紧不放宽」先例＋防谄媚：只消费决议统计，不消费任何文本反馈）。
- 挂载：executioncontract 域 controller 增端点（无新补丁——该域路由已挂载）。

### P5 机制级监督（证据链＋偏差复利监控）

论文锚点 7.2.1：audit trail 把行动链回产生它的内部推断；防偏差跨推理步复利（不确定推断→自信议程→塑造观察）；被拒绝的主动行为不得盲目进入后续适应。

- `custom/server/proactivity/intervention-ledger.ts`：记录增可选 `evidenceChain?: { source: string; refs: string[]（file:line/URL/事件 id）; inference: string（一句话推断）; uncertainty?: 'low'|'medium'|'high' }`——结构化字段非自由文本，可机检。
- `custom/server/proactivity/proactivity-scorecard.ts`：机制层读数增 `compoundingBiasSignals`——同 topic 键连续 ≥3 次高不确定（uncertainty='high'）仍升级/重复投递的计数（「不确定的推断变成自信的议程」的代理指标）。
- 溯源透传：standing-agenda 恢复建议与 anticipation 预演结果落账时携带 sessionId 与 refs 链（意图+diff 一体留存的最小增量；完整会话溯源面挂账后续批）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | discovery 作为 EvalSet 的 `kind` 形态而非独立域 | 评测资产治理（指纹/修订/密封/校准）全部复用，discovery 集同享版本锚点；独立域要重造五套治理面 | 新建 discovery-store 域（否决：与 eval 资产治理双口径，违反单一事实源） | 是 |
| D2 | 无锚点发现判 unsupported 而非低分 | 仓内红线「结论无锚点不成立」；论文「有据、值得关注」三问中「有据」是门槛不是加分项 | 锚点缺失扣 0.3 分（否决：无锚点发现不可复核，给分即鼓励编造） | 是 |
| D3 | 指纹并入 discovery 字段、老 hash 不变 | canonicalize 滤 undefined，老集合序列化结果不变；discovery 集改题同受指纹治理 | discovery 单独 fingerprint（否决：双指纹口径） | 是 |
| D4 | 预演 fail-open 回静态表、critical 跳过预演 | 论文 4.6.2「反思消耗延迟与时机门冲突」；预演不可靠时污染仲裁门比没有预演更糟；critical 必达不等慢通道 | 预演失败则抑制投递（否决：把新增故障面引入既有必达路径） | 是 |
| D5 | standing agenda 落 custom 层，恢复建议走 interventions 治理链 | 恢复动作经治理者四门+两轴裁决＝恢复即一次受治理的干预；不自建旁路绕过已建立的仲裁面；避免 B 类补丁 773 的重放回归面 | vendor kanban 卡级 standing 语义补丁（否决：本轮价值在闭环语义不在存储位置；卡级挂账后续批） | 是 |
| D6 | resumeCondition 复用 AutomationSourceFilter | 四源事件语义已在 automations 域单一事实源化，matcher 直接消费 AutomationEvent；再造过滤器词表=双口径 | 新事件 DSL（否决：表达力冗余且无消费者） | 是 |
| D7 | earned autonomy 默认只建议，收紧 opt-in 自动、放宽永须人确认 | D7 首轮精神（控制感）+论文警告信任是观察量非优化目标；「收紧自动」对齐 enforce-gate 只收紧先例 | 双向自动调挡（否决：放宽自动化=把权限升级交给被评估者自己） | 是 |
| D8 | 冷启动阈值 sampleSize<20 不出建议 | 论文「在大规模运行记录上证明可靠性后才扩大授权」；小样本建议=噪声放大 | 无阈值（否决：3 条记录就能建议改挡，统计上不成立） | 是 |
| D9 | 偏差复利用 scorecard 机制层读数呈现而非独立告警域 | 论文定位是「监控面」不是新门；obsalerts 是环境基线漂移域，语义不同（推理偏差≠指标漂移） | 新建 bias-alerts 域（否决：机制预算不允许只加不减） | 是 |
| D10 | P2 的 SUGGESTION_PROFILE 降级为 fallback＝机制预算配对项 | 「新增门/账本须配对删除或降级」；静态表仍承担 fail-open 职责不是死代码 | 删除静态表（否决：fail-open 路径需要它） | 是 |

## 验证

- 目标测试（每 P 落地即跑）：`npx vitest run custom/server/eval custom/server/proactivity custom/server/standingagenda custom/server/executioncontract`
- P1：指纹兼容锁定测试（老集合无 discovery 字段 hash 逐字节不变）＋discovery 校验分支＋判分四指标（precision/recall/正确沉默/验证负担）＋无锚点判 unsupported。
- P2：预演纯函数（mock LLM 两分支）＋fail-open 路径＋delta 融合权重＋critical 跳过＋开关关闭回静态表。
- P3：matcher 四源匹配（file 通配/kanban 列迁移/git ref/webhook eventType）＋恢复建议走 interventions 落账＋stale 目标附重对齐。
- P4：track record 聚合（含 ledger 缺席 fail-soft null）＋建议矩阵（冷启动 hold/高拒绝收紧/大样本零拒绝放宽）＋auto-tighten 开关。
- P5：evidenceChain 落账回读＋compoundingBias 信号计数＋坏档隔离。
- 全量 `npm test`＋`npm run typecheck:harness`；simharness 探测组扩展跑 `simharness/tests` 相关面。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§5.8 proactivity 域描述增 anticipation 预演面与 standing agenda 域引用；§5.x eval 域增 discovery 形态一句；executioncontract 域增 earned-autonomy 建议器一句。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增稳定参数行（discovery 四判据阈值、预演开关与单 sync 上限、恢复建议走治理链、earned autonomy 冷启动阈值与方向限制）。
- `config/mechanism-budget.json`：登记 standing-agenda 域与 earned-autonomy 建议器（sunset：owner=本轮批、reviewBy=下两轮推演、retireWhen=多轮推演无消费即退役）；配对降级=P2 SUGGESTION_PROFILE 主路径降级（D10）。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec 与调研报告。
