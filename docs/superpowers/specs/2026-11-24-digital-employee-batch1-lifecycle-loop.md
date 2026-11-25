# 数字员工 3.0 吸收·批一：上岗—派单—执行—退出闭环 设计 spec

> 日期：2026-11-24
> 状态：已实施，待独立审查（2026-11-24 用户指令「批准」；方向授权为用户在方案 A/B/C 中指令「执行A」；D1、D2 随批复确认）。回归矩阵合并前档全绿、八步浏览器实操全过；实施进度与逐任务记录见 `docs/superpowers/plans/2026-11-24-digital-employee-batch1.md` 与 `.superpowers/sdd/2026-11-24-digital-employee-batch1/progress.md`。
> 来源：《大模型驱动的数字员工3.0建设应用白皮书》（中国工商银行金融科技研究院、华为技术有限公司、北京金融科技产业联盟，2024 年 9 月，51 页）差异吸收。本仓此前无该白皮书的同源吸收轮；最接近的天猫数字员工文章吸收（`2026-10-23-tmall-digital-worker-absorption.md`）来源不同，其已落地的介入归因、协作画像、交付效能面本批不重建。
> 相关正本：`2026-11-06-workunit-responsibility-ledger.md`（执行单元责任台账）、`2026-11-19-capability-pool-foundation.md`（能力池）、`2026-11-19-ai-native-operating-model-design.md`（AI 原生组织运行模型）。
> 行号基准：`custom/`、`docs/` 位置核对于主干 `b9ff5a025`；`vendor/` 位置核对于干净检出（未注入补丁），已注入的主工作区里行号会不同。
> 批复口径：批复本 spec 即视为决策 D1、D2 获确认；要改选请在批复中写明。

## 背景与目标

### 为什么做

白皮书把数字员工当作企业劳动力来管理，要求六件事同时成立：业务价值可证明、有独立身份和岗位、能力与流程可复用、研发与运行一体化、运营可量化、安全有闭环。对照 AIStudio 现状，基础对象大多已有，问题出在对象之间的链路断开。本批只处理「上岗—派单—执行—退出」这一段，断点共六处，均有代码位置：

| # | 断点 | 代码位置 |
|---|---|---|
| 1 | 身份的「户口五要素」在界面上补不齐：服务端登记与更新接口支持能力边界、审计要求，但控制器没有透传，界面也没有这两项。身份因此始终是「户口不齐」，连带进不了结果团队 | `custom/server/governance/governance-controller.ts:768-790`；域层已支持：`custom/server/agentidentity/agent-identity.ts:246-339` |
| 2 | 生命周期在界面上走不完：准入要求责任卡带三组准入证据，变更后重启要求两条证据，界面都提交不了；退出登记提交的是写死的一行占位文字 | `custom/client/governance/components/WorkUnitLedgerSection.vue:108-147`；要求在 `custom/server/agentidentity/lifecycle.ts:81-100` |
| 3 | 生命周期不约束派单：已登记未准入、变更中、已退役的执行单元照常被派活；能力检查只打印警告 | `custom/server/kanban/column-dispatch.ts:242-249`、`custom/server/zcode/mention-dispatch.ts:289-297` |
| 4 | 能力路由不落到执行者：路由选中的本机 Agent 只记进本地索引，看板卡仍指派给消息里原来的目标 | `custom/client/matrix-teams/stores/task-dispatch.ts:181-215` |
| 5 | 署名可冒填：生命周期迁移人、署名记录签署人、责任卡的业务负责人签署人、离职操作者、信任域操作者都取自请求体；准入只查签署人非空 | `governance-controller.ts:886-925`、`:858`、`:733-744`、`custom/server/trust/controller.ts:45-51`、`custom/server/agentidentity/responsibility.ts:71` |
| 6 | 退役与离职不联动：退役不撤销凭证和委托；离职只写移交文档并停用聊天账号，任务改派、自然人停用、执行单元退役互不相关 | `custom/server/governance/registry-admin.ts:268-325`、`custom/server/agentidentity/people.ts:129-140` |

### 目标（批一完成判据）

