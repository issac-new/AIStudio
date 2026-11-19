# SoduWork 调研：企业 Agent 的三道坎与 AIStudio 的吸收边界

> 日期：2026-11-19
> 调研对象：微信文章《SoduWork 正式开源：企业 Agent 落地的现实问题与解法》（2026-11-18）＋ 上游仓 `mdiri-ai/SoduWork` @ `9b172502d`（v1.13.18-127，MIT，5039 文件）
> 读者：决定 AIStudio 吸收范围的产品与工程维护者
> 用途：判断哪些机制值得吸收、哪些是宣传话术；本批落地范围见 `docs/superpowers/specs/2026-11-19-delivery-truth-acceptance.md`

## 一句话结论

SoduWork 的可借鉴处不在「多智能体编排」，而在「把完成变成可推导的事实」：逐条 AC 验收、不可变交付版本、返修栅栏、四层能力授权。它的「调度智能」与「独立监督」弱于宣传，不能照抄。

## 三个决定性发现

### 1. 文章真正解决的是「完成不可信」，不是「Agent 不够多」

SoduWork 源码的重心在任务、交付物、审批与返修的数据模型上：`acceptance_criteria` 是任务表的一等字段（`hub-backend/app/models.py:145`），所有 `done` 写入统一经过 `delivery_truth.canComplete` 派生门禁，拒绝时返回结构化 `blockers[{code,title,detail,action}]`（`task_status.py:49-57`、`delivery_truth.py:315-375`）。这套设计把「完成」从状态词变成可由证据推导的事实，恰好对应 AIStudio 当前最薄弱的一环：`verification` 默认 `standard` 直接跳过评审（`runtime/hermes_cli/kanban_db.py:3187-3189`），`independent` 档原先只校验事件时序、不校验审查者身份（`:3158-3173`）。

### 2. SoduWork 的「调度智能」在源码里是人工编排，不是策略引擎

模型目录没有价格、单价或每百万 token 费率字段（`models.py:114-133`）；代码里没有把任务风险、场景或成本映射到模型的规则引擎。实际能力是人工在任务、里程碑、工作流节点、轮次四个层级指定 Agent 与模型（`workflow_route_policy.py:10-117`），加上底座不可用时的 best-effort 回退和 Hub 侧并发准入。文章宣称的「常规步骤用经济型模型、关键步骤用强模型」在源码中没有对应实现。AIStudio 的 `modelroute`/`modelcap` 骨架反而更接近策略路由，缺的是接线与能力矩阵生产者。

### 3. 治理闭环强在「版本 + 四层授权」，弱在「独立监督 + 审计防篡改」

值得吸收：内容寻址的不可变版本、隔离区、同版本号内容冲突拒绝（`automation_models.py:330-352`、`plugin_identity.py:65-106`）；「版本受众 / 实时 use-edit 策略 / 员工安装 / 任务绑定」四层分离，明确区分「能发现、能安装、能在对话用、能在任务跑」（`automation_models.py:409-415`、`plugin_access.py:18-40`）；逐轮 MCP 票据 + 服务端每次调用重校验（`plugin_mcp_gateway.py:198-303`）。
不能吸收：企业插件签名可选（`plugin_signatures.py:228-240`）、发布评测对企业插件只做 advisory（`api/plugins.py:479-500`）、审核人没有职责分离（同一 `plugin.manage` 可提交+审批+撤销，`api/plugins.py:421-465`）、审计是普通可写表且部分写入 best-effort（`audit.py:32-38`）。最刺眼的一条：`review` 只允许任务创建人签，且不校验创建人≠执行人——创建人自己执行时就是自审（`approval_routing.py:186-197,394-398`）；AI 审查节点默认复用执行节点同一 Runner，不校验模型或 harness 不同（`workflow_engine.py:682-684,906-919`）。

## 文章主张与源码事实对照

| 文章主张 | 源码事实 | 判断 |
|---|---|---|
| 开工前必须明确验收标准，标准没确认任务不启动 | 只有工作流声明 `spec` 节点时才强制；普通任务 `acceptance_criteria` 默认空数组，`create_task` 不检查非空，可直接派发（`schemas.py:104-106`、`tasks.py:444-481`） | 宣传过度；机制存在但非全局硬门 |
| 执行 Agent 与审查 Agent 分离 | 审查节点可配不同 agentKind/model，但引擎不校验不同；默认 sticky 同 Runner | 作业隔离成立，人员/模型隔离不成立 |
| 审查不通过退回返修 | 有返修栅栏：必须来自退回后的新授权执行且 round 递增（`artifact_version_guard.py:21-85`）；自动 5 轮/人工 8 轮封顶 | 这条是真实现，值得吸收 |
| 人工签收归档 | 签收只允许 creator；签收后不自动生成归档包，验收底稿是手动导出（`acceptance_summary.py:169-276`） | 签收有，归档弱 |
| 插件走预检→审核→签名→授权→审计 | 企业插件签名可选、评测 advisory、reject 与 revoke 同状态、无职责分离 | 骨架有，硬约束弱 |
| 同一流程分步骤用不同底座 | 任务、里程碑、工作流节点、轮次四层可选模型，最细到轮次边界 | 成立，但靠人工编排 |
| ACP 统一接入 | 声明式 `agent_catalog.json` + 统一 ACP bridge + 权限门禁；新增标准 ACP 只需加目录项（改配置+发版） | 这条是真正值得借鉴的工程实现 |

