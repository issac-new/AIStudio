# AI 原生组织运行模型·批二（共享认知与学习）增量 spec

> 日期：2026-11-20
> 状态：已批准（用户指令「完成未做及后续批二、批三」＝方向授权；本批边界沿设计 spec §2 批表）
> 母本：`2026-11-19-ai-native-operating-model-design.md`（已批准）；批一：`2026-11-20-ai-native-outcome-batch1.md`（已合并 6759d1919）

## 变更

### 一、批一欠账清偿（服务端小修包）
- events.jsonl/snapshots.jsonl 断电半行吞行窗口回移（快照面 ensureLineTerminated 模式回移到 outcome-store 两追加面）。
- 收件箱 decide 合同状态门：outcome 绑定条目在合同 cancelled/settled 时拒批（409 `outcome_not_active`，与 dispatch 面对齐；deny 仍放行——否决不设门）。
- fleet-tap 快照读取瞬态失败不再 fail-open：读不出 outcome_ref 时按「有绑定但不可证」处理（跳过 autopass 候选＋decide 面 409 outcome_unavailable），不退风险档闸猜。
- 读端点 authz 收口：`GET /:id/context` 的 `content` 与 `GET /:id` 的 measures/结算摘要限 owner/verifier（其他登录用户得元数据不含 content——快照物化文本与 C1 保护面对齐）；measurements/settlement 读面同权。

### 二、任务树继承补全（补丁 807）
- `create_task` 带 parents 时继承父卡 outcome_id（覆盖 kanban_swarm swarm 建卡与 CLI `--parent` 路径）；runtime 镜像同步；「空→值/同值」三态语义与 805 一致，异值拒。
- 激活即绑定（批一）继续覆盖存量卡；两路互补后「未经 dispatch 的运行中子卡对终态守卫不可见」缺口关闭。

### 三、person↔mxid 桥与 gateway 双签放开
- `Person` 增可选 `mxids: string[]`（人工登记/种子导入；不自动映射不猜）。
- Hermes 守卫（806 面）双签释放路径：actor mxid → people 反查 → 命中 ownerPersonId/verificationOwnerId 且两笔不同 person 时释放（替换批一 deny-only 临时裁决）；CLI/transport 面单人直答面维持 deny-only（单身份通道，指引收件箱）——边界注随设计 spec 更新。
- 收件箱签署映射复用同桥（emails ∪ mxids）。

### 四、全量上下文快照与召回留痕（本批核心）
- `buildFullSnapshot` 在批一最小信封上扩：Panorama 各面（证据/评测/评审/计划/图运行/泳道）、DecisionGraph 近期决策摘要、PremiseLog 活跃前提、approved 经验（expcandidates approved 且作用域匹配，带版本＝id+updatedAt 指纹）；`approvedExperienceVersions` 由恒 [] 变为实值；teamVersion 仍 null（批三）。临界（1 MiB/100 源）与脱敏纪律沿用；非关键源失败进 excludedSources，关键源失败禁派单。
- dispatch 切换全量快照；经验召回走既有 exp-inject 通道并在 `recordInjection` 落 snapshotId（召回可证明——「已注入」留痕绑定到具体派单快照）。
- `learningOptIn` 与既有 EXPERIENCE_INJECT 双闸不变；未 approved 候选永不出现在快照。

### 五、学习候选与同口径对照
- settlement_signed 事件触发学习候选生成/更新（expcandidates 扩展：outcomeId/sourceSettlementId 已在批一类型预留；双闸=learningOptIn+EXPERIENCE 写入闸）。
- 对照投影：`GET /api/hermes/outcomes/:id/comparison`——同 measure 定义的基线/评估结果并排；effect 恒三态 `improved|degraded|unknown`，不足两个同口径已结算结果时 `unknown`（带缺口说明），绝不自动宣称有效。
- OutcomeSection 增对照行（只读投影，无新写面）。

