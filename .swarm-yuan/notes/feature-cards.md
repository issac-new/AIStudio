# 项目特征卡：AIStudio（SwarmStudio 体系单仓）— 2026-10-24 全量重生成轮

> 数据来源：三路并行子代理探查（notes/explore-{structure,conventions,codeorg}.md）+ mine-habits 5204 提交统计 + detect-frameworks.sh + framework-evidence.sh 台账（notes/framework-evidence.tsv 76 行）+ 机械提取（notes/inventory/）。探查面=worktree 干净跟踪态 @ e5ae1a928。
> 形态判定（§D.0）：**[前端UI, 后端API, 桌面IPC(vendor 壳层), 脚本/推演面(bash+python)]**；无异步 MQ 维度（实时走 socket.io 命名空间与轮询）、无库导出维度。
> 框架激活（§D.0.5）：**ACTIVE_FRAMEWORKS = vue, naiveui, vite, koa, jest-vitest, pytest**。detect-frameworks 全树扫描报 24 个（spring-boot/django/harmonyos 等系 vendor/ 上游树污染，Monorepo+钉版基线场景误报）——AI 按开发面证据收敛六框架：vue 343 .vue / naiveui 48 文件引用 / vite 15 配置 / koa 103 路由文件 / jest-vitest 875 .test.ts / pytest simharness+runtime python 面（python3.14 -m pytest 22 passed 实测，2026-10-24 spec 记档）。pytest 为本轮新增（整合后 simharness/runtime 入库成开发面）。
> 视觉成熟度（§D.0 尾注）：沿用 10-16 轮判定——31+ CSS 自定义属性、scss BEM、无 DESIGN.md → 场景①（frontend-design-methodology 的 document 模式）。

## 1. 项目类型（P0）

AIStudio 单仓（原 ncwk 多仓 2026-10-24 整合）= SwarmStudio 桌面应用（Electron+Koa+Vue3）二次开发层 + `vendor/` 钉版上游基线三树（hermes-studio v0.7.38 @04e5d9aa7 / hermes-agent v0.22.4 @4d04303818 / zcode v3.16.1 @3c5b2276，台账 vendor/VENDOR.md）+ `simharness/` 全流程推演 harness + `skills/swarm-yuan/` 技能源码 + `team/` 运行面部署包。所有改动经 `patches/`（460 .patch，series 登记 397）与 `custom/`（2345 文件：server 149 域 1028 文件 / client 23 域 1046 文件 / qgate 256）构建期注入 vendor/（npm run inject）。git 跟踪 53248 文件；产物=Electron 桌面应用+web。

## 2. 可改范围（P1）

- 可改：本仓全部（git 域）；spec-first 门禁面（WRITABLE_DIRS）=custom registries config scripts patches zcode-patches runtime docs 八面须 spec 先行；simharness/ skills/ team/ assets/ 不触发 spec-required 但同受仓规约束
- 只读：`vendor/**` 钉版基线——inject 注入脏态是预期工作态、不入提交（pre-commit 自动撤出）；基线替换只走 `npm run vendor:sync` + `VENDOR_SYNC=1` 显式通道；vendor/ 内禁建 .git
- 只读区修改机制：一律经 patches/NNN-域-描述.patch + series 登记 + npm run inject；上游锁文件禁手改（新依赖走补丁，687 先例）

## 3. 改造分类（P1）

- **A 类（纯新增零侵入）**：客户端=组件/store/api 放 custom/client/<域>/，经 vite alias `@/custom` + registries/client/entry.mts 入口 shim + bootstrap.ts 按features开关动态注册；服务端=域目录+*-controller.ts 带 prefix koa-router，经 inject 符号链接 packages/server/src/custom → custom/server 挂入
- **B 类（骨架修改走 patch）**：vendor 注入态临时改 → git diff 存 patches/NNN → 还原 → series 登记 → npm run inject 重放验证；三树路由=diff 头前缀判定（hermes_cli/plugins/agent/gateway 等→hermes-agent；zcode-patches/ 目录→zcode；其余→hermes-studio）
- 服务端新路由唯一挂载通道=patch 在 vendor/.../bootstrap/routes.ts 加 import+app.use 两行（80+ 枚挂载补丁族；范本 591/582/543）；**改 B 类后后端重启前 npm run clean && npm run inject**

