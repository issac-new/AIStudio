# 结构探查报告（流A ① 结构子代理，2026-09-16）

## 1. 工作区顶层布局

| 路径 | 角色 | git 仓库 |
|---|---|---|
| `overlay/` | 二开 overlay 仓库（patches + custom + scripts + release notes） | 是（当前 main @ 3b730cb） |
| `upstream/hermes-studio/` | 只读上游：Electron+Vue+Koa 桌面应用，tag **v0.7.21**（8d964022, 2026-09-12），remote github.com/EKKOLearnAI/hermes-studio | 是 |
| `upstream/element-web/` | 只读上游：Matrix 参考实现，tag **v1.12.27**（6dffa50580, 2026-09-01） | 是 |
| `upstream/hermes-agent/` | 只读上游：Python agent 运行时，tag **v2026.9.14** = release v0.21.3（345cd2b057, 2026-09-14） | 是 |
| `docs/` | 工作区文档（superpowers specs/plans/notes + 公众号稿） | 否 |
| `.claude/ .agents/ .zcode/ .superpowers/` | 各 agent 工具配置/plans 目录 | — |
| `node_modules/`（顶层） | 空占位；overlay/node_modules 是指向上游的 symlink | — |

## 2. overlay 构建系统（package.json scripts）

- `inject` → node scripts/inject.mjs：应用 B 类 patch + symlink + 生成 vite.config.overlay.ts
- `clean` → inject.mjs --clean：逆序 reverse patch、移除 symlink、还原非 patch 产物
- `verify` → verify-clean.mjs：校验上游工作树干净
- `sync` → sync-upstream.sh：clean → gh release 最新 tag（fallback git describe origin/main）→ detached checkout + git clean -fdx → re-inject → npm install
- `ensure-injected` → ensure-injected.mjs：幂等前置钩子（predev/prebuild），manifest 或 cockpit 路由检测
- `build` → vite build --config vite.config.overlay.ts（仅 client bundle）
- `dev` → cross-env HERMES_WEB_UI_BACKEND_PORT=8647 vite --port 8649 --strictPort
- `test` → vitest run
- `build:full` → build.mjs：openapi:generate → vite build → server tsc → build-server
- `build:dmg[:mac|:win|:linux]` → build-dmg.mjs 五步：inject → build:full → desktop npm ci → build:main（desktop tsc）→ electron-builder --publish never
- engines.node >= 23.0.0

## 3. scripts/ 全量（14 文件）

inject.mjs（patch 应用/还原+symlink+vite config 生成+manifest）/ ensure-injected.mjs / verify-clean.mjs / sync-upstream.sh / build.mjs / build-dmg.mjs / serve-server.sh（TS_NODE_PROJECT 修正 + PORT 默认 8647，cwd=upstream/hermes-studio）/ add-i18n-keys.mjs / add-matrixchat-i18n.mjs / graph-migrate.mjs（薄壳委托 vite-node）/ graph-migrate-cli.ts（dry-run 默认，--apply 落库 .loop/graph-specs.json）/ graph-shadow-report.mjs（shadow 双跑对齐率）/ loop-migrate.mjs（LocalStore→MatrixStore）/ loop-migrate-saas.mjs（MatrixStore→SaaSStore PG）

## 4. 注入机制细节（inject.mjs）

- patch 路由（:53-74，clean 侧 :104-123）：patch 文本首个 `---/+++ a|b/<path>` 前缀匹配——`hermes_cli/ plugins/ agent/ apps/ assets/ acp_ gateway/ tests/gateway/ tests/hermes_cli/` → **hermes-agent**；其余 → hermes-studio。hermes-agent patch 失败 warn+continue（:80-86），hermes-studio 失败 exit 1
- series 文件：每行一个 patch 文件名按序应用，`#` 注释禁用（:32-39）；420 行 = 启用 219-220 + 禁用 30-34 + 段注 118 + 空行
- manifest `.overlay-injected.json`：{appliedPatches, generatedAt}（:369-377）；clean 优先读 manifest 否则 fallback series（:381-383）
- symlink 两条：`overlay/node_modules → upstream/hermes-studio/node_modules`（:222-245）；`upstream/.../server/src/custom → overlay/custom/server`（:247-279，因 server 用相对路径 import，tsc/esbuild 不吃 vite alias）
- vite.config.overlay.ts 生成（inject.mjs:139-220）：mergeConfig 上游，root 指向上游 packages/client 绝对路径；alias 数组顺序敏感：`/src/main.ts`→registries/client/entry.mts（:26）、`@/custom`+`@custom`→custom/client（:27-28）、`@registries`→registries（:29）、`@`兜底→上游 client/src（:31）；build.outDir=上游 dist/client；dev proxy `/agent-health`→127.0.0.1:8650/health 并从 ~/.hermes/.env 读 API_SERVER_KEY 注入 Bearer（:190-213）
- 脏树门禁（:319-350）+ restoreNonPatchArtifacts（:281-311）

