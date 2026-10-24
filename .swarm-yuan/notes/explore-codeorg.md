# AIStudio 代码组织与调用链探查报告（swarm-yuan Step 3 · 代码组织路）

对象仓：`/Users/cuishi/lab/AIStudio/.claude/worktrees/feat-aistudio-dev-regen`（vendor/ 处于未 inject 基线态）。规模：vendor 41,751 文件 / custom 2,345 / simharness 332 / patches 461 / runtime 132 / scripts 113（`git ls-files` 统计）。所有断言带 file:line 锚点（行号基于当前基线）。

---

## 1. inject 注入链

### 1.1 总机制：双轨注入（B 类 patch + A 类 overlay）

- **B 类（patch 轨）**：对 vendor/hermes-studio、vendor/hermes-agent、vendor/zcode 三棵基线树做 `git apply`。入口 `scripts/inject.mjs`（`package.json` scripts: `inject = node scripts/inject.mjs`、`clean = ... --clean`）。
- **A 类（overlay 轨）**：custom/ 代码不改上游文件，靠 vite alias（客户端）与符号链接（服务端）挂入，见 §1.4。

### 1.2 patches/series 读取与应用（scripts/inject.mjs）

- 读 series：`readSeries()` 在 inject.mjs:133-140——逐行 trim、跳过空行与 `#` 注释（series 文件里大量中文注释块，如 patches/series 对 072 补丁的说明）。
- **三树路由**（关键机制）：补丁按其 diff 头首个目标路径路由——
  - `HERMES_AGENT_PATCH_PREFIXES`（inject.mjs:155-173）：`hermes_cli/ plugins/ agent/ apps/ assets/ acp_ gateway/ tests/gateway/ tests/hermes_cli/ optional-mcps/ optional-skills/ tools/ tests/tools/ tests/agent/ hermes_state model_tools.py toolsets.py tests/home_io_guard.py` 前缀 → vendor/hermes-agent；
  - `zcode-patches/` 目录（zcodeSeriesFile，inject.mjs:43）整目录路由 vendor/zcode；
  - 其余全部落 vendor/hermes-studio。
  - 路由判定函数 `resolvePatchTargetRoot`（inject.mjs:185-196）：先匹配 `^(?:---|\+\+\+) [ab]/(.+)$`，无头补丁回退 `diff --git a/... b/...` 行。
- **vendor 模式 git 适配** `treeGitCtx`（inject.mjs:92-102）：vendor/<tree> 无自身 .git，apply/status 经外仓以 `--directory=<rel>` 执行，status 行剥前缀后与补丁路径同构。
- 应用循环 `applyPatches`（inject.mjs:198-236）：hermes-agent/zcode 目标失败**容错跳过**（inject.mjs:222-226），hermes-studio 失败 exit(1) 硬死。`applyPatchAtRoot`（inject.mjs:105-108）用 `git apply --whitespace=nowarn`（win32 额外 `--ignore-whitespace`，inject.mjs:131）。
- clean（反向）：`reversePatches`（inject.mjs:238-264）逆序 apply -R；随后 `restoreNonPatchArtifacts`（inject.mjs:617-640）把非 patch 目标的脏文件（如 docs/openapi.json）checkout 回 HEAD；再删 patch 新增的 untracked 文件（inject.mjs:766-774）。clean 前有 8647 端口活服务探测闸（inject.mjs:62-80，防运行树与进程分裂）。
- 脏树前置校验（inject.mjs:649-708）：排除自身 symlink 残留/openapi 产物/patch 新增 untracked/`.loop/` 运行态后仍有脏行即拒绝；识别 npm install lock churn 并给出 stash 对策（inject.mjs:700-706）。
- 收尾写台账 `.overlay-injected.json`（inject.mjs:744-751：appliedPatches + appliedZcodePatches + generatedAt）。

### 1.3 custom/ 如何挂入（符号链接，非复制）

- **服务端**：`ensureServerCustomSymlink`（inject.mjs:551-589）把 `custom/server` 符号链接到 `vendor/hermes-studio/packages/server/src/custom`。理由写在 inject.mjs:46-48 与 552-554：server 代码用相对路径 `import '../custom/...'`（tsc/esbuild 无法经 alias 重定向）。链接校验带 realpath 比对防并行 worktree 链到旧树（inject.mjs:556-563）。clean 时 unlink 还原。
- **客户端**：不走链接，走 vite alias——`generateOverlayViteConfig`（inject.mjs:340-491）生成 `vite.config.overlay.ts`（gitignore），alias 数组顺序敏感：`/src/main.ts → registries/client/entry.mts`（入口重定向，inject.mjs:413）、`@/custom 与 @custom → custom/client`（:414-415）、`@registries → registries`（:416）、`@ → 上游 packages/client/src` 兜底（:418）；另把 pinia/vue/@vue/runtime-core/vue-router 裸包钉到上游树单实例防双实例白屏（:399-408）。`outDir` 钉上游 dist/client、`inlineDynamicImports: true`（:436）、dev proxy 带 xfwd 与 agent-health 鉴权注入（:453-484）。
- **node_modules**：`ensureNodeModulesSymlink`（inject.mjs:509-549）建 `overlay/node_modules → vendor/hermes-studio/node_modules` junction；worktree 检出回落主检出共享实例（`mainCheckoutVendorNodeModules`，inject.mjs:496-506）。
- inject 出口顺带执行 `node scripts/deploy-agent-runtime.mjs --apply`（inject.mjs:742，B1 双树漂移根治）。

