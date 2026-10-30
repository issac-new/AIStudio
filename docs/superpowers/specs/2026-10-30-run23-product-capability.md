# run23 产品能力侧复盘改进批：评测门禁归因 / 维度标注 / 承载面诊断（2026-10-30）

> 状态：已实现（分支 `feat/run23-prod-capability`，未合入 main）。
> 触发：run23 全流程推演报告与评审反复暴露的三个产品侧能力缺口——发布门禁五项运行时证据「恒缺」、150 个评测任务未标注能力维度、产品面承载率 1/5 低于验收线 4/5。
> 边界：只改 `custom/` 与 `docs/`；`simharness/`、`vendor/` 零改动。三项的根因归属逐项给出，不把推演侧问题伪装成产品缺陷，也不把产品缺陷登记成推演侧降级。

## 1. 变更

### 1.1 评测发布门禁：no_data 与「未达标」显式分开（缺口①）

| 文件 | 变更 |
| --- | --- |
| `custom/server/eval/releaseGate.ts` | 新增 `ReleaseGateNoDataCode`（`not_collected` / `insufficient_samples` / `requires_live_backfill`）；每项 no_data 同时写 `noDataCode + noDataReason`（`gap` 保留为兼容别名）；`evaluateReleaseGate` 增第 4 参 `evidenceMode`（只影响原因措辞，不参与判定）；`ReleaseGateSummary` 增 `noData[]` 与 `evidenceMode`；TTFT 缺口文案由「需 live 打点」纠正为「trace 首 token 遥测」 |
| `custom/server/eval/aggregate.ts` | 调用处透传 `run.evidenceMode` |
| `custom/server/eval/e2e-verdict.ts` | 按 `gate.checks` 逐项判读：`status=fail` → FAIL 并点名 `key=实测（阈值）`；`status=no_data` → GAP 并按原因码前缀区分「未采集 / 样本不足 / 无回放数据源」；`E2eVerdictResult` 增 `noData[]`；删除笼统的「线上证据未回填」重复 GAP（由 response_tier/qps 的 `requires_live_backfill` 承载）；历史 run（只有 `gapKeys` 无 `checks`）保留兼容文案 |
| `custom/client/eval/api.ts` / `components/EvalReportPanel.vue` / `i18n.ts` | DTO 增 `noDataCode/noDataReason/noData`；门禁表逐项显示原因码（未采集/样本不足/无回放数据源），`no_data` 状态文案由「证据缺口」改为「无数据」 |

### 1.2 能力维度标注通道（缺口②）

| 文件 | 变更 |
| --- | --- |
| `custom/server/eval/types.ts` | `EvalTask.dimension?: EvalDimension \| 'unclassified'`（注释写清三条路：七维 / 显式未分类 / 留空未标注） |
| `custom/server/eval/coverage.ts` | 新增 `isEvalDimensionTag`；`EvalCoverage` 增 `unclassifiedTasks`；`untaggedTasks` 只算真实缺省，`unclassified` 单列且不计入 `covered` |
| `custom/server/eval/redteam-seed.ts` | 新增 `REDTEAM_VECTOR_DIMENSIONS`（向量→维度单一事实源）与 `dimensionForRedteamTaskId`；36 条种子建集时自带维度：di/ii/se/ta → `privilege_injection`（24 条），cr/sc → `unclassified`（12 条，依据见文件注释） |
| `custom/server/eval/redteam-variants.ts` | 114 条变体继承父题 `dimension` |
| `custom/server/eval/store.ts` | `validateTask` 接受 `'unclassified'`；新增 `labelSetDimensions`（逐题 `assignments` 标注/清除，或 `backfill:'redteam-seed'` 按映射回填存量集；只补未标注项、显式标注优先；变更走 `bumpSetAsset` 版本递增；密封集拒绝） |
| `custom/server/eval/controller.ts` | 新增 `POST /api/hermes/eval/sets/:id/dimensions`（参数严格校验，非法维度/未知 taskId/空请求整单 400） |
| `custom/client/eval/api.ts` / `components/MetricRegistryPanel.vue` / `i18n.ts` | 覆盖面板显示「显式未分类」计数（与未标注分开） |

### 1.3 产品承载面诊断 + IDE 深链空态（缺口③）

| 文件 | 变更 |
| --- | --- |
| `custom/client/ide/store/ide.ts` | 新增 `taskWorkspaceError`：任务 workspace 解析失败不再静默，记 HTTP 状态供空态文案区分；`setActiveTask`/成功解析清空旧错误 |
| `custom/client/ide/composables/useIdeWorkspace.ts` | 新增纯函数 `noWorkspaceHint`：无任务 / 404 任务不存在或无权访问 / ≥500 解析故障 / 任务未物化，四种文案分开 |
| `custom/client/ide/views/IdeFilesPane.vue` | 空工作区改用 `noWorkspaceHint`（带 `data-testid=ide-files-no-workspace-message`） |

