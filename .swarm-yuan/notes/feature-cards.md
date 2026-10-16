# 项目特征卡：hermes-overlay（SwarmStudio 二开仓）— 2026-10-16 全量重生成轮

> 数据来源：三路并行子代理探查（结构/规范/代码组织）+ mine-habits 3353 提交统计 + detect-frameworks.sh + framework-evidence.sh 台账（notes/framework-evidence.tsv 65 行）。上游参照树只读：/Users/cuishi/lab/ncwk/upstream/hermes-studio。
> 形态判定（§D.0）：**[前端UI, 后端API, 桌面IPC(patch 侧)]**；无异步 MQ 维度、无库导出维度。定时信号轻量（clusterinspector 巡检环 timer + loop cron bridge），不立独立维度。
> 框架激活（§D.0.5）：**ACTIVE_FRAMEWORKS = vue, naiveui, vite, koa, jest-vitest**（detect-frameworks 报 12 个，AI 剔除 7 个：react/express/webpack/tailwind/fastapi/pytest 在 custom/ 零引用 grep 实证，命中来自 runtime/ 镜像与 qgate fixtures 的 package.json；opentelemetry 仅 run-trace 插件的数据格式非框架使用——与 9-16 轮裁决一致）。
> 视觉成熟度（§D.0 尾注）：9-16 轮实测 31 个 CSS 自定义属性 + 6 个 scss（BEM）+ 无 DESIGN.md → 场景①（有实现无 DESIGN.md，引用 frontend-design-methodology 的 document 模式）；本轮未复验，Step 7 填充时抽验。

## 1. 项目类型（P0）

overlay-fork 二次开发仓（非 monorepo）。最终应用 = 只读上游 `upstream/hermes-studio`（当前检出 v0.7.35，稳定发布线 v0.7.32）+ `patches/` 359 条有效补丁（`npm run inject` 构建期 git apply，双目标路由 studio/agent）+ `custom/` 自有代码（client 16 前端模块 / server 127 服务端模块 / qgate 独立包 / hermes-agent-plugins Python 件 / desktop / upstream-compat）。第三上游 `upstream/zcode`（zcode-patches/ 4 条）。产物 = Electron 桌面应用 SwarmStudio + web。版本线 0.7.30-overlay-2.38（已发 2.37，2.38 进行中）。

## 2. 可改范围（P1）

- 可改：`overlay/` 全部（custom/、patches/、scripts/、docs/、config/、runtime/ 模板、registries/、zcode-patches/）
- 只读：`upstream/hermes-studio`、`upstream/hermes-agent`、`upstream/zcode`（仅 `git pull`）；`simharness/`（overlay 只读消费）
- 只读区修改机制：upstream 变更一律经 `patches/NNN-域-描述.patch` + `patches/series` 登记 + `npm run inject` 注入（工作区 AGENTS.md:5-11）
- git 位置：git 只在 overlay/；工作区根非 git 仓

## 3. 改造分类（P1）

- **A 类（纯新增）**：新组件/store/服务放 `custom/`，经 alias `@/custom` + `registries/client/entry.mts` 入口 shim + bootstrap.ts 注册器（registerRoute/registerNavEntry/registerComponent，features 开关）接入，零侵入上游（README:229-238, 317-339）
- **B 类（骨架修改）**：schema/config/vite/路由挂载等约 7 类运行前置条件走 patch：upstream 临时改 → `git diff > patches/NNN-描述.patch` → 还原上游 → series 登记 → `npm run inject` 验证（README:573-596）
- 服务端新模块范式：custom/server/<mod>/ 导出带 prefix 的 koa-router + patch 在上游 `bootstrap/routes.ts` 加 import+`app.use(xxxRoutes.routes())` 两行（范本 patch 036/582/636）
- 旁路挂载：native-routes.ts 原生中间件直判（7 个 IDE 端点，绕 koa-router 404 根治件）

## 4. 技术栈摘要（P0）

