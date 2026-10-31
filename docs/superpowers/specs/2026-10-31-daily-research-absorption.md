# 2026-10-31 日常调研吸收轮：组件台账刷新、Loop Graph 任务台账与 RSI 增益归因/约束保持

日期：2026-10-31
状态：implemented
触发：用户要求「整理 hermes agent loop graph 任务和 AIStudio 的所有组件台账，全面调研当前 RSI 相关综述及技术栈，完成每日常规的调研、学习、吸收，组件升级兼容等工作」。

## 变更

### 一、组件台账刷新（2026-10-31 实测锚）

本轮按 `team/skills/devops/tech-component-ledger-refresh-orch/SKILL.md` 的「点名触发」程序，对三棵 vendor 树、本机常驻组件、带版本轴的 🔴🟡 线与 RETIRED 复活检查做了一次全量实测。结论如下（详细行级数据见 `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md` 的 2026-10-31 刷新）：

1. **hermes-studio 已发 v0.8.0**（2026-10-30T15:04:25Z，commit `f67b587b9`，基线 `8f215f59d`，compare `ahead_by=58`）。这是本轮唯一的真实升级触发点。v0.8.0 的主线是 Person 个人助理 BOT、浏览器工具族、桌面设备窗口隔离与 MCU 目录重排；未标 `BREAKING`，但 `packages/esp32-c3/*`、`packages/esp32-s3/*` 已整体迁到 `packages/mcu/...`，直接打穿补丁 329 的 5 个目标文件。静态交集评估：422 条活跃补丁中 160 条与 v0.8.0 变更路径有交集，46 条落在上游大改写文件上。**本轮只做兼容评估，不执行升级**（见决策 D1）。
2. **hermes-agent 仍为 v0.22.5**（2026-10-23），main 领先 3087 提交，无新稳定 tag；等发版再升级。
3. **zcode 上游 main 已到 v3.17.1 线**（`a60ba6a7`，2026-10-30；单提交 5231 文件，包版本 3.16.2→3.17.1）。按「跟 main」政策属于应同步对象，但本仓 `zcode-patches/series` 有 8 条活跃补丁，需单独走升级轮；本轮只登记。
4. **台账过期项修正**：OpenExecutive 已发 v0.6.8（2026-10-30，基线后 124c）；mattpocock/skills 已发 v1.3.2（2026-10-29，v1.3.1 后 51c）；A2A 已出 `v1.1.0-rc` tag（2026-10-29，v1.0.1 后 92c，稳定发版仍 1.0.1）；semantica 未发版增量从 196c 涨到 217c；Ghidra 12.2 仍待 JDK 25 换绑；LongHorizon PyPI 0.1.8 的 upload_time 实为 2026-10-21（台账原记 08-20，笔误）。
5. **台账结构性修复**：终态单文件此前分域行数 36、§3.2 标题 9、§七.3 35、§二 6/8/18 三套口径互相矛盾；本轮统一为「行级机械计数」并把 2026-10-30 追加在旧账的 HelixHarness 行迁入终态表，计入后 37 行。旧账 `docs/upstream-analysis/component-ledger.md` 恢复冻结态，只保留历史反查；终态表新增「范围与相关台账」节，明确 vendor 三树归 `vendor/VENDOR.md`、技能运行时归 `capability-map.md`、旧账为历史档案，避免把「唯一事实源」误读为「全仓唯一定义」。
6. **VENDOR.md 同步**：hermes-studio 上游仓已改名 `EKKOLearnAI/ekko-studio`（旧名重定向）；zcode 包版本实为 3.16.2（不是「v3.16.1 系列」的唯一口径）；zcode 活跃补丁实为 8 条（002-009），不是 7 条。

### 二、Loop Graph 任务台账

新增 `docs/superpowers/specs/2026-10-31-loop-graph-task-ledger.md`，把 P2/P3/P4 台账、多视图设计、代码内 TODO 与当前代码事实逐条对账，形成 LG-01～LG-40 的任务台账。核心结论：