### 1.4 --config-only 模式

inject.mjs:784-789：仅 `generateOverlayViteConfig() + ensureNodeModulesSymlink()` 后 exit(0)，**不触碰 upstream 注入态**——供多会话并行期的 worktree 构建门禁（build:full 需要 vite.config.overlay.ts 而全量 inject 会重写共享 upstream）。

### 1.5 ensure-injected 差量补套（scripts/ensure-injected.mjs，predev/prebuild 钩子）

- 判定已注入：manifest 存在 OR cockpit 路由标志 `name: 'hermes.cockpit'` 在上游 router/index.ts（`cockpitRouteInjected`，ensure-injected.mjs:98-105）。
- 未注入且上游干净 → 自动跑 inject（ensure-injected.mjs:213-215）；部分失败但 cockpit 路由在位则放行（:219-222）。
- **差量补套**：`delta = readSeries() - manifest.appliedPatches`（ensure-injected.mjs:231），非空时逐条 `applyDelta`（:74-95，目标路由复用 inject.mjs 导出的 `isHermesAgentPatchPath` 单一事实源）并回写 manifest（:237-240）。
- zcode 树漂移自愈：树干净但 series 非空 → 全量重放（`healZcodePatches`，:149-191）；树脏但声明新增文件缺失 → 按文件 `git apply --include` 补放（`healMissingZcodeFiles`，:113-139）。
- 无条件 `ensureNodeModulesSymlink()`（:200）治愈"先 inject 后 install"时序。

### 1.6 registries/ 注册表如何被消费

- `registries/client/index.ts:14-42`：进程内 registry（routes/navEntries/components 三桶）+ `registerRoute/registerNavEntry/registerComponent` 收集器。
- `registries/client/bootstrap.ts:10-91`：mount 前调度——按 `features.*` 并行动态 import 各 custom 域的 `registerXxx(app)`（matrixChat/kanban/branding/cockpit/ide/ia2/eval/skillgov/ontology/bpa，:19-74），随后把 `getRegisteredRoutes()` 逐条 `router.addRoute`（:82-84），matrix-chat 子路由另挂（:87-90）。`app.use(router)` 因此被推迟到全部 addRoute 之后（entry.mts:151-166，防 catch-all 重定向环）。
- `registries/client/entry.mts`：入口 shim，复制上游 main.ts 启动序列 + A 类注册（见 §3）。
- `registries/server/index.ts:1-31` 与 `bootstrap.ts:1-6`：服务端注册中枢**当前为空壳预留**——所有 server 改动实际走 B 类 patch 或 custom/server 独立模块（注释 registries/server/index.ts:2-5 明说）。
- `registries/client/deeplink.ts`：hash 路由深链迁移判定（entry.mts:75-80 消费）。

---

## 2. 服务端域解剖

### 2.1 分层模式（custom/server/AGENTS.md:1-40 是成文约定）

每域一目录；`*-controller.ts` 挂 REST（Koa Router + prefix）；纯函数（analytics/collectors/detectors）与存储（*-store / JSONL ledger）分离；`__tests__/` 域内同级。约定原文：「`*-controller.ts` 挂 REST，纯函数与存储分离」「读模型 fail-soft；执法链 fail-closed」「新路由优先加进已挂载 controller；新建独立路由必须在 patches/ 加挂载补丁并登记 series」。

三代表域证据：