TypeScript 全栈（Node ≥23，desktop pin python 3.12.13）：Vue 3 + Pinia + vue-router + naive-ui 前端，koa-router 后端（49 prefix router ~337 端点），vite 8 派生构建（单 chunk inlineDynamicImports），vitest 3.2.4 测试（628 文件）。

> 版本基线表（--deps 对比基线；**依赖单一事实源=上游 hermes-studio/package.json**——overlay package.json deps 为空、node_modules 为符号链借用、`.qgate/gates/symbol-grounding.yaml` 机器核验）：
>
> | 依赖 | 版本 | 类型 |
> |---|---|---|
> | vite | ^8.0.4 | 核心(构建) |
> | vitest | ^3.2.4 | 核心(测试) |
> | vue | ^3.5.32 | 核心(框架) |
> | pinia | ^3.0.4 | 基础 |
> | vue-router | ^4.6.4 | 基础 |
> | typescript | ~6.0.2 | 核心 |
> | vue-tsc | ^3.2.8 | 开发 |
> | ts-node | ^10.9.2 | 开发(serve 链) |
> | @vitejs/plugin-vue | ^6.0.5 | 核心(构建) |
> | naive-ui | ^2.44.1 | 基础(UI) |
> | vue-i18n | ^11.3.2 | 基础 |
> | jsdom | ^27.0.1 | 开发(测试) |
> | esbuild | ^0.27.0 | 开发 |
> | @playwright/test | ^1.63.0 | 开发(回归探针) |
> | monaco-editor | ^0.55.1 | 基础(IDE) |
> | @xterm/xterm | ^6.0.0 | 基础(终端) |

## 5. 构建发布命令（P0）

| 用途 | 命令 | 说明 |
|---|---|---|
| dev | `npm run dev` | vite 8649 --strictPort；predev 自动 ensure-injected；后端 8647 代理（/api /v1 /health /upload /socket.io→8647，/agent-health→8650 带 Bearer） |
| 后端 | `npm run serve` | serve-server.mjs，ts-node 拉上游 server，PORT=8647；改后端/patch 后 `lsof -ti:8647 \| xargs kill -9` 再 re-serve |
| inject/clean | `npm run inject` / `npm run clean` | 补丁注入 / 反向还原（clean 时 8647 在听拒执行，OVERLAY_ALLOW_LIVE_CLEAN=1 豁免） |
| verify/sync | `npm run verify` / `npm run sync` | 上游纯净态校验 / 上游同步（clean→fetch/reset→re-inject） |
| build | `npm run build` | 纯 client（vite --config vite.config.overlay.ts，生成物配置勿手改） |
| build:full | `npm run build:full` | openapi→vite→tsc→build-server→runtime 资源→verify-dist 门禁五步链 |
| 打包 | `npm run build:dmg`（mac 默认）/ `:win` | electron-builder；产物落 upstream/hermes-studio/packages/desktop/release/；发版须递增版本号并删 ~/.hermes-web-ui/webui/<version>/ |
| test | `npm run test` | vitest run（include custom/**/*.test.ts） |
| test:eval | `npm run test:eval` | eval 回归单文件（含红线负例） |

端口约定：8649 前端 dev / 8647 后端 / 8650 agent gateway / 8648 上游 start / 8748 desktop livez。

## 6. 分支规范（P1）

- 命名 `feat/<描述>` `fix/<描述>` `refactor/<描述>`，验证通过合回 main（工作区 AGENTS.md:13-31）；用户级更强：提交型任务走 worktree（.claude/worktrees/，≤3 并行，--no-ff 收口，不跨 worktree cherry-pick）
- 推送：按用户指令，不自动推；CI 仅 qgate.yml
- pre-commit 门禁：scripts/githooks/pre-commit（jargon 词表 HARD>0 拒提交；启用 git config core.hooksPath scripts/githooks）
- 提交实证：Conventional Commits 中文 subject，`type(scope): 中文主题——细节`（b38044db 等）；测试未绿禁提交（测试与 commit 分两轮工具调用）

## 7. 安全规则（P1）

