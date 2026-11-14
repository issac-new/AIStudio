# Proactive AI 综述第二轮吸收：全文版调研与净增量定谳

日期：2026-11-14
触发：用户「深入调研 https://mp.weixin.qq.com/s/p_OenOwaSqhFLG55RPQM-A 完善 AIStudio」。
定位：**同论文第二轮吸收**。2026-11-03 首轮（spec `2026-11-03-proactive-intervention-governance.md`）只拿到公号摘要版（3.8k 字），本轮取得论文全文（`storage.googleapis.com/gweb-research2023-media/pubtools/1048480.pdf`，pdftotext 11,652 行）并三路深读 §1-§8 全部章节。本轮主旨：**用全文细节升级首轮摘要级吸收，清偿首轮明文挂账的第二批，并评估摘要版完全缺失的 per-domain 与治理增量**。

论文：《Proactive AI for Superintelligent Agents》（UIUC/Google/Stanford/Berkeley/CMU，Ke Yang 等，2026）。正文 §1-§3 概念与历史、§4 6A 机制、§5 三层评估、§6 十三域应用（6.1 编码智能体）、§7 迈向校准的主动性、§8 结论。

## 一、全文相对摘要版的新信息面

首轮摘要版只有「校准化主动性＋三层评估」两条命题；全文补齐了五块摘要没有的内容：

1. **§4 机制细节**：每个 A 的子机制、代表系统、设计取舍（如 4.4 四道顺序门、4.5 自主谱系与 preview-then-commit、4.6 快慢两层适应）。
2. **§6.1 编码智能体专项**（五小节）：发现/执行解耦、依赖感知议程、风险感知协同、长期 stewardship、评估开放问题——对本仓最相关的一章。
3. **initiative × authority 双轴跨域地图**（Table 16）：13 域两轴定位＋下一里程碑＋绑定约束；编码域结论「forecast-mandate / gated action / 绑定约束=不完备 oracle 与人工评审预算」。
4. **earned autonomy**：自主权是「人类基于已证明可靠性授予的权限」，按运行记录统计挣得、可失去、可重协商。
5. **§7.2.1 机制级监督**：护栏从输出过滤转向对内部主动回路（感知/预判/议程/仲裁）的监督，audit trail 须把行动链回产生它的内部推断。

## 二、6A × AIStudio 对账（含首轮两批）

| A | 仓内现状 | 完备度 | 缺口 |
|---|---|---|---|
| Awareness | cron monitor_script/url 输出比对（`vendor/hermes-agent/cron/jobs.py:1827`）＋四源 automations（`custom/server/automations/automation-rules.ts`，file/kanban/git/webhook）＋obsalerts 漂移告警 | 触发面**分散在 vendor 与 custom 两层不互通**；无统一 should-I-act 监视器；无 sleep-time compute（夜间预演/预压缩） |
| Anticipation | goal WAIT 屏障（`vendor/hermes-agent/hermes_cli/goals.py:442-455`）＋断点推断（`custom/server/proactivity/breakpoint-adapter.ts`）＋静态启发式收益表（`interventions-service.ts:103` SUGGESTION_PROFILE 硬编码 0-1 分） | 两个孤立原语＋一张静态表；**无 act-minus-abstain 反事实差值**（论文 4.2.3 的干预价值定义）、无预执行 dry-run、无「我避免的未来」解释载体 |
| Agenda | kanban 最成熟：8 列状态机＋依赖边 parent-gating＋typed block 同因复发路由 triage（`kanban_db.py:113-117`）＋goal_mode 卡＋auto-decompose | **无 standing agenda 语义**（注册触发条件→挂起→条件满足自动恢复，论文 4.3.2）；无 plan repair 局部重规划；无自生成目标与用户请求同队列的优先级仲裁面 |
| Arbitration | 最强面：两轴模型 L1-L5×五档（首轮前批）＋注意力治理者四门顺序（首轮本批，spec D8 对齐全文 p24-28）＋四挡执行内核＋审批账本 | 权限轴与注意力轴均完备；仅缺置信门的校准语义（无 conformal/校准误差概念——首轮 D5 已声明启发式边界，属已知取舍非缺口） |
| Action | dispatcher 认领 spawn＋wake 唤醒＋goal loop 质量门；PR/看板卡天然 preview-then-commit | 基本完备；分级通知通道（log→报告→page）部分存在 |
| Adaptation | 干预台账＋校准读数＋三层计分卡（首轮本批）＋decisions.jsonl 哈希链＋复盘批 | **闭环未接线**：D7 明确反馈不自动改偏好（正确），但**无 earned autonomy 档位动态化**——四挡是静态配置，无「按 track record 挣得/收紧权限」通道；无「拒绝反馈不得盲目学习」防线（§7.2.1d） |

