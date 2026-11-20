# AI 原生组织运行模型·批一（结果与授权地基）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 OutcomeContract 域（合同/事件/测量/结算/授权矩阵/最小快照）、看板与 Hermes 审批接线、根任务结果面板，并用 AIStudio 自身授权闭环试点走通首个真实结果。

**Architecture:** 新增 `custom/server/outcome/` 单一域承载结果对象；授权矩阵以纯函数＋共享判定向量在 TS（custom）与 Python（runtime/vendor 补丁）双侧同边界实现；看板 `tasks.outcome_id` 列承载任务关联；`HERMES_KANBAN_TASK` 环境变量（网关注入，session_kanban.py:175）是审批守卫的可信任务上下文。

**Tech Stack:** TS/Koa（custom server，vitest）、Python（vendor hermes-agent 补丁＋runtime 镜像，pytest）、Vue3（客户端组件测试）。

**Spec:** `docs/superpowers/specs/2026-11-19-ai-native-operating-model-design.md`（已批准；本计划实现其批一边界 §2 表、§3.3 接入边界、§4.1-4.4 契约、§2.1 试点）

## Global Constraints

- 功能门：服务端全部 `/api/hermes/outcomes*` 端点仅在 `OUTCOME_WORKBENCH=1` 时可用，否则 404 `{code:'outcome_workbench_disabled'}`。
- 不新增/升级任何依赖；HTTP 一律 `custom/server/lib/http` 的 `ok/fail/created/bodyOf`（K19）；新服务端命令跑 `npm run typecheck:harness`。
- vendor 改动只走 patches/＋series（当前尾 803，新补丁取 804/805/806）＋runtime 镜像同步；注入态不入提交。
- 注释中文、标识符英文；文案中文默认、不设假按钮；空态/来源失败/未知分别成文。
- 台账纪律：事件只追加、原子写（tmp+rename）、哈希链 `sha256(prevHash + canonical JSON)`；写失败对状态变更 fail-closed。
- 单一事实源：人员=agentidentity/people；风险词表=approval-inbox 现有正则（行为字节级不变，新增面只做加法）；任务树=vendor 看板；工程完成=completion_contract 既有权威。
- 每任务收口：目标测试绿→`git add` 本任务文件→Conventional Commits（如 `feat(outcome): ...`）。

## Review Focus

1. **合同修订使旧审批失效**——激活后 PUT 递增 version，携带旧 contractVersion 的审批/结算必须被拒（Task 12 测 409；Task 4 测 measurement 版本过滤）。
2. **双签同人两票**——high+one-way 第二签必须来自 verificationOwnerId 且与第一签不同人；同人重复批准不释放（Task 11 gateway 测；Task 12 inbox 测）。
3. **声明只可调严**——action 声明把 high 降 low / one-way 升 reversible 必须被忽略并记 basis（Task 5 测 combineProfiles）。
4. **cancelled 结果的派单**——outcome 已 cancelled 后 dispatch 反查到该 outcome 必须拒绝派单（422 `outcome_not_active`），不静默当无合同（Task 10 测）。
5. **重开使结算失效**——root 重开后 settled→active，旧 settlement 标 supersededBy，suggestVerdict 不再引用旧结算（Task 3 测）。

---

### Task 1: Outcome 类型与校验

**Files:**
- Create: `custom/server/outcome/types.ts`
- Create: `custom/server/outcome/validate.ts`
- Test: `custom/server/outcome/__tests__/validate.test.ts`

**Interfaces:**
- Produces: `OutcomeStatus`、`OutcomeVerdict = 'achieved'|'partial'|'missed'|'unknown'`、`Reversibility = 'reversible'|'costly'|'one-way'|'unknown'`、`OutcomeMeasure`（measureId/name/definition/unit/operator:'gte'|'lte'|'eq'/baseline:number|null/target:number/sourceRef）、`OutcomeContract`（spec §4.1 字段逐字，measures 无 actual）、`OutcomeMeasurement`（measurementId/outcomeId/measureId/contractVersion/actual:number|null/availability:'available'|'pending'|'unavailable'/evidenceRefs:string[]/observedAt/recordedBy/recordedAt）、`DecisionProfile`（riskTier/reversibility/externalEffect/basis:string[]）；`validateContractInput(v: unknown): { problems: string[] }`。