## 4. 技术栈摘要（P0）

TypeScript 全栈（Node ≥23；推演/运行时 python3.14）+ bash harness。Vue 3 + Pinia + vue-router + naive-ui 前端（343 .vue / 21 store）；koa-router 后端（75 路由文件 534 端点，55 显式 prefix）；vite 8 派生构建（vite.config.overlay.ts 生成物勿手改，单 chunk inlineDynamicImports）；vitest（custom+scripts 875 .test.ts）；simharness bash+python（44 mx-* 脚本 + pytest）。

> 版本基线表（--deps 对比基线；**依赖单一事实源=vendor/hermes-studio/package.json**，.qgate/gates/symbol-grounding.yaml depsFile 机器核验）：
>
> | 依赖 | 版本 | 类型 |
> |---|---|---|
> | vite | ^8.x（以 vendor manifest 声明值为准） | 核心(构建) |
> | vitest | ^3.2.4 | 核心(测试) |
> | vue | ^3.5.x | 核心(框架) |
> | pinia / vue-router | ^3.x / ^4.x | 基础 |
> | naive-ui | ^2.44.x | 基础(UI) |
> | typescript | ~6.0.x | 核心 |
> | ts-node | ^10.9.2 | 开发(serve 链) |
> | monaco-editor / @xterm/xterm | IDE 基础 | 基础 |
> （Step 7 填充时以 `vendor/hermes-studio/package.json` 实测值替换上表 range 列）

## 5. 构建发布命令（P0）

