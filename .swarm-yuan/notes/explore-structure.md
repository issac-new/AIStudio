# overlay 仓「结构与构建」探查报告（路A · 2026-10-16 全量重生成轮）

仓库：/Users/cuishi/lab/ncwk/overlay，git main @ b38044db（2026-10-16）。overlay-fork：最终应用 = 只读上游 ../upstream/hermes-studio（检出 v0.7.35）+ patches 注入 + custom/ 自有代码。

## 1. 顶层目录

| 条目 | 用途 |
|---|---|
| patches/ | B 类补丁主库（studio+agent 双目标路由），series 770 行（有效 359），_skip/ 与 _skip-0735/ 归档 |
| zcode-patches/ | 第三上游 upstream/zcode 补丁（5 文件 series 有效 4） |
| custom/ | A 类纯新增：client（16 域）/server（90+ 域实测 127 模块）/desktop/qgate/hermes-agent-plugins/upstream-compat/__tests__ |
| registries/ | client entry shim：registries/client/entry.mts 被重定向为 /src/main.ts 入口（复制上游启动序列+A 类注册） |
| scripts/ | 56 项工具脚本：inject/serve/build/verify/regression/walkthrough 族、githooks/pre-commit、runtime/ 子目录 |
| runtime/ | 受管外部运行时镜像（semantica v0.7.0 MCP、pua @e6e6cd2 12 技能、pricing/roster），runtime-manifest.json 同步 ~/.hermes/hermes-agent；模板必须入库（D3 事故实锤） |
| config/ | bootstrap.ts / features.ts / loop-config.ts（路径与特性配置单一事实源） |
| vite.config.overlay.ts | inject 生成、已 gitignore、勿手改（改 inject.mjs） |
| vitest.config.ts | overlay 测试权威配置（手写入库） |
| tsconfig.json | 极简 ESNext/bundler/strict:false/noEmit（仅类型工具用，实编译走上游 tsconfig） |
| packages/、tests/ | inject 生成的上游派生件（gitignore 声明） |
| node_modules | 符号链 → ../upstream/hermes-studio/node_modules（依赖借用单一事实源） |
| RELEASE-NOTES.md（148KB）+ release-notes-1.1~2.2.md | 发布说明族 |
| docs/（30 项）、spec/、evidence/、assets/ | 文档/规格/证据 |
| docker-compose.yml | 沙箱编排占位（注释明示未经验证不得宣称可 up） |
| .overlay-injected.json | inject 状态 manifest（生成物；实录 appliedPatches 359 / appliedZcodePatches 4 / generatedAt 2026-10-15T07:21:14Z） |
| .github/workflows/qgate.yml | 唯一 CI |
| .archived-patches/、.qgate/、.swarm-yuan/、patches-v0.7.35-fixes/（空）、docs-cockpit-*.md | 归档/门禁/生成轮工作区/设计稿 |

## 2. package.json

name=hermes-overlay；version=0.7.30-overlay-2.38（package-lock 滞后一版 0.7.29-overlay-2.37）；private；type=module；engines node>=23.0.0；**dependencies/devDependencies 均为空**（//deps-borrow 注释：依赖单一事实源=上游 package.json devDependencies，symbol-grounding.yaml 机器核验）。借用基线：vite ^8.0.4 / vitest ^3.2.4 / vue ^3.5.32 / pinia ^3.0.4 / vue-router ^4.6.4 / typescript ~6.0.2 / vue-tsc ^3.2.8 / ts-node ^10.9.2 / @vitejs/plugin-vue ^6.0.5 / naive-ui ^2.44.1 / vue-i18n ^11.3.2 / jsdom ^27.0.1 / esbuild ^0.27.0 / @playwright/test ^1.63.0 / monaco-editor ^0.55.1 / @xterm/xterm ^6.0.0。

scripts 全表：inject（inject.mjs 补丁注入+派生 vite config+链接 custom/server）/ clean（--clean 反向还原；8647 在听拒执行，OVERLAY_ALLOW_LIVE_CLEAN=1 豁免）/ serve（serve-server.mjs ts-node 拉上游后端 PORT=8647）/ verify（verify-clean.mjs 上游纯净态）/ sync（sync-upstream.sh）/ ensure-injected（幂等差量补套）/ build（vite build 纯 client）/ prebuild+predev（先 ensure-injected）/ dev（HERMES_WEB_UI_BACKEND_PORT=8647 vite --port 8649 --strictPort）/ dev:lan（+--host，devAutoLogin admin/123456 仅限可信局域网）/ test（vitest run）/ test:eval（eval 回归单文件）/ bench:expert / build:full（build.mjs 全链）/ build:dmg|:mac|:win|:linux（electron-builder）/ catalog-check+zcode:ensure+zcode:serve（zcode 引擎面）/ runtime:doctor|:vendor-pua|:register / postbuild（verify-dist.mjs 产物完整性门禁）。

## 3. 构建系统

