# 看板流程地基：状态词表单源、事件契约与三处红灯

来源：企业架构文章《AI 时代，企业业务流程应该如何重构？》（2026-11-19）的六章框架。
本仓对位诊断结论：AI 参与业务的机制建得很厚（gate／审批账本／HumanGate／四挡），但托举它的
业务流程层没有标准化——状态词表多份副本、配置引用不存在的列、事件契约与 kernel 实际不符。
本文只做「基础准备」这一层：把已造成静默失效的四处对齐，并给词表加漂移守门。

## 变更

### 一、状态词表建立消费面单一入口并加对账守门

- 新增 `custom/server/kanban/kanban-status.ts`：导出 `KANBAN_STATUSES`（九态）、`isKanbanStatus`、
  `KANBAN_STATUS_VOCAB_VERSION`。注释写明正本是 kernel `hermes_cli/kanban_workflow.py`
  的 `DEFAULT_STATUSES`，本常量是消费面（TS／配置／客户端）的唯一引用点。
- 新增守门测试 `custom/server/kanban/__tests__/kanban-status-contract.test.ts`：
  1. 解析 `vendor/hermes-agent/hermes_cli/kanban_workflow.py` 的 `Column("…")` 键 + `ARCHIVED`，
     断言与 `KANBAN_STATUSES` 集合相等；kernel 换血增删列即红。
  2. 断言 `runtime/roster/columns.yaml` 的列键全部 ∈ `KANBAN_STATUSES`。
  3. 断言 `team/shared/handoff-rules.yaml` 中 `status: active` 规则的 `from`/`to` 全部 ∈ `KANBAN_STATUSES`。
- 不改 kernel：`vendor/**` 是钉版基线，改它要走 patches 并在换血时重生成；对账守门能以零补丁成本
  达到同样的防漂移效果，且能同时约束 overlay 与配置文件两侧。

### 二、修正引用不存在列的配置（列自动化与交接规则）

- `runtime/roster/columns.yaml`：`in_progress` 键改 `ready`；删除 `verify` 键。
- `team/shared/handoff-rules.yaml`：`todo→in_progress` 改 `todo→ready`；`in_progress→review` 改
  `ready→review`；`review→verify` 置 `status: retired` 并注明原因。
- WIP 口径（`custom/server/governance/board-status.ts`）：`statuses.doing` 改 `statuses.running`。
  行数据来自 `group by status` 的真实值，`doing` 恒不存在，故 WIP 长期少计。
- 治理健康页（`GovHealthSection.vue` 的 `BOARD_COLS` 与 `i18n.ts` 中英两表）：`doing` 列改 `running`。

### 三、客户端事件适配器对齐 kernel 实际事件

- `custom/client/shared/adapters/event-adapter.ts` 的 `kindToWhat`／`kindToFullText` 补齐真实 kind：
  `status`（payload `status`／`requested_status`）、`column_transition`（payload `to`）、
  `review_requested`、`scheduled`、`archived`、`reclaimed`、`gave_up`、`needs_decision`、
  `gate_blocked`、`gate_warning`、`completion_blocked_contract`、`completion_contract_warning`、
  `edited`、`attached`、`promoted_manual`、`reprioritized`、`estimate_set`、`spawned`、`claim_rejected`。
- 保留原有 `status_changed` 分支作为历史兼容（旧库/旧投影），不删除。

### 四、三处已红缺陷

- `RELEASE-MANIFEST.json` 的 yuan-skill 版本 `v2.100.4` → `v2.101.0`，与 `skills/swarm-yuan/CHANGELOG.md`
  首个版本标题一致；`node scripts/merge-invariants.mjs --check` 由 rc=1 转绿。
- `custom/server/graph/simulation-graph-template.ts` 删除 `meta.gateCommands`。director runtime 不消费
  该键（gate 由 gate 节点的 `config.command` + 受信目录执行），留着只会在每次起跑触发
  `preflightSpecCapabilities` 的 `gate_meta_forbidden`，使 `/api/graph/sim-director/start` 必然失败。
- `custom/server/ontology/ontology-watch.ts` 的完成判定从 `payload.status === 'done'` 改为
  `(payload.to ?? payload.status) === 'done'`。真实 `column_transition` payload 是
  `{to, mode, results, actor?}`（`kanban_gates.py`），原判定恒 false，结卡后的本体校验从不触发。

## 决策记录

