# Agnes Harness 吸收：判定席位（批二先行）

> 状态：已批准（2026-11-20 用户批准「两批都做、完整治理」）。批一（学习闭环治理）因 `ai-native-cognition-batch2` 在途会话占用同一区域，按单写属主纪律让位，改为批二合并后再起；本 spec 只覆盖批二。
> 外部吸收源：量子位《双系统决策+双层自进化，Agnes让Agent效率最高提速14倍，成本骤降至1/27！》，2026-11-20。
> 一手材料：`Agnes-Harness-Technical-Report-Nov-2026`（PAPER.pdf，21 页）、`Agnes-Sys1-1.0-Technical-Report`（REPORT.md，5 页）、`AgnesAI-Labs/agnes-harness` README。

## 1. 背景与目标

### 1.1 外部研究的可用结论

文章把 Agnes Harness 归纳为四项机制。逐项对照一手材料后，可用与不可用如下：

| 文章主张 | 一手材料核验 | 对本仓的处置 |
|---|---|---|
| Sys1 是 9B 决策模型，决定「调哪个工具/等待还是执行/要不要叫大模型」 | Sys1 报告：Qwen3.5-9B 基线，block-bidirectional attention，**直接抽取候选选项概率**而非生成文本；用途是 classification / tool selection / request routing / ordinal scoring | 吸收**治理模式**（有限选项、置信度、强制回交、来源留痕、已验证快路径），**不引入 9B 模型** |
| 0.53s vs 7.6s（14.3 倍）、单次决策成本 1/27 | 报告有该读数，但范围是密封仿真/100 次调用单元成本，不是任务总成本；九项基准是 harness×模型配对分，报告自述不能归因给 harness 单独效果 | 不作为产品收益口径；只作为「已知转移不必每次调大模型」的设计依据 |
| TTT：上岗前自出练习题、只调末端校准参数、学完清空 | Sys1 报告原文：TTT 一节「只给出方法与评测计划，**未报告任何实测收益**」 | **不吸收**。本仓不训练模型；任务级临时上下文已由 run 作用域覆盖 |
| RSI：复盘→验证→版本化 Playbook→复用 | 报告有完整治理链：数据型 Playbook、Train/Eval/Sealed 三向隔离、字典序目标（安全优先）、人工签署、200 任务试用期与统计自动回滚 | 批一吸收（延后，见 §7） |
| 插件化按需装配 + 会话级 pinning | README：插件按会话 pin 版本，运行中会话保持启动版本 | 候选，本轮不做（本仓现有粒度到 profile） |
| MHS 硬件标准 | 报告：物理设备协议，独立于 MCP | **不吸收**，与本仓软件开发组织域无关 |

补充核验：Sys1 报告的 Omniscience 非幻觉率比对照低 18.0 个百分点，文章未提；因此「概率可读」不等于「判定可靠」，本批快路径只从**重复一致的已验证判定**固化，不把单次概率当正确率。

### 1.2 目标

在不改变默认行为的前提下，给本仓两个 LLM 判定点加一层「判定席位」：

- 有限选项与置信度显式化；拿不准时按固定条件回交更强判定或人，而不是静默放行。
- 已验证的高频转移走持久快路径，减少重复 LLM 调用与判定漂移。
- 每条判定留来源（rule / fast-path / model / human）与版本键，事后可倒查。

### 1.3 非目标与反目标

- 不引入 9B 决策模型，不训练、不微调任何模型。
- 不替换现有判定核：toolresultguard 的 S0/S1/τ 三段门控、eval judge 的多裁判多数决保持原样；席位只包一层。
- 不改变默认开关：`TRG_ENABLED` 仍默认 0，`TRG_HANDOFF` 默认 0；不开时行为与今天完全一致。
- 不把「快路径命中」写成「判定正确」；快路径只表示「同情境同版本下重复一致」，正确性仍由原判定与人工复核负责。
- 不新增账本：快路径与回执落在既有审计/评测存储，避免机制通胀。