- [ ] **Step 1: 写失败测试** `validate.test.ts`：合法最小合同（1 measure+owner+verifier）通过；measures 与 acceptance.statements 双空→problem；operator 非法；target 非有限数；riskTier='high' 且 owner===verifier→problem（low/medium 允许同人并返回分离提示字段）；rootTaskId 缺失/超 128 字符；processRef 缺 definitionVersion。
- [ ] **Step 2:** `npx vitest run custom/server/outcome/__tests__/validate.test.ts` → FAIL（模块不存在）。
- [ ] **Step 3:** 实现 types.ts＋validate.ts（纯函数、无 IO；校验逐条对应测试）。
- [ ] **Step 4:** 复跑 → PASS。
- [ ] **Step 5:** `git add` 两文件＋测试；`feat(outcome): 合同类型与校验纯函数`。

### Task 2: 事件台账与 outcome-store

**Files:**
- Create: `custom/server/outcome/outcome-store.ts`
- Test: `custom/server/outcome/__tests__/outcome-store.test.ts`

**Interfaces:**
- Consumes: Task 1 类型。
- Produces: `OutcomeEvent`（eventId/outcomeId/contractVersion/type/at/actor/payload/hash/prevHash；type ∈ `'contract_created'|'contract_activated'|'contract_updated'|'measurement_appended'|'status_changed'|'settlement_signed'|'context_snapshot_created'|'settlement_superseded'`）；存储布局 `underWebUi('outcome')/<outcomeId>/`（contract.json 当前合同＋events.jsonl 追加）；`createContract(input, actor)`（rootTaskId 已存在→`{ok:false, code:'root_task_taken'}`；幂等键 clientRequestId 重复返回原合同）、`getContract(outcomeId)`、`findByRootTask(rootTaskId)`、`updateContract(outcomeId, patch, expectedVersion, actor)`（expectedVersion 不符→`{ok:false, code:'version_conflict'}`；成功递增 version 并发 contract_updated）、`appendEvent`/`listEvents`、`appendMeasurement`（measurementId 幂等：重复返回原事实 added:false）、`listMeasurements(outcomeId, measureId?)`（从 events 过滤派生，不落第二份存储）、`_useOutcomeStoreForTests(dir)` env 逃生同 judgments 先例。

- [ ] **Step 1: 写失败测试**：create→findByRootTask 命中；同 rootTaskId 二次 create 拒 root_task_taken；clientRequestId 重放幂等；update 版本冲突与成功递增；events 哈希链首条 prevHash='GENESIS'、第二条 hash=sha256(前条 hash＋本条 canonical JSON)；appendEvent 写盘失败（目录只读夹具）→`{ok:false}` 且 contract.json 未变（fail-closed）；measurement 重放 added:false。
- [ ] **Step 2:** 跑测 FAIL。**Step 3:** 实现（原子写用 `../lib/fs-store` 的 atomicWriteJson/appendJsonl；canonical JSON=键排序序列化）。**Step 4:** PASS。**Step 5:** commit `feat(outcome): 事件台账与存储（哈希链/幂等/版本并发）`。

### Task 3: 状态机与重开语义

**Files:**
- Create: `custom/server/outcome/state-machine.ts`
- Test: `custom/server/outcome/__tests__/state-machine.test.ts`

**Interfaces:**
- Produces: `transitionGuards(contract, to, guards: { allTasksTerminal: boolean; reason?: string }): { ok: true } | { ok: false; problems: string[]; code?: string }`——draft→active（校验过 Task 1 validateContractInput）；active→observing（须 allTasksTerminal）；observing→settled（仅经 settle 端点，状态机返回 needs_settlement code）；draft/active/observing→cancelled（reason 非空）；settled 无出边（code `settled_terminal`，重开走 reopen）。`applyReopen(contract, latestSettlementId): { contract: OutcomeContract; supersededSettlementId: string } | null`（仅 settled/observing 态生效：settled→active、observing→active；null=非重开态）。