| 域 | controller（Router+prefix） | store/纯函数 | 测试 |
|---|---|---|---|
| progress | task-progress-controller.ts:16 `new Router({prefix:'/api/progress'})`，:30 `GET /tasks`；federation-controller.ts（/machines 跨机联邦） | task-progress-store.ts:1-17（订阅 zcode 投影事件的有界会话映射，冷启动如实声明空）；task-progress-analytics.ts（聚合纯函数） | __tests__/task-progress.test.ts、federation.test.ts |
| clusterinspector | cluster-inspector-controller.ts:1-120（snapshot/run REST + CLI 桥 provider 注入） | collectors.ts / detectors.ts / detectors-zero-delivery.ts / process-scan.ts / card-classify.ts / route-hint.ts（采集→检测→定级分离）；inspector.ts:706-730（巡检环 `setInterval(...).unref()`，默认 60s，`CLUSTER_INSPECTOR=off` 关） | __tests__/ 18 个测试文件（含 real 模式的 cluster-inspector.real.test.ts） |
| harness | harness-controller.ts:50 `prefix:'/api/harness'`，只读聚合 12+ 端点（:79-98…）；子路由挂载 `router.use('/workbench', ...)`（:57）、`/sim-launch`（:59）、`/trust`（:61）——**子路由不新增 bootstrap 补丁** | capability-catalog/cost-accounts/maturity/primitives/nine-layers/eval-layers/rsi-maturity 全部 collector+report 两态；workbench/ 子域自带 controller/store/service/apply/probe-runner 完整分层 | __tests__/ + workbench/__tests__/ 双层 |

### 2.2 Koa 路由挂载链（B 类 patch 是唯一上游锚点）

1. 上游 server 入口：`vendor/.../server/src/index.ts:1` `export * from './bootstrap/http'`。
2. `bootstrap/http.ts:17` import `registerRoutes`，:504 `registerRoutes(app, [requireUserJwt, resolveUserProfile])`——**authMiddleware 之后挂的全是受保护路由**。
3. `bootstrap/routes.ts:81` `registerRoutes(app, authMiddleware)`：public 路由（:85-95）→ authMiddleware（:98）→ protected 路由序列（:101 起）。
4. custom 域挂载 = 一枚两行补丁：import 行 + `app.use(xxxRoutes.routes())` 行，追加在 protected 序列尾部。例：
   - progress：patches/591-server-progress-task-routes.patch:10（import）+:18（`app.use(progressRoutes.routes())  // /api/progress/tasks`）
   - clusterinspector：patches/582-server-cluster-inspector-routes.patch:11（import `clusterInspectorRoutes, startInspectorIfEnabled`）+:19-20（启动巡检环 + app.use）
   - harness：patch 543（harness-controller.ts:19 头注「挂载：patch 543 在 bootstrap/routes.ts…series 台账惯例」）
   - 此类"挂载补丁"共 80+ 枚（`grep -l "bootstrap/routes.ts" patches/*.patch`），loop 域最早最重（patch 134 一次性挂 loop engine 全家）。

### 2.3 custom/server 被上游 server 进程加载的机制锚点

- 加载路径：`packages/server/src/bootstrap/routes.ts` 内 `import xxx from '../custom/<domain>/<controller>'`（patch 写入）→ 相对路径解析到 `packages/server/src/custom` → 该位置是 inject.mjs:570 建的符号链接（指向 overlay custom/server）→ 实际代码在仓内 custom/server/。
- 首例 patch 114（`patches/114-server-trace-api.patch:9` `import traceRoutes from '../custom/controllers/hermes/trace'`），loop patch 134:8-22 一次挂 15 个 loop 模块，socket 面 patch 135:19 `setupLoopSocketNamespace(activeGroupChatServer.getIO())`（复用上游 socket.io 实例挂 /loop 命名空间，custom/server/loop/services/loop-socket.ts:24）。
- 运行：`npm run serve`（scripts/serve-server.mjs）设 `TS_NODE_PROJECT=packages/server/tsconfig.json + TS_NODE_FILES=1` 包装上游 server 启动；patch 314 把 `src/custom/**/__tests__` 排除出 server tsconfig。

---

## 3. 客户端域解剖

### 3.1 views → store → api 调用链模式（以 cockpit/ia2/ide 为证）

- **api 层范式**：`custom/client/<域>/api/*.ts` 统一 `import { request } from '@/api/client'`（上游封装，见 §7.2），DTO 与服务端回包逐字段对齐（custom/client/governance/api/harness.ts:1-5、custom/client/ia2/api/trust.ts:1-3）。历史组件可用 `authFetch`（裸 fetch + Bearer，custom/client/ide/utils/auth-fetch.ts:7-13）。
- **Pinia store 范式**：`defineStore` + `ref/computed/watch` 组合式（非 options）；cockpit store 是最大聚合面（custom/client/cockpit/store/cockpit.ts:1-37：跨 import 上游 `@/stores/hermes/*`、custom matrix-chat/ia2/kanban 各域 store 与 adapters）；ia2/workspace.ts:26-38 展示「extract-shared 拆分」纪律——路由退役时把仍被消费的能力拆到新 store、持久层（cockpit-kv）与 adapter 原样复用零复制。
- **adapters 层**（cockpit 特有）：custom/client/cockpit/adapters/ 16 个 adapter（task/attention/fleet/history/notify/topology…）把上游 API 数据整形为 cockpit 视图模型，store 消费 adapter（cockpit.ts:20-37）。
- **composables 层**：轮询类用「模块级单例 + 引用计数 + effect scope 自动释放」范式（custom/client/ia2/composables/useTaskProgress.ts:29-76）。

