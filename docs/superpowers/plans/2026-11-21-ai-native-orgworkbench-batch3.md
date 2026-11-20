# AI 原生组织运行模型·批三（组织工作台）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OutcomeTeam 团队域＋DecisionAgenda 决策议程投影＋贡献回顾域＋三 Section 客户端接线＋批二欠账（浏览器三面实物走查、pristine-replay 复跑），全批后 AI 原生组织三批收官。

**Architecture:** 团队与贡献全落既有 outcome 域/agentidentity 域加法扩展；议程是新只读投影域 orgworkbench（零写面）；宿主路由挂载走补丁 810（804 范式）。

**Tech Stack:** TS/Koa（vitest）、Vue3（组件测试）、vendor 补丁（仅 810 一枚，studio 侧 routes.ts）。

**Spec:** `docs/superpowers/specs/2026-11-21-ai-native-orgworkbench-batch3.md`（母本设计 spec §4.6/§4.7/§4.8/§5.1/§9/§10）

## Global Constraints

- 沿批一/二：OUTCOME_WORKBENCH 门、K19 ok/fail/bodyOf、注释中文、台账哈希链与原子写、不新增依赖。
- 补丁号 810（series 尾 809）；本批仅此一枚补丁。
- 每任务 TDD 先红后绿；commit 只含本任务文件。
- 议程域零写面、贡献评价只收 human-entry——任何自动写入路径=Critical。

## Review Focus

1. **候选不自动成队**——draft 团队不经 owner 确认不 active；高风险复核同人必拒。
2. **议程源失败≠空列表**——逐源 available 独立；失败源不得伪装「没有待决事项」。
3. **贡献评价不可伪造**——非 owner/verifier 签署拒、person 自评拒、缺 rationale/evidenceRefs 拒、响应无总分/排名字段。
4. **快照 teamVersion 实值**——有已确认团队时快照携带其版本，无团队仍 null（旧合同兼容）。
5. **走查是实物**——隔离 production 起服浏览器实操三面，缺陷修复后复走查；文字记录留档。

---

### Task 1: OutcomeTeam 类型/store/事件/dueAt/约束校验

**Files:**
- Modify: `custom/server/outcome/types.ts`（OutcomeTeam 接口、OutcomeEvent 增 `team_confirmed`、OutcomeContract 增可选 `dueAt?: number`）
- Modify: `custom/server/outcome/outcome-store.ts`（team.json 读写：`getTeam(outcomeId)`/`confirmTeam(outcomeId, team, updatedBy)`＝atomicWriteJson＋events.jsonl 追加 team_confirmed 事件；version 递增与 expectedVersion 冲突语义在 store 层）
- Create: `custom/server/outcome/team-validate.ts`（纯函数 `validateTeam(contract, team, people, rosterOk: (agentId)=>boolean)`：owner/verifier 成员到位、high 不同 active 自然人、person active、agent roster complete、members 非空且 subjectId 合法）
- Test: `custom/server/outcome/__tests__/team-validate.test.ts`（负面全集：高风险同人/inactive person/roster blocked agent/owner 缺席/成员空/draft 语义）；`outcome-store.test.ts` 追加（team.json 原子写、team_confirmed 事件入哈希链、expectedVersion 冲突、旧合同无 dueAt 兼容）

**Interfaces:**
- Produces: `getTeam/confirmTeam/validateTeam`；合同 dueAt 可选字段（validate.ts 输入校验同步放行）。

- [ ] TDD 红→实现→绿（npx vitest run custom/server/outcome/）→typecheck→commit `feat(outcome): OutcomeTeam 类型/存储/事件与约束校验（批三 T1）`。

### Task 2: 团队端点＋快照 teamVersion 实值