- [ ] **Step 1: 写失败测试**：全迁移合法路径；draft 缺 measure 阻断 active；active→observing 带 allTasksTerminal=false 拒（code `tasks_unfinished`）；settled→任意拒；cancelled reason 空拒；applyReopen settled→active 且返回旧结算 id；applyReopen active→null。
- [ ] **Step 2** FAIL → **Step 3** 实现（纯函数）→ **Step 4** PASS → **Step 5** commit `feat(outcome): 结果状态机与重开失效语义`。

### Task 4: 测量绑定与结算建议

**Files:**
- Create: `custom/server/outcome/settlement.ts`
- Test: `custom/server/outcome/__tests__/settlement.test.ts`

**Interfaces:**
- Consumes: Task 1/2 类型。
- Produces: `suggestVerdict(contract, measurements): { verdict: OutcomeVerdict; perMeasure: Array<{ measureId; met: boolean | null }>; missingMeasureIds: string[] }`——每个 measure 只认 `contractVersion === contract.version` 的最新一条（旧版本测量只作历史）；operator 比较（actual=null/availability≠'available'→met:null）；全部有值且全 met→'achieved'；全有值部分 met→'partial'；全有值全不 met→'missed'；任一 missing→'unknown'＋missingMeasureIds。`settle(store 内部用)` 不在本任务（控制器 Task 7 组装）：本任务另产 `validateSettlementInput`（verdict='unknown' 必须带 gapNote 非空与 nextReviewAt；rationale≥20 字；measurementIds⊆当前版本测量）。

- [ ] **Step 1: 写失败测试**：四 verdict 分支；版本过滤（v2 合同＋v1 测量→missing）；actual=null→met:null→unknown；gte/lte/eq 边界（target 相等）；unknown 缺 gapNote 拒；rationale 19 字拒。
- [ ] **Step 2** FAIL → **Step 3** 实现 → **Step 4** PASS → **Step 5** commit `feat(outcome): 测量版本绑定与结算建议`。

### Task 5: DecisionProfile 与授权矩阵（双侧向量）

**Files:**
- Create: `custom/server/outcome/decision-matrix.ts`
- Create: `custom/server/outcome/decision-vectors.json`
- Modify: `custom/server/approval-inbox/risk-tier.ts`（委托，行为字节级不变）
- Test: `custom/server/outcome/__tests__/decision-matrix.test.ts`
- Test: `custom/server/approval-inbox/__tests__/risk-tier.test.ts`（既有文件追加回归）

**Interfaces:**
- Produces: `classifyDecisionProfile(input: { kind:'command'|'review'|'kanban'; detail?; title?; domain? }): DecisionProfile`——riskTier 复用 risk-tier.ts 既有正则（同判据）；reversibility v1 映射：命中 one-way 词表（publish/git push/drop|truncate table/kubectl delete/发布/上线/发版）→'one-way'，其余写副作用→'unknown'，纯只读 LOW_COMMAND_LEAD→'reversible'；externalEffect=命中对外词表（push/publish/deploy/发送/上传）。`combineProfiles(auto, declared?): DecisionProfile`——declared 只可调严（risk 只升不降、reversibility 只向 one-way 收、externalEffect 只可置 true），违规项忽略并记 basis。`evaluateOutcomeAction(input: { mode; profile }): { action:'allow'|'ask'|'deny'; dualSignRequired: boolean; decidedBy: string; rule: string }`——按 spec §4.3 表逐格：high+one-way→ask+dualSign；high|one-way|unknown|externalEffect 任一→ask；medium|costly→build:ask、guarded/yolo:allow（decidedBy='policy:risk-evaluated'）；low+reversible+!external→allow；mode='plan'→deny（decidedBy='policy:plan-readonly'）。`risk-tier.ts` 的 `classifyApprovalRisk` 改为 `classifyDecisionProfile(...).riskTier` 的薄委托，输出与现状完全一致。