## 2. 仓内现状与断点

| 断点 | 事实锚点 | 后果 |
|---|---|---|
| 缓存键缺策略/模型版本 | `custom/server/toolresultguard/decide.ts:58` 键=`stage:contentSha`；`client.ts:71-97` 模型/阈值来自 config | 换模型或 τ 后 10 分钟内仍复用旧判定 |
| 灰区不回交 | `decide.ts:111-114` 灰区 → `CONFIRM`（放行+警示）；文件头注明 S2 不在 v1 | 拿不准时安全侧没有第二道判定 |
| 判定无持久历史 | `decide.ts:120` 只写进程内 TTL 缓存；`audit.ts:30-42` 只 append 审计 | 重启即失忆，同内容重复付费 |
| 历史先例不改变动作 | `custom/server/decisiongraph/decision-recorder.ts:128-142` 只拼一行参考 | 第二次遇到同情境仍从头判定 |

## 3. 变更

### 3.1 新增判定席位原语

`custom/server/judgment/`：

- `types.ts`：`SeatRequest{situationKey, policyVersion, modelVersion, facts}`、`SeatVerdict{mode:'fast-path'|'hand-back'|'evaluate', ...}`、`FastPathEntry{option, confidence, verifiedCount, status, createdAt, lastVerifiedAt, revokedAt?, revokedReason?}`。
- `seat.ts`：纯函数 `seatMode(request, policy, lookup)`。
  - 强制回交顺序：用户刚发言 → 上一步失败 → 连续自动判定达上限（默认 3）→ 策略不一致 → 情境键/版本/选项集缺失。
  - 未触发回交时查快路径；命中且条目健康（active、版本匹配、选项在允许集、置信度过线、未过期）才返回 `fast-path`。
  - 条目级防御：情境键与请求不符、confidence/verifiedCount 非数值、超过最大有效期（默认 30 天）一律不命中——快路径文件是可被触碰的用户目录，按不可信输入校验。
  - 其余返回 `evaluate`，由原判定核继续。
- `solidify.ts`：`observeEntry(existing, request, observation)` 与 `revokeEntry(entry, reason)`。
  - 只有 `verified: true` 的观察才累加；**verified 的语义由调用方定义**（见 3.2：toolresultguard 只在真实模型调用后置 true，缓存重放不算）。
  - 连续 3 次一致才 `active`；置信度取各次观察的最小值（后续观察不能抬高置信）。
  - `overturned` 立即撤回且不自动复活；策略/模型版本变化由键自然失效。

### 3.2 toolresultguard 接入

- `custom/server/toolresultguard/types.ts`：
  - `GuardConfig` 增 `fastPathEnabled`、`handoffS2`、`s2Model`、`s2TimeoutMs`；默认全关（`false`/`false`/`clef-4bit`/30000）。
  - `GuardDecision` 增 `fastPathKey?`、`handoff?`、`s1LatencyMs?`、`s2LatencyMs?`。
  - 新增 `GUARD_LOGIC_VERSION`（判定逻辑变更必须 bump，进策略指纹）与 `GUARD_FAST_PATH_MIN_CONFIDENCE`（0.75，单一事实源）。
