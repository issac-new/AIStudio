# AI 原生组织运行模型·批三（组织工作台）增量 spec

> 日期：2026-11-21
> 状态：已批准（用户指令「完成未做及后续批二、批三」＝方向授权；本批边界沿设计 spec §2 批表）
> 母本：`2026-11-19-ai-native-operating-model-design.md`（已批准）；批一 `2026-11-20-ai-native-outcome-batch1.md`（已合并 6759d1919）；批二 `2026-11-20-ai-native-cognition-batch2.md`（已合并 3c17cb04d）

## 变更

### 一、OutcomeTeam 团队域（设计 §4.6）
- `custom/server/outcome/types.ts` 增 `OutcomeTeam`：`{outcomeId, version, members: Array<{subjectKind:'person'|'agent', subjectId, role, responsibility}>, status:'draft'|'active'|'closed', changeReason, updatedBy, updatedAt}`；合同增可选 `dueAt?: number`（缺省=无逾期判定，旧合同零迁移）。
- 存储：outcome 目录内 `team.json`（最新态，atomicWriteJson 同 contract.json 纪律）＋`events.jsonl` 追加 `team_confirmed` 事件（哈希链延续批一既有事件枚举）。
- 约束校验纯函数 `validateTeam`：团队无独立 accountable/reviewer 字段——约束改为「合同 ownerPersonId 与 verificationOwnerId 必须各有一名对应成员（role 承载 accountable/reviewer 语义）」；riskTier==='high' 时 owner 与 verifier 必须不同 active 自然人（复用 people.activePersonIds）；person 成员必须 active；agent 成员必须 `rosterStatus==='complete'`（name/can/cannot 三字段，不发明「可用阶段」新枚举）；候选团队不自动成队——draft 经 owner 显式确认才 active。
- 快照 `teamVersion` 由恒 null 变实值：冻结派单上下文时取当前已确认（active）团队版本，无团队仍 null。

### 二、团队端点（设计 §6）
- `PUT /api/hermes/outcomes/:id/team`：仅 owner（服务端身份）；`expectedVersion` 并发（冲突 409）；`changeReason` 必填；成功写 `team_confirmed` 事件；受 OUTCOME_WORKBENCH 门。合同非 active/observing 时拒（422 `outcome_not_active` 同语义）。

### 三、DecisionAgenda 决策议程（设计 §4.7，只读投影零写面）
- 新模块 `custom/server/orgworkbench/agenda.ts` 六源聚合，每源独立 `available`（源失败≠「没有待决事项」，fail-soft）：
  1. 待审批/双签：approval-inbox `collectPendingItems` 提取为共享读模块（controller 改调共享件，行为字节级不变、回归锁钉住）；议程收 `dualSignRequired===true` 或 `outcomeRef` 非空的条目。
  2. 逾期结果：合同 `dueAt != null && dueAt <= now && status ∈ {active, observing}`（kind `outcome_overdue`）。「阻塞」不伪造状态机 blocked 态——被审批卡住的信号由源 1 覆盖，不重复计项。
  3. PremiseLog：`dueQueue`（到期 hold/pending）＋`status==='refuted'`（被推翻）。
  4. 评审分歧和升级：ReviewFinding open 态 verifications confirm+reject 并存＝分歧；escalation `listPending()`。
  5. 待审核学习候选：expcandidates `status==='candidate'`。
  6. 待确认团队变更：OutcomeTeam `status==='draft'`。
- 议程项形状按设计 §4.7：`agendaId/outcomeId?/kind/question/owner/evidenceRefs/riskTier/reversibility/age/sourceRef`；例行进度不进入。
- 人处理决定仍回原权威域（审批账/PremiseLog/expcandidates/OutcomeTeam）；议程不提供任何写端点。

### 四、org-workbench 控制器＋补丁 810
- `custom/server/orgworkbench/org-workbench-controller.ts`：`GET /api/hermes/org-workbench/agenda`（宿主 JWT＋OUTCOME_WORKBENCH 门，每请求动态读）。
- 补丁 `810-hermes-org-workbench-routes.patch`：宿主 `bootstrap/routes.ts` 追加挂载（804 范式；series 尾 809 起独占递增）。

