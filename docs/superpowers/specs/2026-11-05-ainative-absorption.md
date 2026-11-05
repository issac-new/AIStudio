# 2026-11-05 AI Native 工程体系吸收批（五篇系列九件）

> 已归档：2026-11-05 → registry/ainative.md（spec-archive）

## 变更

来源：赞恩的AI工坊《AI Native 工程体系》系列五篇（认知框架 / Spec-Driven Development / Agent Harness / Agent Loops / 团队基础设施），全文精读后按「机制可否机械化」筛选，落九件产品能力。文章口径的关键判据：三根柱子（规格驱动、Harness 四层、Loop 收敛）；"模型判断是建议，程序化终止条件是法律"；"CLAUDE.md 是建议，Hooks 是法律"。

本批九件按线分组，文件面不相交，worktree 并行实施：

### T1 规格保真度门（T1，规格线）

现状断点：四段机检只判「四个标题存在 + 每段一行非空」（`.swarm-yuan/hooks/spec-first-lib.sh:399-435`），564 份 spec 中 349 份靠基线豁免；模糊词检测只存在于 simharness PRD（`custom/server/governance/lifecycle/requirements.ts:16` 的 `FUZZY_RE`），未接 spec 链；无验收条件（GWT）与异常场景覆盖检查。

落点：
- 新增 `config/fuzzy-words.json` 作为模糊词单一事实源（`core` 表＝simharness reqgate 四词逐字口径；`extended` 表＝保真度门扩充词表，正本以该文件为准），`requirements.ts` 与 shell 判定库共读，消除双表漂移。
- `spf_spec_fidelity_check` 新增于 `spec-first-lib.sh`（与四段机检同库），四维判据：完整性（模糊词 0 命中）、一致性（决策记录 ≥1 条）、无歧义（模糊词 + 术语首现全称）、可验证（「变更」段含 ≥1 条 GWT 或带判据的验收条件）。
- L3 门 `skills/swarm-yuan/assets/gates/process/spec-first.sh` 增加 fidelity 检查，`SPEC_FIDELITY_ENFORCE` 三档 warn/block（默认 warn）。
- 存量基线 `.swarm-yuan/spec-fidelity-baseline.txt` 只许减（同四段基线范式）。

验收：新 spec 含模糊词或零验收条件时 L3 输出违规；基线守门测试断言基线内条目仍不达标、不得新增、不得指向不存在文件。

### T2 统一 Loop 终止原因码（Loop 线）

现状断点：终止原因四族词表互不映射——qgate 六态（`custom/qgate/src/core/types.ts:5-11`）、graph `finishReason` 七值（`custom/server/loop/graph/types.ts:213-216`）、kanban outcome 八值（`runtime/hermes_cli/kanban_db.py:1111-1112`）、turn_exit 十一前缀（`vendor/hermes-agent/agent/turn_failure_copy.py:120-138`）。复盘无法机器回答"为什么出来"。

落点：
- 新增 `custom/server/loop/termination.ts`：`LoopTerminationCode` 十七码（SUCCESS / PARTIAL_SUCCESS / IMPOSSIBLE / MISSING_INFO / BUDGET_EXHAUSTED / TIMEOUT / REPEATED_FAILURE / CONTEXT_PRESSURE / PERMISSION_DENIED / UNSAFE_DETECTION / LOW_CONFIDENCE / SOURCE_CONFLICT / VALIDATION_FAIL / AMBIGUOUS_INTENT / CONFIRM_REQUIRED / REVIEW_REQUIRED / UNKNOWN）。
- 映射纯函数：`fromGateVerdict`、`fromGraphFinishReason`、`fromKanbanOutcome`、`fromTurnExitReason`；`isRetryable(code)`、`isNormalExit(code)` 供调度面消费。
- 端点 `GET /api/harness/terminations`：聚合最近 N 天各子系统终止码分布（数据源 faileroute 决策账、graph run 记录、kanban task_events）。

验收：纯函数单测逐码覆盖四族映射；端点返回 `byCode/bySubsystem` 且未知输入落 UNKNOWN 不抛错。