- G1 界面可走通：登记身份（五要素齐备）→ 保存带准入证据的责任卡 → 业务负责人签署 → 准入 → 运行；变更后重启须提交两条证据；退役须填写真实退出事项。
- G2 派单门生效：**显式绑定**了运行时目标的执行单元，在未准入、变更中、已退役或责任卡失效时不接新派单，拦截原因在派单结果中可见；未绑定的目标行为不变。
- G3 能力路由落地：路由选中的本机 Agent 的运行配置名成为看板卡的实际指派对象。
- G4 署名可信：迁移人、署名记录签署人、业务负责人签署人、退出确认人、离职操作者取服务端登录身份，请求体同名字段不生效；责任卡内容在签署后改动，旧签署即失效。
- G5 退出联动：退役自动撤销凭证记录与委托；离职前必须先完成在岗执行单元的退役交接；离职联动自然人停用；任务改派真实执行并由服务端核实后写入移交工单；改派只在令牌校验与前置检查通过后进行。
- G6 守门有效：以上各项都有测试，且含负面用例；关键守门测试经变异探针验证会变红。

### 非目标（本批不做）

- 不建统一的员工实体、岗位模型、员工 360 页、人才市场、绩效评分与排名（批二、批三）。
- 不改内核领取门：已排进看板队列的任务仍可能被对应的运行进程领走；跨机接收端（`doReceiveAssign` 建卡前）也不设门。两者都要改上游代码或客户端闸，另立项。
- 凭证仍是台账记录，不接网关真实吊销。现状见 `custom/server/toolpipeline/enforce-gate.ts:663-683`：工具执法只读工具白名单。
- 不改 `OUTCOME_WORKBENCH`、动作门 `shadow` 等默认开关。
- 不批量回填存量身份：未绑定的身份不受派单门影响。
- 信任域只绑定操作者；审计者与模型仍可由请求声明，独立性策略维持现状。
- 不修成本预算的币种错配（价目表是 CNY，预算按 USD 累计），归批二。

### 反目标（做成了也算失败）

- 存量未绑定目标的派单行为发生任何变化。
- 门读不到台账时被渲染成「通过」。
- 系统自动退役某个执行单元（绕过在岗自然人确认交接）。
- 为此新增补丁。若实施中发现必须改上游文件，停下回到用户裁决。

## 方案取舍（已由用户选定）

| 方案 | 做法 | 代价 | 结论 |
|---|---|---|---|
| A 研发交付岗标杆牵引 | 先修通既有链路，再建员工 360 与资产共享，分三批 | 每批都要补测试与走查，前期看不到新页面 | 选定 |
| B 平台模型先行 | 先统一员工、岗位、能力、资产、评价模型再迁移 | 迁移面大，会复制既有事实源，较长周期没有可验证的业务闭环 | 不选 |
| C 展示先行 | 先做员工详情、评价大屏、人才市场 | 会把警告态和缺证据包装成完成态 | 不选 |

三批路线：批一（本文件）上岗—派单—执行—退出；批二员工 360 与五维运营账；批三受控学习、资产共享与发布消费者。

## 变更

### 0.1 业务完成条件

一个现有执行单元（身份册里一条已绑定运行时目标的身份）通过界面完成登记、准入、运行；运行期间正常接单；退役后三个派单入口都拒绝再派，拒绝原因可查；其名下凭证记录与委托已撤销。以上每一步都有测试和一次浏览器实操记录。

### 0.2 输入与来源

- 身份、责任卡、生命周期、自然人：`custom/server/agentidentity/`（JSON 台账，`AGENT_IDENTITY_STORE` 可重定向）。
- 登录身份：`ctx.state.user`，经 `custom/server/approval-inbox/human-gate.ts:33-56` 的 `requireAuthenticatedActor` 取得；无鉴权单机部署用 `AISTUDIO_LOCAL_OPERATOR` 指明本机操作者。
- 派单目标：@提及的目标名；RACI 派发的 Matrix 账号全形。
- 任务改派：既有看板改派接口 `POST /api/hermes/kanban/:id/reassign`（`vendor/hermes-studio/packages/server/src/modules/hermes/controllers/kanban.ts` 的 `reassign`，干净检出 `:752-770`；路由登记在 `modules/hermes/routes/kanban.ts:31`）。请求体为 `{profile, reclaim?, reason?}`，执行账号须对 `profile` 有访问权限，否则被拒（同函数内 `denyProfileAccess`）。核实手段：`custom/server/kanban/dispatch-readiness.ts:95` 的只读查询。
- 输入全部服务端校验；请求体里的身份字段一律不采纳。

### 0.3 工作流边界

- 硬依赖：登录身份必须是在岗自然人（登录名即自然人 id，与结果合同域同一约定，`custom/server/outcome/outcome-controller.ts:112-114`）；执行单元必须显式绑定才受门约束。
- 可降级：门读台账失败时不拦截，但结果记为 `unknown` 并写明原因。
- 必须等人：退役确认、变更后重启、离职。系统不替人做这三类决定。

### 0.4 工具与副作用