### 3.2 路由注册机制（客户端路由表在哪、如何并入上游）

- 路由表在各域 `routes.ts`，**纯路由描述、零上游 router/index.ts 锚点**（custom/client/ide/routes.ts:1-4 纪律原文；ia2/routes.ts:17-18 同）。
- 注册流：域 index.ts `registerXxx()` 里 `for (const route of buildXxxRoutes()) registerRoute(route)`（custom/client/ide/index.ts:15、custom/client/ia2/index.ts:28）→ bootstrap.ts:82-84 统一 `router.addRoute`（mount 前）。
- ia2 是主路由树：`IA_AREAS` 六阶段（ia2/routes.ts:38-45）、`IA_LEGACY_REDIRECTS` 旧链迁移表（:57-68）、`ANNEXED_LEGACY` 并入页记录表（:90 起，同名替换上游 /hermes-* 路由）、`buildIaRoutes()`（:181）。`ia2NotFoundGuard` 诚实 404 守卫（ia2/index.ts:27）。
- 上游 router 的 cockpit 锚点（patch 071 注入 `name: 'hermes.cockpit'`）是 ensure-injected 的注入信号（§1.5）。
- 入口 shim `registries/client/entry.mts`：复制上游 main.ts FOUC/token 序列（:52-65）+ 深链迁移（:75-80）+ dev 自动登录桩（:90-108，仅 `HERMES_WEB_UI_DEV_BOOTSTRAP=1`）+ `app.use(router)` 推迟至注册完成（:151-166）+ mount 前未匹配路由重导航（:168-175）。

### 3.3 naive-ui 使用方式

- 全局壳在上游：vendor `packages/client/src/App.vue:17,33` 装 NConfigProvider + naiveLocale。custom 组件按需 import 单组件（custom/client/ia2/views/WorkbenchView.vue:64 `NDrawer, NDrawerContent`；custom/client/ia2/components/IaShellHeader.vue:39 `NModal`）或 `createDiscreteApi` 命令式弹层（custom/client/cockpit/components/ApprovalPanel.vue:10）。custom 侧大量 UI 自绘（cockpit.scss / ui.scss 基元，ia2/index.ts:17-24 双落点静态导入）。

### 3.4 三域一句话画像

- **cockpit**（88 文件）：store+components+adapters+api+composables 全层，但路由家族已退役（index.ts:23-25 删 nav 注册，能力作为「协作能力模块」被 ia2 消费）。
- **ia2**（307 文件，最大域）：/app 六阶段工作台主 IA；views 75 + components 46 + api 19 + composables 18 + store 6；含 i18n-term-overrides（§7.4）。
- **ide**（287 文件）：/app/ide 任务工作台；utils 53（auth-fetch/authedMedia 等）+ views 31 + api 15。

---

## 4. simharness/ 架构

### 4.1 总体

`simharness/README.md:3`：「15 个 AI 员工组成一家虚拟软件公司…26 步主链、六道强制关卡（G1 需求冻结到 G6 复盘）不过不放行，全部结论带代码提交号+任务卡号双凭证」。目录：mux/ 136（mx-* 工具链）、skills/ 122、tests/ 28、scenarios/ 5、materials/（需求单 RFD）、var-templates/。只消费产品不改产品（README.md:5，隔离边界由 tests/isolation-boundary.test.sh 三断言看守）。

### 4.2 mx-lib.sh（1618 行）公共库职责

- **SIM_ROOT 定锚**（mx-lib.sh:63-74）：`AIPAY_SIM_ROOT` env 优先，默认 `/Users/cuishi/lab/ncwk-sim-mux`（NVMe 卷），不可写回落 `$HOME/ncwk-sim-mux`。派生：`HERMES_ROOT=$SIM_ROOT/hermes`（gateway 的 HERMES_HOME）、`AGENT_SRC=$SIM_ROOT/hermes-agent-src`（agent 源码快照）、`PRODUCT_DIST=$SIM_ROOT/product-dist`（studio 构建快照）——推演执行面与宿主 `~/.hermes` 完全隔离。
- 执行面三参 + 回落告警（:77-99：STUDIO_DIST/HERMES_BIN/HERMES_PYTHONPATH）；`hermes()` 函数转发兜 PATH 盲（:105）。
- 端口/目录：GW_PORT 8801、STUDIO_PORT 8802（:116-117），与真机 orchestrator :8650 共存靠 `HERMES_GATEWAY_LOCK_DIR`（mx-up.sh:8，LOCK_DIR :118）；creds/pids/logs 目录（:119-121）。
- 编制：`USERS=(admin bella fanfan wei mei chen hu lin xiao qi fei arch secops ops audit)` 12 人类 + 12 -agent（:136）；三机切片 `mx-node.sh`（:141）。
- 关键函数族：synapse 账号（synapse_register :255、mx_login :285）、Matrix API 薄封装（mx :347、mx_send :383、mx_wait_sender :406、mx_create_room :422）、studio REST（studio :470、studio_login :480、studio_matrix_login :628）、看板 CLI 桥（mx_kanban :636）、治理注册表（gov_registry_put :490）、拉起/自检（ensure_spawn_health :551、ensure_studio_up :557）、快照来源档案（mx_provenance :648）。