**Files:**
- Modify: `custom/server/outcome/outcome-controller.ts`（`PUT /:id/team`：owner-only、expectedVersion 409、changeReason 必填、合同状态门、幂等；`GET /:id` 响应增 team 面（当前团队或 null））
- Modify: `custom/server/outcome/snapshot.ts`（teamVersion：冻结时取 active 团队版本，无团队 null；哈希体规则同步——teamVersion 进哈希）＋`outcome-store.ts` appendSnapshot 校验处
- Test: `__tests__/outcome-controller.test.ts` 追加（401/403 非 owner/404/409 冲突/422 状态门与校验失败/幂等重放返回原团队；GET team 面）；`snapshot.test.ts` 追加（有团队快照带版本、无团队 null、版本变化哈希变化）

- [ ] TDD 红→实现→绿→typecheck→commit `feat(outcome): 团队端点与快照 teamVersion 实值（批三 T2）`。

### Task 3: approval-inbox 共享读模块提取＋议程聚合器

**Files:**
- Modify: `custom/server/approval-inbox/pending-controller.ts`（collectPendingItems 及其五源读取函数提取到 `custom/server/approval-inbox/pending-sources.ts` 共享模块；controller 改 import，行为零变化——现有测试即回归锁）
- Create: `custom/server/orgworkbench/agenda.ts`（`buildAgenda(deps): AgendaResult`——deps 注入六源读函数；每源 `{available, items|error}`；项形状 `agendaId/outcomeId?/kind/question/owner/evidenceRefs/riskTier/reversibility/age/sourceRef`；kind 枚举：`approval_pending|dual_sign_pending|outcome_overdue|premise_due|premise_refuted|review_disagreement|escalation_pending|learning_candidate|team_pending`；排序 age 降序）
- Test: `custom/server/approval-inbox/__tests__/` 既有套件全绿（回归锁）；`custom/server/orgworkbench/__tests__/agenda.test.ts`（每源命中/未命中、单源失败 available:false 不影响他源、失败不伪装零数据、例行进度不入、去重不重复计项）

**Interfaces:**
- Produces: `buildAgenda` 纯投影；`AgendaResult {generatedAt, sources: Record<AgendaSourceKind, {available, itemCount, items?, error?}>}`。

- [ ] TDD 红→实现→绿（approval-inbox＋orgworkbench 两域）→typecheck→commit `feat(orgworkbench): 议程六源投影与收件箱共享读提取（批三 T3）`。

### Task 4: org-workbench 控制器＋补丁 810

**Files:**
- Create: `custom/server/orgworkbench/org-workbench-controller.ts`（`GET /api/hermes/org-workbench/agenda`：宿主 JWT、OUTCOME_WORKBENCH 门每请求读、buildAgeme deps 接真实六源、fail(ctx,503?) 源失败语义按 available 投影不抛）
- Create: `patches/810-hermes-org-workbench-routes.patch`（bootstrap/routes.ts 追加挂载，804 范式：import＋registerRoutes 调用两段）＋`patches/series` 尾部追加
- Test: `custom/server/orgworkbench/__tests__/org-workbench-controller.test.ts`（200 正常、404 门关、401 无 JWT、逐源失败 200+available:false、门语义与 outcome-controller 同款）

- [ ] TDD 红→实现→补丁（vendor 态改 routes.ts→生成补丁→apply-check 双向→inject 重放 complete）→绿→commit `feat(orgworkbench): 议程端点与补丁 810 挂载（批三 T4）`。

### Task 5: 贡献回顾域（judgments 判别联合＋两端点）

**Files:**
- Modify: `custom/server/agentidentity/judgments.ts`（JudgmentRecord 判别联合：`kind:'contribution_review'` 分支 `outcomeId+subject+assessment`、免 unitId；`appendContributionReview(input, contract, people)`：签署人∈{owner,verifier} 且 active、person 自评拒、幂等 reviewId；listJudgments 兼容旧记录）
- Modify: `custom/server/outcome/outcome-controller.ts`（`GET /:id/contribution`：五面 fail-soft——measurements/team/judgments(contribution_review 按 outcomeId 过滤)/learning 候选与召回留痕(injectionLog 反查)/事件时间线；评审结论面恒 `{available:false, reason:'review_linkage_not_built'}`；响应结构无 rank/score/total 字段；`POST /:id/contribution-reviews`：human-entry、幂等 reviewId、校验全在服务端）
- Test: `custom/server/agentidentity/__tests__/judgments.test.ts` 追加（判别读写旧兼容、自评拒、非 owner/verifier 拒、缺字段拒）；`outcome-controller.test.ts` 追加（GET 五面+评审结论 unavailable+无排名字段断言、POST 幂等/403/422）