- [ ] **Step 1: 写失败测试** decision-matrix.test.ts：遍历 decision-vectors.json 全量断言（向量文件含四 mode×三 risk×四 reversibility×externalEffect 代表格＋plan 格＋high+one-way 双签格，≥30 条）；combineProfiles 调松三例（降 risk/升 reversibility/撤 external）忽略＋调严三例生效。
- [ ] **Step 2: 写回归测试** risk-tier.test.ts 追加：对既有代表输入，改委托前后输出逐一相等（锁行为）。
- [ ] **Step 3** 跑两文件 FAIL → **Step 4** 实现 → **Step 5** PASS → **Step 6** commit `feat(outcome): 决策画像与授权矩阵（共享判定向量）`。

### Task 6: 最小上下文快照

**Files:**
- Create: `custom/server/outcome/snapshot.ts`
- Test: `custom/server/outcome/__tests__/snapshot.test.ts`

**Interfaces:**
- Consumes: Task 1 类型；`OutcomeContextSnapshot`（spec §4.4 逐字：content 物化、sourceRefs、excludedSources、teamVersion:null、sha256）。
- Produces: `buildMinimalSnapshot(input: { contract: OutcomeContract; decisionPolicyVersion: string; resolve: { task(): { ok: boolean; task?: { id; title; status } }; people(ids: string[]): { ok: boolean; people?: Array<{ id; name; active }> } } }): { ok: true; snapshot } | { ok: false; problems: string[] }`——content=合同规范子集（title/valueStatement/measures/acceptance/scope/riskTier/defaultReversibility/owner、verifier 身份行/任务摘要/策略块）的 canonical JSON；临界：canonical>1 MiB 或 sourceRefs>100 → ok:false（不截断）；contract/people/task 任一关键源失败→ok:false；非关键源失败→进 excludedSources；同输入 sha256 稳定；快照持久化 `snapshots.jsonl` 追加（store 扩展 `appendSnapshot/listSnapshots`，同 Task 2 纪律）。

- [ ] **Step 1: 写失败测试**：同输入两次构建 hash 相等；task 失败→ok:false；people 部分缺席（非关键）→excludedSources 含 people 行且 ok:true；构造 1.1 MiB content→拒；101 个 sourceRefs→拒；teamVersion 恒 null（批一）。
- [ ] **Step 2** FAIL → **Step 3** 实现 → **Step 4** PASS → **Step 5** commit `feat(outcome): 派单最小上下文快照（物化/哈希/临界拒绝）`。

### Task 7: REST 控制器与功能门

**Files:**
- Create: `custom/server/outcome/outcome-controller.ts`
- Test: `custom/server/outcome/__tests__/outcome-controller.test.ts`

**Interfaces:**
- Consumes: Task 2-6 全部 API；`agentidentity/people` 的名单（owner/verifier active 校验）；签署权限按 spec §4.6（激活/修订/取消/结算/测量=owner 或 verifier；observing 迁移=owner 或 verifier；actor 取服务端身份，客户端不得传 signedBy）。
- Produces: 路由前缀 `/api/hermes/outcomes`——`GET /`（query status/rootTaskId/owner）、`POST /`（clientRequestId；rootTaskId 冲突 409）、`GET /:id`、`PUT /:id`（expectedVersion）、`POST /:id/transitions`（eventId 幂等；非法 422 带 problems）、`POST /:id/measurements`（measurementId；evidenceRefs 必填）、`POST /:id/settlement`（settlementId；verdict='unknown' 须 gapNote+nextReviewAt；结算前打印 suggestVerdict 供签署人参考但不代决）、`POST /:id/context-snapshots`、`GET /:id/context`（?snapshotId 指定）。全端点 OUTCOME_WORKBENCH 门（404 outcome_workbench_disabled）。observing 迁移的 allTasksTerminal 守卫由 Task 10 的 `tasksByOutcome` 提供；本任务先以注入接口 `opts.tasksTerminalOf(outcomeId)` 承接，Task 10 接真实现。

- [ ] **Step 1: 写失败测试**：门关→404；创建/查询/幂等/409；transitions 非法迁移 422；measurements 缺 evidenceRefs 422；settlement unknown 缺 gapNote 422、版本冲突 409；非 owner actor 调结算 403；GET 聚合快照列表 fail-soft。
- [ ] **Step 2** FAIL → **Step 3** 实现（K19 ok/fail/created；错误信封带 problems）→ **Step 4** PASS → **Step 5** `npm run typecheck:harness` 绿 → **Step 6** commit `feat(outcome): 结果 REST 控制器与 OUTCOME_WORKBENCH 门`。

