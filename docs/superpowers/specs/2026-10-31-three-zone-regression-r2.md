# 驾驶舱三区全量回归二轮——走查装具就绪化＋推演交互探针（2026-10-31）

## 变更

本轮承接同日「驾驶舱三区全量回归批」，对 Playwright 走查装具做就绪化与误判根治，补推演区交互探针；服务端 PATCH 状态机 500 的修复与并行批次撞面，按「同题让渡后提交者」处置，本批只做语义核对与活体验证，不重复落补丁。

1. **走查装具就绪化（`scripts/regression/`，测试工具面）**
   - `harness.mjs`：新增 `waitForApp()`（Vue 已挂载 + 启动占位「AIStudio 加载中」消失 + 落地 hash 离开发态），`bootApp()` / `gotoHash()` 统一以应用状态替代固定 3.5s/3s 等待；导航默认超时放宽到 60s（高负载/冷转换下 Playwright 默认 30s 会超时）。2026-10-31 实测冷启 3.5-6s+，固定等待会把加载中误判为白屏/点空。
   - `walk-shell.mjs`：`switchAndWait()` 的空排除语义与主干 `null` 语义合并；落地稳定窗修正（原实现首个 400ms tick 见 hash 未变即返回，实际只等 0.4s，注释声称的 1.2s 稳定窗未实现）——改为 hash 连续 2.5s 不变且登录凭据已落、上限 20s；图标栏冷导航后等应用重挂载并给 `document.body` 空值守卫；栏控步骤先展开持久化折叠的左栏（`wb-unfold-left`），消除「右/中过、左单挂」的假缺陷。
   - `daily-workbench-walkthrough.mjs`：`fresh()` / `visit()` 改用 `waitForApp()`，`document.body?.innerText` 空值守卫；E2 采用并行批终案「DOM∩overview 交选取卡」（聚合板首卡可能是推演卡或数据层已删的滞留卡，盲点会切推演模式/不开抽屉）；H1 ⌘K 增加最多 3 次真实重试（面板未开时），焦点断言保持严格；与并行批同日对该脚本的审批面/loop 画布改造合并保留。
   - `walk-routes.mjs`：①`requiresSuperAdmin` 路由在非 super_admin 会话被守卫改道时记 WARN（权限边界，不冒充页面缺陷），专项轮用 `WALK_TOKEN` 复验；②已知设计内 fail-soft（`available-models?profile=orchestrator` 403、dev 自动登录口令 401 回落）记 WARN；③整页重载销毁执行上下文时，`evaluateWithRetry()` 等应用重挂载后重试一次；④body 未建立时按白屏返回，不再抛 TypeError 吞掉归因。
2. **新增推演交互探针（`scripts/regression/sim-center-walkthrough.mjs`）**：全流程推演七入口逐页（导演台/监督面板/运行监控/证据库/运行编排/推演设置/业务地图）＋运行选择器、编排编辑器、业务地图空值校验与需求影响分析（本地确定性算法）、设置面只读核对；不点「开始运行」「保存设置」。

## 决策记录

1. **就绪判据用应用状态而非固定等待**：固定 settle 在冷启、网关重启、整页重载时不可靠，且会把环境等待记成产品白屏；`waitForApp()` 以 `#app.__vue_app__` 与启动占位消失为判据，失败即真实未挂载。
2. **`switchAndWait` 空排除按「不排除」处理**：`wantOut=''` 是调用方表达「无反向条件」，不是「必须包含空串」。修复在装具层，不改产品切换器。
3. **左栏折叠是持久化 UI 状态，不是缺陷**：`flow.layout.leftFolded` 会跨会话保留；栏控只挂展开态左栏。走查先展开再测，测试后不回写折叠态（避免污染用户布局）。
4. **权限回退记 WARN 而不是缺陷**：`requiresSuperAdmin` 路由对 admin 被守卫送回 /app 是设计内权限边界；用 super_admin 令牌专项轮复验页面内容，两类结果分开记账。
5. **PATCH 状态机 500 让渡并行批次**：本会话复现 triage→review 返回 500（CLI 文案 `cannot request review ... task is not in running/ready`），并行批次已落补丁 713（`state_transition_rejected` 409）并带守门测试 `custom/__tests__/kanban-patch-409-guard.test.ts`。按同题撞面规则不重复落第二个 713（双补丁会在 series/controller 同块冲突），本批改为核对语义并活体验证。running 手工设置仍走 692 的显式拒绝（>=400，脚本只断言 fail-loud）。
6. **已知 fail-soft 不修**：`available-models?profile=orchestrator` 403 是 App 级 ProviderConfigurationPrompt 对非白名单 profile 的设计内 fail-soft（决策见 `2026-10-31-three-zone-regression-fixes`）；放宽权限＝削弱安全边界，走查白名单只作用于测试记账。
7. **推演写操作不纳入自动回归**：「开始运行」「保存设置」会改运行态/配置且不可逆；本轮只验证读取、导航、编辑器打开、空值校验与本地影响分析。真实运行启动另行人工/专项验证。
8. **网关 liveness 重启与 kanban WebSocket 握手偶发不在本批修**：前者根因在 hermes-agent 事件循环/SQLite 竞争（launchd 30s 存活探针连续失败退出 75；本轮另见外部 SIGTERM），后者为单次 P2 观察（重连后恢复）；均与本轮 UI 缺陷分离，挂账并写入报告未验证项。

## 验证

- 走查：`walk-shell.mjs` 23/0；`daily-workbench-walkthrough.mjs` 75/0（含 E5a 409 语义、E5b 审批面、I1 loop 画布）；`ide-workspace-verify.mjs` 11/11（super_admin）；`sim-center-walkthrough.mjs` 7/0；`walk-writes.mjs` 16/16；`walk-routes.mjs` 155/155 访问态到达、180 项 0 缺陷（本会话最终轮，`shots/routes-final/`；并行轮另有一次 WebSocket 握手 P2，最终轮未复现）。
- 全量测试：`npm test` 7043 通过 / 2 失败 / 11 跳过；2 失败均为 `custom/__tests__/architecture-ratchet.test.ts` 既有棘轮债（main 基线同败，计数 1196/877 超阈值 1193/874，非本批引入），按未修项记录。
- 并行补丁 713 核对：`custom/__tests__/kanban-patch-409-guard.test.ts` 通过；注入态 `PATCH /api/hermes/kanban/:id` triage→review 返回 409（活体验证）。
- 既有基线：`vendor/hermes-studio/tests/server/kanban-controller.test.ts` 19 通过 / 1 既有失败（`prevents profile-scoped users...` 期望 404、实际 200：overlay「admin 读详情放行」与上游测试口径不一致，main 基线同败，非本批引入）。
- 证据：本机 `runs/three-zone-20261031/`（截图/ledger/录屏）与 `aistudio-regression-evidence-20261031/`（精选录屏与分帧）。

## 设计文档影响

DESIGN_SYNC: none——本批为回归装具与推演交互探针，属测试工具面；服务端 409 映射由并行补丁 713 交付并已有守门测试。整合正本/数字总账无对应章节，本 spec 即本轮装具口径的事实记录。网关 liveness 与 WebSocket 偶发作为未验证项记录，不构成设计变更。
