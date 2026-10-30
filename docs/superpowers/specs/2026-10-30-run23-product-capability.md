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

## 7. IDE 未物化兜底（2026-10-30 续作）

### 7.1 现象与根因（带锚点）

`/app/ide?task=<任意 id>` 在产品里是死胡同：中栏空白会话、右栏「还没有任务工作区」、简报抽屉在任务未命中时自动收起；`t_af224933`（真实卡）与 `DEV-CHWX-S1`（任务号）表现一致。逐层根因：

| # | 根因 | 锚点 |
| --- | --- | --- |
| 1 | 右栏文件页签在无工作区时只渲染提示，没有任何文件视图 | `custom/client/ide/views/IdeFilesPane.vue:119-124`（改前 `:113` 无工作区块） |
| 2 | 中栏只有「落地引导 / 会话」二分，未物化任务落到空白会话 | `custom/client/ide/views/IdeShell.vue` 模板（改前 `IdeChatPane v-else`） |
| 3 | 任务号不等于卡 id：`getTask('DEV-CHWX-S1')` 404 即判未命中，不按标题解析 | `custom/client/ide/composables/useIdeTask.ts:91`（改前 `readUncached`） |
| 4 | 抽屉「miss 一次性消费」直接清 `briefingMiss`——兜底视图若读该标记会把「不存在」误判成「未物化」 | `custom/client/ide/views/IdeShell.vue:408`（改前 watch 内 `briefingMiss.value = false`） |
| 5 | 任务详情与工作区解析串行、逐板扫描 31 板；冷启实测 9s+，深链长期停在「解析中」 | `useIdeTask.ts` 改前串行 `for (slug of boards)` |
| 6 | files API 带 `root` 参数要求 super_admin（fanfan=admin 实测 403），普通用户不能以任务仓库根做 files root | `patches/123-server-files-root-task-workspace-allowlist.patch`（role 检查先于沙箱放行） |

第 6 条决定了「仓库根」的产品可达边界：**不改后端契约**的前提下，普通用户的只读树只能走无 `root` 的服务器默认根；任务目录内容另走既有 `GET /api/hermes/kanban/workspace-files`（按 task_id 沙箱到任务工作区，admin 可用）。

### 7.2 修法

| 文件 | 变更 |
| --- | --- |
| `custom/client/ide/composables/useIdeFallback.ts` | 新增纯函数 `ideFallbackStateOf`：`no_task / resolving / not_found / resolve_error / unmaterialized / ready` 六态（四态语义与 `noWorkspaceHint` 对齐）；`runMarkOf` 提取 `RUN=` 标记；`primaryOwnerOf` 取 RACI 的 R→A；任务号形态与前缀匹配 |
| `custom/client/ide/components/IdeUnmaterializedView.vue` | 中栏兜底视图：顶部提示行 + 任务简报卡（标题/ID/状态/负责人/RUN/看板/请求 id/按任务号命中标记）+ 只读文件区；`not_found`/`resolve_error` 不渲染文件树 |
| `custom/client/ide/components/IdeReadOnlyTree.vue` | 任务工作区文件树渲染（只读，`<details>` 折叠，目录优先） |
| `custom/client/ide/views/IdeShell.vue` | 中栏接入 `IdeUnmaterializedView`（有激活任务、无真实会话、非 ready）；`briefingMissHandled` 把抽屉一次性消费与兜底判定解耦；任务号命中后按卡 id 关联；详情与工作区并行解析；`briefingTaskError` 区分解析故障 |
| `custom/client/ide/composables/useIdeTask.ts` | 详情优先：拿到卡即返回，板号从 `workspace_path` 的 `/boards/<slug>/workspaces/` 推导（零扫描）；相对路径才后台有界扫板；详情 404 且 id 形如任务号时按标题前缀逐板解析（有界并发 8/单板 3s/总 12s）；超时 8s 与 5xx 记为 `transientError`，不冒充「不存在」 |
| `custom/client/ide/store/ide.ts` | 新增 `taskWorkspaceLoading`（在途不渲染结论）；`setActiveTask` 换任务即清旧 `taskWorkspace`（防上一张卡的已回收路径串到新卡）；解析失败记 status |
| `custom/client/ide/views/IdeFilesPane.vue` | 右栏在「有任务、工作区已解析但未物化、无错误」时出默认根只读树 + 提示行；任务不存在/解析故障保持可解释空态（与中栏同规则） |
| `custom/client/ide/api/taskWorkspace.ts` | 新增 `ideTaskFilesApi.list`（复用既有 `/api/hermes/kanban/workspace-files`，不改后端契约） |
| `custom/client/ide/i18n.ts` | `fallback` 双语字典（提示行/简报字段/文件区/动作） |

