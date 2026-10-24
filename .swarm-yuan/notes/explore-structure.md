# AIStudio 单仓结构探查报告（2026-10-24 全量重生成轮 · 结构路）

> 分母口径：`git ls-files | wc -l` = **53248**。顶层分桶求和精确等于 53248（Python Counter 全量对账），根层覆盖率 100%。探查面=worktree 干净跟踪态（feat/aistudio-dev-regen @ e5ae1a928）。

## 1. 根层目录地图

| 目录/文件 | 文件数 | 作用 |
|---|---|---|
| `vendor/` | 41752 | 钉版上游基线（仅概览）：`hermes-agent` 20676（v0.22.4 @4d04303818）、`zcode` 18266（v3.16.1 系列 @3c5b2276）、`hermes-studio` 2809（v0.7.38 @04e5d9aa7）+ `VENDOR.md` 台账。台账机制：git 跟踪 pristine 基线，`inject` 在工作树打补丁（脏态=预期注入态），基线变更只走 `npm run vendor:sync` 显式通道，`VENDOR_SYNC=1` 才允许提交 vendor/**（vendor/VENDOR.md:1-15、.swarm-yuan/hooks/pre-commit:8-10） |
| `team/` | 4412 | 运行面 hermes agent 团队：`skills/` 2937（cybersecurity-defense 789 / detection 715 / devops 356 / forensics 307 等 46 族）+ `profiles/` 1427（42 个智能体 profile：pay-orchestrator 331、orchestrator 179、worker-* 等）+ `patches/` 23（acp-client/tui/kanban 等运行时源码补丁 apply 脚本）+ `shared/` 9 + 安装/说明文档 |
| `skills/` | 2804 | 全部为 `skills/swarm-yuan/`（元技能生成器源码，§6 详） |
| `custom/` | 2345 | 二次开发层（§2/§3 详）：client 1046 + server 1028 + qgate 256 + 其他 15 |
| `docs/` | 515 | 设计正本与调研：`superpowers/specs` 352 + `superpowers/plans` 62 + 调研源材料目录（nine-sources、wx-research、4articles、upstream-analysis）+ 散篇报告/手册 |
| `patches/` | 461 | hermes-studio 注入补丁族（§5 详） |
| `simharness/` | 332 | 推演 harness（§4 详） |
| `assets/` | 292 | `assets/skills/` 290（内置技能资源）+ logo.png |
| `runtime/` | 132 | 基础运行时受管镜像（§6 详） |
| `scripts/` | 113 | 构建/注入/回归/走查脚本（§6 详） |
| `evidence/` | 35 | 走查与能力证据快照（ide-walkthrough 21、flat-tabs 8、swarm-capability 5 等） |
| `.swarm-yuan/` | 12 | 生成器落仓工件：`hooks/pre-commit`（spec-first L2 + vendor 挡护）、`project-fingerprint`、`project-knowledge.md`、trace/decisions/gate-deny 台账、`notes/` |
| `zcode-patches/` | 9 | zcode 底座受管 fork 补丁（§6 详） |
| `.archived-patches/` | 7 | 退役补丁留档（018/019/021/025/028/060/061；028 与 patches/ 顶层双份留存，字节同 30197） |
| `registries/` | 7 | A 类入口注册 shim（§6 详） |
| `.qgate/` | 4 | 项目级 qgate 覆盖配置：qgate.yaml + gates/engineering.basic-check.yaml + gates/symbol-grounding.yaml |
| `config/` | 3 | overlay 配置：bootstrap.ts、features.ts（VITE_* 开关）、loop-config.ts |
| `.github/` | 1 | `workflows/qgate.yml`（唯一 CI 工作流） |
| 根文件 | 12 | package.json（aistudio@1.0.0-overlay）、package-lock.json、tsconfig.json、vitest.config.ts、vite.config.iso.ts、runtime-manifest.json、docker-compose.yml、README.md、RELEASE-NOTES.md、AGENTS.md、.npmrc、.gitignore |

## 2. custom/server/ 域清单（1028 文件，149 个域目录）

构成面：controller 类文件 110、store 52、service 24、routes 9、`__tests__/` 内文件 461（分散在 176 个域），另有 `controllers/` 聚合目录（ide 31 / hermes 6 / sim 4 / ia2 4 / system 2）。

Top 域：

| 域 | 文件数 | 构成要点 |
|---|---|---|
| `loop/` | 120 | graph 65 + engine 35 + store 7 + connectors 3 + gateway 2 + controllers 2 + __tests__ 2（图执行器/检查点/重试/停滞检测） |
| `eval/` | 58 | 26 __tests__ + 31 平铺（runner/store/judge/release-hold/redteam-variants/synthesize 等） |
| `controllers/` | 47 | 聚合挂载层：ide 31 + hermes 6 + sim 4 + ia2 4 + system 2 |
| `harness/` | 43 | workbench 20 + __tests__ 11 + 12 平铺（nine-layers/capability-catalog/cost-accounts/rsi-maturity/gov-metrics） |
| `governance/` | 39 | __tests__ 19 + 20 平铺（posture/governance-ledger/prov-o/registry-admin/org-diagnosis） |
| `ontology/` | 36 | __tests__ 16 + 20 平铺（ingest/validate/store/watch/seed） |
| `zcode/` | 31 | vendor 11 + __tests__ 7 + 13 平铺（session-projection/projection-socket/squad-protocol） |
| `clusterinspector/` | 28 | __tests__ 18 + 10（detectors/convergence/process-scan） |
| `matrix/` | 24 | __tests__ 12 + 12（task-protocol/raci-matrix/session-store/simulation） |
| `__tests__/` | 24 | 域根级跨域测试 |
| `secaudit/` | 17 | 15 平铺（engine/scan/report/coverage）+ __tests__ |
| `bpa/` `toolpipeline/` `services/` `reviewgov/` | 15/15/15/14 | toolpipeline = 审计→围栏→治理→执法门瀑布 |
| `toolresultguard/` `knowledge/` `kanban/` `approvals/` `incident/` | 14/14/14/14/13 | approvals = 风险分级/人闸/审批台账 |
| 其余 ~128 个域 | 各 2-12 | 长尾小域：contextarchive、tokens、skillprovision、delivery、redteam、evidence、trust（8 文件）、govbus、expcandidates、diagram、graph 等 |

**与 custom/server/AGENTS.md 对账**：域索引列 10 域全部存在（`loop/graph/` 为 loop 子目录 65 文件）；索引自述为「关键域」子集（10/149），无失效条目但覆盖面极小；`controllers/` 聚合挂载层与 `services/` 未入索引。

## 3. custom/client/ 域清单（1046 文件）

| 域 | 文件数 | .vue | 构成 |
|---|---|---|---|
| `ia2/` | 307 | 113 | __tests__ 104 + views 75 + components 46 + api 19 + composables 18 + adapters 7 + store 6 + utils 5 + 平铺 i18n/route/nav ~28 |
| `ide/` | 287 | 80 | __tests__ 120 + utils 57 + components 50 + views 31 + api 15 + composables 8 + store 3 + routes/i18n |
| `matrix-chat/` | 88 | 53 | components 52 + __tests__ 15 + stores 7 + utils 7 + composables 2 + views 1 + identity |
| `cockpit/` | 88 | 15 | 早期工作台聚合（trace/协作/审批组件复用源）+ store 2 |
| `loop/` | 59 | 5 | runcenter/store + 画布/循环面板 |
| `matrix-teams/` | 48 | 7 | stores 10 + components + dispatch/qgate-bridge/review-center |
| `governance/` | 48 | 29 | components 29 + api 8 + __tests__ 8 + i18n 2 |
| `kanban/` | 39 | 17 | 看板域 |
| `eval/` | 20 | 10 | 评测面 |
| `__tests__/` | 14 | — | 域根级（i18n 编译门等） |
| `bpa/`(12) `skillgov/`(7) `ontology/`(7) `ui/`(6) `chat/`(5) `zcode/`(3) `settings-layers/`(2) `branding/`(1) `test/`(1) `styles/`(1) | 44 | 3 | 长尾域 |

计数：**.vue 组件 343**（=git ls-files 'custom/client/*.vue'，100%；全仓 585 = custom 343 + vendor 231 + skills 11）。**Pinia store：store/stores 目录文件 30，实际含 defineStore 的 20**（另 10 为 kv/helper/持久化辅助）。ts 694、scss 7。

**与 custom/client/AGENTS.md 对账**：正文六域均存在；**遗漏未列**：matrix-teams(48)/loop(59)/eval(20)/bpa(12)/skillgov(7)/ontology(7)/zcode(3)/chat(5)/settings-layers/branding/根级 features.ts——matrix-teams 与 loop 已进前六，建议补索引。

## 4. simharness/ 结构（332 文件）

- **`mux/`（136）**：**mx-* 脚本 44 个**（100% 枚举）：
  - 拓扑/生命周期：`mx-up.sh`（单 gateway 多路复用 + 单 studio，PIPELINE_TRIGGER/PARALLEL_REVIEW 提速开关）、`mx-down.sh`（pid+端口清残留）、`mx-setup.sh`（一次性幂等准备）、`mx-lib.sh`（公共库：1 gateway multiplex 全 profile + 1 studio 多 matrix 账号）、`mx-smoke.sh`（G1-G5 验收门禁）、`mx-clean.sh`、`mx-node.sh`（三机节点切片）、`mx-node-heartbeat.sh`/`mx-hb.sh`、`mx-platform.sh`、`mx-relay.sh`
  - 推演驱动/门禁：`mx-prelaunch-check.sh`（开跑前 30 项核验）、`mx-scenario-lib.sh`（20 步场景原语）、`mx-delivery-lib.sh`/`mx-delivery-smoke.sh`、`mx-state-query.sh`、`mx-compensation-ledger.sh`、`mx-closure-snapshot.sh`、`mx-harness-snapshot.sh`
  - 守护：`mx-gateway-babysit.sh`/`mx-gateway-nanny.sh`、`mx-night-watchdog.sh`、`mx-night-sentinel.sh`、`mx-sim-gateway-service.sh`（launchd 托管）、`mx-sim-mautrix-ensure.sh`、`mx-retro-sink.sh`
  - 报告/评测/质量：`mx-report-gen.py`、`mx-report-audit.py`、`mx-narrative-skeleton.py`、`mx-eval-lib.sh`/`mx-eval-summary.py`、`mx-dup-ratio.mjs`（重复率 ≤3%）、`mx-mutation-score.mjs`、`mx-load-probe.py`、`mx-interventions.py`、`mx-mixed-motive.py`
  - 审批/插件/供给：`mx-approval-proxy.sh`（run16 审批饿死事故固化）、`mx-board-supply-check.sh`、`mx-enable-file-approval.sh`/`mx-enable-run-trace.sh`、`mx-grant-profiles.mjs`、`mx-hermes-shim.py`、`mx-lite-seed.sh`、`mx-log-sanitize.py`
  - 子结构：tests/ 16（.test.sh 守门）、qgate-overrides/gates/ 10（L0.* 推演侧门）、templates-pending/ 14、cashier-preview/ 3、git-hooks/ 2
- **`skills/`（122）**：aipaydev-dev/ 116 + 6 单文件技能（testing-shift-left、requirements-analyst、pm-planning、inbox-dedup、defect-loop、capability-report）
- **`tests/`（28）**：.test.sh 15（contract-gate、integration-retention、isolation-boundary、multi-owner-stall、night-sentinel、posture-ledger、qgate-executors、report-truth-anchor、secret-scan-gate、mx-interventions）+ .test.ts 9（eval-fullflow-integration、swarm-bench/collab-integration、v846-governance-closure、unified-report-layer、mutation-dup-tools）+ run-gates.sh 汇入口 + fixtures/whitelist
- **`docs/`（25）**：run 前奏/复盘编年 + specs/ 7 + superpowers/ 6
- **`scenarios/`（5）**：_template/、example-minimal/、mixed-motive-bidding/
- **`materials/`（5）**：RFD-001 收银台 / RFD-002 分账退款 / RFD-003 OCR
- **`var-templates/`（3）**：chain-watch / endgame-watch / run-watch-v3
- 根 4 脚本：`aipay-scenario.sh`（V3 全流程 0-1 推演 26 步单文件版）、`aipay-ocr-verify.sh`、`aipay-agent-sync.sh` + README；package.json（sim-harness@1.1.0 自持守门依赖，无 scripts 段）+ vitest.config.ts

## 5. patches/ 体系

**series 格式**（930 行）：纯补丁文件名行 + `#` 注释行（451 行）+ 空行（82）；非注释登记行 **397**。000 号按依赖位次插入在 043/055 之间（非文件名序）。

- **补丁号最大 687；.patch 总数 460**（= 顶层 450 + `_skip-0735/` 1 + `_skip-0736/` 7 + `_skip-0737/` 2，_skip 目录为上游升级轮移存留档）
- **对账**：series 登记 397 条全在顶层（series-only=0）；顶层 53 个未登记（多被 473 全链终态再生吸收：i18n-locale-* 8 个、历史 i18n 对 076-105、rebrand/agent-health 历史轮、近期 client 侧 481-537、agent 侧 569-680）
- **Top 补丁族**（450 顶层）：server-kanban 24 / client-api 10 / server-routes 9 / agent-kanban 9 / i18n-locale 8 / client-store 7 / client-i18n 7 / test-matrix 6 / server-ide 6 / test-kanban 5 / server-zcode 5 / client-router 5 / server-sessions 4 / server-controllers 4 / client-kanban 4

## 6. 其余开发面目录

- **`runtime/`（132）**：上游运行时受管镜像（README 自述「不是 fork」）：pua/ 46、roster/ 17、hermes_cli/ 15、gateway/ 10、plugins/ 8、tools/ 7、governance/ 7、tests/ 6、agent/ 5、clef/ 3、semantica/（manifest.yaml 经 patch 375 进 hermes-agent optional-mcps）。**`runtime-manifest.json`（根）**：B1 双树漂移根治清单——source=runtime/ → dest=~/.hermes/hermes-agent，inject 出口 deploy-agent-runtime 自动同步
- **`scripts/`（113）**：入口链 inject.mjs（注入/`--clean` 撤销）、ensure-injected.mjs、serve-server.mjs、build.mjs/build-dmg.mjs、verify-clean.mjs/verify-dist.mjs、sync-upstream.sh/vendor-sync.sh、zcode-engine.mjs；维护 migrate-patches.mjs、regen-473.mjs、drift-audit.mjs、check-bundle-budget.mjs；regression/ 40、*-walkthrough.mjs 20+、runtime/ 3、fibo/ 3、plan-html/ 10、githooks/
- **`registries/`（7）**：A 类入口 shim——client/entry.mts 复制上游 main.ts 启动序列、在 app.use(router) 与 app.mount 之间插入增量注册（上游 main.ts 零改动）
- **`zcode-patches/`（9）**：series（基线 origin/main @ 0a1fc56 v3.16.1）+ 8 补丁：002 importSession RPC、003-005 zcode-cua 活体化、006 cua-plugin bundled、007 official host protocol、008 broker-unavailable error-code
- **`skills/swarm-yuan/`（2804）**：SKILL.md + tests/ 1589 + runtime/ 373（diagram-design 290 + mattpocock-skills 83）+ vendor-knowledge/ 305 + assets/ 218（framework-gates 81 + gates 57）+ references/ 140（frameworks 82）+ docs/ 116 + scripts/ 53 + ci/ 3 + 安装器

## 7. 测试面盘点

| 类型 | 数量 | 分布 |
|---|---|---|
| vitest `*.test.*` | 7461 | vendor 6562 / custom 876 / simharness 13 / skills 8 / scripts 2 |
| vitest `*.spec.*` | 173 | vendor（zcode/hermes 自带） |
| `__tests__/` 目录文件 | 1075 | custom 879 / vendor 195 / scripts 1 |
| pytest `test_*.py` | 4 | 全在 vendor/hermes-agent；team 树无 pytest 命名测试；**runtime/tests/ 为 gateway/hermes_cli 两族**（规范路实测） |
| shell 守门 `.test.sh` | ~31 | simharness/tests 15 + simharness/mux/tests 16（推演侧守门主力） |

- vitest 配置 20 个：根 vitest.config.ts（开发面）+ simharness/ + custom/qgate/ + vendor 17
- 根目录无 `tests/`；守门职责由 simharness/tests/ + 仓级 custom/__tests__/patches-series-guard.test.ts、zcode-patches-guard.test.ts、zcode-engine-chain.test.ts 承载

## 8. package.json scripts（根仓 33 条）

- 注入/同步：`inject`、`clean`、`ensure-injected`、`sync`、`vendor:sync`
- 构建：`build`、`prebuild`→ensure-injected、`build:full`、`build:dmg`/{mac,win,linux}、`postbuild`→verify-dist
- serve/dev：`serve`、`dev`/`dev:lan`（:8649 前端 / 8647 后端；dev:lan 免密面仅限可信局域网）、`predev`→ensure-injected
- 测试/质量：`test`、`test:ide-smoke`、`test:ide-selfcheck`、`test:eval`、`typecheck:harness`（tsc 点名 custom/server ~130 文件 noEmit）、`check:bundle`
- 引擎/运行时：`zcode:ensure`/`zcode:serve`、`catalog-check`、`runtime:doctor`/`runtime:vendor-pua`/`runtime:register`、`bench:expert`、`fibo:sync`

构建/注入/serve 链：`npm run inject` → scripts/inject.mjs（重放 patches/series 460 + zcode-patches + registries/config/custom 挂接）→ deploy-agent-runtime 按 runtime-manifest.json 同步 agent 运行时；`npm run dev`/`serve` 起 overlay 前后端。

## 9. 全仓文件类型计数（跟踪面）

.ts 15699 / .py 11223 / .md 8491 / .tsx 2443 / .svg 2378 / .txt 1835 / .com 1678 / .json 1549 / .yaml 1278 / .mjs 868 / (无扩展) 808 / .sh 722 / .vue 585 / .html 536 / .patch 504 / .png 364 / .conf 347 / .js 234 / .yml 131 / .java 112 / .css 80 / .local 75 / .gitignore 68 / .bat 24 / .nix 22 / .mts 20 / .jpg 20 / .sql 26 / .jsonl 24 / .webp 27 / .mmd 28 / .xml 33 / .cjs 41 / .toml 44 / .ps1 49 / .mdx 60 / .rs 17 / .scss 16（.patch 504 = patches 460 + team 19 + zcode-patches 8 + archived 7 + vendor 10；覆盖率 53248/53248）

## 结构性发现

1. series 与补丁文件 53 条差额全部是留档未登记补丁（非丢失）；028 双份冗余。
2. AGENTS.md 索引滞后：client 侧 matrix-teams/loop/eval 大域未入速查；server 索引仅 10/149。
3. 测试双轨：开发面 vitest（custom 876）+ 推演面 shell 门（31 个 .test.sh）；vendor 占全仓 .test. 88%，根 vitest.config include 隔离在 overlay 面。
