# 能力池地基实施计划（AI 原生组织 C 方案·批二点五）

> 对应 spec：`docs/superpowers/specs/2026-11-19-capability-pool-foundation.md`
> 状态：计划（2026-11-19）。进度：Task 1/2/3/4/5/6/7/9/10/11 已实现（提交 9059f9e）；独立审查（冷读子代理）P0×0/P1×5/P2×11，五条 P1 与主要 P2 已当轮修复（准入 unknown 态、assignee_unverifiable、demandSource 标注、P95→中位、种子写通道口径、复用率样本下限等），修复后目标套件 120 例全绿。Task 8 未开工（等批一 804-806 补丁号稳定）。未推送；收口按用户裁决等批一合并。
> 依赖：批一（结果与授权地基）正在 `feat/ai-native-operating-model` 分支实施，未合 main；本批的内核任务字段补丁须等批一 804-806 稳定后分配号段。

## Global Constraints

- 单一事实源：能力标签以 `runtime/governance/capability-ledger.yaml` 与既有技能标签为准；供需表只读投影，不建存储。
- 调度权威：内核 `kanban_db_dispatch` 仍是唯一 spawn 权威；本批只出候选与准入，不自动改 assignee。
- 存量兼容：无 `required_capabilities` 的卡行为不变；旧行 NULL，不回溯迁移。
- 诚实降级：源缺席返回 `available:false` 与 `null`，不写 0 或 100；未声明能力标 `unknown`，不填默认能力。
- 指标纪律：每项指标必须有消费者；无消费者标装饰，不进入主位。
- 机制预算：新增投影/准入/指标在 `config/mechanism-budget.json` 登记 `sunset`（owner、reviewBy、retireWhen），并配对退役静默空表 catch 与装饰指标降级。

## Review Focus

1. **`skills` 语义不被污染**——`required_capabilities` 是独立字段；`skills` 继续只做强制加载。
2. **准入不误阻断**——只有技能包确定性缺失才 block；assignee 未声明只 warn；例外必须带理由并落事件。
3. **候选排序确定**——能力覆盖、reliability、在途负载、agentId 字典序，固定可测。
4. **源缺席不造假**——能力图/注册表/技能目录任缺一，对应维度 unknown。
5. **补丁号不抢**——内核任务字段补丁等 series 尾稳定后再分配，避免与批一 804-806 冲突。

## Task 1: 能力词表与类型

- [ ] 在 `custom/server/capabilitypool/types.ts` 定义 `CapabilityRequirement`、`CapabilitySupplyEntry`、`CapabilityGapRow`、`CapabilityReadiness`。
- [ ] 复用 `custom/server/governance/governance-ledger.ts:21` 的 `SKILL_TAG_RE`，提供 `validateCapabilityTags(tags)`；非法/空/重复标签返回结构化原因。
- [ ] 明确 `unknown` 与 `empty` 的区分：未声明不是“没有能力”。
- [ ] 失败测试先行：`custom/server/capabilitypool/__tests__/types.test.ts`。
- 验收：合法/非法标签用例全绿；无主标签拒绝；重复标签去重且记录。

## Task 2: 供需派生纯函数

- [ ] `custom/server/capabilitypool/derive.ts` 实现 `deriveSupplyDemand(input)`：
  - 需求：按标签聚合任务数与板数、年龄、首次 run 时间。
  - 供给：合并能力台账 L3、能力图、技能供给清单、`profiles.yaml`、舰队目录。
  - 输出 `CapabilityGapRow[]`，每个源独立 `available`。
- [ ] 分母为 0 的复用率/中位时长返回 `null`，不返回 0。
- [ ] 失败测试先行：固定夹具覆盖有供给、无供给、源缺席、零需求四种情况。
- 验收：每个数字可回指夹具证据；源缺席显示 `available:false`；无编造。

## Task 3: 只读控制器与路由

- [ ] `custom/server/capabilitypool/controller.ts` 挂 `GET /api/harness/capabilitypool/supply-demand`、`GET /api/harness/capabilitypool/candidates`。
- [ ] 接入既有 harness/governance 挂载点；不新增顶层门户。
- [ ] 响应带 `generatedAt`、`sources`、`rows`、`unknowns`。
- [ ] 目标测试：路由契约 + 非法标签 422。
- 验收：接口在隔离环境可读；源缺席不 500；非法输入有稳定错误码。

## Task 4: 能力注册表种子

- [ ] `scripts/maintenance/capability-registry-seed.mjs`：从 `profiles.yaml`、`skill-provisioning.json`、`capability-graph.yaml` 生成 `agent-capabilities.md` 行。
- [ ] 只写有证据的声明；未声明 Agent 标 `unknown`；重复运行幂等。
- [ ] 通过既有 `registry-admin` 写通道落盘，不直写治理仓文件。
- [ ] 目标测试：夹具生成、幂等、未声明不填充。
- 验收：种子文件可被 `capability-composer.ts:69` 解析；未声明不变成空能力。

