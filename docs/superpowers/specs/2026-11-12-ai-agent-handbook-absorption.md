# 2026-11-12 ai-agent-handbook 吸收：上线后可信执行

> 来源：微信文章《阿里《ai-agent-handbook》从架构到实践》（小木的offer）
> ＋正本仓库 `aliyun/ai-agent-handbook`（30 章 / 7 篇 / 69 个 Markdown，Apache-2.0）。
> 本批只吸收"上线之后"的机制：执行事实的可信记录、恢复真值、评测硬化、
> 多 agent 停止条件与预算纪律。手册的架构科普、云厂商基础设施与模型训练章节不吸收。

## 变更

四批一次立项、分四次提交。批 5（资产登记册与 Agent Release）不在本 spec 范围，
待 `2026-11-10-execution-kernel-unification` 落地后另立。

### 批 1：可信执行证据链

| 文件 | 变更 |
|---|---|
| `custom/hermes-agent-plugins/run-trace/__init__.py` | schema 升 1.2：新增 `span_kind` 词表（entry/step/llm/tool/retrieval/memory/guardrail/compaction/hitl/interrupt/context）与必填关联字段（`trace_id/session_id/task_id/attempt_id/status/started_at/ended_at`）；注册 `pre_tool_call`、`pre_llm_call`/`post_llm_call`、`post_compaction`、`on_human_input_request/resolved`；`pre_api_request` 增发 `context_manifest` chunk；`post_tool_call` 增 `attempt_id` |
| `custom/hermes-agent-plugins/run-trace/plugin.yaml` | 版本 1.2.0、hooks 清单补新增项、新增可选 env（权限模式/信任级） |
| `custom/server/controllers/hermes/trace.ts` | `TraceNodeKind` 扩展；新增 `span_kind → kind` 映射与 legacy 反推；解析 `context_manifest` 到 `contextManifests`；未知 kind 不丢弃、落 `unknown` 节点 |
| `custom/server/harness/run-result.ts` | 新增纯函数：Run Result 四维（执行/仿真有效性/证据完整性/质量），每维带 `status/source/evidenceRefs/limitations`；缺席为 `unknown` |
| `custom/server/harness/execution-join.ts` | 结果加可选 `runResult`（由四源＋trace 存在性派生，fail-soft） |
| `custom/server/harness/__tests__/run-result.test.ts` | 四维聚合、缺席、冲突、trace 缺失 |
| `custom/server/controllers/hermes/__tests__/trace-graph.test.ts` | 新 span kind 渲染、legacy 兼容、manifest 解析 |
| `custom/hermes-agent-plugins/__tests__/run-trace-schema.test.ts` | 用 `python3 -c` 真跑插件：新字段写入、旧行可读、manifest 指纹稳定 |

### 批 2：恢复真值

| 文件 | 变更 |
|---|---|
| `custom/hermes-agent-plugins/action-ledger/`（新增） | Hermes 插件：`pre_tool_call` 记 intent、`post_tool_call` 结算；JSONL 追加账本；`HERMES_ACTION_LEDGER_GUARD=1` 时对同键未结算 `sent` 动作返回 block，默认 0=只记账 |
| `custom/server/toolcontract/idempotency-store.ts` | 记录加 `status(intended/sent/confirmed/failed/blocked)`、`attempts`、`externalRef`、`errorClass`、`settledAt`；新增 `beginIntent/markSent/confirm/fail/blocked/unsettled`；`complete` 保持旧语义（视为 confirmed）；导出进程级单例 |
| `custom/server/toolpipeline/tool-hooks.ts`、`contract-guard.ts` | 改用共享单例，消除同进程两实例缓存不一致 |
| `custom/server/toolcontract/action-recovery.ts` | 新增纯判定：`confirmed → reuse`、`failed+retryable → retry`、`sent/unknown → check_external`、`blocked → manual` |
| `custom/server/resume/resume-planner.ts` | `ResumeFacts` 加可选 `unsettled`；读 action-ledger 未结算动作；有未结算 → `manual_gate`，理由带条数与动作名 |
| `custom/server/harness/__tests__/handbook-decision-gates.test.ts` | 四关判定夹具：退款超时（sent→check_external，不重放）、恢复（unsettled→manual）、记忆作用域（跨租户拒）、效率（超预算拒） |
| `custom/server/toolcontract/__tests__/contract.test.ts`、`custom/server/resume/__tests__/resume-planner.test.ts`、`custom/hermes-agent-plugins/__tests__/action-ledger.test.ts` | 新增行为与兼容断言 |