- `custom/server/toolresultguard/decide.ts`：
  - 缓存/快路径键改为 `${stage}:${contentSha}:${policyFingerprint}`；`policyFingerprint` = sha1(logicVersion, baseUrl, model, s2Model, handoffS2, s2TimeoutMs, tauHigh, tauLow, s0Gate, maxStateChars, 问句文本)。
  - judge 前查持久快路径；命中且载荷校验通过（形状 + option 与 payload.verdict 一致）才返回 `via='fast-path'`，并按阶段归一（tool_result 的 BLOCK→REWRITE，input 的 REWRITE→BLOCK——消费端同款归一，脏载荷不落到放行）。
  - **固化只认独立模型调用**：每次真实 S1/S2 判定非灰区后观察一次；缓存命中不再观察（独立审查 P0：缓存重放不是独立证据，1 次模型 + 2 次缓存不得固化）。
  - **回交失败兜底**：强制回交后 breaker open 或 judge 不可用时，优先沿用已验证快路径（`via='fast-path-fallback'`）或上次判定（`cache-fallback`），不把已知 REWRITE/BLOCK 降成 fail-open PASS；无任何已知判决才 fail-open（独立审查 P0）。
  - 灰区且 `config.handoffS2` 时，用 `config.s2Model` 再判一次；成功则按 S2 答案重算 τ 并留 `handoff`；失败/超时回落现有 `CONFIRM`（行为不变）。S1/S2 延迟分段记录。
- `custom/server/toolresultguard/index.ts`：
  - 持久快路径实现落在既有审计目录的 `toolresultguard-fastpath.json`（**不新建账本域**；受 `TOOLRESULTGUARD_AUDIT_DIR` 控制；文件权限收紧 0600、目录 0700；mtime 变化即重载，外部清理不残留内存旧副本）。
  - `loadConfig` 增 `TRG_FASTPATH`、`TRG_HANDOFF`、`TRG_S2_MODEL`、`TRG_S2_TIMEOUT_MS`。**TRG_FASTPATH 独立默认关**：TRG_ENABLED=1 的存量部署升级后行为不变（独立审查 P1）。
  - 回交接线现状：`guardUserInput` 传 `userJustSpoke: true`；`ekkoGuardHook` 传 `priorStepFailed: !result.ok`；连续快路径计数按 sessionId（缺省 global）隔离。`policyMismatch` 预留未接线（配置热重载不存在，进程重启即换版本）。
  - `revokeFastPath`（人工撤回）与 `resetFastPath`（人工确认后重新观察：删条目）导出为受控入口。
  - redteam 的 `s1Evaluate` 钉死 `handoffS2/fastPathEnabled=false`：S1 层读数口径不随生产开关漂移。

### 3.3 eval judge：核验后不改

原计划给 eval judge 加持久快路径与 `policyVersion` 键。核验代码后判定不改：

- `custom/server/eval/judge.ts:482` 的缓存键已是 `{state, questions, model, salt}`，其中 `state` 含任务证据、`questions` 含 rubric、`model` 含模型名；跑批还已在 `EvalRun.judgeFingerprint`（`custom/server/eval/types.ts:614`）冻结 `{models, backend, tauYes, tauNo}`。
- 代码里没有「模型版本」字段可加；把 `tauYes/tauNo` 塞进缓存键只会制造无谓 miss（阈值作用于缓存之后的判词映射，不影响原始答案）。
- 因此本批**只记录结论，不改 eval judge**；若未来出现同名模型换权重/换后端，再以 `judgeFingerprint` 为锚补版本键。

### 3.4 派单链来源字段：本轮不做

原计划给 `DispatchPlan`/`MentionOutcome` 补 `source`/`decisionRef`。该文件面与在途 `ai-native-cognition-batch2` 的「全量快照与召回留痕」重叠，按单写属主纪律让位；本批不改派单链。席位原语已可被派单链在下一批直接接入（`seatMode` 纯函数，无需改签名）。

## 4. 决策记录

