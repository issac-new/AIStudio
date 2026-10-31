# hermes-studio 基线升级 v0.7.39 → v0.8.0（2026-10-31）

日期：2026-10-31
状态：in-progress（基线提交 → 补丁重放 → 冲突修复 → 全量验证 → 收口）
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
- 补丁重放：`node scripts/inject.mjs` rc=0 且零「patch 失败」告警；`npm run clean && npm run inject` 二次重放幂等。
- 全量：`npm test`、`npm run typecheck:harness`、`npm run build:full`。
- 兼容面：Node>=23 不变、依赖仅 node-edge-tts patch 级、person schema 全 CREATE-IF-NOT-EXISTS 自增（v0.7.39 无 person 表，DROP 分支不可达）。
- （收口时如实补记：失败补丁清单与各自处置、任何跳过项及其登记）

## 设计文档影响

DESIGN_SYNC: none（基线提交阶段）——本提交仅 vendor/hermes-studio pristine 换血与 spec 本身；VENDOR.md / 数字总账 §C / 组件台账欠账销项三处修订随收口批与验证结果同批兑现（届时本 spec 改 touched 并落同批，避免声明先于兑现）。
