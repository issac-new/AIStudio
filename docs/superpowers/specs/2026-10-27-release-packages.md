# 四模块源码包发布形态：4+1 打包与 Ycode 底座版本（2026-10-27）

分支：`fix/core-coding-chain-v2`

## 变更

用户修订两项发布裁定（2026-10-27）：

1. **Ycode 以 zcode 底座版本为基线版本**：manifest `ycode.version` 由基线 commit（3c5b2276）改为 `vendor/zcode/package.json` 的 `version` 字段（**3.16.2**，JSON 真源 `carrierFormat: json:version`）；基线 commit 移入 `baselineCommit` 字段（series 头可反查），活跃补丁计数（8）照旧对账。
2. **发布=4 个独立源码包＋1 份整体包，均含无法经 pip/npm 安装的第三方依赖源码**：
   - `npm run release:packages`（`scripts/make-release-packages.mjs`）：按各模块 `packageIncludes` 逐条 `git archive --format=tar.gz HEAD -- <paths>`，整体包=全仓 HEAD；产物＋`SHA256SUMS` 落 `dist/release/`。
   - git archive 只取跟踪文件——node_modules/dist/runs 等产物天然不入包（.gitignore 立法生效），"源码"语义由 git 跟踪面定义。
   - 依赖策略（manifest `packaging.depSourcePolicy`）：vendor/ 三树（hermes-studio/hermes-agent/zcode）为无法经 pip/npm 安装的上游源码，随所属模块整树入包；可经 pip/npm 在线安装的依赖不随包，安装时解析——整体包可仅凭源码＋pip＋npm 完成本项目安装与测试。

## 打包产物（2026-10-27 09:4x 实跑，基线=本批提交 HEAD）

| 包 | 体积 | 内容 |
|---|---|---|
| aistudio-cockpit-2.37-src.tar.gz | 36.7MB | 仓级基建（package.json/scripts/config）＋custom/patches/registries＋simharness＋vendor/hermes-studio 源码 |
| aistudio-agent-teams-3.3.0-src.tar.gz | 108.2MB | team/＋runtime/＋runtime-manifest＋vendor/hermes-agent 源码 |
| aistudio-ycode-3.16.2-src.tar.gz | 89.0MB | vendor/zcode 源码＋zcode-patches（002-009） |
| aistudio-yuan-skill-2.95.0-src.tar.gz | 10.3MB | skills/swarm-yuan/ 全目录 |
| aistudio-full-1.0.0-overlay-src.tar.gz | 257.5MB | 全仓跟踪源码（4 模块＋仓级基建） |

校验和见 `dist/release/SHA256SUMS`（构建时生成，产物目录不入库）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | Ycode 版本=vendor/zcode/package.json version 字段 | 用户裁定"以底座版本为基线版本"；JSON 字段机器可读、随上游同步自然更新 | 基线 commit 代版本（前裁定，用户修订废弃） | 是 |
| D2 | 打包=git archive HEAD pathspec | 跟踪面即源码面（.gitignore 已立法产物不入库）；与提交字节对齐可复现 | rsync＋排除表（否决：排除规则双源、易漏） | 是 |
| D3 | registry 依赖不随包 | 用户口径"仅凭源码及 pip/npm 完成安装测试"——可在线装的不重复发 | 全离线（yuan 包已有三档位另通道，整体包不效仿） | 是 |
| D4 | cockpit 独立包含仓级基建＋patches 全集 | inject/build 脚本在仓根；series 混路由 agent 补丁——独立包 standalone inject 需搭配 agent-teams 包，notes 如实注记 | 给 cockpit 配 agent patch 子集 series（否决：series 双源漂移） | 是 |
| D5 | 产物落 dist/release/（gitignore /dist/ 已覆盖） | 中间产物不入库（仓规）；发布渠道上传时取该目录 | 产物入库（否决：违 2026-10-24 立法） | 是 |

## 设计文档影响

DESIGN_SYNC: none —— 发布视角裁定落在 RELEASE-MANIFEST.json（机器真源）＋README 入口行；整合正本不承载发布物清单细节（数字总账口径亦不含产物体积）。

## 验证

- `npm run release:check` → ✓ 全绿（ycode=3.16.2 按 JSON 真源对账、packaging 节、packageIncludes 路径实在）。
- `npx vitest run scripts/__tests__/verify-release-manifest.test.ts` → 14/14（新增：packaging 节、packageIncludes 防幻影、ycode JSON 版本、基线 commit 反查、四模块 pathspec git archive 干跑）。
- `npm run release:packages` 实跑 → 5 包＋SHA256SUMS 全出（体积见上表；首轮 SHA256SUMS 首写笔误 ENOENT，修复后复跑收绿）。
- 提交后以新 HEAD 重打包对齐（产物与提交同基线，校验和以最终构建为准）。
- 未验证项：从整体包解包→npm install→pip install→inject→测试的完整安装验证（挂账：建议发布前在干净环境跑一次，口令=解包 full 包后按 README 四步）。

## 挂账

- 整体包干净环境安装测试（见验证）。
- cockpit standalone inject 的 series 混路由问题（D4 注记；若要彻底独立，需 series 按 target-root 拆分——独立立项）。