| 用途 | 命令 | 说明 |
|---|---|---|
| dev | `npm run dev` | vite :8649 --strictPort；predev 自动 ensure-injected；后端 :8647 代理；dev:lan 免密面仅限可信局域网 |
| 后端 | `npm run serve` | serve-server.mjs，ts-node 拉上游 server，PORT=8647；改后端/patch 后 kill :8647 再 re-serve |
| inject/clean | `npm run inject` / `npm run clean` | 补丁注入（出口顺带 deploy-agent-runtime --apply）/ 反向还原（8647 在听拒执行，OVERLAY_ALLOW_LIVE_CLEAN=1 豁免） |
| 基线同步 | `npm run vendor:sync` | upstream/<tree> → git archive 整树替换 vendor/ → re-inject → VENDOR_SYNC=1 提交（唯一显式通道） |
| build | `npm run build` / `build:full` | 纯 client / 五步链（openapi→vite→tsc→build-server→verify-dist） |
| test | `npm test` | vitest run（include custom/**+scripts/**）；合并前全量 |
| typecheck | `npm run typecheck:harness` | tsc 点名 ~130 个 custom/server 模块 noEmit；新模块须手动并入 |
| 推演 | simharness/mux/mx-up.sh 等 44 脚本 | SIM_ROOT 隔离（默认 /Users/cuishi/lab/ncwk-sim-mux，env AIPAY_SIM_ROOT） |

端口：8649 前端 dev / 8647 后端 / 8650 真机 agent gateway / 8648 上游 start / 8748 desktop livez / **推演面 8801 GW + 8802 studio**。

## 6. 分支规范（P1）

- 命名 `feat|fix|refactor/<slug>`（docs/<slug> 为文档轮实际扩展形态），从 origin/main 起；验证过 `--no-ff` 合回；merge 模板 `merge: <slug> 并入——<中文摘要>`
- 用户级更强：提交型任务一律 worktree（.claude/worktrees/，≤3 并行，IN-FLIGHT 标记，git 通道清理禁 rm -rf）
- pre-commit 双职责：spec-first L2（委托技能目录脚本）+ vendor/** 挡护（VENDOR_SYNC=1 逃生）
- 提交实证：Conventional Commits 中文 subject（feat 1491/fix 1344/docs 670/merge 1225，5204 提交口径）；测试未绿禁提交

## 7. 安全规则（P1）

- 密钥全走 env（296 唯一变量；MATRIX_ACCESS_TOKEN/ZCODE_SERVER_AUTH_TOKEN/QGATE_LLM_API_KEY 等），无密钥文件；审计不落敏感原值（custom/server/AGENTS.md 成文）
- 认证：上游 studio JWT（requireUserJwt + resolveUserProfile，custom 全部 REST 默认受保护）；写面加码 controller 自查（super_admin）；loopback 四闸；matrix 会话换 JWT（patch 012）
- 脱敏：toolresultguard 审计 sha1 脱敏；simharness secrets 采集器部署面
- 上传：--publish never，不自动上传产物

## 8. 文档约定（P1）

- spec/plan：docs/superpowers/{specs,plans}，命名 YYYY-MM-DD-<slug>.md（specs 334 / plans 62）；spec 必含「变更/决策记录/验证」三段，决策事实源
- 设计正本族：2026-10-23-swarmstudio-integrated-design.md（八章整合正本）+ swarmstudio-design-ledger.md（数字总账）+ 2026-10-05-mux-v8-fullflow-plan.md（推演唯一正本）
- RELEASE-NOTES.md 最新轮置顶，每轮含验证数字+边界披露
- 台账：.swarm-yuan/{decisions,trace,gate-deny}.jsonl 有意入库

## 9. 测试体系（P1）

- 根 vitest：include custom/**/*.test.ts + scripts/**/*.test.ts（875 文件），setupFiles=custom/client/test/setup.ts，testTimeout 20000，jsdom 按文件头注释；alias 上游根 env OVERLAY_UPSTREAM_ROOT > vendor/ > ../upstream；全量口径 6260 用例 0 失败（2026-10-24 b3756a051 实测记档）
- simharness 独立面：自带 vitest（143 测）+ 31 个 .test.sh 守门（合同门/隔离边界/夜间哨兵等），入口 tests/run-gates.sh；node_modules 本仓自持优先
- pytest（runtime/）：拼合树前提=vendor v0.22.4 基线+runtime 覆盖层（runtime-manifest.json 部署到 ~/.hermes/hermes-agent）；python3.14 -m pytest 22 passed 实测
- qgate 子项目（custom/qgate/）独立 vitest+CI；.qgate/gates/engineering.basic-check junit minTotal:100 防缩水
- CI 仅 .github/workflows/qgate.yml（只跑 qgate 自身——overlay 全量依赖本地注入态不可 CI 复现）

## 10. 环境与外部资源（P1）

- node ≥23（CI 24）/ python3.14（pytest 实测链）；desktop pin python 3.12.13
- 布局：vendor/ 三树内置（不再依赖 ../upstream 兄弟目录；upstream/ 为本地升级缓存不入库）；node_modules 符号链 → vendor/hermes-studio/node_modules
- 推演隔离：SIM_ROOT（env AIPAY_SIM_ROOT，默认 /Users/cuishi/lab/ncwk-sim-mux NVMe）派生 HERMES_ROOT/AGENT_SRC/PRODUCT_DIST，与宿主 ~/.hermes 完全隔离；isolation-boundary.test.sh 三断言看守
- 外部资源：Matrix/Synapse（CS v3+Admin v2）；sqlite 文件态+pg（LOOP_PG_URL）；zcode 引擎 8650（Bearer）
- 运行时部署：runtime-manifest.json（45 文件清单）驱动 deploy-agent-runtime.mjs（默认 dry-run，--apply 才拷贝，目标差异先备份 .bak 只留 3 份）

## 11. 可复用稳定单元清单（P0）

> 全量计数见第 16 项核验表；详细签名表落 reference-manual §4/§6/§9（Step 7 从三路报告+机械提取全量搬运，禁止样本化）。