### 4.3 场景体系（mx-scenario-lib.sh，2441 行）

- **state 键值存储**：`STATE` 文件 + `sget/sset/sset_once`（:43,72,75；sset_once 闸键首过保护 :73-75）、`issue_once` 幂等问题单（:79）。
- **步骤机**：`STEPS="smoke appinit people ba reqgate room dispatch register analysis triage anexec review archgate close plan devimpl defect testpass ready release uat workmgr audit retro ide report"`（:92，26 步），`step_pos/step_reached`（:95,109）支持 `START_STEP/UNTIL_STEP` 断点续跑。
- **六闸 G1-G6**（证据链）：
  - 闸键：`g1_frozen` / `g2_arch_pass` / `g3_code_pass` / `g4_pass` / `g5_ready` / G6=retro（`retro_done`）——aipay-scenario.sh:405, 1072-1090, 1456, 1939, 2740。
  - 硬闸执行 `gate_blocked <gate-key> <step>`（mx-scenario-lib.sh:1946 定义；调用点 aipay-scenario.sh:441 `gate_blocked g1_frozen dispatch`、:1113 `g2_arch_pass close`、:1828 `g3_code_pass testpass`、:1903 `g4_pass ready`、:2212 `g5_ready release`、:2230 `release_done uat`）——闸键未落 state 即拒入后续步骤。
  - 判词体系：`mx_text_gate_verdict`（:1495，「结论行 PASS|FAIL」结构锚定，含全角冒号归一 :1510、round 注记剥离 :1513）、`mx_room_gate_verdict`（:1556）、`kanban_card_gate_verdict`（:1576）、双源 `mx_gate_verdict_dual_seen`（:1599）——房间消息行或看卡面任一出现判词即过（时间窗防旧轮污染 :1479-1488）。
  - 首过率/打回率统计六闸全计口径（:2208, :2251-2252）。
- 其他：审批收件箱镜像（mxq_enqueue/consume :413-425）、auto_approve 三模式（:560）、wait_truth 谓词等待环（:763）、capture_step 帧采集（:841）、verify_done_evidence DONE 凭证核验（:1304）、评审状态机 REVIEW_STATE（:391-397）。

### 4.4 driver（主驱动 aipay-scenario.sh）

单文件 26 步完整版（头注 :1-27），`set -euEo pipefail` + ERR trap 静默 rc=1 断根诊断（:39-44）；source mx-lib + mx-scenario-lib + mx-eval-lib（V8.45 评测接线，G4 子门 `g4_eval_pass`，mx-eval-lib.sh:5-13）+ mx-delivery-lib（M3 协议事件层，缺省开）。导演只扮演人类打字/点击与地面真值核验（:25）。断点续跑/区间执行/`LC_ALL=C` 开跑纪律（:20-24）。`run-driver-supervisor.sh`（259 行）为驱动看护。

### 4.5 与 hermes 网关/SIM_ROOT 的关系

- mx-up.sh 拉起「单 gateway(:8801，多路复用) + 单 studio(:8802，多 matrix 账号)」（mx-up.sh:6-8）；运行面自愈：每次 mx-up 执行 `deploy-agent-runtime --apply` + `mx_apply_agent_patches` 重放 390/391/533/534（mx-up.sh:29-32 注释，防 gateway 自更新擦掉 manifest 与 git-applied 补丁）。
- 环境/清理：mx-setup.sh（账号/看板/团队/记忆库/中央仓供给）、mx-prelaunch-check.sh（22 项核验）、mx-clean.sh。
- 采集与报告：mx-harness-snapshot.sh（产品九层运行面证据，README.md:35-46）、capture-plan.env（26 步拍摄位）、mx-report-gen.py（5312 行，HTML 报告：六阶段分组+闸门仪表盘+证据灯箱，r18_matrix 必采清单单一事实源，report_truth 防往轮产物/死锚）、mx-report-audit.py（审计器）、mx-interventions.py（干预）、mx-eval-summary.py、mx-hermes-shim.py、mx-log-sanitize.py。

### 4.6 守门测试