### 1.4 设计正本同批修订

- `docs/superpowers/specs/2026-10-19-eval-baidu-paradigm-design.md` §3.4 增补 `'unclassified'` 口径与标注通道（附依据）。
- `docs/superpowers/specs/2026-10-19-fullflow-v845-eval-integration.md` 新增 §7：G4-E 发布门禁 no_data 归因（三态判据与阈值零变化）。

## 2. 决策记录

### D1 缺口①不硬造读数：三项「本可采集」+ 两项「结构性无源」，分码呈现

run23 的评测运行是**内联证据**（测试报告原文，`eval-run.json` 的 attempt 无 `sessionId/efficiency/toolCalls`），与 V8.45 D2「评测运行基于测试报告证据，不重放 agent」一致。因此对该 run 而言：

| 门禁项 | 数据源现状 | 本次归类 |
| --- | --- | --- |
| `tool_success` | 有源：`runner.ts:139` 从 trace `tool_span` 折叠 `toolCalls`，`eval/metrics.ts:322 toolSuccessRateOf` 计算成功率 | `not_collected`（内联证据未关联 trace；换 `samples[].sessionId` 重跑即有数） |
| `p99_ratio` | 有源：trace trailer `duration_ms` / span 时延 → `AttemptEfficiency.durationMs` | `insufficient_samples`（本次 n=0；n<2 无统计意义） |
| `ttft` | 有源：run-trace `first_token_ms/ttft_ms`（`runner.ts:123-127`）与 `obssignals/signals.ts:218` 同源聚合 | `not_collected`（同上；**不是** live 压测项，旧文案说错） |
| `response_tier` | 无回放源：需真实流量分档，经 `POST /runs/:id/live-evidence` 回填 | `requires_live_backfill` |
| `qps_headroom` | 无回放源：需部署验收压测（`mx-load-probe` 产物回填） | `requires_live_backfill` |

判定：不把系统级 trace 指标当某个 run 的证据（代理值=造假），也不为「凑绿」把 no_data 写成通过。产品侧做的是**让缺口可归因、可补采**，而不是让缺口消失。判据三态不变：no_data → GAP 放行，fail → FAIL 阻断（§5.3）。

### D2 判据仍只在一处：`e2e-verdict.ts` 吃门禁逐项结果，不重算

端点 `/api/hermes/eval/e2e-verdict` 只组装输入，判定仍在 `computeE2eVerdict`。本次只是把「门禁项状态」从 `gapKeys` 字符串升级为逐项 `checks` 判读；`gapKeys` 保留（= no_data 键序），旧驱动/旧 run 不受影响。

### D3 150 个未标注任务的根因是种子生成器，不是数据脏

run23 SIM 库 `eset-002 红队种子库·v2` = 36 条种子 + 114 条变体 = 150 条，全部无 `dimension`。两个生成器（`buildRedteamSeedTasks` / `buildRedteamVariants`）都没写该字段；`coverageOfSets` 只认显式标注，于是 `untaggedTasks=150`。修法分两层：新集会自带维度（根治），存量集走 `backfill:'redteam-seed'` 一次回填（迁移通道）。

### D4 `unclassified` 是显式归类，不是「凑绿」的新维度

七维来自信通院《云上 Agent 基准度量模型》。红队社会病理两向量（互批合谋/迎合上位）测多 Agent 群体的社会动力学，七维里没有对应类目。三种处理对比：

| 方案 | 后果 | 采纳 |
| --- | --- | --- |
| 硬塞进现有七维 | `covered` 虚高、判据读到假覆盖 | 否 |
| 留空 | 永远计入 untagged，判据持续记缺口 | 否 |
| 显式 `unclassified` | 不冒充七维覆盖；不记「未标注」；读数面单列 | 是 |

实现上 `'unclassified'` 不是第八维：`EVAL_DIMENSIONS` 仍七项，`covered` 仍只数七维，新增的 `unclassifiedTasks` 与 `untaggedTasks` 并列呈现。

### D5 不改 `simharness/`：缺口③的根因落在报告线，不在产品

见 §3 诊断表。五个产品面的页面全部存在，四个面在 run23 有真实 UI 帧；1/5 的直接原因是报告叙事注册表 `simharness/mux/narrative_run23.py` 的 26 个步位全部 `imgs=[]`（0 个非空），而 `mx-report-gen.py:4128-4138` 的 `_face_step` 只从 `STEPS_META[n].imgs` 取帧。属报告生成线，按本批纪律（不改 simharness）只列修复建议，不动手。