### T3 三种死法检测补齐（Loop 线）

现状断点：文章六种死法中，本仓已有空转（`session_telemetry.py:146-155`）与重试螺旋（`failure-detector.sh:261-285`）检测，确认缺三种：颤振（同一文件反复编辑）、计划卡死（Plan Mode 无 TTL，`custom/server/plan/plan-mode.ts:14` 五态无 expired）、PR 守望（无轮询无变化上限）。

落点：
- 颤振：`runtime/agent/runaway_guard.py` 新增 `file_edit_thrash` 信号——同一文件同一行 3 次以上编辑或同一文件 5 次编辑且验证连续失败，按现有六信号同机制上报（默认仍只报不拦，遵守既有 `HERMES_RUNAWAY_GUARD_INTERRUPT` 开关）。
- 计划卡死：`plan-mode.ts` 增加 `expired` 态与 TTL（默认 30 分钟，`PLAN_TTL_MS` 可覆盖）；`custom/server/clusterinspector/detectors.ts` 增加 `plan.stale` 检测器（requested 超 TTL 未动作）。
- PR 守望：`custom/server/loop/types.ts` 的 pr-babysitter 模板补显式轮询上限（N 次无变化即升级人工），并在 `custom/server/loop/graph/run-spawner.ts` 的停滞指纹判定中把"等待外部状态且指纹不变"计入 stagnant。

验收：三组单测；runaway 测试断言新信号触发条件与默认不打断语义。

### T4 harness-doctor 体检命令（Harness 线）

现状断点：`nine-layers.ts:501,506,518` 三处硬编码 true/文件存在性（secretRedaction、identityInEnforcement、enforceWired），自检虚高；CLAUDE.md 完全未被任何体检读取；无 claude doctor 式统一命令。

落点：
- 新增 `scripts/harness-doctor.mjs`（只读，fail-soft）：八项体检——① AGENTS.md/CLAUDE.md 行数与分叉检测（冲突关键词检索）② 文档死链（引用的仓内路径是否存在）③ 权限总闸实测值（`HERMES_TOOL_ENFORCE`、approvals.mode 统计）④ 沙箱可用性（exec-sandbox 探测 + `HERMES_TOOL_SANDBOX_ROOTS`）⑤ 墙钟/迭代实际值（`run_budget_seconds`、`max_iterations` 三处文案一致性）⑥ 缓存层序静态检查（vendor 静态前缀断点存在性）⑦ 反馈回路新鲜度（qgate state、spec receipts、decisions 最近时间）⑧ 待退役机制台账（mechanism-budget sunset 过期项）。
- `package.json` 增加 `"doctor": "node scripts/harness-doctor.mjs"`。
- `nine-layers.ts` 三处硬编码改实测：`secretRedaction` 检查 redact 模块与配置、`identityInEnforcement` 读 enforce-gate 的实际接线、`enforceWired` 检查环境开关值而非文件存在。

验收：`npm run doctor` 在本仓输出 0 fail 或明确 fail 清单；nine-layers 单测更新；doctor 输出 JSON 可被 CI 消费。

### T5 墙钟硬闸与迭代默认值收敛（Loop 线，vendor 补丁）

现状断点：`run_budget_seconds` 到 80% 只注入一次提示，无 100% 硬中止分支（`vendor/hermes-agent/agent/conversation_loop.py:126-155`）；默认迭代上限实际 `sys.maxsize`（`hermes_cli/config.py:1714`、`run_agent.py:241`），而帮助文本写 500/60，三处矛盾。

落点：
- `patches/` 新增一条补丁：每回合结束处判 `time.time() - _run_budget_started_at >= run_budget_seconds` 则写 `turn_exit_reason=wall_clock_exhausted` 并结束回合（不打断进行中的工具调用，只在回合边界硬停）。
- 默认值收敛：`max_iterations` 显式默认 200（`config.py` 与 `run_agent.py` 同源），`_parser.py`/`cli.py` 帮助文本同步为 200；`iteration_budget.py` docstring 同步。
- 补丁号取 series 下一个可用号，`patches/series` 同批登记；VENDOR_SYNC 通道注入验证。

