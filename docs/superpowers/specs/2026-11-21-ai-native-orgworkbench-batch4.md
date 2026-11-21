# AI 原生组织·批四（批三挂账清偿）增量 spec

> 日期：2026-11-21
> 状态：已批准（用户指令「完成未做」＝清偿批三收官诚实清单的批后挂账项；边界=批三 spec 收口回填节挂账清单）
> 母本：`2026-11-19-ai-native-operating-model-design.md`（已批准）；批三 `2026-11-21-ai-native-orgworkbench-batch3.md`（已合并 e4e447ab9，其收口回填节为挂账正身）

## 变更

### 一、F1：OutcomeSection 建模表单（批一遗留「POST / 由后续任务接线」未接 UI）
- `custom/client/kanban/components/OutcomeSection.vue` 空态入口升级为可操作表单：根卡无合同时显示「建合同」折叠表单，字段必填集与服务端 `validateContractInput` 同源（title/valueStatement/ownerPersonId/verificationOwnerId/riskTier/defaultReversibility/learningOptIn＋acceptance{statements[]}/scope{included[]}＋measures 行可增删：measureId/name/unit/operator/target/definition）；rootTaskId=当前卡自动携带不暴露输入；clientRequestId=表单会话内生成一次、提交失败重试不换键（幂等）。
- 提交走 `@/custom/kanban/api/outcome` 新增 `createOutcome`（POST /api/hermes/outcomes）；422 problems 逐条显示；409 冲突提示刷新；成功后面板刷新进合同态（复用既有 load）。
- 表单默认值从卡上下文预填但不伪造：title 预填卡标题（可改）、owner 预填当前登录人（可改）、其余留空。

### 二、F3：绑定缺列误报定谳（走查发现）
- `custom/server/outcome/kanban-resolution.ts` bindOutcomeFamily 的 `SELECT outcome_id FROM tasks` 抛「no such column: outcome_id」类错误时，返回专用错误码 `schema_missing`（problems 指明「看板库缺 outcome_id 列（805 迁移面未覆盖该库）」），不再吞成 `root_task_missing` 误导「任务不存在」。其余 SQL 错误维持 db_unavailable。
- 控制器激活端点透传该码（422 body 带 code=schema_missing），客户端 OutcomeSection 激活失败时按码给定向文案。

### 三、D（终审 M-3 前半）：DecisionGraph 统一决策引用补三接线
- `custom/server/decisiongraph/decision-recorder.ts` 增两个记录函数（照 recordApprovalDecision 形态）：`recordLearningDecision`（expcandidates 审核决定：approve/reject）与 `recordTeamDecision`（团队确认：confirm/version）。fire-and-forget 同款（失败告警不阻断原权威域写）。
- 接线点：`custom/server/expcandidates/exp-store.ts` curateCandidate（或其控制器调用处，选实际写点）与 `custom/server/outcome/outcome-store.ts` confirmTeam。审批（approval-log）与升级（recordEscalationDecision）已在位不动。
- PremiseLog 复核决定暂不接（refute/re-eval 已有自己的 history 正身且无统一引用先例字段）——留批后观察，不在本批扩大面。

### 四、D（终审 M-3 后半）：RACI 面接团队版本（OrchestrationView 对账提示）
- `custom/client/ia2/api/orchestration.ts` 五问装配处：有已确认团队（team.version>0）时对第三问控制点做一致性对账——各任务 `raci.approver` 若非空且不在团队成员 subjectId 集，控制点 reasons 附黄条「RACI 审批人 X 不在已确认团队 vN 中」；approver 为空不提示（不伪造控制点）。
- 纯客户端投影零新端点（团队面数据已在五问装配链路内）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | F1 表单必填集与服务端校验同源、不复制第二份校验逻辑 | 单一事实源；客户端只做「必填非空」级提示，合法性强弱判定一律服务端 |
| D2 | F3 只区分 schema_missing 一个新码 | 走查实证的唯一误导形态；其余 SQL 错误 db_unavailable 已诚实 |
| D3 | DecisionGraph 只接学习/团队两类，PremiseLog 不接 | 学习与团队是批二三新增决定面（统一引用承诺的直接对象）；PremiseLog 有自身 history 正身，扩大面须独立论证 |
| D4 | RACI 对账=只读黄条提示，不改写卡 | 设计 §4.6「消费同一团队版本」的最小诚实兑现：暴露不一致让人裁决，不自动改 RACI（写面另有属主） |

## 验证

- 每任务目标 `npx vitest run <path>`（先红后绿）；服务端改动跑 `npm run typecheck:harness`；客户端跑组件测试＋`typecheck:client` ratchet。
- F1 组件测试：表单渲染/必填提示/422 problems 显示/幂等键稳定/成功刷新；F3 store 测试：缺列夹具（手建无 outcome_id 列库）→schema_missing、正常库不受影响；D recorder 测试：两函数落账形状＋原域写失败不阻断（fire-and-forget）；RACI 对账测试：approver 在/不在团队两态＋空 approver 不提示。
- 全量 `npm test`＋`node scripts/merge-invariants.mjs --check`＋`node scripts/governance-lint.mjs --budget`（机制预算：本批零新增门/脚本/账本，不登记 delta；若 reviewer 有异见按其裁决补记）。

## 收口回填（2026-11-21 实测）

- T2 `875aff2`（主会话）：bind 面缺列→schema_missing（红测先行：无列夹具实证误报→专用码）；三处读投影 catch 加 [schema_missing] 日志定向标记（返回契约零破坏）；ActivationBindCode 扩列。27/27 绿。
- T1 `2697204fa`：建模表单（必填非空级提示＋rootTaskId 自动携带＋clientRequestId 会话内稳定＋422 逐条回显＋成功刷新）；measures.sourceRef 按服务端正身收入行字段（实现者核实 validate.ts:84 逐行必填，spec 字面未列——实现取服务端）；激活 schema_missing 定向文案（按 body.code）。kanban 92 绿（+8）。
- T3 `c9b571b2f`：recordLearning/recordTeamDecision 照既有形态；引入方式取静态 import（偏离锚点的 lazy require——自证在案：approval-log.ts:29-31 注明 lazy require 在 vitest ESM 静默失败，escalation-controller 等三处静态先例）；落账点=事件＋team.json 双成功后（优于 spec 字面）；curate 同状态重写不记；4 既有测试文件加 HERMES_DECISION_GRAPH=0 关闸（afterAll 恢复）。五目录 343 绿。
- T4 `438165f9f`＋审查 I-1 修复：对账门=version>0 && status==='active'（draft/closed 团队经 API 可落盘 version≥1，draft 非已确认——黄条不得称「已确认团队」；draft/closed 态测试锚补）；ia2 989 绿（+5）。
- 整批审查：可合并 0C/1I/2M/6N——I-1 已当场修（上条）；M 级均文档面（留档 batch-review.md）不阻断。
- 全量 `npm test` 结果见合并前验证（本节不预写）。

## 设计文档影响

DESIGN_SYNC: touched
- `docs/DESIGN.md` §3.9「组织工作台议程」行补一句「学习/团队决定经 decision-recorder 落统一决策引用（fire-and-forget）」；「业务结果合同」行补「根卡建模表单已接 UI（原 API-only 挂账清偿）」。