## 三大支柱的真实机制

### 调度智能：人工编排 + 底座回退 + 并发准入

- 模型目录：Provider 级 key，ModelDef 只有 `ctx_window/modality/config`，没有成本字段（`models.py:98-133`）。
- 选择粒度：设备/Agent 默认、任务、里程碑、工作流节点、轮次五层；最细到轮次边界，不能在一轮内部按 tool call 切换（`execution_selection.py:14-31`、`runner_turn_selection.py:10-104`）。
- 失败语义：显式指定但不可用的模型直接失败，不静默替换（`model_catalog.py:624-631`）；底座回退默认 best-effort，高风险任务没有自动 strict 映射。
- 可借鉴：短时、用途绑定的模型票据 + Hub 侧统一转发（客户端拿不到上游 key，`device_auth.py:114-126`、`ai_proxy.py:488-587`）；数据库协调的五维模型准入租约（`model_runtime.py:44-53,550-633`）；声明式 ACP 目录 + 统一子进程桥（`agent_catalog.json`、`acp_bridge.py:1-6,724-832`）。

### 治理闭环：不可变版本 + 四层授权

- 版本：`(plugin_id, version)` 与 `(plugin_id, checksum)` 双唯一；同版本号内容变化直接冲突（`automation_models.py:333-336`、`plugin_identity.py:65-106`）。
- 隔离区：新版本固定 `quarantined, enabled=False`；审批通过才启用（`plugin_service.py:360-376,378-436`）。
- 四层分离：
  - 版本受众：`organization/users/org_units`，随版本冻结（`plugin_audience.py:10-14`）。
  - 实时 use-edit 策略：`inherit/organization/users/org_units/none`，每次请求实时读取（`plugin_access.py:18-40`）。
  - 员工安装：个人 opt-in，固定已接受版本（`automation_models.py:409-415`）。
  - 任务绑定：企业任务执行只认 binding（`plugin_bindings.py:167-236`）。
- 可借鉴：逐轮 MCP 票据 + Hub 每次 `tools/list`、`tools/call` 重校验，客户端无法用旧票据继续调用已撤销能力（`plugin_mcp_gateway.py:198-303,461-484`）。

### 结果交付：逐条 AC + 返修栅栏

- 任务单一实体：`Task.acceptance_criteria` 是 JSON 字符串数组，最多 50 条、单条 1000 字符；进入执行后不可改（`models.py:145`、`task_requirements.py:343-344,362-369`）。
- `done` 统一事实门：`delivery_truth.canComplete`，拒绝返回结构化 blockers（`task_status.py:49-57`、`delivery_truth.py:315-375`）。
- 不可变交付版本：`ArtifactVersion` 带 `seq/checksum/commit_sha/state`；新版本创建时旧版本自动 `superseded`，其 pending 审批自动 `cancelled`（`automation_models.py:208-227`、`release_control.py:199-216`）。
- 逐条 AC 验收报告：`checks` 必须与 criteria 一一对应、每项附 evidence、总结论与逐项一致（`task_acceptance_review.py:124-154`、`cloud_acceptance.py:107-155`）。
- 返修栅栏：必须来自退回后的新授权执行且 round 递增（`artifact_version_guard.py:21-85`）；自动 5 轮/人工 8 轮封顶（`workflow_engine.py:1107-1108,1130-1158`）。

## AIStudio 对账：九个概念都不缺，缺的是完成边界的硬执法

| 文章概念 | AIStudio 现状 | 关键缺口 |
|---|---|---|
| 任务定义 | 派单五问准入默认 warn（`custom/server/kanban/dispatch-readiness.ts:8-9,83-90`）；交接规则是建议面（`custom/server/handoff/handoff-rules.ts:5-7`） | 无默认硬门；验收标记是正则启发式 |
| 数据可信 | evidence 有 SHA-256 前向链（`custom/server/evidence/evidence-store.ts:204-304`）；run manifest 记录模型/权限/提示词指纹 | 证据台账 500 条环形上限；执行记录仅保留 14 天 |
| 结果验证 | LoopForge gate 真实沙箱、只有 `ok+exit 0` 通过（`custom/server/loop/graph/gate-executor.ts:1-12`）；完成契约可解析 AC 并重算（`runtime/completion_contract.py:5-9`） | 契约只在已声明 AC/dod 时生效；无逐条 AC 裁决结构 |
| 行动落地 | 看板派发 + 多后端 + ACP（`team/` 通用客户端、`runtime/` 编码委托） | 两套 ACP 客户端并存；provider 是硬编码分支 |
| 权责复制 | skillprovision 供给 + expcandidates 候选 + team-library 版本史 | 无调用时技能 ACL；`/learn` 未接线；owner-registry 只覆盖 12/30 profile |
| 调度智能 | modelroute 档位纯函数（`custom/server/modelroute/model-routing.ts:42-79`）只在 IDE Auto 按钮消费；modelcap 风险路由无消费方、矩阵无生产者（`custom/server/modelcap/matrix.ts:40`） | 工作流节点无模型维度（`custom/server/loop/graph/graph-spec.ts:10-18`）；judge 未接线（`custom/server/loop/graph/verifier-bridge.ts:14-18`） |
| 治理闭环 | skillgov 扫描 + skillprovision + 工具网关 | 扫描默认不阻断；无独立审核角色；无技能包签名；调用只按 read/write 类别（`custom/server/toolpipeline/enforce-gate.ts:123-136`） |