| 写入点 | 副作用 | 幂等与失败处理 |
|---|---|---|
| 身份登记/更新、责任卡保存、状态迁移 | 写身份台账并追加事件流 | 既有原子写；校验失败不落盘 |
| 业务负责人签署 | 在责任卡上记签署人、时间与所签版本指纹；事件流留痕 | 重复签署覆盖为当前版本；签署人非在岗自然人则拒绝 |
| 退役 | 另把该身份的凭证记录置为已撤销、未撤销委托置为已撤销 | 与状态迁移同一次落盘；事件流逐条留痕 |
| 自然人停用 | 写 `people.json` | 重复停用幂等 |
| 派单拦截 | 不起运行进程，只产出一条派单结果 | 无额外副作用；拦截结果走既有派单台账 |
| 任务改派 | 调看板 CLI，回收并改指派 | 逐卡调用；单卡失败不中止，结果如实列出 |
| 离职前置检查 | 只读：校验管理员令牌、查阻止离职的执行单元、预览自然人联动 | 不写任何文件 |
| 停用 Matrix 账号 | 既有行为 | 不变 |

### 0.5 结果与证据

- 派单结果新增原因码 `unit_gate`（生命周期或责任卡拦截）与 `capability_block`（能力硬门拦截），`detail` 写明具体原因；门读数结构 `{target, applicable, identityId?, decision, reasons}`，`decision` 取 `pass | block | unknown | skipped`，`reasons` 用的原因码：`gate_off`、`not_bound`、`ledger_unavailable`、`unit_registered | unit_changing | unit_retired`、`card_invalid`。门读数经统一判定核的事实输入逐目标传入；预演入口没有任务上下文，不评能力读数，但评门读数。
- 退役响应带 `revoked: {credentials, delegationsOut, delegationsIn}`。
- 责任卡签署记录带 `signedBy / signedAt / cardRevision / stale`；前置检查响应带 `blockedUnits: Array<{identityId, name, stage}>` 与 `person: {deactivated | not-linked}` 的预览。
- 离职响应在原三个提交号字段之外带 `taskHandover: Array<{taskId, before, after, reassigned, note}>` 与 `person: {deactivated | not-linked, personId?}`；仍有在岗执行单元时离职接口返回 409，错误码 `offboard_blocked`。逐卡核实的实现是 `custom/server/governance/offboard-handover.ts` 的 `verifyTaskHandover`。
- 事件流（`events.jsonl`）是署名与撤权的追溯来源。

### 0.6 异常与恢复

- 未登录且未设 `AISTUDIO_LOCAL_OPERATOR`：署名类写接口返回 401，界面显示提示。
- 登录身份不是在岗自然人：返回 400，问题列表写明「迁移人必须是在岗自然人」。
- 身份台账读取失败：派单不拦，结果记 `unknown`；团队确认按既有口径记为不齐备。
- 改派失败：不中止离职流程，移交工单与界面标明「未改派」。
- 改派成功而离职被拒或失败：界面列出已改派的卡与原指派对象，可一键改回；修正原因后重跑，离职三步保持幂等。
- 回滚：`WORKUNIT_DISPATCH_GATE=off` 关闭派单门，等价于批一之前的行为；身份台账新增字段均可缺省，旧数据不迁移。

### 0.7 验收反例

以下情况必须被测试拦住：已退役或未准入的已绑定单元被派单成功；请求体冒填迁移人或签署人后记录里出现被冒填的名字；责任卡内容在签署后改动，仍凭旧签署通过准入；管理员令牌无效或前置检查未过时任务被改派；退出事项为空或为占位文字仍能退役；门函数被改成恒通过后测试仍全绿；路由选中的 Agent 与看板卡指派对象不一致；离职时仍有在岗执行单元却停用了账号；台账读取失败时门读数显示通过。

### 一、身份台账补全（接口与界面）

- `POST /api/governance/agent-identity/register` 与 `POST /agent-identity/:id/update`：透传 `capabilityBoundary`、`auditRequirement`；规范化和校验沿用域层既有实现（`agent-identity.ts:291-339`），控制器只挑键。
- `POST /api/governance/people`：透传 `mxids`（域层已支持，`people.ts:92-127`）。
- 新增 `POST /api/governance/people/:id/deactivate` 与域函数 `deactivatePerson`：置 `active=false` 并记 `deactivatedAt / deactivatedBy / deactivatedReason`；重复停用幂等；响应列出仍引用此人的执行单元（未退役且责任卡以其为主责任人、复核人、接管人或维护人），供界面提示，不阻断。
- 界面 `AgentIdentitySection.vue`：登记表单增加工具白名单、能力边界（能做什么、不做什么，每行一条）、审计抽样比例与留存天数；表格增加「户口缺口」列（读域层既有 `listRosterGaps`，不新增判定）；增加「补全」编辑（责任人、白名单、能力边界、审计要求、运行时绑定）。更新文件头与界面底部那句过时的「台账不是鉴权」说明，如实写明当前哪些已执法、哪些仍是记录。