## 三、净缺口定谳（五项，按价值排序）

### 缺口 1：发现测试（discovery 形态评测）——首轮第二批挂账#1，仍未清偿

实证锚点：`custom/server/eval/store.ts:289` 仍强制「tasks 至少 1 条」；全仓 grep `discovery` 零命中。simharness 主动性两轴明文「不进六闸判据」只作读数（`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md:1422`）。run27 复盘已有实证痛点：dispatch-preset 77 笔代偿＝「组织自派发 0 条」——主动发现能力从未被量化，只有失败后计数。

论文锚点（§6.1.5）：现有基准「很少要求智能体自己决定什么值得关注」；终极评估环境「不再预选 issue，要求智能体自行决定什么值得调查……核心问题从完成多少被分配任务，转向是否随项目演化发现、调度、执行并守护有用的工作」。配套判据：task-discovery precision/recall、人工验证工作量、**对正确沉默的奖励**；FixedBench 实证「智能体常在问题已解决时仍修改代码，暴露任务完成型基准不惩罚的行动偏差」。

### 缺口 2：Anticipation 反事实差值（act-minus-abstain）——首轮第二批挂账#3 部分清偿

现状：干预收益是静态启发式表（unblock-blocked=0.7/0.25 等，spec D5 声明「缺真人反馈数据，先可解释排序」）。论文 4.2.3 给出升级路径：**干预价值＝行动世界与弃权世界的期望结果差**；同一差值兼作解释（「我避免的未来」是信任的最小载体）。工程形态：轻量 LLM 模拟器对候选干预做两分支预演（act/abstain），差值喂给治理者第二门。注意论文自身警告：反事实校准错误直接污染仲裁门；反思消耗延迟与时机门冲突，须快慢分离（4.6.2）。

### 缺口 3：coding agents 专项机制（§6.1，摘要版完全没有）

四个可吸收点，按仓内对应度排序：
- **发现/执行解耦**：提案型 agent 输出「有范围、有证据的工程主张」，项目可接受/推迟/拒绝——与执行型 agent 分离（GitHub agentic autofix 沙箱验证后 draft PR 模式）。仓内 dispatcher 只派发已 ready 的卡，「发现→提案」环节无独立产物形态。
- **会话溯源与交接笔记**：「会话溯源成为承载每次干预背后意图及其最终 diff 的共享制品」；Handoff Debt 实证「继任者拿到前瞻性上下文笔记比只继承仓库状态恢复效率高得多」。仓内已有 handoff-controller（交接质量账本）与 superagent 批一的交接合同——差距在「意图+diff 一体留存」未成会话级一等制品。
- **依赖感知资源受限议程**：Cursor 自驾实验教训「静态依赖图过于僵硬、系统卡在最慢 worker、大规模编译造成共享资源争用」→「主动议程是随执行新证据改变结构的依赖感知、资源受限计划……是可修订的执行结构，而非不断增长的后备清单」。仓内 kanban 有依赖边但无资源约束建模（worktree 并行上限是人肉规则）。
- **stewardship**：「因上游依赖暂停、仓库变化后恢复的迁移类承诺……挑战是保住这项工作仍然值得做的理由」。仓内 typed block 有「同因复发」但没有「暂停条件+恢复条件+仍然值得做的证据」三件套。

### 缺口 4：earned autonomy 档位动态化（§4.6.3）