- 构建物：只出 mac arm64 dmg + win x64 zip 两种，dmg 免签（CSC_IDENTITY_AUTO_DISCOVERY=false + identity=null；用户 2026-10-13 全局指令）
- 密钥：全走 env（203 唯一变量；MATRIX_ACCESS_TOKEN/ZCODE_SERVER_AUTH_TOKEN/QGATE_LLM_API_KEY 等），无密钥文件；Matrix 凭据统一 readGatewayMatrixEnv
- 认证：上游 studio JWT（patch 016 扩 matrix_user_id）+ synapse adminToken whoami 校验（whoami 失败拒落盘）+ loopback 四闸（socket.remoteAddress/XFF/Origin/Host）+ ws 升级 rejectUpgradeOrigin
- 脱敏：toolresultguard 审计 sha1 脱敏；shared/ 补件泄漏事故教训（collect 认任何 .env*，密钥轮换待办在案）
- 上传：--publish never 常量，不自动上传产物

## 8. 文档约定（P1）

- spec/plan：`docs/superpowers/{specs,plans}`，命名 `YYYY-MM-DD-<topic>.md`（specs 多 -design 后缀）；specs 112 条目 / plans 52 文件
- 设计正本：specs/2026-10-05-mux-v8-fullflow-plan.md（推演全流程唯一正本）；档案件=mux-history-and-engineering-archive.md；归档约定 specs/archive/README.md（唯一副本+git 历史保全）
- RELEASE-NOTES.md 每轮必含：上游版本/patch 计数/门禁终态（inject N/N+tsc 0+vitest 数字+i18n+build EXIT=0）/产物 sha256 与体积/装机三验
- 正式文档三规则：多格式一致（md/docx/pdf 同步重出）/终稿态/说人话+jargon 门禁（方法论正本=skill gongwen-bifa）

## 9. 测试体系（P1）

- vitest 3.2.4；vitest.config.ts 手写入库：include `custom/**/*.test.ts`、setupFiles custom/client/test/setup.ts（stub ResizeObserver/localStorage）、environment 按需 `// @vitest-environment jsdom`、OVERLAY_UPSTREAM_ROOT 隔离树支持
- 628 测试文件：client 292 / server 307 / qgate 19 / __tests__ 5 / desktop 4 / upstream-compat 1；__tests__ 目录 170 个
- 回归探针 scripts/regression/ 16 个（ux/api/pixel）；CI 仅 qgate.yml（注入态不可 CI 复现）
- 历史基线：534 文件 3847 过 / 1 skip（2026-10-13 记档）

## 10. 环境与外部资源（P1）

- node ≥23（CI 24）/ python 3.12.13（desktop pin）；无 .nvmrc
- 布局硬约定：../upstream/{hermes-studio,hermes-agent,zcode} 三兄弟目录；OVERLAY_UPSTREAM_ROOT 可重定向隔离副本
- node_modules 符号链 → 上游 hermes-studio（依赖借用单一事实源，symbol-grounding 核验）
- 外部资源：Matrix/Synapse（MATRIX_HOMESERVER 等 env；CS API v3 + Admin API v2；联邦房 MX_FEDERATION_ROOM）；sqlite×3 文件 9 表 + pg（LOOP_PG_URL）；zcode 引擎 8650（Bearer API_SERVER_KEY）
- MCP/受管运行时：runtime/（semantica v0.7.0 MCP、pua 12 技能、pricing/roster），runtime-manifest.json 同步 ~/.hermes/hermes-agent；runtime:doctor/register 对账命令

## 11. 可复用稳定单元清单（P0）

> 全量计数见第 16 项核验表；详细签名表落 reference-manual §4/§6/§9（Step 7 从路 C 报告全量搬运，禁止样本化）。