- 配置三件：vite.config.overlay.ts（生成物）、vitest.config.ts（手写）、tsconfig.json（极简）。无独立 rollup/electron-builder 配置（后者在上游 packages/desktop）。
- vite.config.overlay.ts：mergeConfig 上游 vite.config 后覆盖——root/outDir 钉绝对路径（outDir=upstream/hermes-studio/dist/client，desktop 构建读此目录）；alias 数组顺序敏感：pinia/vue/@vue/runtime-core/vue-router 裸包名钉上游单实例（双实例白屏根治）→ /src/main.ts→overlay/registries/client/entry.mts → @/custom|@custom→custom/client → @ 兜底上游 src；inlineDynamicImports:true（单 chunk，规避 rolldown+echarts 跨 chunk 漏 import）；server.fs.allow 双根；server.proxy：/api /v1 /health /upload /socket.io 补 xfwd:true →8647，/agent-health→127.0.0.1:8650（rewrite+从 ~/.hermes/.env 读 API_SERVER_KEY 注 Bearer）；vite:vue 注入 node:fs 适配器（typescript 7.x 预览版 compiler-sfc ts.sys 探测失效适配）。
- build:full 顺序：上游 generate-openapi.mjs → vite(overlay config) → tsc --noEmit -p packages/server/tsconfig.json → 上游 build-server.mjs → 拷 runtime/{pricing,roster} → dist/server/runtime/ → 拷 semantica-bridge.py → verify-dist.mjs 门禁（index.html 缺失/<200B/assets 无 JS 即硬失败）。

## 4. patch 注入体系

- patches/ 409 .patch 文件；series 有效 359；manifest 对齐（appliedPatches 359/appliedZcodePatches 4）。
- 命名：NNN-域-描述.patch 三位零填充（000 起，当前最大 620+）；域段 client-/server-/test-/cockpit-/desktop-rebrand- 等。
- inject.mjs 机制：①按 series 顺序 git apply --whitespace=nowarn（win32 加 --ignore-whitespace）②目标路由：解析 patch 首个 ---/+++ 目标路径，命中 HERMES_AGENT_PATCH_PREFIXES（hermes_cli/ plugins/ agent/ apps/ assets/ gateway/ tools/ model_tools.py toolsets.py 等）路由到 upstream/hermes-agent，否则 hermes-studio；agent/zcode 目标失败容错跳过，studio 失败 exit 1 ③符号链 custom/server→上游 packages/server/src/custom ④生成 vite.config.overlay.ts（路径 JSON.stringify 转义防 Windows 反斜杠）⑤写 manifest；--clean 反序 git apply --reverse+untracked 清理，不触上游 .git ⑥OVERLAY_UPSTREAM_ROOT 支持隔离注入副本；clean 前探测 8647 拒绝带服清理。
- ensure-injected.mjs：manifest 在而 series 领先时自动补套差量。

## 5. 测试体系

vitest ^3.2.4（借上游）；vitest.config.ts：include ['custom/**/*.test.ts']（只跑 overlay）；setupFiles custom/client/test/setup.ts（stub ResizeObserver/localStorage）；environment 按文件 // @vitest-environment jsdom；alias 与构建 config 手工同步；define __APP_VERSION__='test'；OVERLAY_UPSTREAM_ROOT 隔离树。
测试文件 628：client 292 / server 307 / qgate 19 / __tests__ 5 / desktop 4 / upstream-compat 1。运行 npm run test；历史基线 534 文件 3847 过/1 skip（2026-10-13 记档）。另有 scripts/regression/ 16 个 ux/api/pixel 探针 + custom/qgate 独立包（自带 tsconfig+vitest，CI 单独跑）。

## 6. 端口（实证）

前端 dev 8649（--strictPort）；后端 8647（serve-server.mjs，TS_NODE_PROJECT=packages/server/tsconfig.json TS_NODE_FILES=1）；代理 8649→/api /v1 /health /upload /socket.io→8647（xfwd）+/agent-health→8650；上游 start 8648；desktop webui livez 8748；dev:lan 全网卡 8649。

## 7. 产物与发布

- web 产物：upstream/hermes-studio/dist/client + dist/server。
- 桌面产物：upstream/hermes-studio/packages/desktop/release/。流程：inject --clean→硬还原→inject→build:full→desktop npm ci+build:main(tsc)→根 node_modules npm prune --omit=dev（防 14GB 巨包）→electron-builder（mac --mac --publish never -c.mac.identity=null ad-hoc 无签名，本机证书已吊销；win --win --x64；linux --linux）。
- 产物类型：mac arm64 DMG + win x64 zip 双 canonical（命名 SwarmStudio-<上游版本>-mac-arm64.dmg / -win-x64.zip，附 sha256），GitHub Release+ModelScope 双通道；nsis -86 bad CPU type 为在案惯例非交付物。
- RELEASE-NOTES 态：最新已发 2.37（hermes-studio v0.7.29+agent v0.21.5，dmg 384.0MB/zip 412.3MB，2026-10-04）；2.38 进行中；上游检出实为 v0.7.35（0.7.35 升级轮已启动）；desktop 捆绑 hermes runtime pin 0.21.5。
- 同版本号覆盖缓存陷阱：发版须递增版本号并删 ~/.hermes-web-ui/webui/<version>/（README:631-637）。

## 8. CI/CD

唯一 .github/workflows/qgate.yml：触发 push/PR 且路径限 custom/qgate/**；ubuntu-latest+node 24；working-directory custom/qgate 内 npm install && npx tsc && npx vitest run。注释明示：overlay 全量依赖本地注入态 upstream 树 CI 不可复现，故只跑 qgate。无发布自动化（发版本机手工）。

## 9. 环境要求

node>=23（CI 24；无 .nvmrc）；desktop 捆绑 python pin 3.12.13（fetch-python.mjs:33 PBS_PY）；runtime/ 面依赖 HERMES_BIN 指向 python；布局硬约定 ../upstream/{hermes-studio,hermes-agent,zcode} 三兄弟目录；OVERLAY_UPSTREAM_ROOT 可重定向。