## Task 5: 派单准入纯函数

- [ ] `custom/server/kanban/capability-readiness.ts` 实现 `assessCapabilityReadiness(task, supply, candidates)`：
  - 技能包缺失：`block`，原因 `skill_not_installed`。
  - assignee 未声明：`warn`，原因 `assignee_undeclared`，允许 `will_force_load`。
  - 无 assignee：候选按能力覆盖、reliability、负载、agentId 排序，`warn`。
  - 无需求：`pass`。
- [ ] 失败测试先行：四种决策路径 + 排序确定性 + 存量卡不变。
- 验收：决策表与 spec 一致；无自动改派。

## Task 6: 接入既有 readiness 链

- [ ] 在 `custom/server/kanban/dispatch-readiness.ts:47-81` 与列编排/mention 既有 readiness 链调用 Task 5 纯函数。
- [ ] 阻断/警告写结构化事件；例外必须带理由与 actor。
- [ ] 不修改内核 claim 逻辑；内核强制另立补丁。
- [ ] 目标测试：列编排与 mention 两条链的准入事件。
- 验收：真实卡走查能看到候选/缺口/证据；无需求卡零影响。

## Task 7: Matrix 生产端 v2

- [ ] `custom/server/matrix/chat-bridge.ts:427-439` 输出 `schemaVersion: 2`、`updatedBy/updatedAt`、每 Agent `capabilities`。
- [ ] 不改协议、不改客户端解析器。
- [ ] 目标测试：v2 载荷被 `protocol.ts:284-326` 解析成功；v1 旧载荷仍被拒绝且不崩溃。
- 验收：客户端 `selectAgent` 能拿到能力标签；端到端一条派单测试。

## Task 8: 任务 `required_capabilities`（依赖补丁号）

- [ ] 等批一 804-806 稳定后，在同一内核补丁批次加 `tasks.required_capabilities TEXT`（JSON 数组，可空）。
- [ ] `runtime/hermes_cli/kanban_db.py:1030-1144` 建表/迁移、`Task` dataclass、创建参数、创建事件 payload。
- [ ] `custom/server/services/hermes/kanban-task-fast.ts:195-200` 投影字段。
- [ ] `custom/client/kanban/components/KanbanInlineCreate.vue` 增加可选能力标签输入；`KanbanTaskDrawer.vue` 展示。
- [ ] 旧行 NULL；无字段卡行为不变。
- 验收：迁移幂等；旧库可读；事件含 `requiredCapabilities`；创建/编辑/展示三面一致。

## Task 9: 三项指标与消费者

- [ ] `custom/server/metricpolicy/store.ts:32-92` 注册：
  - `measure/capability-supply-lead-time`，消费者=能力缺口复核。
  - `measure/capability-reuse-rate`，消费者=能力退役复核。
  - `measure/human-ai-team-success`，消费者=团队组合复核；批三前 `available:false`。
- [ ] `custom/server/metricpolicy/derive.ts` 实现派生与 unknown 语义。
- [ ] 目标测试：消费者非空；分母 0 未知；批三前成功率 `available:false`。
- 验收：每项指标能回答“哪个决定因它改变”；无消费者项标装饰。

## Task 10: 界面

- [ ] `custom/client/governance/components/GovHealthSection.vue` 或 `CapacitySection.vue` 增加能力供需表：标签、需求、供给、缺口、复用板数、供给时效、来源可用性。
- [ ] 任务抽屉显示 `required_capabilities`、候选、缺口、证据链接。
- [ ] 空态/未知态/源不可用三套文案；高风险不用绿色。
- [ ] 浏览器实物走查：治理页、任务抽屉、创建表单三处。
- 验收：数据可回指接口；无假按钮；未知态不显示为 0。

## Task 11: 正本同步与机制预算

- [ ] 更新 `docs/DESIGN.md` 权威数据源表、架构治理章、指标章、界面章。
- [ ] `config/mechanism-budget.json` 登记新投影/准入/指标，配对退役静默空表 catch 与装饰指标降级。
- [ ] 更新设计索引/文档索引；`npm run gen:doc-indexes`（若适用）。
- [ ] 全量 `npm test`、`npm run typecheck:harness`、独立审查。
- 验收：DESIGN_SYNC 兑现；机制预算不超限；独立审查通过。

## 执行顺序

- 可先做：Task 1-7、Task 9（不依赖内核补丁）。
- 等补丁号：Task 8。
- 最后：Task 10-11 与全量门。
- 每任务独立提交；提交前目标测试；合并前全量。