### 批 3：评测硬化

| 文件 | 变更 |
|---|---|
| `custom/server/eval/golden-set.ts` | 新增并列 `GOLDEN_CASES` 元数据（bucket/scenario/sourceRef/expected）与 `GOLDEN_NEGATIVE_MATERIALS`（由正例确定性改写的合成负例）；`GOLDEN_MATERIALS` 保持原结构派生 |
| `custom/server/eval/golden-gate.ts` | `calibrate:true` 时跑 P2P＋F2P；`GoldenGateResult` 加 `calibration{p2pPassed,p2pTotal,f2pRejected,f2pTotal,ece,brier,decision}`；默认观察态；`GOLDEN_GATE_ENFORCE=1` 且校准未达标才 `ok:false`；gate 运行禁用 auto-reflow |
| `custom/server/eval/runner.ts` | 新增可选 `skipAutoReflow`，gate 与校准运行不污染回归库 |
| `custom/server/eval/failure-taxonomy.ts`（新增） | canonical 七类（ENV/TIMEOUT/PRODUCT/SCRIPT/FLOW/UNKNOWN/FLAKY）＋eval 六类映射；`badcase-distill.ts` 加可选 `canonical` 字段，旧 `rootCause` 联合不变 |
| `simharness/mux/mx-eval-summary.py`、`mx-report-gen.py` | 读取 `evidence/evals/golden-gate.json`，summary 加 `goldenGate`，报告加"黄金集门检（桶 x/y/z·误杀 n·校准状态）"行；缺席为 null，不改退出码 |
| `custom/server/eval/__tests__/golden-gate.test.ts`、`golden-set.test.ts`、`failure-taxonomy.test.ts` | 校准分支、负例结构、canonical 映射、旧字段兼容 |

### 批 4：多 agent 停止条件与预算租约

| 文件 | 变更 |
|---|---|
| `custom/server/zcode/team-stop.ts`（新增） | 纯判定：派生任务数、返工轮次、无进展、可选委派深度；阈值可配；输出 `{stop,code,reason}` |
| `custom/server/zcode/mention-dispatch.ts` | `PlanFacts` 加可选 `team`；在自触发之后、pending 槽之前评估；`TEAM_STOP_ENFORCE=1` 才 reject，默认只记录 |
| `custom/server/zcode/team-stop-facts.ts`（新增） | 从 dispatch-ledger/squad 评估账本收集事实；深度仅采纳调用方显式值，不猜 |
| `custom/server/tokenbudget/budget-lease.ts`（新增） | 预算租约：derive/reserve/settle/revoke/status，JSON 持久化，可级联撤销 |
| `custom/server/tokenbudget/budget-policy.ts` | 状态加 `reservedUsd/availableUsd`；`HERMES_BUDGET_ENFORCE=1` 时 block 判定计入预留 |
| `custom/server/zcode/__tests__/team-stop.test.ts`、`custom/server/tokenbudget/__tests__/budget-lease.test.ts` | 停止四码、阈值、默认不拦；租约派生/结算/撤销/并发预留 |
| `custom/hermes-agent-plugins/run-trace/__init__.py` | LLM span 增 `call_id`/`attempt_id`（`api_request_id`＋`retry_count`），成功 span 也带重试次数 |

### 明确不做（本批）

- 不改 vendor 基线；不新增 vendor 补丁；批 4 的 LLM 请求硬准入未接
  （Hermes 请求咽喉属执行内核统一范围），本批只做账本与预算租约。