simharness/tests/：vitest 143 测（run-gates.sh 入口）+ isolation-boundary.test.sh 三断言（README.md:32,62-63）。

---

## 5. runtime/ 部署层

- **内容清单**（132 文件，按 git ls-files 分组）：`hermes_cli/` 15（kanban 全家：kanban.py/kanban_db*.py/kanban_gates.py/cron.py…）、`gateway/` 10（platforms/base.py、run_inbound.py、session_rotation.py、hosted_rooms.py、noise_filter.py…）、`agent/` 5（tool_executor.py、runaway_guard.py、handoff_checkpoint.py、rule_heartbeat.py）、`tools/` 7、`plugins/` 8（platforms/matrix、kanban/dashboard、studio-file-approval、style-charter）、`governance/` 7（action-contracts.yaml、decision-rules.yaml、metrics.yaml、state-model.yaml、capability-ledger.yaml + dataset/agent-handbook.jsonl）、`pua/` 46（技能包）、`roster/` 17、`toolsets.py` 1、`tests/` 6。
- **部署方式**：`runtime-manifest.json`（root=`overlay/runtime`，target=`~/.hermes/hermes-agent`，45 文件清单）驱动 `scripts/deploy-agent-runtime.mjs`——默认 dry-run，`--apply` 才拷贝（:1-7）；目标已存在且内容不同先备份 `.bak.<ts>` 只留 3 份（:59-90）；源根解析兼容 worktree/双仓名 aistudio|hermes-overlay（:27-38）。调用点：inject 出口（inject.mjs:742）与 mx-up 自愈（§4.5）。runtime:doctor/runtime:vendor-pua/runtime:register 见 package.json scripts。

---

## 6. config/ 特性开关

- 三文件：`config/bootstrap.ts`（路径台账：patchSeriesFile/client.overlayEntry=registries/client/entry.mts/customDirs…）、`config/features.ts`（FeatureConfig 19 项 + `import.meta.env.VITE_CUSTOM_*` 读取，features.ts:61-82）、`config/loop-config.ts`（loop 状态适配器环境探测快照：local/matrix/saas 自动检测，loop-config.ts:7-19）。
- **消费点**（features 全部在客户端）：
  - 注册调度：registries/client/bootstrap.ts:19-74（matrixChat/cockpit/ide/eval/skillgov/ontology/bpa/kanban/branding 八路门控动态 import）；ide 关闭时补 /ide→/app 重定向兜底（:40-46）。
  - 域入口自检：custom/client/ide/index.ts:11、cockpit/index.ts:16、matrix-chat/index.ts:6,24。
  - 导航/壳层：custom/client/ia2/views/IaFeatureShell.vue:24-27（bpa/ontology/eval/skillgov 四开关渲染「未启用」页——eval 路由无条件注册、由壳层说明页兜深链）、ia2/routes.ts 与 nav-centers.ts、IaSideNav.vue。
- 服务端不消费 features.ts（服务端开关走 env，如 `CLUSTER_INSPECTOR=off`、`PIPELINE=off`、`SIM_HARNESS_LAUNCH=1`）。

---

## 7. 跨切机制

### 7.1 JWT

- 签发：vendor `packages/server/src/modules/studio/middleware/auth.ts`——HMAC 手写 JWT：`sign`（:102）、`signUserJwt`（:164-183）、`signAppJwt`（:186-210）；matrix 会话换 JWT 经 patch 012（auth controller import custom/matrix/session-store，patches/012-server-controllers-auth.patch:44）。
- 校验：`requireUserJwt`（auth.ts:330）+ `resolveUserProfile`，注入位于 bootstrap/http.ts:56 import、:504 `registerRoutes(app, [requireUserJwt, resolveUserProfile])`——**custom 全部 REST 因此默认受 JWT 保护**；写面加码由各 controller 自查（harness-controller.ts:69-77 `writeDenied`：有认证主体须 super_admin）。
- 客户端存取：token 存 localStorage `hermes_api_key`（vendor api/client.ts:31-33 getApiKey/setApiKey）；payload 客户端自解码取 role/username（client.ts:63-100）。

### 7.2 客户端 api 封装（request 层）

- 唯一主干：vendor `packages/client/src/api/client.ts:212-273` `request<T>()`——自动拼 base、注入 `Authorization: Bearer`（:230-232）与 `X-Hermes-Profile` 活动档（:235-238）、全局 401 清会话跳登录（:241-250）、错误对象带 status/code（:264-268）。
- custom 全域 api 模块薄封装此函数（cockpit/api/approvals.ts:3、governance/api/harness.ts:6、ia2/api/trust.ts:3）；非 JSON 端点用 `authFetch`（custom/client/ide/utils/auth-fetch.ts:7-13，同源取 token 保留原生 fetch）。

### 7.3 SSE / 实时