文件区取舍（按可达性排序）：

1. 任务目录有文件（`workspace-files` 非空）→ 任务工作区只读树（真正的「任务仓库根」）；
2. 任务目录已回收（`materialized=false`，确定不存在）→ **跳过**任务目录探测（该接口冷启会预热 CLI 缓存，实测约 9s），直接服务器默认根只读树；
3. 解析故障/任务不存在 → 不出树，只出原因与动作（重试/看板入口）。

### 7.3 验证

- `npx vitest run custom/client/ide`：**126 文件 / 814 测试全过**（原 795 + 新增 19：`ide-fallback.test.ts` 15 例、`files-pane-root.test.ts` 2 例、既有用例同步 2 例）。
  新增守门覆盖：四态判定（含任务解析故障不得按「未物化」兜底）、RUN/负责人提取、任务号 S1/S10 边界、任务目录树 vs 默认根树、404/5xx 不渲染树、`materialized=false` 跳过慢接口、右栏兜底树。
- 实地走查（SIM studio 8802，用户 fanfan=admin；已把本 worktree 构建的 client 部署到 `SIM_ROOT/product-dist/client`，原目录备份 `client.bak-run23prod`）：

| 输入 | 稳定态 | 页面文字（实测） | 截图 |
| --- | --- | --- | --- |
| `?task=t_af224933` | `unmaterialized`（约 1-4s；冷启详情约 5s） | 提示「未物化任务工作区：以下为只读文件视图」；标题「DEV-CHWX-S1 契约镜像+配置域+工程骨架（RUN=20261028-v8-run23）」；RUN 20261028-v8-run23；状态 done；负责人 hu-agent；看板 hu-channel-wechat；文件区「服务器默认根只读视图（非任务仓库）」「任务目录已被回收或未派发（无任务文件）· …/workspaces/t_af224933」+ 根目录文件树 | `/Users/cuishi/lab/ncwk-sim-mux/evidence/ide-fallback-20261030/t_af224933.png` |
| `?task=DEV-CHWX-S1` | `unmaterialized`（约 11s，任务号逐板解析） | 同上，且「请求 id DEV-CHWX-S1（按任务号命中）」；任务 ID 显示 t_af224933 | `…/task-number-DEV-CHWX-S1.png` |
| `?task=DEV-NOPE-9` | `not_found`（约 2s） | 「任务 DEV-NOPE-9 不存在或当前账号无权访问（深链 ?task= 未命中）；从左侧任务或看板重选一张卡」；无文件树；「去工作台选任务」「重试」可点 | `…/not-found-DEV-NOPE-9.png` |
| 收起简报抽屉（右栏） | — | 右栏出现「未物化任务工作区：以下为服务器默认根只读视图（非任务仓库）」+ 文件树；不再显示「还没有任务工作区」 | `…/t_af224933-right-pane.png` |

- 走查中的真实接口：`GET /api/hermes/kanban/t_af224933`（200，详情含 workspace_path）、`GET /api/ide/task-workspace?task=t_af224933`（200，materialized=false）、`GET /api/studio/files/list`（无 root，200）、`GET /api/hermes/kanban/workspace-files?task_id=…`（任务号路径下 200）。普通用户带 root 的 `files/list` 仍 403（未改权限边界）。

### 7.4 未做与边界（如实）

- **任务仓库根**（如 SIM 的 `workspaces/fanfan/aipaydev`、`central/aipaydev`）对 admin 不可读：files API 的 `root` 参数要求 super_admin（patch 123 既有边界）。本轮按「不改后端契约」只回落服务器默认根，并在界面明示「非任务仓库」；若要展示任务仓库根，需放开只读 root 权限或新增按任务解析的只读树接口（产品权限决策 + 后端契约批次）。
- 任务号解析依赖逐板 `listTasks`（服务端无任务搜索接口），最坏 12s 上限后判 `not_found`（带重试）；高负载环境会接近上限。根治需服务端搜索端点（后端批次）。
- `materialized=false` 时跳过 `workspace-files`（避免 9s CLI 预热）；若该目录实际仍有文件（端点与目录状态竞态），本轮不展示任务目录内容，只展示默认根。
- 右栏 Git 块仍为空（任务 worktree 不存在），不在本批范围。
- `simharness/mux/capture-plan.env` 的编码面拍摄位仍写死 `?task=DEV-PAYCORE-S`（陈旧任务 id，采集线修复项，未改）。