- 不新建 microVM、ARD/RAD 注册中心、边缘运行时、模型训练/蒸馏、eBPF 采集。
- 不把黄金集升为默认硬门；`GOLDEN_GATE_ENFORCE=1` 是显式开关。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 批 1/2 走 Hermes 现有 hook 与 run-trace 插件，零 vendor 改动 | 改 vendor 需补丁系列再生与注入重放，爆炸半径大；现有 `pre_api_request` 载荷已含 system_prompt/messages/tools/token，是真实上下文，不是推断 |
| D2 | span 词表只增不改：新 `span_kind`，旧 `kind/phase` 保留 | 旧 JSONL 与旧读侧必须能继续工作；读侧按 `span_kind` 优先、legacy 反推兜底，未知不丢弃 |
| D3 | Context Manifest 由 `pre_api_request` 实际载荷生成，存哈希与计量，不复制正文 | 正文已在 `request_messages` 中；再存一份既浪费又扩大敏感面。Manifest 回答"用了什么、版本、多少 token"，不回答"内容是什么" |
| D4 | HITL 只做边界标记与关联，不新建 trace 文件 | trace 文件按 session 生命周期管理，强行分文件会断裂工具/压缩事件；用 `hitl_span(status=waiting/resumed)`＋`linked_trace_id` 表达跨请求恢复 |
| D5 | Action Ledger 独立成 Hermes 插件，JSONL 追加；guard 默认关 | 与 run-trace 职责分离；默认关保证现网零行为变化；`HERMES_ACTION_LEDGER_GUARD=1` 才拦，且只拦已知副作用工具的同键未结算动作 |
| D6 | 幂等账本加状态但保留 `complete` 旧语义，并收敛为共享单例 | 现有测试与调用方按"只观测"断言；单例修复同进程两实例缓存不一致（auditHook 落键、contractGuard 看不到）的实际缺陷 |
| D7 | 恢复有未结算动作即 `manual_gate`，不自动重试 | 手册四关的核心：超时≠失败；本地没有外部真值，自动重试会重复副作用。人审或查外部状态后才可继续 |
| D8 | 黄金集 F2P 用合成负例，默认观察，显式开关才拦 | 合成负例不是 ground truth，只能证明"判分器至少能拒绝明显错误"；先积累校准数据，避免用未校准的分数拦住发布 |
| D9 | canonical 失败分类只增字段，不改旧 `rootCause` 联合 | 旧台账与客户端 testid 已持久化六类值；改 union 会让旧记录标签丢失 |
| D10 | 团队停止条件只用可推导事实：派生数/返工/无进展；深度仅采纳调用方显式值 | 现有台账无 parent 链，房间事件不能可靠推深度；编造深度等于假治理。默认不拦，`TEAM_STOP_ENFORCE=1` 才生效 |
| D11 | 预算租约先落 Studio 侧账本，LLM 硬准入挂账 | 硬准入必须在 Hermes 请求咽喉；本批不伪造"已拦住"。租约先把"预留/结算/撤销"语义立起来，供执行内核统一接线 |
| D12 | LLM 逐尝试账本走 run-trace 的 `attempt_id`，不新增 vendor 补丁 | `api_request_id` 已是逻辑调用 id；补 `retry_count` 即可区分物理尝试，覆盖主循环/重试/流式 |

## 验证

- 批 1：`npx vitest run custom/server/controllers/hermes/__tests__/trace-graph.test.ts custom/server/harness/__tests__/run-result.test.ts custom/hermes-agent-plugins/__tests__/run-trace-schema.test.ts`；`npm run typecheck:harness`。
- 批 2：`npx vitest run custom/server/toolcontract/__tests__/contract.test.ts custom/server/toolpipeline/__tests__/contract-guard.test.ts custom/server/resume/__tests__/resume-planner.test.ts custom/server/harness/__tests__/handbook-decision-gates.test.ts custom/hermes-agent-plugins/__tests__/action-ledger.test.ts`。
- 批 3：`npx vitest run custom/server/eval/__tests__/golden-gate.test.ts custom/server/eval/__tests__/golden-set.test.ts custom/server/eval/__tests__/failure-taxonomy.test.ts`；`python3 -m py_compile simharness/mux/mx-eval-summary.py simharness/mux/mx-report-gen.py`；合成夹具跑 summary/report 各一次。
- 批 4：`npx vitest run custom/server/zcode/__tests__/team-stop.test.ts custom/server/tokenbudget/__tests__/budget-lease.test.ts custom/server/__tests__/zcode-mention-dispatch.test.ts`。
- 全量：`npm test`（若 worktree 注入态不可用，按 N-4 配方先建链；失败项如实列）。
- 注入/部署面：本批零 vendor 改动，`npm run inject` 不需重放；Hermes 插件按目录部署，验证脚本用 `python3 -c` 真导入。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §4.5（执行记录与证据）补 Run Result 四维与 Context Manifest；
  §4.6（治理与审计）补 Action Ledger/恢复真值与团队停止条件；
  §4.8（评测/记忆/经验回流）补黄金集 F2P 校准与 canonical 分类；
  §6.4（已知边界）把"LLM 硬准入未接、HITL 只做边界标记、深度仅显式值"列为未验证项。