论文：「自主应当是分级且以证据索引的，随绩效历史累积而调整……在大规模运行记录上证明可靠性后才扩大授权」；「智能体可以按预测信任选择主动性级别，只在已挣得之信赖证据允许的范围内升级」。仓内 approval-ledger 已有三态决议账（decidedBy 区分真人/策略），是现成的 track record 数据源；四挡静态。与首轮 D7 不冲突：D7 否决的是「自动改用户显式偏好」；earned autonomy 是「权限档位随证据建议调整」，且可设计为「收紧自动、放宽须人确认」（对齐 `enforcement-policy.ts` 只收紧不放宽先例）。

### 缺口 5：机制级监督 audit trail（§7.2.1）

论文四方向：(a) 监督行动前的内部阶段（感知/预判/议程/仲裁），让不安全的主动性在变成执行前被检出；(b) 防偏差跨推理步复利（不确定推断→自信议程→塑造后续观察）；(c) 治理私有上下文→主动性行动的转化；(d) audit trail 把行动链回内部推断，且被拒绝的主动行为不得盲目进入后续适应。仓内 intervention-ledger 已有 reason code 骨架，approval-ledger 有决议账；缺「触发证据链」结构化字段与偏差复利监控面。

## 四、分批方案（供裁决）

| 批 | 内容 | 落点 | 一句代价 |
|---|---|---|---|
| **P1 发现测试** | eval 集 `discovery` 形态（无显式任务）；判据含 task-discovery precision/recall＋正确沉默奖励＋行动偏差惩罚 | `custom/server/eval/`（store/types/evaluators）＋ simharness 能力探测组接线 | eval schema 变更须保 contentFingerprint 兼容；judge 语义须设计（发现质量无唯一真值，需证据锚定判据） |
| **P2 反事实差值** | 干预计分从静态表升级为 act/abstain 两分支轻量预演，差值喂治理者第二门，兼作解释 | `custom/server/proactivity/` 新 anticipation 面＋interventions-service 接线 | 引 LLM 调用进治理链（延迟/成本），须快慢分离防时机门冲突；预演失败须 fail-open 回静态表 |
| **P3 standing agenda** | kanban 卡/typed block 增「触发条件注册→挂起→条件满足自动恢复」语义＋plan repair 局部重规划 | vendor hermes kanban（B 类补丁 773+）或 custom 层投影 | 触上游＝补丁链尾追加＋重放回归；恢复语义与 dispatcher 认领的竞态须设计 |
| **P4 earned autonomy** | 挡位建议器：按 approval-ledger track record 输出档位调整建议（收紧自动、放宽须人确认） | `custom/server/executioncontract/` 旁新增 advisor＋ledger 消费 | 冷启动期数据稀疏；建议语义须防谄媚（论文警告信任是观察量不是优化目标） |
| **P5 溯源与监督** | 会话溯源「意图+diff 一体」＋intervention-ledger 触发证据链字段＋偏差复利监控 | proactivity/handoff/obsalerts 三域扩展 | 面广单点浅；建议并入后续相关批随批携带 |

推荐组合：**P1 独立先行**（上轮挂账、评估面、无上游补丁）；**P2+P3 成对**（论文称 Anticipation 与 Agenda 是 coding agents 两大项目级缺口，且反事实差值天然驱动 standing agenda 的触发条件）；P4/P5 待前三批跑出 track record 数据后再立。

## 五、诚实边界

- 论文全文经 pdftotext 转换，三路子代理分段深读（§1-3 / §4 / §5-8），关键论断均附原文行号锚点；图片内容（Figure 1-15、Table 3/16）只有文字层，图内细节未核。
- 本报告只做定谳与立项建议，未动任何代码；`docs/reports/` 本文件未提交，立项后随批入 worktree。
- 仓内现状两路调研均为只读，锚点 file:line 以调研当日 main（66a3213d2）为准；vendor/ 脏态为注入预期工作态。
- 「P2 预演差值」的 LLM 模拟器保真度论文自身存疑（LLM 反事实能力脆弱），工程上只能作排序信号不作精确预测——此边界须写进批二 spec。
