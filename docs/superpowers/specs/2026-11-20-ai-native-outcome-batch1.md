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

批一准出门（2026-11-20 实测）：

- 试点走查（NODE_ENV=production＋OUTCOME_WORKBENCH=1，隔离 HERMES_WEB_UI_HOME=/tmp/outcome-pilot-ui＋HERMES_HOME=/tmp/outcome-pilot-hermes，端口 8765——8647 被他 session 在服占用；服务 cwd 经 lsof 核验为本 worktree vendor 树）：people 种子（hrgov-seed 9 人＋27 单元草案，dry-run 先行）→建登录用户 plusprimer/verifier1→people 以 id=登录名建册激活（含种子 p-1 roster 激活）→建根卡→建合同（owner=plusprimer、riskTier=high、defaultReversibility=one-way、双 measure）→激活（看板库直读核验 outcome_id 绑定＋outcome_bound 事件）→派单快照（context-snapshots 端点代验——完整 gateway 未起，快照 content 物化 contract/owner/policy/task/verifier）→双签审批（queue.jsonl 入队 outcome_ref＋dual_sign_required：owner 第一签 409 dual-sign-required 落账→verifier 第二签 200 resolved＋响应文件在案；第三人 admin 签 403 not_outcome_signer 负例）→observing（tasksTerminal 真实现放行）→双 measure 人工核验提交（owner m1=96.4＋verifier m2=0）→结算 achieved（机器建议同判）→GET measurements/settlement 读端点回读一致。unauthorized=0。
- `npm test` 全量：9468 passed / 2 failed / 11 skipped。①architecture-ratchet K19（ok:false 989>874）**红由批一引入**（收口审查 C-1 归因更正：前文「main 先在欠账」系误把批一笔 842a16d4e 当批前基点；逐笔 git 取证批前基点 4da6f3a6e=874 达标，+115 全部为批一笔——store +33/snapshot 族 +32/805 +17/状态机 +9/控制器 +5/收件箱双签族 +19）：新增面为 store/snapshot/状态机等纯函数 Result 联合与测试的 `{ok:false}` 结果对象字面量，非 HTTP 失败信封（outcome 域 HTTP 出口全走 ok/fail）。处置＝基线 874→989 上调＋理由注释（棘轮测试基线声明处）＋decisions.jsonl 留痕，`npx vitest run custom/__tests__/architecture-ratchet.test.ts` 7/7 绿（ebb604fa8）；②overlay-pristine-replay：clean 守卫检出 8647 端口他 session 在服而拒跑（环境性，非本批缺陷）。
- `node scripts/merge-invariants.mjs --check` → pass（收据 431 行；新增 spec 后 gen-doc-indexes --write 同步索引 711/711 再验通过）。
- `npm run typecheck:harness` → 0 错误；`npm run typecheck:client:ratchet` → 19 ≤ 基线 19。

完整响应摘录见 `.superpowers/sdd/2026-11-19-ai-native-outcome-batch1/task-15-report.md`（本地 SDD 工作区，不入库）。未验证项（终审 I-1 如实披露）：**浏览器实物走查未做**——试点为 REST 全链代验（NODE_ENV=production 隔离起服）＋组件交互测试覆盖；OutcomeSection/OrchestrationView/Inbox 三面的浏览器实操挂账批二置顶补验。

终审 I-2/I-3 处置（2026-11-20 修复波）：①结算引用集断链已根治——服务端 `validateSettlementInput` 当前版本有在账测量时空 measurementIds 拒（settlement.test.ts 32 用例含两新分支）；客户端 doSettle 引用集＝本会话 ∪ 服务端在账最新（outcome-section 16 用例含终审 I-2 断言）。②执法面口径边界注：`OUTCOME_WORKBENCH` 统管 REST 与 dispatch 两面；agent 审批守卫面（补丁 806）以「合同存在且任务绑定」为门、不受该 env 开关控制——关闭开关不解除已有合同绑定的守卫执法（方向从严），批二评估守卫面接同 flag。此注与设计 spec T10 ruling「统管全部执法面」的表述差异以本注为准。

## 设计文档影响

DESIGN_SYNC: none——正本修订已在批一 Task 15 第三段同批兑现，无需另立 touched：`docs/DESIGN.md` §4.6 治理章已补「结果绑定审批以合同门为权威、与风险档闸互斥分流」与「测量/结算读面与 OUTCOME_WORKBENCH 门」两句（§3.9 outcome 行内旧读面口径同步）；设计 spec §4.3 已追加授权边界补注（SPEC_REBIND=1 收据重绑在册）；pending-batch N03 已标注部分承接；`custom/server/AGENTS.md` 域索引已登记 outcome 域。终审修复波（I-2 代码修）落点：`295537b80`（结算引用集非空强制与客户端并集提交）。