### 六、浏览器三面实物走查（批一 I-1 欠账＋批二准入）
- 隔离 production 起服（NODE_ENV=production、OUTCOME_WORKBENCH=1、HERMES_WEB_UI_HOME 隔离）后浏览器实操：OutcomeSection（建合同/激活/测量/结算全交互）、OrchestrationView（三态渲染）、Approval Inbox（双签两笔流）。发现缺陷随批修复并复走查。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 欠账四小修随批二清偿而非独立批 | 均为批一审查 Parked 项、文件面小；机制预算配对收敛继续有效 |
| D2 | gateway 双签放开依赖显式 mxid 桥，不自动映射 | 仓规 fail-soft 不猜数；映射错误=越权放行，代价不对称 |
| D3 | 全量快照沿用批一信封不另立格式 | 设计 §4.4「批二在同一信封中追加」既定 |
| D4 | 对照投影只读、effect 三态、不足即 unknown | 设计 §4.5「注入≠有效」；两个同口径结果是宣称改善迹象的下限 |
| D5 | K19 按域清零降基线不在本批 | 非阻断且涉及全仓豁免清单改造，独立立项 |

## 验证

- 模块级：每任务目标 vitest（先红后绿）＋`npm run typecheck:harness`；补丁 807 双向 apply-check＋runtime 镜像一致＋PYTHONPATH pytest；806 更新同要求。
- 试点 II（批二准出）：以批一试点结果为基线，走第二个同口径结果全链——重点证明：快照含 approved 经验版本、recordInjection 带 snapshotId（召回留痕可反查）、对照投影在只有 1 个已结算结果时 effect=unknown。
- 浏览器三面走查记录（操作步骤＋所见＋缺陷修复闭环）。
- 全量 `npm test`（预期非本批红=环境 pristine-replay＋v2.102.0 两红他 session 在途）＋`merge-invariants --check`＋`governance-lint --budget`。

## 设计文档影响

DESIGN_SYNC: touched
- `docs/DESIGN.md`——§4.6 补「gateway 双签经 mxid 桥释放（CLI/transport 维持 deny-only）」「对照投影 effect 三态」两句。
- 机制预算 changes[]：mxid 桥、全量快照扩展、对照投影（均带 sunset＋配对收敛：deny-only 临时裁决退役、快照最小/全量合一、effect 不进 settle）。


## 收口回填（2026-11-21 实测）

- T1 吞行回移＋读面 authz（742d9e9c1+df74cc4d5）：outcome 域 210 用例绿；四读端点＋GET / 行级 readScope。
- T2 收件箱状态门＋tap 收口（9d770a5ac）：approval-inbox 153 用例绿。
- T3 补丁 807 建卡继承（59f518ee3）：pytest 12/12（swarm 三 parents/CLI --parent 真链）；worktree 全量重放 complete。
- T4 mxid 桥与 gateway 双签释放（edd0ab3）：pytest 62/62（桥命中两异角色释放/同人两 mxid 拒/未登记拒/桥缺席 fail-closed/无 actor 面 hold/卡片面透传）；806 重生成双向 apply-check 过、四文件与注入态逐字节一致。
- T5 全量快照与召回留痕（dbccea0）：snapshot 33（四块物化/非关键四路降级/未 approved 双面缺席/关键源失败上抛）；dispatch-outcome 7；召回留痕反查（快照指纹⊇候选、injectionLog 按 snapshotId 命中）与 EXPERIENCE_INJECT=0 无块零留痕双钉；42 文件 448 用例绿。
- T6 学习候选＋对照投影（4e2dcca）：learning 7（双闸/幂等/形状）＋comparison 7（单结果恒 unknown/口径漂移不算/持平 unknown/退化 degraded/取最新基线）＋控制器 4（comparison 端点/双闸触发）＋面板对照行 1；339 用例绿。
- **试点 II（pilot2-e2e.test.ts，可复跑证据）**：people→建卡→合同(high/one-way,learningOptIn)→激活即绑定→approved 经验→派单全量快照（approvedExperienceVersions 含 exp-p2@指纹、sourceRefs 逐条）→召回留痕反查闭环→observing→测量→结算→学习候选生成→对照投影（两结果持平恒 unknown＋单结果恒 unknown）——学习链全通。
- **T7 浏览器实物走查：两次受阻挂账批三初**。隔离 production 起服因 vendor chat-run.ts 编译红（surfaceRuns/SurfaceError 在 v0.8.28 基线无定义）拒起——main 检出注入态同红定谳（他会话 v0.8.28 换血＋778 链在途残缺，非本批引入；批二点五轮同型受阻一次，本批第二次）。按外部阻塞立法换策略：组件级全交互（outcome-section 17 用例）＋REST/store 级全链（pilot2-e2e）代偿，实物走查随批三初 778 收口后补。
- 全量门：`npm test` 9596 passed / 2 failed（overlay-pristine-replay=8647 环境性；v2.102.0 training-manual+route-manatic=他会话在途，主检出同红在案）。