验收：补丁应用后 `npm run inject` 通过；hermes agent 单测相关子集绿；手工验证 80% 仍有提示、100% 在回合边界停止。

### T6 CI 产品门禁（团队线）

现状断点：`.github/workflows/qgate.yml` 只测 `custom/qgate/**` 自身，`swarm-yuan.yml` 只测技能本体；`grep 'npm test|qgate run|governance-lint|merge-invariants' .github/workflows/` 零命中——CI 绿灯不代表产品门禁通过。

落点：新增 `.github/workflows/governance.yml`，push/PR 触发：`node scripts/governance-lint.mjs --budget`、`node scripts/merge-invariants.mjs --check`、`npm run typecheck:harness`；全量 `npm test` 放 nightly schedule（避免 PR 分钟数爆炸）。

验收：workflow YAML 语法检查；首次推送后 GitHub Actions 实跑结果核对（未跑通前标"未验证"）。

### T7 delta 规格归档（规格线）

现状断点：`ADDED/MODIFIED/REMOVED Requirements` 只存在于模板（`spec-template.md:125-137`），无解析与合并实现；`docs/superpowers/specs/archive/` 只是历史唯一副本，不是变更归档。

落点：
- 新增 `scripts/spec-archive.mjs`：读取目标 spec 的 delta 段，合并进 `docs/superpowers/specs/registry/<domain>.md`（主规格库，域=文件名第三段或显式 `## 规格域`），原 spec 移入 `archive/`，输出合并报告。
- `docs/superpowers/specs/registry/README.md` 声明主规格库角色；`docs-ssot-guard` 与 `gen-doc-indexes.mjs` 排除 `registry/` 子目录，A.1 角色表登记。
- `state-machine.sh` 的 archive 阶段提示改为"verify 通过后可跑 spec-archive"（warn 档，不硬拦）。

验收：`spec-archive --dry-run` 对一份真实 spec 输出合并内容；单测覆盖新增/修改/冲突三类；索引守卫不因新目录变红。

### T8 上下文开销比（Harness 线）

现状断点：`context-reads.ts` 只有读取次数/路径；`swarm-collab.ts:109` 的 MOR 是协作消息字符；无法回答"上下文成本 ÷ 有效产出"。

落点：新增 `custom/server/obssignals/context-overhead.ts`：按会话聚合 `toolResultChars + readChars` 为分子，`finalResponseChars + completedTasks` 为分母，输出 `overheadRatio`、`byLayer`、`cacheHitRate` 关联；`obs-signals` 端点增加 `contextOverhead` 面；口径注释写明"字符代理，token 口径挂账"。

验收：单测覆盖零分母、缺数据 available:false 不猜数；端点字段与前端消费不破坏既有断言。

### T9 AI Native 评分卡（团队线）

现状断点：四套自检并存（maturity / rsi-maturity / nine-layers / delivery maturity），口径不同、均为自检；无统一团队评分卡；无代码退回率直接度量（`metricpolicy/derive.ts:136-137` 自述只有返工代理率）。

落点：新增 `custom/server/harness/ai-native-scorecard.ts`，把文章 30 秒判断的 12 条落成可测判据（6 正：结构化规格、刻意组装上下文、证据随产出、CI 拦截、权限最小化、生产信号回流；5 反：复制粘贴上下文、凭感觉完成、无评测门、逐个 debug、权限过大），逐条映射已有数据源，缺失标 `unknown` 不猜数；端点 `GET /api/harness/ai-native-scorecard`；前端 governance 面板一节 + i18n。

验收：单测覆盖 unknown 分支；端点返回 `criteria[12]`、`score`、`gaps`；前端构建通过。

### D1 权限最小化（2026-11-05 用户令「直接做完」，同日实施清偿）