**D1 词表正本放 kernel、消费面放 TS，用对账测试连接，而不是改 vendor 或第三处新建正本。**
理由：kernel 的 `DEFAULT_WORKFLOW` 是唯一真正决定合法流转的实现（约 18 处 SQL 谓词从它派生）；
在 TS 新建正本会形成双正本，改 vendor 又要承担补丁换血成本。对账测试同时覆盖 overlay 与两份配置，
漂移一侧即红。代价：新增了一个测试文件，属机制预算内的守门测试而非新门禁（不新增 hook/脚本）。

**D2 列自动化 `in_progress` 映射到 `ready`，不是 `running`。**
理由：列编排由前端拖卡成功后触发（`SwarmKanbanView.fireColumnAutomation` 传真实 `from`/`to`）。
`running` 由 dispatcher 认领写出且 `drag_target=False`，用户永远拖不进去；键 `running` 只能在
派发器自己改状态时触发，形成自触发或永不触发的死键。`ready` 是唯一「拖进去即表示可以开工」的
可达列，与「实现步骤派单」的原意一致。

**D3 删除 `verify` 列配置，不并入 `review`。**
理由：默认工作流没有 verify 列。把复测并入 `review` 会让 review 进入时一次派三步
（qa／approve／retest 合并进单 run），属于行为变更而非缺陷修复，不在本轮猜测。
原文「合理的业务差异用场景化流程管理」——差异应显式登记，不能靠死键维持「机制在场」的假象。
挂账：缺陷复测派发（原 verify 意图）需产品裁决是新增板列还是并入 review 的某一步。

**D4 交接规则第三条置 retired 而非改目标列。**
理由：`review→verify` 的证据要求（评审判词／测试证据／残余风险）在 `review→done` 上同样成立，
但目标列改变会改变注入时机与接收方语义；`retired` 保留历史与版本（仓库既定口径：退役不删除历史），
并在注释写明恢复条件（出现 verify 列时改回 active）。

**D5 事件契约只改客户端，不改 kernel。**
理由：kernel 是上游钉版基线；客户端适配器本就是「上游事件 → 产品视图」的翻译层，翻译表缺 kind
属适配层缺陷。保留 `status_changed` 分支做兼容，避免旧投影/旧库回归。

**D6 导演模板删键而不是放宽预检。**
理由：`meta.gateCommands` 在 director 路径无消费者，放宽预检等于为一个死字段扩大受信面。
删除后该 spec 仍受「gate 节点命令必须在受信目录」的约束，安全边界不变。

**D7 DESIGN_SYNC 判 touched。**
理由：本批新增了「状态词表契约」这一跨域约束，属 DESIGN.md §4.2 记载的看板状态机范畴；
不写进设计正本会让下一个人再次各写一份副本。

## 验证

- `npx vitest run custom/server/kanban/__tests__/kanban-status-contract.test.ts` — 词表对账绿。
- `npx vitest run custom/server/loop/graph/__tests__/sim-director-rest.test.ts` — 导演起跑由「预期 400
  gate_meta_forbidden」改为「起跑成功且 spec 不含 meta.gateCommands」。
- `npx vitest run custom/server/ontology/__tests__/` — 结卡事件 `{to:'done'}` 能触发摄取。
- `npx vitest run custom/server/kanban/__tests__/` — 列自动化/交接规则匹配面不回归。
- `node scripts/merge-invariants.mjs --check` — 由 rc=1 转 rc=0。
- `npm test` — 全量（合并前）。

未验证（如实标注）：`runtime/roster/columns.yaml` 属部署模板，`scripts/deploy-agent-runtime.mjs`
默认保留宿主上与之不同的文件，因此宿主 `~/.hermes` 的列编排不会随本批自动生效，需显式
`--force` 或人工回灌；本批不做宿主部署。

## 设计文档影响

DESIGN_SYNC: touched
DESIGN_DOCS: docs/DESIGN.md

在 `docs/DESIGN.md` §4.2「消息、调度与看板状态机」补一段状态词表契约：九态以 kernel
`DEFAULT_WORKFLOW` 为正本，TS 侧 `kanban-status.ts` 是唯一消费面，列编排与交接规则的列名必须
落在该集合内，漂移由守门测试拦截；事件侧以 kernel 实际 kind 为准（`status`／`column_transition`），
客户端适配器负责翻译，不在 kernel 侧造新产品事件。