### 二、运行时绑定与派单门

- 身份新增可缺省字段 `runtimeBindings?: { agents?: string[]; matrixAccounts?: string[] }`。`agents` 是派单目标名（@提及用的名字），`matrixAccounts` 是 Matrix 账号全形。一个目标只能被一个身份绑定，重复绑定返回问题列表。
- 新增纯函数模块 `custom/server/agentidentity/dispatch-gate.ts`：

  ```ts
  assessUnitDispatchGate({ target, targetKind: 'agent' | 'matrix-account', identities, people, mode })
    → { target, applicable, identityId?, decision: 'pass' | 'block' | 'unknown' | 'skipped', reasons }
  ```

  判定顺序：`mode==='off'` → `skipped`；无身份绑定该目标 → `skipped`（原因 `not_bound`）；台账不可读 → `unknown`；阶段不是准入或运行 → `block`（原因 `unit_registered / unit_changing / unit_retired`）；责任卡按非准入口径有缺口（`cardGaps`，`responsibility.ts:63-80`）→ `block`（`card_invalid`）；其余 `pass`。
- 能力硬门：对门判定为 `pass` 的目标，若任务声明了能力需求且现有能力检查结果为 `block`，拒绝（`capability_block`）。`block` 的含义是整个能力池没有任何供给方具备该标签（`custom/server/capabilitypool/derive.ts:254-261`），与按谁求值无关，所以沿用现有「一次派发求值一次」的读数，不逐目标重算；`warn` 与 `unknown` 维持只警告。未绑定目标维持现有「只警告」。
- 接线点一（覆盖列编排、直接 @提及、预演）：`custom/server/zcode/mention-dispatch.ts` 的判定核 `planDispatch`（`:192-256`）在「已知目标、自触发抑制」之后、「团队停止条件」之前增加一步；门读数经 `PlanFacts` 注入（可选字段，缺省不评），一次派发调用只读一次身份台账。预演入口（`custom/server/zcode/engine-controller.ts:407-411`）直接使用服务的只读事实快照 `planFacts()`，所以门读数放进该快照后预演与真实派单自动一致，预演控制器不改。列编排经同一个 `service.dispatch`，`custom/server/kanban/column-dispatch.ts` 不改判定逻辑。原因码词表在 `custom/server/zcode/dispatch-reasons.ts`，驾驶舱标签在 `custom/client/zcode/store/zcode-projection.ts`（按字面值本地化），两处同步；任务生命周期映射（`custom/server/taskledger/taskledger.ts` 的 `mapMentionReason`）对拒绝类原因不登记，新原因码沿用，无需改动。
- 接线点二：`custom/server/services/kanban/raci-dispatch.ts` 的 `doDispatch`（`:107-142`）对每个责任人账号求值；被拦截的账号不建房、不发指派；全部被拦时**抛出**带原因的错误，不写去重记录。必须抛错的原因：上游调用方是尽力而为模式，对返回值不处理、只对抛错打警告（`vendor/hermes-studio/packages/server/src/modules/hermes/services/kanban/kanban-service.ts` 的 `createTask` 与 `assignTask` 末尾的调用）；返回 `{ok:false}` 会被静默吞掉，拦截原因无处可见。部分被拦时正常派发未被拦的账号，被拦名单写进日志。
- 接线点三：结果团队确认 `PUT /api/hermes/outcomes/:id/team`（`custom/server/outcome/outcome-controller.ts:498-509`）。已绑定的 Agent 成员除户口齐备外，还须门判定不是 `block`（`pass` 放行；`unknown` 不拦，与派单门口径一致）；未绑定身份（门读数为 `skipped`）沿用现判据，只查户口齐备。门求值本身抛错或读失败时按不可接单处理，与现有 `rosterOk` 的口径一致。这里与派单门口径不同是有意的：派单是可用性关键路径，读不到不拦（D4）；组队是一次性的人工确认，且该端点对户口读失败本就按不齐备处理，两种读数在同一端点不应一个松一个紧。`team-validate.ts` 增可选回调，未绑定身份沿用现判据。
- 开关：环境变量 `WORKUNIT_DISPATCH_GATE=off` 关闭；缺省对已绑定身份强制。