## 5. 端口与运行形态

8647 后端 Koa（serve-server.sh:9）/ 8649 vite dev strictPort / 8648 上游 start / 8650 agent health 代理。Electron 壳 = upstream/hermes-studio/packages/desktop/（src/main 30+ 模块：entry/index/app-lifecycle/webui-server/webui-port/runtime-manager/updater/hermes-cli/linux-sandbox；src/preload；electron-builder.yml；release/ 产物目录）。

## 6. 构建发布链路

build-dmg.mjs 产物落 `upstream/hermes-studio/packages/desktop/release/`（mac: dmg+zip；win: zip）。RELEASE-NOTES.md（102KB）结构：`## 版本` 倒序每版一行摘要（`SwarmStudio **2.23**（基于 hermes-studio v0.7.21 + hermes-agent v0.21.3 …）`）+ `>` 引用块四段式详情（升级面/patch regen/门禁/产物 sha256）+ `### X.Y 明细` + `## 历史版本`。release-notes-1.1..2.2.md 为早期单版文件（12 个），2.1 后主写汇总文件。上传 GitHub/ModelScope 按用户指令（--publish never）。

## 7. upstream/hermes-studio 目录地图

- `packages/client/` Vue web UI：src/{api,views,components,stores(Pinia),router,composables,i18n(locales 10+ 语言 ts),styles,shared,types,utils,constants,data,assets,main.ts,App.vue}；public/；index.html
- `packages/server/` Koa：src/{bootstrap(http 启动),modules(coding-agents/ekko/hermes/studio 四大业务域),custom(→overlay symlink 注入位),assets,index.ts}
- `packages/desktop/` Electron 壳（见 §5）
- `packages/ekko-agent/`、`packages/esp32-c3/`（MCU 固件）、`packages/skills/`
- 顶层：scripts/（build-server.mjs/generate-openapi.mjs/desktop-dev.mjs）、dist/、tests/、docs/、vite.config.ts、vitest.config.ts、playwright.config.ts、docker-compose.yml/Dockerfile、bin/

## 8. docs/superpowers/ 文档清单

specs/ 33 篇（kanban 高级特性/Matrix 账号集成/**2026-06-21-overlay-architecture-design.md 奠基文档**/cockpit 技术债 batch0-4/cockpit 各子系统设计/loop-engineering/framework-gates/hermes-agent 019-020 迁移等）；plans/ 36 篇（与 specs 对应的实施版，含 swarm-studio-cockpit-p1..p6、hermes-studio-0646-upgrade）；notes/ 1 篇（run-trace-view 部署手记）。overlay 仓内另有 overlay/docs/superpowers/{specs 39,plans} 并存有分叉（近期落 overlay 侧）+ 5 篇 docs-*.md 散稿。

## 结构事实速查表

| 项 | 值 |
|---|---|
| overlay 版本 | 0.7.21-overlay-2.23（package.json:3） |
| 三 upstream | hermes-studio v0.7.21 / element-web v1.12.27 / hermes-agent v0.21.3 |
| desktop 捆绑 runtime | pin 0.21.0（patch 207） |
| 端口 | 8647 后端 / 8649 vite / 8650 agent health / 8648 上游 start |
| 构建输出 | client→upstream dist/client；server→dist/server |
| 注入 manifest | overlay/.overlay-injected.json |
| symlink | node_modules→上游；server/src/custom→overlay/custom/server |
| vite alias 链 | /src/main.ts→entry.mts；@/custom+@custom→custom/client；@registries→registries；@→上游 client/src |
| patch 路由 | hermes_cli/ plugins/ agent/ apps/ assets/ acp_ gateway/ tests/gateway/ tests/hermes_cli/ → hermes-agent |