### 五、贡献回顾域（设计 §4.8）
- `agentidentity/judgments.ts` 的 `JudgmentRecord` 扩展为判别联合：旧六 kind（acceptance/rejection/override/escalation/pause/capability）不变仍要求 `unitId`；新 `kind='contribution_review'` 改用 `outcomeId＋subject:{subjectKind:'person'|'agent'|'team', subjectId}`＋`assessment:'effective'|'mixed'|'ineffective'|'unknown'`；`rationale`（≥20 字）与 `evidenceRefs` 依旧强制；`source` 恒 `human-entry`。judgments.jsonl 追加制，旧记录无 kind 字段按旧形状判别读。
- `GET /api/hermes/outcomes/:id/contribution`：事实层五面 fail-soft——测量、团队角色、人署名评价（contribution_review）、学习候选与召回留痕（injectionLog 按 outcome 反查）、事件时间线；「评审结论」面 v1 标 unavailable（评审域无 outcome 外键，不伪造逐条挂接）。响应无总分/排名/因果信用比例字段。
- `POST /api/hermes/outcomes/:id/contribution-reviews`：签署人必须 ∈ {ownerPersonId, verificationOwnerId} 且 active 自然人（服务端身份，客户端不得指定 signedBy）；subject 为 person 时禁止自评；幂等键 `reviewId` 重复返回原记录。

### 六、客户端三 Section＋两视图接线（设计 §5.1）
- `GovOrgKnowledgeView` 增 `DecisionAgendaSection`（置顶，置于现有五流/知识/决策图谱之前）、`OutcomeTeamSection`、`ContributionReviewSection`（组件落 `custom/client/governance/components/`，沿用 `@/custom` alias 与既有 Section 外壳）。
- `OrchestrationView`：有合同时显示当前团队版本与成员角色（消费既有 `GET /:id` 扩展面）；无合同保持现状标注。
- effectiveness 视图：只增同口径结果对照链接，不新增排行榜。
- 界面诚实态：空数据/来源失败/指标未知分别文案；高风险、one-way、来源不可用不用绿色；中文文案＋英文标识符。

### 七、批二欠账清偿
- **补丁 778 丢段根治（T7 前置，随批三落地）**：v0.8.28 重锚（83a38d3e8）把 778 的 sockets/chat-run.ts 定义段整段丢失（SurfaceRuns/SurfaceError import、surfaceRuns 成员、requestUiSurface、begin/finish 接线），且残留段头无 a/ b/ 前缀——ts-node 起服编译红（surfaceRuns 不存在），批二点五与批二两轮受阻的同根因在升级合入后仍未消除（vitest 不走起服编译、pristine-replay 只验 apply，故全量门不红）。按「外部阻塞复现两次即换策略」立法本批根治：五定义段按 v0.8.28 上下文重锚回补、段头规整为 a/ b/ 形态、畸形头旧段删除；重放五前置补丁生成 777 态后正向 diff 重组，全量 clean＋inject 与修复态逐字节一致；隔离起服编译零错、ekko 域 14/14 绿。
- **补丁 640 同族丢段根治（T7 走查建号前置）**：同轮重锚把 640 的 bin/hermes-web-ui.mjs 段中 generateAdminPassword/writeAdminLoginFile/resetDefaultLogin 重写段丢失（-74 行），致 CLI reset-default-login 引用已删除的 DEFAULT_PASSWORD 直接 ReferenceError——隔离建号通道断。同配方修复：函数体按现文件锚点回补（含 SecNoDefaultCred END 标记与悬空括号清理），pristine 态直接 diff 重组段（640 前无其他补丁触及该文件）；全量重注入逐字节一致，建号/重置两路径实测通（随机密码 0600 落 admin-login.json）。
- 浏览器三面实物走查（批一 I-1＋批二 T7 两次受阻；778 根治后通道恢复）：隔离 production 起服（NODE_ENV=production、OUTCOME_WORKBENCH=1、HERMES_WEB_UI_HOME 隔离）按设计 §9.4 六步实操；记录文字化留档（evidence 禁新增二进制，仓规）。
- `overlay-pristine-replay` 复跑（8647 空窗时；批一/二两轮环境性登记的欠账）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | OutcomeTeam 落 outcome 目录 team.json＋events.jsonl 事件，不建新顶层存储 | 设计 §7.2「新代码只承载既有系统没有的对象」；事件哈希链延续批一语义，避免第二套账本 |
| D2 | dueAt 可选字段＋不发明 blocked 状态 | 状态机无 blocked、合同无时限的现状下，「阻塞或逾期」唯一诚实实现=可选 dueAt 逾期判定；阻塞信号由源 1 覆盖不重复计项 |
| D3 | 议程审批源复用 collectPendingItems（提取共享模块） | 单一事实源；五源聚合逻辑不复制；controller 行为回归锁钉住 |
| D4 | 评审分歧判据=同 finding verifications confirm+reject 并存（open 态） | reviewgov 收敛机制原生信号（verifyFinding 禁自证），不新建分歧台账 |
| D5 | agent 成员准入=rosterStatus complete 三字段 | AgentIdentity 无「可用阶段」枚举字段；rosterStatus 是既有权威判据 |
| D6 | 贡献事实层 v1 五面＋评审结论面标 unavailable | 评审域无 outcome 外键，逐条挂接成本高且易伪造；fail-soft 不猜数优先 |
| D7 | 补丁号 810 | series 尾 809 起独占递增；撞号让号先例（807/808/809） |
| D8 | 团队约束不复制 accountable/reviewer 字段到 OutcomeTeam | 设计 §4.6 归属节：合同 ownerPersonId/verificationOwnerId 是唯一责任人正身；团队以成员 role 承载，避免双正本漂移 |
| D9 | 议程与贡献端点全部只读或 human-entry，零自动写 | 设计 §4.7/§4.8 反目标：不允许一次成败静默改规则、不生成排名 |
| D10 | 议程读源=七个 source key（reviewgov 与 escalation、合同与团队按账本拆独立）而非 spec 字面「六源」；评审源受 listCases 隐性 cap 500 截断且截断先于排序（复用既有语义） | 「每源独立 available」只有账本粒度才诚实（合并账本会连带误报或吞错伪装零数据）；理据注释在 agenda.ts:33-37。cap500 截断信号留待后续按需补（终审 M-1 注记） |
| D11 | OutcomeTeam 裁剪 familyRef 字段；「系统给出候选团队」（设计 §5.2 步 2）落为手工编辑成员表而非 team-library 自动候选 | team-library 候选面无 outcome 关联外键，自动候选会伪造建议；owner 手工确认更符合「候选不自动成队」红线（终审 M-2 注记） |

