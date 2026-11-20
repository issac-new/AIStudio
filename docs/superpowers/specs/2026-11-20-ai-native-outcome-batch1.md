# AI 原生组织运行模型·批一增量 spec（Task 15 收口）

写给谁看：批二实现者与审查者——据此对账批一实际落了什么、为什么这样落、验证到什么程度。
设计正本：`docs/superpowers/specs/2026-11-19-ai-native-operating-model-design.md`（已批准，收据在册）；本文件是批一实现事实的增量记录，不重复设计论证。

## 变更

批一 15 任务交付面（分支 `feat/ai-native-operating-model`，全部已提交）：

| 任务 | 交付面 |
|---|---|
| T1 | Outcome 类型与校验（`custom/server/outcome/types.ts`＋`validate.ts`，字段枚举逐字 spec §4.1） |
| T2 | 事件台账与存储（`outcome-store.ts`：追加制哈希链 events.jsonl＋contract.json 原子写＋先账后物 fail-closed＋坏档隔离） |
| T3 | 状态机与重开语义（`state-machine.ts`：draft→active→observing→settled＋任意态 cancelled；reopen 不递增 version） |
| T4 | 测量绑定与结算建议（`settlement.ts`：当前版本绑定选取＋perMeasure 机器建议＋unknown 证据缺口强制） |
| T5 | DecisionProfile 与授权矩阵（`decision-matrix.ts`＋`decision-vectors.json` TS/Python 双侧契约；risk-tier 判据正身迁入，`approval-inbox/risk-tier.ts` 退为薄委托，行为字节级不变） |
| T6 | 最小上下文快照（`snapshot.ts`：物化 content＋sha256 幂等＋1 MiB/100 来源临界拒绝＋敏感脱敏 fail-closed） |
| T7 | REST 控制器与功能门（`outcome-controller.ts`：全端点表＋OUTCOME_WORKBENCH 门＋权限矩阵＋四类幂等键＋撕裂自愈＋归属证明） |
| T8 | 宿主路由挂载补丁 804（`patches/804-*`＋series 登记） |
| T9 | 看板 outcome_id 列与子任务继承（补丁 805＋runtime 镜像；tasks.outcome_id 列＋继承传播） |
| T10 | column.dispatch 结果解析与快照接线（`kanban-resolution.ts`：根任务摘要/终态守卫/归属证明/激活即绑定家族传播） |
| T11 | Hermes 审批守卫接线（补丁 806＋runtime 镜像；outcome_ref/dual_sign_required 随条目下发） |
| T12 | Approval Inbox 结果绑定与双签分支扩展（合同门 stale 409＋owner/verifier 双签＋outcome-dual-sign 分册台账） |
| T13 | 根任务结果面板（`custom/client/kanban/components/OutcomeSection.vue`＋`api/outcome.ts`；门关整段不渲染） |
| T14 | OrchestrationView 真实合同显示（协同图消费真实合同，不再占位文案） |
| T15 | 批一收口（本文件）：测量/结算读端点＋面板真实读数＋机制预算＋设计正本/域索引/N03 承接标注＋试点走查＋全量门 |

三补丁：804 宿主路由挂载、805 看板 outcome_id 列与继承、806 审批守卫 outcome 接线与双签（均已登记 series）。

T15 新增读端点（T13/T14 双报缺口补齐）：

- `GET /api/hermes/outcomes/:id/measurements`：`?measureId=` 可选过滤；`measurements` 全量列表当前版本优先（组内落账序，旧版本只作历史）；`latest` 每 measure 最新一条摘要——复用 `settlement.ts` 导出的 `latestCurrentMeasurement` 同一绑定口径（单一事实源：仅当前 contractVersion、observedAt 最大、后写覆盖；无当前版本记录不猜数）。
- `GET /api/hermes/outcomes/:id/settlement`：`settlement`=最新有效结算（未被 superseded 的最后一条；全被取代为 null，不拿已废结算充当前）；`superseded`=历史取代链（按取代事件序，含正身/理由/时间，孤儿 id 只带 settlementId）。
- 面板跟进（最小）：`api/outcome.ts` 增 `fetchOutcomeMeasurements`/`fetchOutcomeSettlement`；OutcomeSection「最新实际值」从会话回显升级为服务端读面，读失败（非门关）降级回显并如实标注（fail-soft 不造假）；结算摘要同源升级并显示历史取代链提示。