- 多数 P2/P3/P4 顺延项已在 2026-09-12 前修复；但 2026-10-20 运行中心 UI 整体删除后，P4 台账里多条「已修」项实际随视图消失（#21/#23/#29/#30），文档状态与代码现状脱节。
- 当前 P0 断链：`SpecEditorView` 试跑、`RunLinks` 任务反查、`LegacyLoopView` 三条入口都跳 `ia2.runDetail`，而该路由在运行中心删除后重定向到 `/app/sim?run=`，`SimCenterView` 只把 `run-sim-director-*` 当导演 run，其余 run 落到 26 步 harness 面板并显示数据不可用。
- 本轮只产出任务台账，**不恢复运行中心 UI**：该 UI 是 2026-10-20 明确删除的产品面，恢复与否是产品裁决（决策 D4），不能在台账轮里静默重建。

### 三、RSI 调研与吸收

新增 `docs/reports/2026-10-31-rsi-survey-and-tech-stack.md`，覆盖 RRSI、Trustworthy RSI、Self-Evolving Agents 综述、HDA、Harness Evolution 评测重思、CHASE、DGM、AlphaEvolve、SEAL、Gödel Agent、ADAS、STOP、Context Engineering、RepliBench 等主线，并给出机制卡片与 AIStudio 落点。已核验的 arXiv 锚：2609.24972（RRSI）、2610.35193（Trustworthy RSI）、2610.22466（HDA）、2507.21046（Self-Evolving Agents 综述）、2607.12227（Harness Evolution 评测重思）。

本轮落码两个 P0 机制（决策 D5/D6）：

1. **D1 增益归因（HDA）**：`ProbeMetrics` 新增 `equalBudgetBaseline?: { runId, setId, passAt1 }`；`recordProbe` 可绑定 `equalBudgetBaselineRunId`（必须是同评测集、explicit 的真实运行，不接受手填）；`loop.ts` 新增纯函数 `attributeGain()`，把原始增益拆成 `computeGain`（等预算基线 − 标准基线）与 `harnessGain`（候选 − 等预算基线）；晋级门在归因读数存在时，`harnessGain <= 0` 直接 blocker `gain_explained_by_compute`，`harnessGain` 不足原始增益一半时 warning `gain_mostly_compute`；未绑定时按 `HARNESS2_RSI_REQUIRE_ATTRIBUTION=1` 决定 warning 还是 blocker，默认 warning。
2. **D5 约束保持门**：`Proposal` 新增 `constraints?: ConstraintRecord`；新增 `POST /api/harness/workbench/proposals/:id/constraints` 记录一组「不许退化」断言（id/statement/status/evidenceRef，记录 actor）；晋级门对 `fail` 硬拦 `constraint_regression`，对 `unknown` 警告 `constraint_unverified`，未记录时按 `HARNESS2_RSI_REQUIRE_CONSTRAINTS=1` 决定 warning 还是 blocker，默认 warning。

### 四、组件升级兼容评估

hermes-studio v0.8.0 的迁移方案（本轮不执行）：