## 验证

- 每任务目标 `npx vitest run <path>`（先红后绿）＋新增服务端模块 `npm run typecheck:harness`。
- 控制器矩阵：正常/401/403/404/409（expectedVersion、幂等键）/422/依赖失败逐源模拟（失败不伪装零数据）。
- 负面测试（设计 §9.1）：候选不自动成队；高风险复核同人拒；person 成员 inactive 拒；agent 成员 roster blocked 拒；议程源失败≠空列表；非 human-entry 拒；缺 rationale/evidenceRefs 拒；person 自评拒；响应无总分/排名字段。变异探针：删高风险复核分离、伪造 signedBy、给响应加 rank 字段——对应测试必须红。
- 补丁 810 双向 apply-check＋`npm run inject` 重放 complete；浏览器走查记录文字留档。
- 全量 `npm test`＋`node scripts/merge-invariants.mjs --check`＋`node scripts/governance-lint.mjs --budget`。

## 收口回填（2026-11-21 实测）

### 浏览器六步走查（T7a，全链通）

隔离栈：8648 后端（NODE_ENV=production＋OUTCOME_WORKBENCH=1＋HERMES_WEB_UI_HOME/HERMES_HOME/HERMES_KANBAN_HOME 三隔离）＋8649 vite dev 代理；admin 随机口令（640 修复后 CLI 建号）注入会话。全链实录：