- custom/server **无 SSE**（grep text/event-stream 零命中）；上游 SSE 仅 4 处（vendor studio/controllers/model-api.ts、media.ts、coding-agents claude-code/codex proxy）。
- 实时主通道是 socket.io：custom 侧复用上游实例挂命名空间——loop `/loop`（custom/server/loop/services/loop-socket.ts:24-45，subscribe→join room+回放 50 条历史，emitLoopEvent 写侧扇出；挂载 patch 135:19）、zcode 投影 socket（patch 398）、kanban 聚合 WS（客户端 custom/client/ia2/store/workspace.ts:18-20 connectOverviewStream，board 事件 500ms 去抖刷新）。大量治理读模型走**轮询**（useTaskProgress 20s，:55）。

### 7.4 i18n 装配

- 词条主库走上游 locale 文件 + B 类补丁注入（patch 044-053 八语言、076/077、082/083、090/091、104/105、473 等）。
- 运行时增量：`applyIa2TermOverrides`（custom/client/ia2/i18n-term-overrides.ts:1-9）在 entry.mts i18nReady 钩子里 `mergeLocaleMessage` 深合并 Tier-2 术语覆盖（禁 inject 期改补丁防漂移，entry.mts:146-147；须等首次 switchLocale 完成防重建抹掉，entry.mts:33-50,142）；STAGE_META 派生六阶段导航词条（i18n-term-overrides.ts:14-19）。
- 默认语言强制 zh + dark（entry.mts:22-50，账户键/共享键双枚举防覆写）。

### 7.5 审计日志通道

- **工具执行审计唯一出口**：custom/server/toolpipeline/tool-hooks.ts（custom/server/AGENTS.md:21 明文）——`ToolExecAuditEntry`（:36）落 `~/.hermes-web-ui/tool-exec-audit/tool-exec-<day>.jsonl`（:78-87，mkdir mode 0700）；工具瀑布：auditHook（观测）→ toolresultguard（围栏）→ enforce-gate（执法门）（:6 头注）。
- **治理事件总线**：custom/server/govbus/event-log.ts——append-only JSONL 环形（CAP 2000）+ 六域三severity + 进程内订阅扇出（:1-19,47-49）；REST 只读面 govbus-controller.ts（prefix `/api/hermes/governance-events`，:6，不开公开写入口防伪造）。
- 其他通道：审批史 approvals/approval-log.ts（桥接 govbus decision 事件）、派发台账 governance/dispatch-ledger.ts:16（`~/.hermes-web-ui/overlay/dispatch-ledger.jsonl` append-only + commandId 去重）、任务证据 hash 链 evidence/evidence-store.ts、执法决策账 toolpipeline/policy-decisions.ts。

---

## 8. 端到端调用链完整实例：看板卡研发进度徽章（/api/progress/tasks）

1. **视图挂载**：阶段壳 `custom/client/ia2/views/stage/StageShell.vue:143` 懒加载看板 `lazyTab(() => import('@/custom/kanban/views/SwarmKanbanView.vue'))`（另一入口 TasksView.vue:44,184）。路由来源：ia2/routes.ts:181 `buildIaRoutes()` → ia2/index.ts:28 `registerRoute` → registries/client/bootstrap.ts:82-84 `router.addRoute` → entry.mts:151-166 注册完成后 `app.use(router)` → mount。
2. **卡片组件**：`custom/client/kanban/components/KanbanTaskCard.vue:3` import `useTaskProgress`；:42-43 `const { progressMap } = useTaskProgress(); taskProg = computed(() => taskProgressOf(progressMap.value, props.task.id))`；:3 的 `phaseProgressText` 渲染 "x/y 站完成"。
3. **composable 轮询**：`custom/client/ia2/composables/useTaskProgress.ts:37` `authFetch('/api/progress/tasks?limit=200')`；:55 `setInterval(refresh, 20_000)`；:52-76 引用计数单例（consumers/scope dispose）。
4. **鉴权注入**：`custom/client/ide/utils/auth-fetch.ts:7-13` 从 localStorage `hermes_api_key` 取 JWT，`Authorization: Bearer <jwt>`。
5. **HTTP → Koa**：vite dev 经 proxy `/api`（inject 生成的 vite.config.overlay.ts 模板，inject.mjs:458）到 server :8647；服务端 `bootstrap/http.ts:504` `registerRoutes(app, [requireUserJwt, resolveUserProfile])` → `requireUserJwt`（vendor modules/studio/middleware/auth.ts:330）验签放行。
6. **路由命中**：`custom/server/progress/task-progress-controller.ts:16` `new Router({ prefix: '/api/progress' })`；:30 `router.get('/tasks', ...)`。该路由能被加载是因为 patch 591 在 `vendor/.../bootstrap/routes.ts` 写入 import + `app.use(progressRoutes.routes())`（patches/591-...patch:10,18），`../custom` 经 inject.mjs:570 建的 symlink `packages/server/src/custom → overlay/custom/server` 解析。
7. **controller → store/服务**：task-progress-controller.ts:36 `readDispatchLedger(2000)`（派发事实真值，governance/dispatch-ledger.ts:16 JSONL 存储）；:37 `getSessionStore(getZcodeProjectionRuntime())`（会话进度面，progress/task-progress-store.ts:1-17 订阅 zcode 投影事件流的有界映射）；:40-45 按台账 workspace 读里程碑（task-progress-store.ts `readWorkspaceMilestones`）；:49-53 联邦注册表 registrySnapshot（progress/federation.ts）跨机同 taskId 合并；:54 `taskProgressOverview(...)` 纯函数聚合（task-progress-analytics.ts）；:57-62 `readWorkspaceGitActivity`（git 在途面 G1，task-progress-store.ts:67）。
8. **返回**：task-progress-controller.ts:63 `ctx.body = { ok, ts, ...overview, gitActivity, machinesSummary }`；异常 fail-soft 降级 `reason:'progress_read_failed'` 不 5xx（:64-66）。
9. **客户端消费**：useTaskProgress.ts:40-46 校验 `data.ok` 后写 `byTask` ref → KanbanTaskCard computed 响应式更新徽章。