- [ ] TDD 红→实现→绿→typecheck→commit `feat(outcome): 贡献回顾域——judgments 判别联合与两端点（批三 T5）`。

### Task 6: 客户端三 Section＋两视图接线

**Files:**
- Create: `custom/client/governance/components/DecisionAgendaSection.vue`（消费 GET /api/hermes/org-workbench/agenda；逐源 available 折叠组、空态/失败态分文案、项点击不带写动作只显示 sourceRef 指引回原权威域）
- Create: `custom/client/governance/components/OutcomeTeamSection.vue`（按根任务查合同→GET /:id team 面；成员表 subjectKind/role/responsibility；确认团队走 PUT（owner）；高风险警示色）
- Create: `custom/client/governance/components/ContributionReviewSection.vue`（GET /:id/contribution 五面＋签署表单 POST；person 自评前端拦截＋服务端 422 兜底；无总分/排名 UI）
- Modify: `custom/client/ia2/views/gov/GovOrgKnowledgeView.vue`（三 Section 挂载，DecisionAgenda 置顶）
- Modify: `custom/client/ia2/views/orchestration/OrchestrationView.vue`（有合同显示团队版本与成员角色；无合同保持现状标注）
- Modify: effectiveness 视图（同口径对照链接一行，指向 outcome 对照面）
- Test: 三组件组件测试（挂载/空态/来源失败/交互）＋既有 ia2 回归

- [ ] TDD 红→实现→绿（组件套件＋ia2 回归）→typecheck:client --check→commit `feat(client): 组织工作台三 Section 与两视图接线（批三 T6）`。

### Task 7: 批二欠账——浏览器三面实物走查＋pristine-replay 复跑

**Files:**
- 无源码新增；走查记录落 `docs/superpowers/specs/2026-11-21-ai-native-orgworkbench-batch3.md` 收口回填节（文字化，evidence 禁新增二进制）
- 若走查发现缺陷：随批修复＋复走查（修复提交注明走查轮次）

**Steps:**
- [ ] 隔离起服：NODE_ENV=production、OUTCOME_WORKBENCH=1、HERMES_WEB_UI_HOME=/tmp 隔离、端口避开 8647 占用面。
- [ ] 浏览器实操设计 §9.4 六步：建根任务＋合同＋团队→激活→派单/审批→observing→测量→结算→学习候选→议程处理各源一项→签署贡献评价→刷新重开追溯。
- [ ] 三面各自记录：OutcomeSection（批一面）/OrchestrationView（团队版本新面）/GovOrg 三 Section（新面）；亮暗主题＋窄容器抽查；高风险/来源失败不用绿色核验。
- [ ] 8647 空窗时复跑 overlay-pristine-replay（批一/二环境性欠账）。
- [ ] 走查结论回填 spec＋commit `docs(outcome): 批三浏览器走查记录与 pristine-replay 补跑（批三 T7）`。

### Task 8: 收口——机制预算/K19/全量门/合并

**Files:**
- Modify: `config/mechanism-budget.json` changes[]（team/agenda/contribution 三面登记，sunset＋配对收敛）
- Modify: `docs/DESIGN.md` §3.9 两行＋outcome 行补 team（与 spec 设计文档影响一致，同批兑现）
- K19 棘轮按新增 ok/fail 字面量归因调基线（如新增）
- [ ] `npm test` 全量＋`node scripts/merge-invariants.mjs --check`＋`node scripts/governance-lint.mjs --budget`＋docs 索引重生成。
- [ ] spec 收口回填（各任务实测结果）＋终端审（变异探针抽查）＋rebase main→`merge --no-ff`→推送→worktree/分支 git 通道清理。