### 三、能力路由落到实际执行者

- 协议 `AgentDescriptor`（`custom/client/matrix-teams/protocol.ts:274-282`）增加可选字段 `profile`；解析函数校验字符集与长度，非法即整条拒收。
- 桥接声明 `custom/server/matrix/chat-bridge.ts:454-510` 从房间 Agent 视图带出 `profile`（视图已含该字段，来源是 `vendor/hermes-studio/packages/server/src/modules/studio/sockets/group-chat.ts` 的 `RoomAgent.profile`，干净检出 `:248-272`）。服务端镜像类型同步。
- `selectAgent`（`custom/client/matrix-teams/agent-router.ts:35-51`）：只把 `profile` 非空的 Agent 纳入候选。
- `doReceiveAssign`（`task-dispatch.ts:181-215`）：看板卡指派对象取路由选中 Agent 的 `profile`；本地索引同时记 `routedProfile`。有覆盖能力的 Agent 但都没有 `profile` 时回执失败，原因 `no-routable-profile`，不回落到原目标。

### 四、署名与操作者绑定登录身份

- 责任台账：状态迁移的 `by` 与退出确认人 `confirmedBy`、署名记录的 `signedBy`、离职接口的 `actor`，统一取 `requireAuthenticatedActor(ctx).username`（控制器内已有同款封装 `decisionActor`，`governance-controller.ts:90-98`）。请求体里的同名键不采纳。
- 业务负责人签署同样只认登录身份，并改为独立动作：新增 `POST /api/governance/agent-identity/:id/card/sign`。签署人取登录身份且须为在岗自然人；服务端记录签署时间与所签责任卡的版本指纹（去掉签署字段后做规范化 JSON 的 SHA-256）。责任卡保存接口不再接受请求体里的签署字段；保存时若卡片内容与已签版本不一致，原签署标为失效（`stale`，保留历史）。准入检查要求签署存在且未失效（现状只查签署人非空，`responsibility.ts:71`）。存量签署没有版本指纹，按失效处理，准入前须重新签署。
- 信任域：`custom/server/trust/controller.ts` 的 `actorOf` 去掉「请求体 `actor` 优先」分支。有登录用户取登录名；没有时沿用现状回落为固定值 `operator`（`:45-51`），不引入新变量，不改变单机部署行为。
- 界面：迁移人、退出确认人、业务负责人签署改为只读显示当前登录身份，并标明其是否为在岗自然人；责任卡表单里的签署人输入框换成「以当前登录身份签署」按钮。若仓内没有可用的自然人登记界面，在责任台账的自然人名单处提供「以登录名登记并启用」。

### 五、退役与离职联动

- 退役自动撤权：`transitionIdentity` 在迁往 `retired` 且校验通过时，同一次落盘内撤销该身份全部有效凭证记录，以及它的全部未撤销委托（出边与入边），事件流逐条留痕并注明随单元退役。
- 离职前置检查（只读）：新增 `POST /api/governance/matrix-offboard/precheck`，入参同离职接口。它校验管理员令牌（只查询不写），列出阻止离职的执行单元，预览自然人联动结果；不写任何文件。阻止条件：`runtimeBindings.matrixAccounts` 命中 `@<name>-agent:<server>` 且阶段为准入、运行或变更中的身份。
- 自然人联动：`people.json` 里 `mxids` 命中该账号（全形或裸用户名）且在岗的自然人，随离职停用；无命中时响应标 `not-linked`，不做推断。
- 任务改派：离职向导第一步收齐全部信息（含管理员令牌与可选的「接手执行单元」，候选来自既有指派对象列表接口）。点击后依次执行：前置检查 → 逐卡改派 → 离职。改派走既有接口，提交的是运行配置名；执行账号须对其有访问权限。**不回收在跑任务**：看板改派命令对运行中的任务，不带回收参数时直接拒绝改派（`vendor/hermes-agent/hermes_cli/kanban_db.py` 的 `reassign_task`，其文档注明运行中须先回收）；强行回收会中断正在执行的工作，不由离职流程自动触发。因此运行中的卡改派失败，如实标为「未改派（任务运行中）」。`offboardAccount` 自身仍做一次前置检查（防两次调用之间状态变化），并用只读查询核实每张卡当前指派对象，把「已改派至 X（服务端核实）」或「未改派」写进移交工单与响应。未填接手执行单元时不改派，工单如实写「仅登记」。
- 半完成状态：改派成功而离职被拒或失败时，界面列出已改派的卡及其原指派对象，提供「改回原指派对象」（调同一改派接口）；修正原因后可重跑，离职三步保持幂等。