产品侧本轮只做了一件与承载面直接相关的事：IDE 深链 `?task=<不存在>` 的空态从「还没有任务工作区」改为按解析状态说明（404/5xx/未物化），让采集帧能自证是参数陈旧还是功能缺失。

## 3. 验证

### 3.1 单元/集成测试（本轮实跑）

```
npx vitest run custom/server/eval custom/client/eval custom/server/harness/__tests__
→ Test Files 54 passed (54) / Tests 448 passed (448)

npx vitest run custom/client/ide
→ Test Files 125 passed / Tests 795 passed (795)   # 注入态完成后重跑
```

新增守门：
- `custom/server/eval/__tests__/e2e-verdict.test.ts`：no_data→GAP 带原因码、fail→FAIL 点名、非达标不混入 noData、历史 run 兼容、笼统「线上证据未回填」不再出现。
- `custom/server/eval/__tests__/eval-metrics.test.ts`：五项 no_data 全部有 `noDataCode/noDataReason`（与 `gap` 同文）、内联证据原因点名 `sessionId` 补救路径、TTFT 文案不含 live。
- `custom/server/eval/__tests__/eval-baidu-registry.test.ts`：`unclassified` 计入单列不冒充覆盖；逐题标注/清除/版本递增/整单拒绝；`backfill` 回填 36 种子（24 越权注入 + 12 unclassified）且显式标注优先；密封集拒绝。
- `custom/server/eval/__tests__/eval-baidu-http.test.ts`：`POST /sets/:id/dimensions` 200/400 投影、存量 rt-* 集回填。
- `custom/client/ide/__tests__/workspace-root.test.ts` + `task-workspace-store.test.ts`：空态四分支、错误记录与清除。

### 3.2 真实 run23 库副本验证（临时测试，跑完已删）

复制 `/Users/cuishi/lab/ncwk-sim-mux/webui/eval/eval-store.json` 到 tmpdir 后调用 `labelSetDimensions('eset-002', { backfill: 'redteam-seed' })`：

```
[before] untaggedTasks=150, unclassifiedTasks=0, privilege_injection=0, covered=0/7, revision=2
[after]  updated=150, untaggedTasks=0, unclassifiedTasks=12, privilege_injection=138, covered=1/7, revision=3
         contentHash=0d864477e3c9b39a49c9d16a860203d83131aaf7
```

结论：存量 150 条未标注任务可一次回填归零；12 条社会病理任务如实归入 `unclassified`，不冒充七维覆盖。

### 3.3 类型检查

```
npm run typecheck:harness → exit 0
npm run typecheck:client  → 138 errors（仓库基线 18）
```

`typecheck:client` 的差异是环境性的：本 worktree 刚注入、且脚本以 `--ignoreConfig` 扫描到的上游/基线版本与本机主树不同；错误清单中 `custom/client/eval/*` 与 `custom/client/ide/*` 命中 **0** 条（`grep -c` 实测）。脚本无 `--check` 时会重写 `config/typecheck-client-baseline.json`，已 `git checkout` 还原，未入库。

### 3.4 未验证项（如实）

- **未跑 `npm run dev` + localhost:8649 界面走查**：本 worktree 无 8647 后端，起服务会写宿主真实 `~/.hermes-web-ui`。IDE 空态改动由纯函数单测 + store 单测覆盖；模板只有一处插值，已读码核对。
- **未在真实产品进程里调 `POST /sets/:id/dimensions`**：HTTP 投影测试用真 koa + tmpdir store 覆盖了 200/400 与回填；未对宿主实例发请求（会改真实评测库）。
- **未修**：capture-plan 审批面拍摄位、编码面拍摄位参数陈旧、报告承载率取帧源——均在 `simharness/`，按本批纪律不动（建议见 §4.3）。

## 4. 缺口③诊断与归属

### 4.1 口径对齐

方案 §5.5（`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md:2298`）定义的五面分母是**沟通/任务/审批/度量/编码**；「推演（/app/sim）」是 IA 面帧条款里的独立要求，不在五面分母内。评审口述的「驾驶舱/看板/IDE/治理/推演」按此映射：驾驶舱≈沟通（工作台）/看板=任务/IDE=编码/治理=度量/推演=IA 面帧。

### 4.2 逐面诊断（run23，附 file:line）