- **11a 可复用 API**：49 prefix router ~337 端点全量（路 C §3.2 逐文件端点表）。高频面：/api/hermes/cluster-inspector/*（snapshot/run/pipeline）、/api/governance/*（44 端点）、/api/loop/* + /api/graph/*、/api/ide/*、/api/hermes/eval/*（24 端点）、/api/zcode-engine/*（20 端点）
- **11b 可复用组件**：285 .vue 全量（ide 71/ia2 69/matrix-chat 52/governance 21/kanban 18/cockpit 16/loop 16/bpa 7/matrix-teams 7/eval 4/ontology 2/chat 1/skillgov 1）；容器视图入口：IdeShell/IaShell/SwarmKanbanView/MatrixChatView/CockpitView/RunCenterView/WorkbenchView
- **11c 可复用函数/composable**：26 use* 文件（useRunTrace/useTaskLifecycle/useFitSlice/useAgentActivity 等）；服务端纯函数层 clusterinspector/detectors.ts（28 检测器纯函数无 IO）、prdelivery/validatePr、convergence.ts 记账
- **11d 可复用 Store**：22 Pinia store（cockpit 1/ia2 5/ide 1/loop 2/matrix-chat 5/matrix-teams 6 + 注入上游的 auth 薄片），store id 全量在路 C §2.2
- **11e 可复用类型**：export interface 1359 + export type 404，分布 485 文件
- **11f 稳定性标注**：稳定层=custom/ 模块导出面（组件/store/composable/REST 面）+ registries 注册器 + config/ 单一事实源；不稳定层=模块内部实现与长尾单文件模块；**禁止改层=upstream 三仓 + node_modules 符号链 + inject 生成物（vite.config.overlay.ts、packages/、tests/）**
- **11g 下游影响域（1 跳）**：上游 bootstrap/routes.ts 挂载点（改它=全部 custom 路由面回归）；vite alias 数组（@/custom 先于 @，改序=白屏）；registries/client/entry.mts（全部 A 类前端注册经它）；patches/series 顺序（依赖序，改序=注入失败）

## 12. 数据规范（P1）

- sqlite 9 表 3 文件：saas-store.ts（loops/loop_contracts/loop_events/loop_verifications）、event-log-store.ts（graph_events/graph_specs/graph_checkpoints）、change-governance-store.ts（change_requests/freeze_windows）
- 其余=JSON/JSONL 文件态（pipeline-state.json/parallel-review-state.json/cluster-inspector-convergence.json 落 <home>/runtime/）；clusterinspector 直读上游 kanban.db tasks 表（node:sqlite，cluster-inspector-controller.ts L91-109）
- 入口 env：RUN_UNDO_DB/HERMES_INCIDENT_DB/CHANGE_GOV_DB/HARNESS_STUDIO_DB/DATABASE_URL/LOOP_PG_URL

## 13. 五层认知基底（P1）

- 13a 认知映射：①概念=127 server 模块+16 client 模块 ②结构=A/B 类改造+挂载范式 ③空间=custom/{client,server,desktop,qgate,hermes-agent-plugins,upstream-compat} ④映射=glossary（mux-v8 方案本体论六要素+词表）⑤规律=本卡 §15 ⑥处理=precheck+qgate+githooks+junit
- 13b 六维基线：速度=小提交(<100 行)占 43%（1437/3353）；聚散=16 前端/127 服务端模块；趋势=patches/series 420 次改动最热；强度=337 端点+ws 面；能耗=285 .vue/22 store；累积量=359 有效补丁+347 行 series 修复记档
- 13c：第一层已建立（本卡）；二三层由 spec/workflow 模板承载；四五层随使用建立

## 14. 领域知识识别（P1）

- 14a 技术：Vue3 SPA+Electron 桌面；Node koa 后端；Matrix 协议（CS v3/Admin v2）；OTel 数据格式；SQLite/pg/JSON 文件态混合
- 14b 业务：AI 协作编排平台（agent 集群运维/循环编排/看板治理/评审闸/推演 harness 对接）；核心实体=Loop/Task/Card/Run/Session/Detector/Verdict/Evidence/Approval/Blueprint
- 14c 客观规律（每条代码证据，Step 7 展开）：巡检防自风暴（冷却去重 inspector.ts）；destructive 处置永远人工门（inspector.ts 头注）；fail-closed 约定（缺 env 即 503：humansim/observability/orgloop/OBS_SIM_ROOT）；series 顺序=依赖序（git apply 顺序敏感）；双实例白屏（alias 单实例钉扎根治）

## 15. 编排调用关系及约束（P0）

- **15a 导入方向**：custom client → 上游经 `@` 兜底 alias；上游不得 import custom（唯一例外=bootstrap/routes.ts 挂载两行 + entry.mts shim）；前端模块间跨引用允许（ia2→ide 组件在案），store 跨模块消费须显式 import
- **15b 注册/装配顺序**：vite alias 数组顺序敏感——裸包名单实例钉扎（pinia/vue/@vue/runtime-core/vue-router）→ /src/main.ts→entry.mts 重定向 → @/custom → @ 兜底（反序=双实例白屏）；服务端新路由唯一挂载通道=bootstrap/routes.ts 的 import+app.use 两行（patch 落）
- **15c 路由挂载**：客户端 patch 240 系列（component: () => import('@/custom/...)）+ 登录落点 /ide（patch 276）；服务端 49 router 各带 prefix；7 个 IDE 端点原生中间件直判（native-routes.ts）
- **15d 改造落位**：A 类→custom/<mod>/；B 类→patches/NNN-域-描述.patch + series 登记；改 B 类后必须 `npm run clean && npm run inject` 再重启后端（README:498）
- **15e 状态所有权**：前端=22 Pinia store 分模块所有；服务端=JSON/sqlite 文件态；clusterinspector 管道=采集(collectors 四采集器 fail-soft)→检测(detectors 纯函数 28 检测器)→定级→处置（InspectorDeps 注入 9 provider；notify 必发 govbus；safe-act 默认关）
- **15f 测试边界**：vitest include 仅 custom/**；upstream 不直接单测；qgate 子包 CI 独立跑
- 证据锚：路 C 报告 §2.4/§3.1/§4/§6；vite.config.overlay.ts alias 段；README:229-238/317-339/498/573-596

## 16. 详尽组件库清单（P0·计数核验表）

| 维度 | 枚举计数 | 清单去向 | 来源命令 |
|---|---|---|---|
| 前端 .vue | 285（views 56+components 229） | reference-manual §4 | find custom/client -name '*.vue' \| wc -l |
| Pinia store | 22 文件/22 store id | §4 | grep -rl defineStore custom --include='*.ts' |
| composables | 26 use* 文件 | §4 | find custom/client -name 'use*.ts' |
| server 模块 | 127（+__tests__） | §4 | ls -d custom/server/*/ \| wc -l |
| prefix router | 49 | §6 | grep -rn "Router({ prefix" custom/server |
| REST 端点 | ~337（291 router.+39 变量名+7 原生） | §6 逐端点 | grep -rn "router\.(get\|post\|put\|delete\|patch)" |
| *-store.ts | 26 | §4 | find custom/server -name '*-store.ts' |
| sqlite 表 | 9（3 文件） | §9 | grep -rn "CREATE TABLE" custom/ |
| 有效补丁 | 359（series）；409 .patch 文件在盘 | codebase | grep -vc '^\s*#\|^\s*$' patches/series |
| 测试文件 | 628 | codebase | find custom -name '*.test.ts' \| wc -l |
| 类型导出 | interface 1359 + type 404（485 文件） | §9 | grep -rlE "^export (interface\|type)" |
| env 变量 | 203 唯一 | codebase | grep -rhoE "process\.env\.[A-Z_0-9]+" \| sort -u \| wc -l |

> Step 13 由 inventory-verify.sh 机器复核。

## 17. 合规与质量特性基线（P1）

无强监管合规要求（默认约定，可调整）。质量特性实践基线：jargon 门禁（githooks HARD=0）、qgate engineering.basic-check（junit 落盘 minTotal 100；退出码 0 但报告含失败=INCONCLUSIVE 不给假绿）、symbol-grounding（依赖借用契约：上游砍依赖即亮红）、verify-dist 产物门禁（index.html 缺失/<200B/assets 无 JS 硬失败）、eval 密封集防探测契约。数据分级：shared/ 补件事故后全置换占位+scrub VACUUM（教训在案，密钥轮换为用户硬待办）。