## 决策记录

1. **读面 latest 复用结算绑定选取器（导出 `latestCurrentMeasurement`）**：面板「最新实际值」与结算机器建议必须同一版本绑定口径——若读面另写一套版本过滤，合同修订后两处可能给出不同「最新值」。导出复用而非复制（单一事实源不变量）。
2. **superseded 语义取「最新有效」而非「最新落账」**：settled 后重开未再结算时，读面返回 settlement=null＋链含旧结算——已废结算不得冒充当前裁决；再结算后 latest=新、链仍含旧。
3. **机制预算配对收敛三项**（`config/mechanism-budget.json` changes[] 2026-11-20 条目，sunset owner=plusprimer、reviewBy=批二收口）：risk-tier 委托归一（判据正身迁移）、N03 任务卡结构化部分承接（outcome_id 列＋激活即绑定＋合同结构化正身，pending-batch 已标注）、verifyRootTask env 豁免通道（OUTCOME_ALLOW_UNVERIFIED_ROOT=1 系批一试点逃生门，T10 已接真实现，随批二退役）。
4. **§4.3 授权边界注（T12 复审 Minor-1 收录，SPEC_REBIND=1）**：fleet 绑定条目 `dual_sign_required=false` 而分类器判 high 时单签即决——合同门为权威的取舍，两分类器分歧角落取合同门。
5. 决策台账：`.swarm-yuan/decisions.jsonl` 落一条 Mechanical 行（2026-11-20，restore 指向本文件）。

## 验证

模块级（本任务实测，2026-11-20）：

- `npx vitest run custom/server/outcome/` → 9 文件 203 用例全绿（含 T15 新增读端点组：正常/门关 404/404 不存在/measureId 过滤/版本优先/superseded 链）。
- `npx vitest run custom/client/kanban/components/__tests__/outcome-section.test.ts custom/client/ia2/__tests__/orchestration-outcome.test.ts` → 20 用例全绿（含读面渲染三分/降级回显两新用例）。
- `npx vitest run custom/client/kanban/` → 14 文件 78 用例全绿（kanban 域回归）。
- `npm run typecheck:harness` → 0 错误；`npm run typecheck:client:ratchet` → 19 ≤ 基线 19（无新增）。
- `node scripts/governance-lint.mjs --budget` → 0 problem(s)。
- `node scripts/maintenance/gen-doc-indexes.mjs --write` → 710 specs 对账 0 problem。

批一准出门（试点走查与全量门结果见收口提交回填与本任务报告 `.superpowers/sdd/2026-11-19-ai-native-outcome-batch1/task-15-report.md`）：
npm test 全量、merge-invariants --check、typecheck 双套复跑、people 种子＋隔离起服 REST 试点主链（建根卡→合同→激活即绑定→dispatch 快照→双签→observing→双测量→结算）。

## 设计文档影响

DESIGN_SYNC: none——正本修订已在批一 Task 15 第三段同批兑现，无需另立 touched：`docs/DESIGN.md` §4.6 治理章已补「结果绑定审批以合同门为权威、与风险档闸互斥分流」与「测量/结算读面与 OUTCOME_WORKBENCH 门」两句（§3.9 outcome 行内旧读面口径同步）；设计 spec §4.3 已追加授权边界补注（SPEC_REBIND=1 收据重绑在册）；pending-batch N03 已标注部分承接；`custom/server/AGENTS.md` 域索引已登记 outcome 域。
