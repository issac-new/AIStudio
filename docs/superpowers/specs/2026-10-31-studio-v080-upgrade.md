# hermes-studio 基线升级 v0.7.39 → v0.8.0（2026-10-31）

日期：2026-10-31
状态：implemented（收口：重放零失败、双 tsc 零错、build:full 绿、release:check 四模块对账全绿、全量 vitest 数字见验证节）
触发：上游 2026-10-30 发布 v0.8.0（`f67b587b9`，基线 `8f215f59d` 后 58 提交）；2026-10-31 日常调研轮实测确认并做兼容评估（`2026-10-31-daily-research-absorption.md` §四），用户指示「继续 完成所有」。

## 变更

1. **基线整树替换**：`vendor/hermes-studio` v0.7.39@8f215f59d → v0.8.0@f67b587b9（pristine，3075 文件；上游主线=Person 个人助理 BOT、浏览器工具族、桌面设备窗口隔离、MCU 目录重排 `packages/esp32-*`→`packages/mcu/*`）。
2. **补丁重放与修复**：422 条 series 全量重放；失败补丁按「GNU patch 容错移植 → 对照 pristine 重生成补丁文件 → clean+inject 全重放」流程收敛；补丁 329 的 esp32 品牌段目标随上游迁移改指 `packages/mcu/esp32-*`。修复清单（逐条文件/原因）见「验证」节实记。
3. **伴生同步**：`vendor/VENDOR.md` 基线表、RELEASE-MANIFEST studio 基线字段、`docs/upstream-analysis/component-ledger.md`（如触及）、组件台账 §五欠账销项。
4. **不随批**：驾驶舱模块版本号升 studio.5（发布轮动作）；zcode 3.17.1 同步（独立任务）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 基线 pristine 先独立提交，再补丁重放 | inject 脏树守卫以 HEAD 为净基；先提交使重放可对账（升级流程正本=VENDOR.md） | 基线+补丁混一提交（否决：不可审查、冲突不可归因） | 是 |
| D2 | 失败补丁走「容错移植+文件级重生成」，不逐 hunk 手工硬拼 | 上游大改写文件（chat-run.ts +23KB、locale ±7KB）上下文漂移大；文件级重生成与既有 0.7.39 升级轮先例一致 | 逐 hunk 三方合并（否决：46 条高风险面工作量失控） | 是 |
| D3 | 补丁 329 esp32 段迁移而非退役 | MCU 固件品牌串仍需 SwarmStudio 化（manifest/README/main.cpp）；上游只挪了目录 | 退役 esp32 段（否决：固件恢复出厂品牌） | 是 |
| D4 | v0.8.0 无 BREAKING 标记但按跨 minor 全量验证门收口（npm test/typecheck/build:full） | MCU 路径变更+DB 自增 schema+person 大面注入；宁严勿漏 | 仅目标测试（否决：跨 minor 必须全量） | 是 |
| D5 | 本次不追 v0.8.0 的 Person/浏览器新能力吸收 | 升级轮目标是基线换血+补丁零跳过；新能力按组件台账另立调研线 | 顺手吸收（否决：混批不可审查） | 是 |

## 验证

- 基线替换：`find vendor/hermes-studio -type f | wc -l` = 3075（=pristine）；`packages/mcu` 在位、`packages/esp32-*` 清零。
- 补丁重放（终局，多轮收敛后）：pristine 重铺 → `npm ci --ignore-scripts`（v0.8.0 锁含 node-edge-tts 1.2.12，V2 DRM 导出实测在位）→ `node scripts/inject.mjs` **rc=0、零失败**（44 条失败件全部重生成或退役后全量重放）。
- 失败件处置台账（44＝42 重生成落盘＋2 退役）：150 退役（上游已内置 autoInstallOnAppQuit=false）；517 退役（并入 301 重生成件）；266/197/528/623 四条迁位（266→642 后、197/528/623→studio 序尾，消除 index.ts/http.ts/routes.ts 终态跳变对后继上下文的破坏）；663 退役（通配逃逸 plugin 并入 525 重生成件，build-server 家族按 series 实序 525(plugin)→608(external) 定版）；329 esp32 品牌段迁移 `packages/mcu/esp32-*`（10 文件）；手工语义修复：266 import 行＋ENOENT 错位剔除×7（上游签名重构后五处 catch 落位错误，剔除后由本批重生成件内的正位三处承载）、301 路由名单、017/103 依赖行、042→690 desktop pkg 终态、555 死块删除、ConnectionsPanel 三补丁（524/650/702）相邻重复块归一。
- 守门适配（断言介质迁移，非放宽）：connections-panel-gate/s3-feature-gates 三例由「补丁文本断言」改「注入态树断言」（重生成后补丁内归因可漂移，行为语义以树为准）；两守门实跑 16/16 绿。
- 类型门：`typecheck:harness` 0 错；服务端 `tsc -p packages/server` 0 错（多轮：剔除错位 ENOENT＋node-edge-tts 1.2.12 后达成）。
- 构建：`npm run build:full`（含 openapi 481 端点生成、vite overlay 构建、服务端 tsc、build-server、运行时资产）。派生配置 `vite.config.overlay.ts → .mts`（上游 v0.8.0 配置新增 `import pkg from './package.json'`，CJS 包装下 ESM 语法崩；.mts 强制 ESM，package.json/build.mjs/inject.mjs/.gitignore 四处引用同批替换）。
- 全量：`npm test` = 970 文件 / 7066 用例通过、11 跳过、0 失败（rebase 后终跑，含并行新补丁 717；过程失败均已逐项定性与根治：runtime-verify 探针夹具毫秒竞态改 mkdtemp、absent-tree 派生配置名随 .mts 迁移、release-manifest 三载体随底座升 0.8.0-studio.1、build-server 家族 525/608/663 按 series 实序定版且 663 并入 525 退役）。
- `npm run release:check` 四模块对账全绿（cockpit=0.8.0-studio.1 / agent-teams=v0.22.5-team.4 / ycode=3.16.2 / yuan-skill=v2.98.0）。
- `npm run build:full` 绿（openapi 481 端点、vite overlay 构建、服务端 esbuild＋固件拷贝、verify-dist 完整性门禁全过；fsevents 外置为运行期解析）。
- 兼容面：Node>=23 不变；依赖仅 node-edge-tts ^1.2.11→^1.2.12（V2 DRM API）；person schema 全 CREATE-IF-NOT-EXISTS 自增（v0.7.39 无 person 表，DROP 分支不可达）；上游仓改名 ekko-studio 已随 VENDOR.md 记录。
- 已知取舍：023 原件中一段纯注释（peer-unread Note 两行）因锚漂移未随批保真，属零行为注释，git 历史可考；主线 brand 面新增 231 处 Ekko Studio 字串（v0.8.0 新面）未在本批扫尾——记入组件台账待办，品牌统一轮处理。

## 设计文档影响

DESIGN_SYNC: touched（收口批兑现）

- `vendor/VENDOR.md`：studio 行 v0.8.0@f67b587b9＋升级注记（44 件重生成/2 退役/4 迁位/mcu 品牌迁移）。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§C hermes-studio 基线核实值 v0.8.0；核实日注升级批。
- `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`：§五升级欠账销项＋§八变更日志补行。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（425）。