### 六、界面汇总

- `WorkUnitLedgerSection.vue`：责任卡表单增加三组准入证据（代表性任务、边界情况、数据与权限评估）；签署人输入框换成「以当前登录身份签署」按钮，并显示签署是否对当前版本有效；目标阶段下拉只列当前阶段的合法去向（依 `lifecycle.ts:56-62`）；变更后重启显示两条证据引用输入；退役显示退出类型、交接事项（必填，至少一条，不预填）与只读确认人，并提示高风险单元的确认人不得是主责任人；表格增加「绑定目标」与派单门状态。
- `OrgEditor.vue` 离职向导：第一步收齐全部信息（含管理员令牌、接手执行单元）；执行后显示前置检查结果、逐卡改派结果、改派核实情况、自然人联动结果与半完成状态的恢复入口。
- 文案中英双语同步。

### 七、机制预算与设计文档

- `config/mechanism-budget.json` 登记本批：新增 1 个域模块（`dispatch-gate.ts`）、1 个环境开关、2 个端点（责任卡签署 1 个写、离职前置检查 1 个只读）、1 组可缺省身份字段；补丁、脚本、账本、npm 脚本均零新增，不占预算限额。配对退役两项：两处「只打印警告」的能力检查在已绑定目标上被硬门取代；责任台账里手填的迁移人、签署人输入框与写死的退出占位文字删除。退役条件：全部在用执行单元完成绑定、且连续两轮真实运行门零误拦后，把派单门并入内核领取门，本层门退役；或连续两轮零绑定时降级为只读读数。
- `docs/DESIGN.md` §4.6「执行单元责任台账」段补充规则，见「设计文档影响」。

## 决策记录

| # | 决策 | 选择 | 备选 | 理由 | 类型 |
|---|---|---|---|---|---|
| D1 | 试点范围如何界定 | 只有显式绑定运行时目标的身份受派单门约束 | 用环境变量列白名单；按身份名与目标同名自动匹配 | 绑定写在身份台账里，单一事实源；同名自动匹配会让全部存量身份受约束，而它们缺省都是「已登记」态，等于一次性停掉这些目标的派单 | Taste，批复即确认 |
| D2 | 已绑定身份默认强制还是默认警告 | 默认强制，`WORKUNIT_DISPATCH_GATE=off` 回滚 | 默认警告，需显式开启 | 绑定是明确的管理动作，声明了却不执行正是本批要修的形态；未绑定目标不受影响，回滚开关保留 | Taste，批复即确认 |
| D3 | 派单门接在哪一层 | 统一判定核 `planDispatch`，加 RACI 与团队确认两处 | 直接改内核领取门 | 判定核是列编排、直接提及、预演的共同入口，一处接线三处生效，且不动上游代码；内核门需补丁，另立项 | Mechanical |
| D4 | 门读台账失败怎么办 | 不拦截，结果记 `unknown` 并写明原因 | 一律拦截；静默放行 | 派单是可用性关键路径，台账文件损坏不该让全部编排停摆；但读不到不等于通过，必须如实记录 | Taste |
| D5 | 能力路由的目标没有 `profile` | 明确失败，原因 `no-routable-profile` | 回落到消息里原来的目标 | 回落就是现状的静默错配；部署后桥接重启即带 `profile`，失败窗口很短且可诊断 | Mechanical |
| D6 | 署名身份从哪来 | 服务端登录身份，登录名即自然人 id | 另建登录名到自然人的映射表 | 结果合同域已用同一约定（`outcome-controller.ts:112-114`），不建第二套映射 | Mechanical |
| D7 | 信任域操作者的严格度 | 只去掉请求体优先，无登录用户时保留现有回退（固定值 `operator`） | 与责任台账同样强制要求登录身份 | 信任域记录的是操作留痕，责任台账记录的是在岗自然人的署名，两者目的不同；强制化会改变单机部署行为 | Taste |
| D8 | 退役是否自动撤销委托与凭证记录 | 自动，并与状态迁移同一次落盘 | 只改状态，撤权靠人手动 | 退役后仍留有效委托等于退役无效；真实凭证吊销不在台账能力内，如实标注 | Mechanical |
| D9 | 离职时如何对待在岗执行单元 | 拒绝离职（409），先退役再离职 | 离职时自动退役 | 自动退役会绕过「在岗自然人确认交接」这一既有硬约束 | Mechanical |
| D10 | 任务改派走哪条通道 | 界面调既有看板改派接口，离职端点只读核实后记账 | 加补丁把看板服务注入治理控制器 | 后者要新增补丁并占用加补丁的串行名额；写操作继续走唯一通道，核实在服务端完成 | Mechanical |
| D11 | 存量身份是否回填 | 不回填、不自动绑定 | 批量按同名绑定 | 存量身份缺省阶段为「已登记」且户口要素不全（`agent-identity.ts:180` 注释），批量绑定等于停掉这些目标的派单 | Mechanical |
| D12 | 业务负责人签署如何防冒填、防「签后改卡」 | 独立签署动作，签署人取登录身份，签署绑定责任卡版本指纹，内容改动即失效 | 保存责任卡时顺带记签署人；或只绑定登录身份、不绑版本 | 责任台账界面上唯一的签署入口就是它，不纳入则 G4 留口；不绑版本则签署人对改动后的卡片并不知情 | Mechanical |
| D13 | 改派与离职的先后，及半完成状态 | 先只读前置检查（含令牌校验），再改派，再离职；半完成状态如实展示并可一键改回 | 在离职端点内串行执行改派；或只核实不自动改派 | 端点内串行要把看板服务注入治理控制器，需加补丁；令牌未校验就挪卡会把错误留到后面；一键改回让半完成可恢复 | Taste |