### Task 8: 宿主路由挂载补丁

**Files:**
- Create: `patches/804-server-outcome-routes.patch`
- Modify: `patches/series`（尾追加）

**Interfaces:**
- Consumes: Task 7 `outcomeRoutes`。
- 步骤照 773-server-standing-agenda-routes.patch 范式（vendor bootstrap/routes.ts import＋app.use）。

- [ ] **Step 1:** 在注入态手工接线（git diff 存补丁→还原），series 尾登记带注释引用本批 spec。
- [ ] **Step 2:** `npm run inject` 全量重放绿（8647 占用时登记环境阻塞、择窗复跑）。
- [ ] **Step 3:** `npx vitest run custom/server/outcome/__tests__/` 绿 → commit `feat(outcome): 宿主路由挂载补丁 804`。

### Task 9: 看板 outcome_id 列与子任务继承（补丁 805＋runtime 镜像）

**Files:**
- Create: `patches/805-agent-kanban-outcome-id.patch`
- Modify: `patches/series`
- Modify（补丁触碰面镜像）: `runtime/` 对应镜像文件
- Test: `runtime/tests/hermes_cli/test_outcome_inheritance.py`

**Interfaces:**
- Produces: vendor `kanban_db.py` tasks 表 `outcome_id TEXT` 列（迁移照 workflow_template_id 先例：CREATE TABLE 增列＋既有库 ALTER 惰性迁移）；`kanban_decompose.py` 建子卡时 `outcome_id` 继承父卡；Studio 侧写入口=合同激活时把根任务 `outcome_id` 写入（照 patches/366 raci-assign 的服务端写先例，TS 侧函数 `bindOutcomeToTask(taskId, outcomeId)` 落 `custom/server/outcome/kanban-bind.ts`，读写经既有 hermes kanban 服务通道）。
- 关键约束：子任务不得改挂其他 outcome（服务端更新该列仅允许「空→值」或同值；改挂须结果责任人显式迁移事件——批一只实现拒绝）。

- [ ] **Step 1: 写失败 pytest**：decompose 后子卡 outcome_id=父卡；旧库无列→首写触发 ALTER 且不坏数据；TS 侧 vitest：bindOutcomeToTask 空→值成功、已值且不同→拒（code `outcome_rebind_forbidden`）。
- [ ] **Step 2:** pytest/vitest FAIL → **Step 3:** 补丁＋镜像＋TS 实现 → **Step 4:** `PYTHONPATH=vendor/hermes-agent python3.14 -m pytest runtime/tests/hermes_cli/test_outcome_inheritance.py -q` 绿＋vitest 绿 → **Step 5:** inject 重放 → **Step 6** commit `feat(outcome): 看板 outcome_id 列与继承（补丁 805）`。

### Task 10: column.dispatch 结果解析与快照接线

**Files:**
- Create: `custom/server/outcome/kanban-resolution.ts`（`outcomeOfTask(taskId)`、`tasksByOutcome(outcomeId): Array<{id;status}>`——读既有 hermes kanban 读通道）
- Modify: `custom/server/kanban/column-dispatch.ts`
- Test: `custom/server/outcome/__tests__/kanban-resolution.test.ts`
- Test: `custom/server/kanban/__tests__/`（dispatch 相关既有文件追加）

**Interfaces:**
- Produces: dispatch 流程在派发 step 前按 taskId 反查 outcome：无合同→原行为；有合同且 status='cancelled'|'settled'→抛 `OutcomeDispatchError`→REST 422 `outcome_not_active`；有合同且 active/draft→生成最小快照（Task 6），关键源失败→422 `outcome_context_unavailable`；`ColumnDispatchResult` 增 `outcome?: { outcomeId; contractVersion; snapshotId }`；Task 7 的 `tasksTerminalOf` 接 `tasksByOutcome`（全部子卡终态=done/archived/cancelled 才 true）。