口径（用户纠正定谳）：`approvals.mode: "off"`（30/30 profile）关闭的是 agent 内置逐条交互式审批流；审批实际由推演程序承担——`simharness/mux/mx-approval-proxy.sh` 导演代批＋`mx-scenario-lib.sh` HumanGate 产品闭环，非"零审批裸跑"。真实缺口与清偿：执法总闸默认关→默认开（env=0 逃生门，managed 可锁死）；策略文件缺席裸放→回落仓内默认策略包 `config/default-tool-policies.json`（三 deny 红线＋两 require_approval＋只读放行，permissive 未命中不拦）；无组织锁定面→`managedsettings` 域（双源加载＋extraDeniedTools 并入链首＋只读端点）；无角色矩阵→`team/shared/role-tool-matrix.yaml`（8 角色×30/30 profile，守门断言新 profile 必须归角色）；`.git` 无护栏→默认包 deny-git-dir-write；路径沙箱相对路径豁免→exec 按 cwd 解析后判。验收与遗留见台账 `2026-11-05-ainative-pending-batch.md` N01（resolved）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D-1 | 九件全做，D1 只记账 | 2026-11-05 用户裁决：全做（分 worktree 并行）；权限最小化本轮不动，只记账 |
| D-2 | 终止码采"映射而非替换" | 不动四族既有枚举的消费者语义，新增统一视图层；未知输入落 UNKNOWN 不抛错 |
| D-3 | 模糊词单一源 `config/fuzzy-words.json` | 消除 shell/TS 双表漂移；`requirements.ts` 的 FUZZY_RE 改为读取该文件 |
| D-4 | 机制预算配对退役 | 新增 1 gate / 2 scripts / 1 npm script / 1 端点模块；配对删除 `api.contract-alignment` 重复 gate 旧版（0.1.0）、`dispatchpreview` 与 `prefixreuse` 两个无生产消费者模块；`org-governance-walkthrough` 按既有 sunset 退役 |
| D-5 | 墙钟默认 200 迭代 + 显式墙钟 | 三处文案（500/60/sys.maxsize）收敛为 200；墙钟默认不启用（`run_budget_seconds` 仍由调用方显式设置），只在设置后硬生效 |
| D-6 | delta 归档落 `specs/registry/` | 主规格库与逐份 spec 分离；`archive/` 保持"历史唯一副本"语义不混用 |
| D-7 | T5 走 patch 不改 vendor 直接改 | 遵守 vendor 钉版基线规则，行为变更只经 patches/ 注入 |
| D-8 | D1 由记账改同日实施 | 2026-11-05 用户令「直接做完」；总闸默认开＋默认包回落保证未配置环境也有红线基线，env=0 逃生门保留 |
| D-9 | 默认策略包 permissive 而非 strict | 未命中不拦=既有写/执行行为不变（阶梯/沙箱继续判定）；strict 翻转 fail-open 语义保持 opt-in（文章口径「关键是你知道自己在选什么」） |

## 验证

逐件验收：目标 vitest（`npx vitest run <path>`）；服务端新模块跑 `npm run typecheck:harness`。

合并前全量门：`npm test`；`node scripts/governance-lint.mjs --budget`（新增 mechanism 已登记 sunset）；`node scripts/merge-invariants.mjs --check`；pre-push 实跑 L0 五门 + 健康体检。

专项验证：T5 需 `npm run inject` 后跑 hermes agent 相关单测；T6 需 GitHub Actions 首跑结果（未跑通前在交付说明标"未验证"）；T9 前端构建 + 面板走查。

## 设计文档影响

DESIGN_SYNC: none

理由：本批为新增独立域模块（termination / context-overhead / ai-native-scorecard / harness-doctor / spec-archive）与门禁扩展（spec-fidelity），不改变整合设计正本（`2026-10-23-swarmstudio-integrated-design.md`）的既有结构与数字总账；新增能力在 A.1 索引与本 spec 记录。T5 的迭代默认值变更属运行时行为，已在决策记录 D-5 留痕。

## Spec Delta（OpenSpec 格式；registry 合并面）

### ADDED Requirements

### Requirement: 规格保真度门
治理 spec 的「变更」段须含可验证验收（GWT 或含判据验收行）、「决策记录」段至少 1 条决策行、全文零模糊词（词表单一源 `config/fuzzy-words.json`）与零 `TBD`。档位 `SPEC_FIDELITY_ENFORCE=warn|block`，存量债走基线棘轮（只许减）。