## 五个断点在 AIStudio 的落点

| 文章断点 | SoduWork 的做法 | AIStudio 现状 |
|---|---|---|
| 任务定义 | `acceptance_criteria` + `triage_stage` 门 | 派单五问 + AC/dod 完成契约（默认 warn/enforce 可配） |
| 数据可信 | `ArtifactVersion` checksum + 附件 sha256 | evidence 前向哈希链 + run manifest |
| 结果验证 | 逐条 AC 报告 + 返修栅栏 | LoopForge 真实 gate + 完成契约；本批补 independent 报告 |
| 行动落地 | Runner 派发 + ACP bridge | 看板派发 + ACP（两套客户端并存） |
| 权责复制 | 经验插件 + 四层授权 + 审计 | skillprovision + expcandidates；缺调用时 ACL |

## 本批吸收与后续批次

### 已实施（2026-11-19）

只吸收「结果交付」中与本仓完成内核直接相邻的一条：`verification=independent` 不再只看事件时序，而要求当前评审周期的逐条 AC 验收报告。

- 报告随 `kanban_complete.metadata.acceptance_report` 提交；校验条数/ID/证据/结论一致性、reviewer≠implementer、绑定当前 `review_requested` 事件。
- 返修轮次写入 `changes_requested.reworkRound`；超过上限拒绝 `request_review` 并落 `rework_exhausted`；`force` 可越过。
- 拒绝原因结构化 `blockers[{code,title,detail,action}]`；`VerificationLevelBlocked.blockers` 与事件 payload 同步携带。
- 紧急放行仅 `HERMES_KANBAN_ACCEPTANCE_OVERRIDE=1`，并落 `acceptance_override` 事件。
- 实现与验证见 `docs/superpowers/specs/2026-11-19-delivery-truth-acceptance.md`。

### 后续候选（未实施）

1. **不可变交付版本**：给任务卡增加内容寻址的 `delivery_version`（checksum+commit+state），新版本自动作废旧版本与 pending 审批。当前 evidence 记录可追加但不可寻址，缺少「验收绑定到确定交付物」的硬约束。
2. **技能四层授权**：audience / use-edit 策略 / 安装 / 调用绑定分离，调用时重校验。当前 `skill-guard-hook` 只拦 `dangerous` 扫描 verdict，且缺扫描记录时 fail-open。
3. **调度智能接线**：GraphSpec 节点增结构化模型字段；`resolveAutoRouteTarget` 接派发；judge 真调用独立模型；modelcap 矩阵生产者。当前骨架完整但无消费方。
4. **ACP 目录化**：把 `team/` 的硬编码 provider 分支改成声明式目录 + 统一桥，消除两套 ACP 客户端。
5. **派单时 AC 硬门**：`verification=independent` 的卡在派发前就要求 AC 非空，而不是等到完成时才拒。

### 明确不吸收

- 成本自动路由：模型目录无价格数据，做出来只能是猜测。
- 企业插件签名可选、审核人无职责分离、creator 自审：这些是 SoduWork 的已知弱点，不是可借鉴机制。
- 无防篡改审计：AIStudio 的 evidence/approval 已有前向哈希链，不应退回普通可写表。
- 写死 5/8 轮：本批改为默认 5、env 可调、0 关闭。

## 未覆盖与验证

- 本报告的证据来自 2026-11-19 对 `mdiri-ai/SoduWork` 的只读源码检查（commit `9b172502d`），未执行上游任何脚本。
- 本批测试：目标套件（acceptance + verification levels + completion contract）**58 passed**；广域 kanban 回归 234 passed / 7 skipped / 8 failed，8 个失败换回基线旧 `kanban_db.py` 后同样失败，属环境/存量，不是本批引入（host venv Python 3.14.7）。
- 未完成全量：Homebrew Python 缺 `prompt_toolkit`、host venv 缺 `keyring`，`tests/hermes_cli` 全量有收集错误且长跑超过 30 分钟未收敛，已中止。
- 未做真实多 Agent 会话走查：需要一张 `verification=independent` 的卡完整走「实现→请求评审→审查报告→完成/退回」。
- 未改看板 UI：逐条 AC 结果暂不展示，后续批接 `acceptance_report` 事件。