- [ ] **Step 1: 写失败测试**：无合同不变；cancelled→拒；快照关键源失败→拒；active→结果透出 outcome 三元组；tasksTerminalOf 混合状态判定。
- [ ] **Step 2** FAIL → **Step 3** 实现（fail-soft 读、fail-closed 门）→ **Step 4** PASS（含 dispatch 既有回归目录）→ **Step 5** commit `feat(outcome): 派单结果解析/快照/终态守卫接线`。

### Task 11: Hermes 审批守卫接线（补丁 806＋runtime 镜像）

**Files:**
- Create: `patches/806-agent-approval-outcome-guard.patch`
- Create（镜像主体）: `runtime/tools/outcome_policy.py`＋vendor 侧同文件经补丁落位
- Modify: `patches/series`
- Test: `runtime/tests/tools/test_outcome_policy.py`

**Interfaces:**
- Consumes: `decision-vectors.json`（pytest 读仓相对路径断言同边界）；`HERMES_KANBAN_TASK` 环境变量；vendor `outcome_policy.py`：`outcome_context() -> dict|None`（env→taskId→sqlite 只读查 outcome_id→读 `~/.hermes-web-ui/outcome/<id>/contract.json`，任一环缺席→None=非 outcome-scoped，走既有行为）、`evaluate(command: str) -> {action, dual_sign_required, profile}`（分类词表与 TS 同源判定向量锁定）、`combine_declared`。
- Produces: `tools/approval.py` 守卫在既有 floors 与 yolo 判定之间插入：outcome-scoped 且 evaluate→'deny'（身份/版本不可证）→按 guardian deny 处理；'ask'→走既有 pending 流，high+one-way 时审批条目标记 `dual_sign_required`＋需两份不同签署人（session 状态记录第一签者，第二签不同人方释放；同人二票不释放）；'allow'→放行并在 approval_ledger 记录 outcome 引用（outcomeId/contractVersion）。

- [ ] **Step 1: 写失败 pytest**：向量文件全量断言；outcome_context 各环缺席→None；dual-sign 首签不释放、同人二票不释放、verifier 二签释放；allow 记账带 outcome 引用。
- [ ] **Step 2** FAIL → **Step 3:** 补丁＋镜像＋approval.py 接线 → **Step 4:** pytest 绿＋vitest decision-matrix 绿（同向量）→ **Step 5:** inject 重放 → **Step 6** commit `feat(outcome): 审批守卫 outcome 接线与双签（补丁 806）`。

### Task 12: Approval Inbox 结果绑定与双签分支扩展

**Files:**
- Modify: `custom/server/approval-inbox/pending-controller.ts`（505-546/556-623 双签先例分支扩展）
- Test: `custom/server/approval-inbox/__tests__/`（追加 outcome 用例）

**Interfaces:**
- Consumes: Task 5 矩阵、Task 10 outcomeOfTask。
- Produces: 携带 outcome 上下文的待审项（kind=command/review/kanban 且 taskId 反查到 active 合同）标注 outcomeId/contractVersion；decide 时：contractVersion 与当前不符→409 `stale_contract`；high+one-way→要求 owner 与 verifier 两笔不同 actor 顺序批准（复用既有双签分支，签署人集合=合同字段而非仅 fleet:/enf: 前缀）；第二签完成才落 resolved。

- [ ] **Step 1: 写失败测试**：stale contractVersion 409；单签 high+one-way 仍 pending；owner 两票不生效；owner+verifier 顺序两笔→resolved；无 outcome 项行为回归不变。
- [ ] **Step 2** FAIL → **Step 3** 实现 → **Step 4** PASS（含 approval-inbox 既有回归）→ **Step 5** commit `feat(outcome): 审批收件箱结果绑定与双签扩展`。

### Task 13: 根任务结果面板（客户端）

**Files:**
- Create: `custom/client/kanban/api/outcome.ts`（authFetch 封装，照 ide/api/workitem.ts 范式）
- Create: `custom/client/kanban/components/OutcomeSection.vue`
- Modify: `custom/client/kanban/components/KanbanTaskDrawer.vue`
- Test: `custom/client/kanban/components/__tests__/outcome-section.test.ts`