#### Scenario: 新 spec 含模糊词
- **WHEN** 基线外 spec 正文命中模糊词表（围栏与行内 code 除外）
- **THEN** L3 spec-first 门输出 gate_spec_fidelity 违规（block 档强拦）

### Requirement: 统一终止原因码
Loop/门禁/看板/回合四族终态词表可映射到统一十七码视图（`custom/server/loop/termination.ts`），未知输入落 UNKNOWN 不抛错；`GET /api/harness/terminations` 输出 byCode/bySubsystem 分布（数据面 fail-soft）。

#### Scenario: 未知终态输入
- **WHEN** 任一映射函数收到词表外取值
- **THEN** 返回 UNKNOWN 且不抛错

### Requirement: 墙钟硬中止
`run_budget_seconds` 设置后，通用循环在迭代边界判 100% 耗尽即以 `wall_clock_exhausted` 收口（不打断在途工具调用、预算后不发摘要请求）；未设置预算行为不变。迭代默认上限四方一致为 200。

#### Scenario: 预算耗尽
- **WHEN** 回合内墙钟越过 run_budget_seconds 且工具调用已返回
- **THEN** 本回合终止，退出原因 wall_clock_exhausted

### Requirement: 三种死法检测
颤振（同文件反复编辑且其间验证连败）入 runaway 第七信号；Plan Mode requested 超 TTL 自动过期（默认 30 分钟）；pr-babysitter 模板带无变化轮询上限（默认 12 次）并写明升级人工。

#### Scenario: 计划悬挂
- **WHEN** requested 计划超 TTL 未裁决
- **THEN** 状态转 expired 且不可再 confirm，plan.stale 检测器可见

### Requirement: harness-doctor 体检
`npm run doctor` 输出八项只读体检（上下文文档分叉/死链/权限总闸/沙箱/迭代墙钟一致/缓存层序/反馈新鲜度/机制退役），fail 抬退出码 1，`--json` 可机消费；nine-layers 不得含硬编码 true 的自检项。

#### Scenario: 机制退役过期
- **WHEN** mechanism-budget 任一 sunset 条目 reviewBy 已过
- **THEN** doctor 报 fail 且退出码 1

### Requirement: CI 产品治理门
`governance.yml` 在 push/PR 跑 governance-lint --budget、merge-invariants --check、typecheck:harness（CI 内联装工具链）；全量 npm test 因依赖本地注入态 vendor 树不入 CI。

#### Scenario: 推送触发
- **WHEN** main 收到 push 或 PR 开启
- **THEN** 治理静态门三命令在干净 CI 环境执行并以失败阻断

### Requirement: delta 规格归档
`spec-archive.mjs` 解析 spec 的 ADDED/MODIFIED/REMOVED Requirements 合并进 `registry/<域>.md`（日志式溯源追加，MODIFIED/REMOVED 缺既有正本即告警登记）；默认盖章不动源文件（A.1/design-index 零扰动），`--move` 提供完整归档联动。

#### Scenario: 首次归档
- **WHEN** 含 delta 段的 spec 执行归档
- **THEN** registry 域文件创建并追加带日期溯源的条目，源 spec 盖「已归档」戳

### Requirement: 上下文开销比
`obs-signals` 端点新增 `contextOverhead` 面：按会话聚合工具结果与读取字符为分子、最终回复与完成任务为分母的字符代理比值（token 口径挂账），缺数据 available:false 不猜数。

#### Scenario: 零分母会话
- **WHEN** 会话无有效产出（分母为零）
- **THEN** 该会话不计入比值（不产生无穷大）

### Requirement: AI Native 评分卡
`GET /api/harness/ai-native-scorecard` 输出 12 条判据（6 正 5 反 1 缓存）的达标态，逐条映射既有数据源，缺失标 unknown 不猜数，前端 governance 面板呈现。

#### Scenario: 数据源缺席
- **WHEN** 某判据的数据面不可用
- **THEN** 该判据标 unknown 且不计入达标分子