### 0.8 批准前六问

1. **决策**：推动「一个执行单元现在能不能接活、谁签字让它接活或停活」这一判断由系统如实回答；给平台超级管理员和执行单元责任人看。
2. **口径**：不涉及统计数字。派单门读数只有通过、拦截、未知、未评估四态，缺数据不给绿灯。
3. **可逆性**：可逆。关 `WORKUNIT_DISPATCH_GATE` 即回到批一之前；新增字段均可缺省，旧台账无需迁移。
4. **署名**：平台超级管理员（登录名须为在岗自然人）对状态迁移、署名与离职操作署名；高风险单元的退役确认人不得是主责任人。
5. **停止条件**：连续两轮真实运行出现对已准入单元的误拦且原因不可解释；或出现因门读失败导致的派单静默异常；或绑定后无法通过界面完成一次完整上岗与退役。
6. **语法**：动了权限语法（未准入与已退役单元不再接新派单；退役即撤委托）与责任语法（署名只认登录身份）。不动预算、考核、数据权属。

## 验证

以下为实施后的真实结果（2026-11-24/25，分支 feat/digital-employee-batch1）。

- 纯函数：`dispatch-gate.test.ts` 12 例覆盖四态全表，先测后实现，全绿。
- 接口：`workunit-routes.test.ts` 带登录态改写后 19/19；新增字段透传与规范化、未登录 401、请求体冒填迁移人不生效、登录身份非在岗 400、退役自动撤权、自然人停用与 `mxids` 透传、离职前置检查与联动、移交工单核实行全绿。
- 业务负责人签署：无登录 401、非在岗 400；保存责任卡不采纳请求体签署字段；签后改卡内容则签署失效；凭失效或无版本指纹的旧签署准入被拒——全绿。
- 派单：`zcode-mention-dispatch.test.ts` 用真实 `MentionDispatchService` 配替身引擎，未准入/变更中/已退役已绑定单元被拒且引擎未调用、未绑定与门关闭照常起跑、台账不可读读数 `unknown`、能力 block 拒/warn 与 unknown 放行，全绿；RACI、团队确认、预演同源各一组。
- 路由：`mb-routing.test.ts` 断言看板卡指派对象等于路由选中 Agent 的 `profile`，无 `profile` 回执 `no-routable-profile`，全绿。
- 变异探针（四项均变红后改回）：门函数恒通过、迁移人改回取请求体、签署人改回取请求体、路由结果改回不用于指派。
- 全量门禁：`npm run regress -- --scope merge` **14 面 14 通过 0 失败 0 未执行**；`npm run typecheck:harness` 退出码 0。
- 浏览器实操（隔离实例 `HERMES_WEB_UI_HOME=/tmp/de-batch1-live`、`NODE_ENV=production`、端口 8651、Bearer 认证）八步全过：
  1. 以登录名登记并启用自然人 `admin`（id=admin）；
  2. 登记五要素齐备＋绑定 `zcode-live` 的身份；
  3. 保存带三组准入证据的责任卡；
  4. 以登录身份签署（signedBy=admin、有版本指纹、stale=false）；
  5. 准入→运行（迁移人=admin，body 不带 by）；
  5b. 服务探针（真实判定核＋门）：running 放行（start/queued）、retired 拦截（unit_gate/unit_retired）；HTTP 预演因目标未注册返 `target_unavailable`（与门无关，环境缺真实 zcode 引擎）；
  6. 登记凭证＋建委托；
  7. 退役自动撤权 `revoked={credentials:1}`、凭证读回 revoked，探针回归稳定；
  8. `WORKUNIT_DISPATCH_GATE=off` 重启，running 与 retired 都 `start/queued`（等价回滚）。