**Interfaces:**
- Consumes: Task 7 端点。
- Produces: 抽屉内 OutcomeSection——GET /outcomes?rootTaskId= 命中则展示状态/版本/measures（baseline·target·最新 actual·availability）/结算摘要，提供激活/观察/取消/测量提交/结算表单（权限不符时按钮禁用并示因）；无合同且该卡为根卡（无 parents）→「建模业务结果」入口；无合同非根卡→不渲染；404 outcome_workbench_disabled→整段不渲染（不报错）。

- [ ] **Step 1: 写失败组件测试**：有合同渲染状态与 measures；unknown 结算显示缺口文案；门关不渲染；非 owner 提交按钮禁用。
- [ ] **Step 2** FAIL → **Step 3** 实现 → **Step 4** PASS → **Step 5** commit `feat(outcome): 根任务结果面板`。

### Task 14: OrchestrationView 真实合同显示

**Files:**
- Modify: `custom/client/ia2/api/orchestration.ts`（`fetchOutcomeByRoot(rootTaskId)`）
- Modify: `custom/client/ia2/views/orchestration/OrchestrationView.vue`
- Test: `custom/client/ia2/__tests__/orchestration-outcome.test.ts`

**Interfaces:**
- Produces: 五问面板第 1 问「业务结果与负责人」：根卡有合同→真实 title/owner（people 名）/status/measures 摘要/合同版本，实测口径脚注同步更新；无合同→现有启发式＋「未建模业务结果」徽标；API 失败→该小节 fail-soft 标不可用，画布不受影响。

- [ ] **Step 1: 写失败测试**：有合同渲染真实 owner 与版本；无合同徽标；API 500→小节示不可用不炸。
- [ ] **Step 2** FAIL → **Step 3** 实现 → **Step 4** PASS → **Step 5** commit `feat(outcome): 协同图接入真实结果合同`。

### Task 15: 机制预算、设计正本同步与试点收口

**Files:**
- Modify: `config/mechanism-budget.json`（changes[]：outcome 域/快照/矩阵＋sunset owner=plusprimer、reviewBy、retireWhen；配对收敛=risk-tier 委托归一＋N03 任务卡结构化由本批 outcome 字段部分承接）
- Modify: `docs/DESIGN.md`（§3.9 权威数据源表补 OutcomeContract/OutcomeEvent/快照行；治理章补矩阵与结算语义两句）
- Modify: `docs/superpowers/specs/2026-11-19-process-framework-pending-batch.md`（N03 标注「批一部分承接」）
- Create: `docs/superpowers/specs/2026-11-19-ai-native-outcome-batch1.md`（增量 spec：变更/决策记录/验证/设计文档影响四段，记录实现事实）
- Test: 全量门＋试点

- [ ] **Step 1:** 机制预算与 DESIGN.md/索引（`node scripts/maintenance/gen-doc-indexes.mjs --write`）随批修订；增量 spec 四段成文。
- [ ] **Step 2:** 试点执行：people 种子激活 plusprimer（scripts/maintenance/hrgov-seed.mjs）→根任务建合同（owner=plusprimer、high/one-way 试一动作）→走 dispatch 快照→审批双签→observing→按 spec §2.1 双 measure 人工核验真实日志后提交测量→结算；浏览器走查 OutcomeSection/OrchestrationView/Inbox 全链（NODE_ENV=production serve 双态配方）。
- [ ] **Step 3:** 独立核验：非实现者复核测量计算与日志证据（EGM 冷读协议；无子代理则停机不自证）。
- [ ] **Step 4:** 全量门：`npm test`（8647 占用时择窗）＋`node scripts/merge-invariants.mjs --check`＋typecheck 双绿；失败如实入交付说明。
- [ ] **Step 5:** commit `chore(outcome): 机制预算/设计正本/试点收口`。

---

## 执行说明

- 任务依赖：1→2→3/4/5（3、4、5 可并行）→6→7→8；9/10 依赖 2＋7 接口；11 依赖 5＋9；12 依赖 5＋10；13/14 依赖 7；15 收口。Task 5 的向量文件是 TS/Python 双侧契约，先于 9-12 落地。
- 验收红线（批一准出）：试点结果从合同走到结算且 unauthorized=0、trace_coverage 分母非零时=100%；high/one-way 未授权必拒（gateway 与 inbox 两面）；存量无 outcomeId 卡行为字节级不变。