- ① 建根任务（看板 UI 待分拣列）：`t_b32a98f6` 创建成功，任务计数 0→1。
- ② 建合同：OutcomeSection 空态如实提示「尚未建模业务结果」；合同经 API 建（`oc-mwpclgsg-cjy06k`，high/one-way 双测量，verifier-b3 双人）——**UI 无建模表单系批一既定缺口**（组件注释自认「POST / 由后续任务接线」未接线），见发现 F1。
- ③ 激活（抽屉 UI 激活按钮）：首次诚实拒绝（绑定扫不到根卡）；补隔离库 outcome_id 列后重试成功（**发现 F4/F3**：vendor 建表的 fresh 库无 805 列；缺列被误报为「任务不存在」）；合同生效、激活即绑定全家。
- ④ 团队（gov-org OutcomeTeamSection）：查询面渲染合同卡＋高风险警示文案；成员表编辑＋变更理由就位；确认按钮点击后 UI 无变化（**发现 F2：确认失败零反馈**）；API 直测 PUT 即成（v1 active，updatedBy=admin 服务端身份）；刷新后只读成员表「已确认团队 v1」正确。
- ⑤ 主链 API 闭环（测量双条 contractVersion 校验拒旧版在案→wm-1/wm-2 落账；observing 首拒 tasks_unfinished 诚实→终结核卡后过；结算 ws-1 achieved 签署＋机器建议）；学习候选未生成=双闸正确（隔离服未开 EXPERIENCE_INJECT）。
- ⑥ 议程＋协同图＋贡献：DecisionAgendaSection 七源真数据（学习候选 16 项 available、空源「没有待决事项」与 available 徽标区分）；OrchestrationView 五问全渲染（合同 v1＋**团队：已确认团队 v1 · admin（accountable）、verifier-b3（reviewer）**＋度量目标）；ContributionReviewSection 六面（测量/团队/评价/学习/事件时间线三事件＋评审结论面「暂未接通」诚实态）；签署评价 UI 端到端成功（cr-mwpctif4，subject=verifier-b3 非自评，signedBy=admin 服务端定）。抽屉终态：已结算＋实测值（0/100 available）＋达成签署＋对照投影「效果未知——不足两个同口径已结算结果，不宣称改善」。
- 亮暗模式/窄容器抽查未逐项做（时间窗），组件测试已覆盖关键态——不宣称已验。

### 走查发现（处置）

| # | 发现 | 级别 | 处置 |
|---|---|---|---|
| F1 | OutcomeSection 无建模表单（仅提示文案；批一注释自认 POST / 未接 UI） | 既有缺口 | 批后挂账（批一面，非本批引入；API 面完整） |
| F2 | OutcomeTeamSection 确认失败零反馈（422/409 无错误文案；表单模型绑定疑点并存） | T6 缺陷 | T8 硬化：确认按钮补错误显示路径 |
| F3 | bindOutcomeFamily 对缺 outcome_id 列的库误报「根任务不存在」（缺列异常被吞成 not-found） | Minor | T8 若顺手（错误码区分 schema 缺列）；否则批后挂账 |
| F4 | fresh 隔离 home 的 kanban.db 由 vendor 建表无 805 列（805 只在 python 建库/迁移路径） | 环境注记 | 走查配方记录：fresh home 需经 python CLI 建库或手工补列 |

### pristine-replay 补跑（T7b）

8647 空窗复跑 `scripts/__tests__/overlay-pristine-replay.test.ts`：**2/2 通过（97.76s）**——批一/二两轮环境性登记欠账清偿；且本次重放包含重组后的 778/640，全 503 枚补丁序列干净态重放全过（对两枚修复补丁的第二次独立验证）。

### 批后挂账清单（终审 M-3 注记）

- DecisionGraph「统一决策引用」（设计 §4.7）：议程零写面按设计落地，但议程处理后的决策统一引用进 DecisionGraph 未接——批后独立小批。
- RACI 面接团队版本（设计 §4.6「RACI 与 OrchestrationView 消费同一团队版本」）：OrchestrationView 面已交付，RACI 消费面未接——批后挂账。
- OutcomeSection 建模表单（走查 F1）：批一注释自认「POST / 由后续任务接线」未接 UI——批后挂账。

### 终树验证（rebase 8553dadd2 后）

全量 `npm test`：**9783 passed / 0 failed / 11 skipped**（含 pristine-replay、route-manifest、training-manual 全绿——索引冲突标记随 main 侧清理消解；走查期间 vite 落的实体 node_modules 遮蔽共享链已按配方隔离重建）。

## 设计文档影响

DESIGN_SYNC: touched
- `docs/DESIGN.md` §3.9 权威数据源表：outcome 域行补 team.json/team_confirmed 事件；新增「组织工作台议程投影（`custom/server/orgworkbench/`，只读零写面）」与「贡献回顾（`agentidentity/judgments` 判别联合，human-entry 唯一写面）」两行。
- `config/mechanism-budget.json` changes[] 登记 team/agenda/contribution 三面（均带 sunset 与配对收敛：议程随 OUTCOME_WORKBENCH 门退役；团队面连续两轮推演零消费评估归档；贡献评价连续两轮零签署评估降级）。