- `docs/manuals/aistudio-design-document-index.md`、`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`、`.qgate/scope.yaml` 同批登记本 spec。
- 不新增 gate/script/ledger 机制；插件与 JSONL 账本不计入机制预算，但需在 spec 留运行路径与退役条件。

## 任务卡

### 完成条件

四批目标测试全绿；`typecheck:harness` 绿；插件 Python 导入与 hook 调用实测；旧 trace JSONL 可读；
默认路径零行为变化（guard/enforce 开关默认关）；未接线项在 spec 与 DESIGN 如实列出。

### 输入与来源

来源=微信文章＋`aliyun/ai-agent-handbook` 正本第 03–24 章；现状锚点=
`custom/hermes-agent-plugins/run-trace/__init__.py:437-702`（三 span）、
`custom/server/toolcontract/idempotency-store.ts:1-10`（只观测）、
`custom/server/resume/resume-planner.ts:187-239`（不查外部真值）、
`custom/server/eval/golden-gate.ts:1-4`（观察态）、`docs/DESIGN.md:1605`（14 例误杀）、
`custom/server/callgate/callgate-hook.ts:15`（LLM 不在闸内）。

### 工作流边界

只动 `custom/hermes-agent-plugins/`、`custom/server/`、`simharness/mux/` 与四份文档登记；
不动 `vendor/`、`patches/`、`zcode-patches/`；不新增 gate/script；不改变默认开关语义。

### 工具与副作用

- 新增/修改文件用 Write/Edit；验证用 `npx vitest run`、`npm run typecheck:harness`、
  `python3 -m py_compile`；不执行破坏性命令。
- 运行 trace 插件测试会写临时目录（`HERMES_RUN_TRACE_DIR` 指向 mkdtemp），不写用户
  `~/.hermes/traces`；幂等账本/恢复测试同样用临时目录（`TOOL_IDEMPOTENCY_STORE`、
  `HERMES_ACTION_LEDGER_DIR` 隔离）。
- 默认开关保持关闭：`HERMES_ACTION_LEDGER_GUARD`、`GOLDEN_GATE_ENFORCE`、
  `TEAM_STOP_ENFORCE` 未设置时零行为变化。

### 结果与证据

- 每批提交带目标测试输出；spec 记录验证命令与真实结果，失败如实写。
- 插件行为门用 `python3 -c` 真 import；trace 读侧用 vitest 结构/行为断言。
- 黄金集 F2P 校准若真实 LLM 调用成本过高，测试用 stub judge；生产数值不伪造。

### 异常与恢复

- 插件 hook 异常一律 fail-open（观测面不得影响主链路）；账本写失败只记日志。
- 恢复遇到未结算动作 → `manual_gate`，不自动重放；账本损坏视为未知，不当作空账。
- 黄金集校准失败不改变默认观察态；`GOLDEN_GATE_ENFORCE=1` 才拦截。

### 验收反例

- 旧 trace JSONL（只有 `kind/phase`）必须仍能读出节点；未知 `span_kind` 落 unknown
  而非静默丢弃。
- 幂等 guard 未开启时重复工具调用照常执行（零行为变化）；开启后同键未结算 `sent`
  才拦，`confirmed` 不拦。
- 团队停止条件未开启时派单结果与现状逐字段一致；开启后只 reject，不吞掉已有任务。
- 黄金集未开启 enforce 时 `ok:true` 语义不变；开启且校准未达标才 `ok:false`。