- 实操发现的真实缺口：自然人登记时若已存在同邮箱记录会按邮箱匹配、忽略显式 `id`（首签因此报「签署人必须是在岗自然人」，重建 id=admin 的自然人后通过）；zcode 引擎预演端点真实路径为 `/api/zcode-engine/mention/preview`。前者已由终审修复 `99bd9efd1` 根治：显式 `id` 未命中且邮箱已属他人时拒绝合并并点名占用者，不再并入他人记录。

### 守门修复（回归矩阵抓出并当场修）

- K19 `ok:false` 棘轮：批前基点 1014→1024（任务 1 +8、任务 3 +2、任务 7 +1、离职被拦分支改 `fail()` −1）；governance-controller 两处手写 HTTP 失败体（409 被拦、502 上游失败）改 `fail()`，其中仅 409 一处计入本棘轮。2026-11-25 变基到 `ccfa55a22`（对方 N34 批已把基线抬到 1019）后逐提交实测终值 **1030**＝净 +11，比变基前多出的 1 处是终审修复（`people.ts upsertPerson` 邮箱属他人拒合并，落在棘轮提交之后，守门自该笔起超限 1 处，修复前实跑红 `expected 1030 ≤ 1029`）。+11 全部由批一提交引入、与 vendor 升级无关，逐笔归因写入 `architecture-ratchet.test.ts` 注释。
- `zcode-session-projection` 枚举冻结守门补 `unit_gate`/`capability_block`（任务 4 新增原因码，守门漏同步）。

## 设计文档影响

DESIGN_SYNC: touched
DESIGN_DOCS: docs/DESIGN.md

- §4.6「执行单元责任台账」段（`docs/DESIGN.md:1200-1208`）追加：身份册可登记运行时绑定；只有显式绑定的执行单元受派单门约束，阶段为准入或运行且责任卡有效才接新派单，未绑定目标行为不变；派单判定在统一判定核求值，列编排、直接提及与预演同源；迁移人、署名人与退出确认人取服务端登录身份；退役时自动撤销凭证记录与委托；责任人停用使责任卡失效时，已绑定单元停止接新派单，换责任人并重新验证后恢复。
- 不新建设计文档，不改其它正本。

## 未做/未验证

- 本文件是设计稿，未改产品代码，未运行测试。断点表与各节引用的代码位置经独立的建设者检查逐条核对属实。
- 建设者检查未核对、现已由主会话读代码核实的项：RACI 调用方对失败的处理（只对抛错打警告，见第二节接线点二）；`reassign --reclaim` 的行为（不回收则拒绝改派在跑任务，见第五节）；驾驶舱标签本地化所在文件（`custom/client/zcode/store/zcode-projection.ts`）。
- 仍未核对、留给实施计划执行时确认的项：服务端 AgentDescriptor 镜像类型的位置；三份界面测试的夹具细节。
- 内核领取门与跨机接收端门未设（见非目标），因此「退役后队列中的存量任务」与「跨机直派」不在本批保障范围。
- 桥接重启前，带能力标签的跨机指派会因缺少 `profile` 明确失败；窗口长短取决于部署重启时机，未实测。

## 留给实施计划的事项

- 开工前先把分支变基到最新本地主干。本文件写作期间主干被其它会话推进到 `3ebe7cbbc`；已核对该推进未触及本批任何代码文件，只改了 `docs/DESIGN.md` 的其它段落（§4.6 责任台账段仍在 `:1200`）与机制预算文件（上限已下调，本批零新增不受影响）。
- 补丁号：本批预计零补丁；如需变更回到用户裁决。
- 现有测试夹具（`PlanFacts`、团队校验、离职用例）随新增可选字段同步，不改变既有断言。
- 决策留痕：本批以本文件「决策记录」段为准（D1–D13）。`.swarm-yuan/decisions.jsonl` 在主干上的哈希链已断（存量：第 136 行是被换行截开的残片，与本批无关；`trace-log.sh --verify-chain` 可复现），本批不向其续写；修复历史行须用户授权，修复后用 `skills/swarm-yuan/assets/trace-log.sh --decision` 补记，不手拼 JSON 行。
- 新 spec 重生成文档索引（`node scripts/maintenance/gen-doc-indexes.mjs --write`）。
- 实施计划：`docs/superpowers/plans/2026-11-24-digital-employee-batch1.md`。