1. **为什么不引入 9B/不训练**：本仓判定点分散且多为规则；训练新模型的成本远高于收益，且一手报告未给出可迁移的 TTT 收益。用现有配置的辅助模型即可，必要时由 `auxiliary.<task>` 指定。
2. **为什么先接 toolresultguard**：它是唯一在运行期逐工具结果付费的 LLM 判定点，且有现成的 S0/τ/缓存/熔断/审计外壳；改造成本最低、收益最直接。
3. **为什么 S2 回交默认关**：灰区当前是 fail-open（放行+警示），改成回交会增加延迟与成本；默认关保证零行为变化，开启后仍是「S2 失败回落原行为」。
4. **为什么快路径落在审计目录而不是新账本**：机制预算纪律要求新增机制配对退役；本轮没有可退役的同类机制，所以不新增账本域，复用既有审计存储。
5. **为什么快路径固化条件是「3 次独立模型调用一致」而不是「单次高置信」**：一手报告的 DM 选项库也是从已验证轨迹固化；单次概率不是正确率（报告自述非幻觉率低 18pp）。独立审查把初版「缓存重放也算观察」定为 P0（1 次模型 + 2 次缓存重放即可固化=模型给自己当证据），已改为只认独立调用。
6. **为什么快路径默认关（TRG_FASTPATH）**：TRG_ENABLED=1 的存量部署升级后必须行为不变；快路径是新增行为面，独立显式开启。
7. **为什么 eval judge 不改**：核验后其缓存键已含 state/questions/model/salt，跑批另有 judgeFingerprint 冻结；塞阈值进键只会制造无谓 miss。

## 5. 验证

- 新增 `custom/server/judgment/__tests__/seat.test.ts`（15 例）：回交条件顺序、连续 3 步上限、快路径命中/未命中/版本不符/过期/情境键串键。
- 新增 `custom/server/judgment/__tests__/solidify.test.ts`（9 例）：3 次一致固化、2 次不固化、未验证不计数、选项变化重建、翻案撤回不复活。
- 新增 `custom/server/toolresultguard/__tests__/fastpath.test.ts`（17 例）：
  - 3 次独立调用固化、第 4 次走 fast-path 不调 judge；
  - **缓存重放不固化**（换新缓存后必须真调模型）；
  - 换 model/tau 后不命中；灰区不固化；人工撤回后不命中；坏档按空处理；
  - **回交遇 breaker open / judge 不可用：沿用已知 REWRITE 不降成 fail-open PASS；无已知判决才 fail-open**；
  - 快路径跨阶段归一（tool_result 的 BLOCK 端到端变 rewrite）；
  - `TRG_HANDOFF=1` 时灰区调 S2，S2 失败回落 `CONFIRM`；未开时不调 S2。
- 既有测试：`npx vitest run custom/server/toolresultguard custom/server/judgment custom/server/redteam`。
- `npm run typecheck:harness`；`node scripts/governance-lint.mjs --budget`。
- 合并前 `npm test` 全量（仓规）。

## 6. 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §2.3 末新增「判定席位」段（定位：包在既有判定核外的策略层非第二套判定核；来源四态；回交五条件顺序；固化语义=3 次独立模型调用一致、缓存重放不算证据、30 天过期；回交失败沿用保守判定兜底；TRG_FASTPATH/TRG_HANDOFF 双开关默认全关零行为变化；eval judge 核验后不改的理由）。
- `config/mechanism-budget.json` 顶部新增 2026-11-20 judgment 条目（delta/pairedRemovals/sunset 2026-12-05）。
- 不触及数字总账（2026-10-23-swarmstudio-design-ledger.md）、不新增补丁号、不改 vendor。

## 7. 未做/未验证

- 批一（学习闭环治理：注入回执、效果归因、试用期、自动回滚、字典序/n≥3/三向隔离）延后，等 `feat/ai-native-cognition-batch2` 合并后另起 worktree 与 spec。
- eval judge 未改（理由见 §3.3）；派单链来源字段未做（理由见 §3.4）。
- 会话级插件 pinning、TOOL_OUTCOME_UNKNOWN 一次性许可未做。
- 快路径的「正确性」未经真实流量验证：本批只证明机制与边界，不声称减少误判或节省多少成本；需要一轮真实开启 `TRG_ENABLED=1` 后的读数才能给收益。
- `TRG_HANDOFF=1` 的 S2 延迟/成本未在真实 clef 端点实测；当前只有 mock 单测。
