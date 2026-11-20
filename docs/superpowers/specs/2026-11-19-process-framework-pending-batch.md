# 2026-11-19 流程框架吸收挂账台账（批一/批二后剩余面）

口径：按挂账台账化约定（2026-11-03 用户令），未做项收敛为编号台账——每条给锚点/根因层/
验收判据/状态。本台账承接企业流程重构文章六章框架调研（批一 `2026-11-19-kanban-process-baseline.md`、
批二 `2026-11-19-process-decoupling-batch2.md`）后真正剩下的面；复盘与后续批 spec 引用编号，
不重复展开。

## 待办

### N01 GraphSpec 节点五要素结构化（模块化层）
- 锚点：`custom/server/loop/graph/graph-spec.ts:10-18`（NodeSpec 只有 `config: Record<string, unknown>`
  自由对象；目标/输入/活动/输出/责任主体均无一等字段）。BPA 模型有五要素但与图执行不连接
  （`custom/server/bpa/bpa-types.ts:22-45`）。
- 根因层：模板节点语义全靠 `config` 约定（`simulation-graph-template.ts:41-76`），词表漂移无守门。
- 验收判据：NodeSpec 增 `goal/inputs/outputs/owner` 可选结构化字段＋快照 schema 版本化
  （`graph_run_specs` 兼容旧快照）＋守门测试（模板节点五要素齐备）；BPA→GraphSpec 编译桥可选。
- 状态：待裁决批次排期。

### N02 看板库路径字面量存量收敛（批二棘轮允许清单 6 文件）
- 锚点：`custom/__tests__/kanban-layout-ratchet.test.ts` ALLOWED——middleware/cli-fast-gates.ts、
  knowledge/board-graph.ts、execution-records/delegate-scan.ts、governance/governance-audit.ts、
  governance/run-surface.ts、services/hermes/task-workspace-cache.ts。
- 根因层：批二迁移面收敛 13 处主消费点；余 6 处各有独立语义（pin env/缓存布局/审计路径）需逐个核。
- 验收判据：六文件全部改 import kanban-layout，ALLOWED 清单缩到正本 1 项；棘轮测试同步收紧。
- 状态：可随任意后续批顺手清偿（棘轮保证只减不增）。

### N03 任务卡结构化授权/验收/异常 owner（模块化层）
- 锚点：图卡 body 只有自由文本 acceptance 与文本边界纪律（`custom/server/graph/node-executors/index.ts:210-226,300-316`）；
  异常处理责任人无字段（失败路由靠节点 onError）。上游卡有 `verification` 三档字段但图执行器不写
  （`vendor/hermes-agent/hermes_cli/kanban_db.py:1466-1469`）。
- 根因层：TaskContract 有结构化 verificationIntent（`custom/server/loop/types.ts:157-171`）但
  persist 落卡只写摘要 body（`loop/graph/kanban-persistence.ts:75-90`）。
- 验收判据：AgentTaskConfig 增 verification 档位透传建卡；acceptance 结构化（AC 列表）入卡 body
  机读块；异常 owner=RACI approver 或节点 onError 升级路径文档化。
- 状态：待裁决（与 N01 同批做收益大）；批一 outcome 字段部分承接（2026-11-20，outcome_id 列＋激活即绑定家族传播＋合同 measures/acceptance 结构化正身，见 2026-11-20-ai-native-outcome-batch1.md）。

### N04 action-contracts 注册表→执行器（解耦层）
- 锚点：8 个动作契约只做 schema 校验＋拼派单文本（`custom/server/kanban/column-dispatch.ts:111-120`
  唯一运行时消费）；错误码四套并存（invalid_transition/invalid-transition/state_transition_rejected/
  kanban/invalid-transition，客户端 0 处按 code 分支）。
- 根因层：契约是「声明面」，无执行点接线。
- 验收判据：错误码四合一（唯一 code 词表＋守门）；至少 column.dispatch 的 errors 词表被
  dispatch 结果面真实消费。
- 状态：待裁决。

### N05 流程资产目录＋spec→merge 三指标（治理层）
- 锚点：无统一「规则 id/版本/适用范围/owner/reviewBy/retireWhen」注册表（qgate 门与 4A 注册表
  各自接近但不覆盖工程流程规则）；本仓 spec→merge 周期时间/一次通过率/异常率零实现
  （GateRun 有 startedAt/endedAt 但无聚合消费）。
- 根因层：成熟度量存在于推演 run 域（run-metrics.ts）与产品变更单域（change-governance-store.ts），
  未迁移到本仓工程流程。
- 验收判据：process-registry（含五维）＋leadTime/firstPassRate/anomaly 三个聚合出口；
  机制预算登记＋配对退役条款。
- 状态：待裁决（建议放机制预算 sunset 到期前一轮）。

### N06 治理台账既有红（独立于本吸收链，顺带记录）
- decisions.jsonl 哈希链断（第 117 行起手工追加无 checksum）；strict 32 problem 非 CI 档；
  spec-receipts 25/244 漂移默认 warn；四段基线外 39 份不达标无人守。
- 锚点：`skills/swarm-yuan/assets/trace-log.sh:165-170`、`scripts/governance-lint.mjs:94-106`、
  `.swarm-yuan/hooks/spec-first-pre-commit.sh:149-168`。
- 状态：非本链引入；属治理可信度批范围（参考 2026-11-19 EGM 吸收批记忆）。

## 已裁定不处置（本轮）

- **旧 loop gate 恒过**（patches/202 engineDeps 无 gateCommands）：属 loop 域行为面，
  cron loop 生产路径已由 LoopForge 可信 SOP 批接管方向，不在流程标准化链内重复修。
- **taskledger 终态锁 vs kanban 重开冲突**（done→ready 后账本 terminal-locked）：涉及账本
  语义立法（reset API 要不要存在），需用户裁决，不单方面引入。
- **多 run 状态机 8 套定义统一**：run 对象统一是执行内核批的后续，先决条件（run 身份统一）
  未成立前做词表统一是伪收敛。

## 计数

- 待办 6 项（N01-N06）；不处置 3 项；批一已清 4 项（三红灯＋词表单源）、批二已清 4 项
  （路径收口/五问准入/tier 缺省/verify 意图）。