- **11a 可复用 API**：75 路由文件 534 端点（55 显式 prefix；机械提取 notes/inventory/endpoints.tsv）。高频面：/api/harness/*（12+ 只读聚合）、/api/progress/*、/api/loop/* + /api/graph/*、/api/ide/*、/api/hermes/eval/*、治理读模型族
- **11b 可复用组件**：343 .vue（ia2 113/ide 80/matrix-chat 53/governance 29/kanban 17/cockpit 15/eval 10/loop 5/matrix-teams 7/长尾）；容器视图入口：IdeShell/IaShell/SwarmKanbanView/MatrixChatView/WorkbenchView/RunCenterView
- **11c 可复用函数/composable**：38 use* 文件（useTaskProgress 单例+引用计数范式等）；服务端纯函数层（clusterinspector/detectors、progress/analytics、loop/engine）；mx-lib.sh 函数族（synapse 账号/Matrix API 薄封装/studio REST）
- **11d 可复用 Store**：21 defineStore（ia2/ide/matrix-chat/matrix-teams/loop/cockpit 分布；另 10 个 kv/helper 辅助文件）
- **11e 可复用类型**：export interface 2132 + export type 576
- **11f 稳定性标注**：稳定层=custom/ 模块导出面+registries 注册器+config/ 单一事实源+mx-lib/mx-scenario-lib 公共库；不稳定层=模块内部实现与长尾单文件域；**禁止改层=vendor/ 三树基线+node_modules 符号链+inject 生成物（vite.config.overlay.ts/.overlay-injected.json/符号链接）**
- **11g 下游影响域（1 跳）**：vendor/.../bootstrap/routes.ts 挂载点（改它=全部 custom 路由面回归）；vite alias 数组顺序（@/custom 先于 @，改序=白屏）；registries/client/entry.mts（全部 A 类前端注册经它）；patches/series 顺序（依赖序，改序=注入失败）；runtime-manifest.json（改清单=部署面漂移）

## 12. 数据规范（P1）

- sqlite 文件态：saas-store/event-log-store/change-governance-store 等（62 处 CREATE TABLE 语句，Step 7 按文件归组核实表清单）；clusterinspector 直读上游 kanban.db tasks 表（node:sqlite）
- JSONL append-only 台账族：dispatch-ledger（commandId 去重）/tool-exec-audit（按日落盘 0700）/evidence hash 链/govbus 环形（CAP 2000）
- 原子写纪律：JSON/JSONL tmp→rename（custom/server/AGENTS.md 成文）
- 入口 env：RUN_UNDO_DB/HERMES_INCIDENT_DB/CHANGE_GOV_DB/HARNESS_STUDIO_DB/DATABASE_URL/LOOP_PG_URL

## 13. 五层认知基底（P1）

- 13a 认知映射：①概念=149 server 域+23 client 域+44 mx-* ②结构=A/B 类双轨+挂载补丁族范式 ③空间=custom/{client,server,qgate}+patches/+simharness/+runtime/ ④映射=正本文档族+AGENTS 链 ⑤规律=本卡 §15 ⑥处理=precheck+qgate+githooks+junit
- 13b 六维基线：速度=小提交(<100 行)占 45%（2353/5204）；聚散=server 149 域/client 23 域；趋势=patches/series 461 次改动最热；强度=534 端点+socket 命名空间；能耗=343 .vue/21 store；累积量=460 .patch（397 登记）+334 specs
- 13c：第一层已建立（本卡）；二三层由 spec/workflow 模板承载；四五层随使用建立

## 14. 领域知识识别（P1）

- 14a 技术：Vue3 SPA+Electron 桌面壳；Node koa 后端；Matrix 协议；socket.io 命名空间实时；SQLite/pg/JSONL 混合；bash+python 推演 harness；hermes agent 网关生态
- 14b 业务：SwarmStudio=AI 协作编排平台（agent 集群运维/循环编排/看板治理/评审闸/评测/推演）；核心实体=Loop/Task/Card/Run/Session/Detector/Verdict/Evidence/Approval/Gate(G1-G6)/Profile
- 14c 客观规律（代码证据见 codeorg 报告）：fail-soft 读模型 vs fail-closed 执法链不可混用；审计唯一出口=toolpipeline/tool-hooks.ts；推演只消费产品不改产品（隔离边界三断言）；series 顺序=依赖序；双实例白屏（alias 单实例钉扎根治）；网关自更新会擦补丁（mx-up 每次自愈重放）

## 15. 编排调用关系及约束（P0）

- **15a 导入方向**：custom client → vendor 经 @ 兜底 alias；vendor 不得 import custom（唯一例外=bootstrap/routes.ts 挂载两行+entry.mts shim）；前端域间跨引用允许（ia2→governance 42 次最多），server 域间显式 import（governance 被引 30 次居首=底座域）
- **15b 注册/装配顺序**：vite alias 数组顺序敏感（裸包单实例钉扎→/src/main.ts→entry.mts 重定向→@/custom→@ 兜底，反序=双实例白屏）；客户端 app.use(router) 推迟到全部 addRoute 之后（entry.mts:151-166，防 catch-all 环）；服务端挂载=protected 序列尾部追加两行
- **15c 路由挂载**：客户端=域 routes.ts 纯描述+bootstrap.ts:82-84 统一 addRoute（零上游 router 锚点纪律）；服务端=55 显式 prefix router+子路由 router.use('/workbench' 等)；ia2 主路由树（IA_AREAS 六阶段+旧链迁移表+ANNEXED_LEGACY）
- **15d 改造落位**：A 类→custom/<域>/；B 类→patches/NNN-域-描述.patch+series 登记；改 B 类后 clean+inject 再重启后端；新依赖补丁须同步锁（687 先例）
- **15e 状态所有权**：前端=21 Pinia store 分域所有（组合式 defineStore）；服务端=JSON/sqlite/JSONL 文件态分域所有；审计通道三件=tool-hooks（唯一出口）/govbus（事件总线，REST 只读不开写入口）/dispatch-ledger
- **15f 测试边界**：根 vitest include 仅 custom+scripts（vendor 不直接单测）；simharness 自持；qgate 独立 CI；pytest 拼合树运行态
- 证据锚：codeorg 报告 §1/§2.2/§3.2/§7；vitest.config.ts:23-35,70；inject.mjs:340-491,551-589

## 16. 详尽组件库清单（P0·计数核验表）

| 维度 | 枚举计数 | 清单去向 | 来源命令 |
|---|---|---|---|
| 前端 .vue | 343 | reference-manual §4 | git ls-files 'custom/client/*.vue' |
| Pinia store | 21 defineStore | §4/§9 | grep defineStore custom/client |
| composables | 38 use* 文件 | §4 | git ls-files 'custom/client/**/use*.ts' |
| server 域 | 149（+__tests__ 461 文件） | §4 | git ls-files custom/server 三级目录 |
| prefix router | 55 显式（路由文件 75） | §6 | grep "new Router({ prefix" custom/server |
| REST 端点 | 534（机械提取） | §6 逐端点 | notes/inventory/endpoints.tsv |
| *-store.ts | 29 | §4 | git ls-files 'custom/server/**/*-store.ts' |
| mx-* 脚本 | 44 | codebase/recipes | git ls-files 'simharness/mux/mx-*' |
| .patch 文件 | 460（series 登记 397，最大号 687） | codebase | git ls-files patches + series |
| vitest 测试 | 875（custom+scripts） | codebase | git ls-files '*.test.ts' 过滤 |
| shell 守门 | 31 .test.sh（simharness） | codebase | git ls-files simharness |
| 类型导出 | interface 2132 + type 576 | §9 | grep export |
| env 变量 | 296 唯一 | codebase | grep process.env |

> Step 13 由 inventory-verify.sh 机器复核（清单计数 ≥ 枚举×0.95）。

## 17. 合规与质量特性基线（P1）

无强监管合规要求（默认约定，可调整）。质量特性实践基线：spec-first 四层拦截（L1 宿主 hook deny/L2 pre-commit/L3 门禁/L4 状态机）；qgate engineering.basic-check（junit minTotal 100；INCONCLUSIVE 不给假绿）；symbol-grounding（depsFile 锚 vendor manifest，砍依赖即红）；jargon 门禁；verify-dist 产物门禁；eval 密封集防探测契约；审计台账三件（decisions/trace/gate-deny 入库）。数据分级：shared/ 补件事故教训在案（密钥轮换用户硬待办）。