| 面 | 页面是否存在 | run23 可走查帧 | 缺什么 | 归属 |
| --- | --- | --- | --- | --- |
| 沟通 | 存在：`custom/client/ia2/routes.ts:259`（collab）、`:276`（s/chat），`views/WorkbenchView.vue` | 有：`room_done-op1-after.png`（步 8，工作台三栏真实渲染） | 报告未挂帧（见下） | 报告线 |
| 任务 | 存在：`routes.ts:317`（board→`TasksView.vue`），阶段页签 `stage-tabs.ts` board | 有：`register_done-op1-after.png`（步 10，任务分解看板） | 同上 | 报告线 |
| 审批 | 存在：`routes.ts:323`（inbox→`InboxView.vue`） | 无 UI 帧；`approved.events`（8990B）按 §5.5 降级计达（报告 ✓） | 无步级拍摄位；`capture-plan.env:116` 自注「release 段加队列帧（或⑤验收·G5 审批签就地拍）」未执行 | 采集注册表线（simharness） |
| 度量 | 存在：`routes.ts:257`（stage/govern）+ `stage-tabs.ts:82`（metrics→`StageMetricsPanel.vue`） | 有：`retro_done-op1-after.png`（步 24，⑥治理·度量检查） | 报告未挂帧 | 报告线 |
| 编码 | 存在：`custom/client/ide/routes.ts:20`（/app/ide） | 帧在但为**空态**：`devimpl_done-op1-after.png` 显示「还没有任务工作区」 | 拍摄位写死陈旧的 `?task=DEV-PAYCORE-S`（`capture-plan.env:66,77`），run23 任务为 `DEV-CHWX-S1/S2/S3`；参数化需采集侧按轮代入 | 采集线（simharness）+ 产品侧空态已改（本轮） |
| 推演（IA 帧） | 存在：`routes.ts:405`（/app/sim）+ `views/sim/SimCenterView.vue` | 有：`26-op1-after.png`（导演台真实渲染） | 报告未挂帧 | 报告线 |

### 4.3 1/5 的直接根因与修复建议（归报告线，本批不改）

- 根因：`simharness/mux/narrative_run23.py` 全部 26 步 `imgs=[]`（`grep -c "imgs=\[\]"` = 26，非空 `imgs=[(` = 0）；`simharness/mux/mx-report-gen.py:4128-4138` 的 `_face_step` 只认 `STEPS_META[n].imgs` 中且文件存在的帧。帧在盘上（`r18-steps.json` 18 步有记录、`screenshots/steps/` 55 张），但报告取不到。
- 建议（任选一，归报告线实施）：
  1. 把 `narrative_run23.py` 的 26 步 `imgs` 按已拍帧补齐（与其他轮注册表同款：`imgs=[('room_done-op1-after','…','ui')]`）。
  2. `_face_step` 增加回退：`STEPS_META[n].imgs` 为空时读 `evidence/r18-steps.json` 的该步 `ops[].frames`（采集侧已登记的事实），两源一致才计。
- 采集侧补拍建议：`capture-plan.env` 增审批队列帧（步 20 的第二键 `ready_done` 指 `/app/inbox`，或按 §2.5 改 step 20 语义需同步方案）；`devimpl_done/ide_done` 的 `?task=` 改为按轮变量（现为静态陈旧 id）。

## 5. 设计文档影响

**DESIGN_SYNC: touched**

| 正本 | 修订 |
| --- | --- |
| `docs/superpowers/specs/2026-10-19-eval-baidu-paradigm-design.md` §3.4 | 增补 `'unclassified'` 显式归类口径、`untaggedTasks` 与 `unclassifiedTasks` 分工、标注通道与版本化写入纪律 |
| `docs/superpowers/specs/2026-10-19-fullflow-v845-eval-integration.md` §7（新增） | G4-E 发布门禁 no_data 原因码、逐项 FAIL 点名、去重、TTFT 采集面措辞纠正；三态判据与阈值零变化 |

不改 `2026-10-05-mux-v8-fullflow-plan.md`：阈值表（:2707）、G4-E 三态、五面分母（:2298）均未变化；本次是「同一口径下的呈现与标注细化」，变更正本已落在上面两份 spec。

## 6. 遗留清单（本批未做，需下一批/另一线）

| # | 项 | 归属 | 说明 |
| --- | --- | --- | --- |
| 1 | 报告承载率取帧源改双源（narrative imgs + r18-steps） | 报告线（simharness） | §4.3；否则承载率继续假低 |
| 2 | 审批面拍摄位、编码面拍摄位参数化 | 采集线（simharness） | §4.3；涉 §2.5 语义同步 |
| 3 | 企业约束种子库 9 任务补 dimension | 产品线（本仓） | `ENTERPRISE_TASK_AXES` 已给三轴映射，需逐题映射到七维（compliance 轴跨 privilege_injection/human_escalation，须人工裁定，不猜） |
| 4 | 失败检查项在报告侧的可读呈现 | 报告线 | `fails` 现在逐项带 `key=实测（阈值）`，报告模板尚未单独渲染该结构 |
| 5 | 历史 run 的旧 gate（无 noDataCode） | 产品线 | 兼容为 `code='unknown'`，原因仍取 `gap` 文本；不回填历史 run（避免篡改已归档证据） |