1. 先修补丁 329：`packages/esp32-c3/*`、`packages/esp32-s3/*` 的目标路径改为 `packages/mcu/esp32-c3/*`、`packages/mcu/esp32-s3/*`；若品牌串在 MCU 固件中已无意义，则退役该补丁并登记。
2. 补丁 690/111/473（locale 与 desktop-i18n）与上游 Person 词条、设备窗口模块同时改写，建议先注入 v0.8.0 再用文件级最小上下文重生成，不做逐 hunk 手工解冲突。
3. 补丁 195/313/088/571/661 集中在 `sockets/chat-run.ts` 与 `chat-run/handle-ekko-agent-run.ts`（上游 +23.3KB 改写），需要重新生成而不是硬拼。
4. 全量重放 422 条 series 后跑 `npm test`、`npm run typecheck:harness`、`npm run build:full`；任何补丁跳过必须在 VENDOR.md 与台账登记，不得静默。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 本轮不执行 hermes-studio v0.8.0 升级，只出评估与迁移方案 | 58 提交跨 minor、补丁 329 硬冲突、46 条高风险补丁；升级是独立的高风险批次，混进日常调研轮会让台账/吸收改动不可审查 | 本轮直接升级（否决：风险与工作量不可控，且会与并行会话争抢 vendor 注入态） | 是 |
| D2 | 本轮 worktree 临时放宽到 5 | 开工时并行会话已占 4 个 worktree（daily-closing/three-zone-r2/ide-selfcheck/docs-aistudio-training-manual），均带 IN-FLIGHT；沿用 2026-10-27 D5 的临时放宽先例，收口后回 ≤3 | 等待槽位（否决：并行会话活跃，等待不可控）或关闭 3 天前的 docs 旧树（否决：有未提交工作，需用户确认） | 是 |
| D3 | 组件台账唯一正本仍为 `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`；旧账冻结；HelixHarness 迁入终态表 | 双源已经造成 HelixHarness 行只落在旧账、终态表缺行；单一事实源要求一次收敛 | 继续双源（否决：判级必然漂移） | 是 |
| D4 | Loop Graph 只出任务台账，不恢复运行中心 UI | 运行中心 UI 于 2026-10-20 被产品删除，恢复与否涉及产品形态；台账轮不能替产品做决定 | 顺手恢复旧 UI（否决：可能推翻既有产品决策） | 是 |
| D5 | D1 增益归因只用真实评测运行，不接受手填 passAt1 | 沿用实验台「证据只能来自 Eval Studio」纪律；等预算基线必须是同集 explicit run | 允许手填（否决：会制造假归因） | 是 |
| D6 | D5 约束保持门采用「人审断言 + 证据引用」，默认 warning、env 可升 blocker | 约束集本身需要人定义；首轮先观测假阳性，再收紧为硬闸 | 默认硬拦（否决：约束集未建成时会拦死所有晋级） | 是 |
| D7 | 不新增外部依赖、不升级 vendor、不改 26 步六闸 | 本轮目标是台账与吸收，不是升级；保持供应链钉版纪律 | 引入 HDA 评测库（否决：无必要依赖） | 是 |
| D8 | RSI 报告只引用已核验 URL；未读全文的标「摘要级」 | 红线：结论必须有锚点，不编造 | 凭记忆补全（否决） | 是 |

## 验证

1. 目标单测（2026-10-31 实跑）：
   - `npx vitest run custom/server/harness/workbench/__tests__/loop.test.ts` = 40/40
   - `npx vitest run custom/server/harness/workbench/__tests__/workbench-http.test.ts` = 24/24
   - `npx vitest run custom/__tests__/docs-ssot-guard.test.ts` = 6/6
2. 类型检查：`npm run typecheck:harness` = 0 错（新增类型/workbench 已在点名清单）。
3. 全量：`npm test` = 970 文件通过 / 6 文件跳过；7042 用例通过 / 11 跳过；0 失败（exit 0）。
4. 台账机械核对：用脚本统计终态表分域行数、§二判级合计、§七.3 行数口径三者相等；旧账不再新增行。
5. 文档守门：附录 A.1 计数与实际直接根 Markdown 数一致（本轮新增 2 份 spec，415→417）。
6. 未验证项：hermes-studio v0.8.0 未实际 inject/测试（本轮明确不做）；zcode 3.17.1 未同步；Loop Graph 的 P0 断链未修（仅台账）；约束检查目前只有 REST 入口 `POST /api/harness/workbench/proposals/:id/constraints`，无前端录入面；等预算基线需在 record 探测时显式传 `equalBudgetBaselineRunId`，自动探测尚未生成该字段。两项 UI/自动化留待后续轮。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§7.3「依赖与运行资产」补 2026-10-31 刷新结论（v0.8.0 触发、台账 37 行、RSI 两机制落码）；核实日改 2026-10-31。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：核实日改 2026-10-31；zcode 口径补包版本 3.16.2；补上游实测注记（不改钉版，不写动态计数）。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec 与 Loop Graph 任务台账 spec，标题计数 415→417。
- `team/profiles/orchestrator/references/design-doc/hermes-complete-design-doc.md`：§4.40 台账摘要改 37 行六域、判级 3/10/24、skill v1.3.0、仓内正本路径。
- `vendor/VENDOR.md`：同步上游仓改名、zcode 包版本与活跃补丁数、v0.8.0 未升级声明。