---

## 9. 模块间依赖边（grep 跨域 import 统计，排除 __tests__）

### custom/server Top 10（源域→被依赖域，次数）

| 边 | 次数 | 说明 |
|---|---|---|
| loop→loop/types | 38 | loop 域内 types.ts 被全域引（域内共享类型桶） |
| loop→loop/store | 19 | engine/controllers → store |
| harness→governance | 15 | 治理读模型大量消费 governance 台账/analytics |
| loop→loop/engine | 9 | controllers → engine |
| loop→loop/paths, loop/graph, loop/connectors | 6/5/5 | loop 内部分层互引 |
| review→reviewgov | 4 | review 域复用 reviewgov |
| progress→zcode | 4 | 会话投影面（§8 实例） |
| kanban→governance / kanban→zcode | 4/3 | 看板服务消费台账与引擎 |
| harness→toolpipeline | 4 | 工具审计查询面 |
| progress→governance | 3 | 派发台账 |

（其余显式边：governance→decisiongraph 3、clusterinspector→mcpcatalog 3、zcode→permmodes 2、trust→auditchain 2、toolpipeline→{toolpolicy,toolcontract,permmodes} 各 2。）governance 是服务端被依赖最重的底座域（被引 30 次居首）。

### custom/client Top 10（@/custom/ 跨域 import）

| 边 | 次数 | 说明 |
|---|---|---|
| ia2→governance | 42 | 工作台消费治理面 API |
| ia2→cockpit | 38 | cockpit 退役后作为能力库被 ia2 吸收（§3.4） |
| ia2→loop | 23 | loop 组件/店铺库复用（路由已退役） |
| ia2→matrix-chat | 15 | 聊天场景 |
| matrix-chat→ui | 12 | 共享 UI 基元 |
| ide→ia2 | 11 | IDE 消费工作台 store/工具 |
| matrix-teams→matrix-chat | 9 | teams 基于 matrix-chat |
| ide→matrix-chat / ia2→kanban / ide→cockpit | 9/9/8 | |
| kanban→ia2 / ia2→ui | 7/7 | kanban 卡消费 ia2 composable（§8 链第 2 步反例：kanban→ia2） |

ia2 是客户端中枢域（出边 140+，入边亦最多）；ui/ 是共享基元底座；依赖呈「ia2 ⇄ cockpit/kanban/matrix-chat 双向但克制」形态，未出现环上失控扩张。

---

## 附：关键单点事实速查

- B/A 类分界定义：inject.mjs:1-9 头注；series 台账 = patches/series + zcode-patches/series。
- 挂载补丁家族清单：`grep -l "bootstrap/routes.ts" patches/*.patch`（80+ 枚，从 036 到 685-workflow）。
- custom/server 域数：55+ 域目录（git ls-files 三级目录统计）；最大域 loop 120 文件、eval 58、harness 43。
- 服务端成文约定：custom/server/AGENTS.md（分层/fail-soft vs fail-closed/审计唯一出口/测试纪律）。
- qgate（custom/qgate/，256 文件）是独立子工程：通用交付门禁框架（core/executors/ontology/cli/plugin/gate-packs，README.md:1-31），独立 vitest 与 npm test。
- 部署闭环：inject（inject.mjs:742）→ deploy-agent-runtime --apply → ~/.hermes/hermes-agent；推演侧 mx-up 再自愈（§4.5）。