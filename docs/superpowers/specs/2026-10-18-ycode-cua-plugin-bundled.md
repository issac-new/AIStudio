# computer-use 插件打包内置进 Ycode 引擎

日期：2026-10-18 ｜ 状态：实施中 ｜ 分支：`feat/ycode-cua-plugin-bundled`

## 主旨三句话

- 唯一主旨：把官方 computer-use 插件（skill+引导脚本+清单）作为**载荷包内置进 Ycode 引擎 fork**（upstream/zcode），CLI 启动 seed 进官方插件缓存并**默认启用**——不依赖市场安装/本机 ZCode 应用的缓存状态。
- 受众及所需：SwarmStudio IDE 用户（用户本人）——任何机器上装 Ycode 即有电脑操作能力（配合上一轮 /api/ide/computer-use 开关）。
- 读完促成什么动作：验收=干净插件缓存下引擎会话可见 computer-use 技能且插件默认启用。

## 事实锚点（探查实证）

- 上游原生 seed 机制：`apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts`（filesystem seed：candidateBaseDirs×rootCandidates 找 `.zcode-plugin/plugin.json`，按白名单收文件，原子写入 `<plugins storage>/cache/zcode-plugins-official/<name>/<version>/`）；定义表 `official-plugin-definitions.ts:378` **已有 computer-use 条目**（version 0.6.4，rootCandidates `packages/zcode-cua-plugin` 等，requiredSeedPaths=docs/scripts/skills）——但**仓库缺载荷包** `packages/zcode-cua-plugin/`（PAID 探查确认 absent），seed 落空。
- 默认启用名单双源机械对照：`official-plugin-definitions.ts` 的 defaultEnabled 字段 ↔ `packages/shared/src/plugin-marketplaces.ts` DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS，`apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts:46` 断言两侧集合相等。上游产品决策=computer-use 默认关（携带 Helper 依赖）。
- 本 fork 003/004（zcode-patches）已把 CUA 运行时活体化：进程内 node-backend（mac=JXA+screencapture），**无原生 Helper/sharp/koffi 依赖**——上游「默认关」的两个理由（MCP 工具集首启注入+拉 Helper）在本 fork 不成立其一（无 Helper），工具集注入即本产品诉求。
- 插件运行时载荷（0.6.4 官方缓存实测）：`skills/computer-use/SKILL.md`（14K）+ `scripts/computer-use-client.mjs`（57K，bridge 注入式，**不 import node_modules**）+ `docs/computer-use.md` + `.zcode-plugin/plugin.json`（name/version/license MIT/skills 声明）。18M node_modules（sharp/koffi）仅独立 CLI 直调路径需要，本 fork 不入载荷。

## 方案（zcode-patches/006）

1. **新载荷包** `packages/zcode-cua-plugin/`：.zcode-plugin/plugin.json、skills/computer-use/SKILL.md、scripts/computer-use-client.mjs、docs/computer-use.md、package.json——逐字拷贝官方缓存 0.6.4（MIT，作者 Z.ai 保留）；不带 node_modules。
2. **定义表**：computer-use 条目加 `defaultEnabled: true`（fork 理由注释：003/004 活体链无 Helper；SwarmStudio 开箱即用；可经插件开关/setPluginEnabled 关闭；ZCODE_CUA_DISABLE=1 仍 fail-closed）。
3. **shared 名单**：DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS 加 `computer-use@zcode-plugins-official`（保机械对照测试绿）。
4. series 登记 006；inject 应用到 upstream/zcode。
5. IDE 侧无需改动：插件 id 不变（computer-use@zcode-plugins-official），上轮端点/开关直接消费 seed 出的插件。

## 决策记录

- D-1：走上游原生 seed 定义表补载荷，不自造注册钩子。理由=定义表本就含 computer-use 条目，缺的只是载荷包；机制全链（缓存 seed/启停/技能装载/UI）零新代码面。
- D-2：载荷不含 node_modules。理由=skill 脚本走宿主 bridge（不 import 依赖树）；fork 003 node-backend 用系统通道（screencapture/JXA），sharp/koffi 仅官方独立路径需要；18M 二进制也进不了文本补丁。
- D-3：fork 级默认启用（上游默认关）。理由=上游默认关的两个依据之一（Helper 拉起成本）在本 fork 不存在；「打包集成」的产品语义=开箱即用；用户仍可关（开关/设置/ZCODE_CUA_DISABLE）。
- D-4：版本号随上游 0.6.4（不 fork 自定版本）。理由=seed 以 version 定缓存目录，同版本在已装机器上与本机已有缓存一致、零扰动；升级随上游 producer。
- D-5：引擎重建（dist）与运行引擎重启不在本补丁内——属部署动作（且记忆在案：引擎 pnpm store 指旧盘的环境债）。补丁落地=源码态就绪；重建/重启为激活步骤，如实记档。

## 验收

- [ ] upstream/zcode 上 `git apply` 006 干净（clean 树回放 RC=0）
- [ ] bootstrap 侧既有测试（plugins.test.ts 机械对照）在补丁态绿（可跑则跑，pnpm 环境受阻则记档）
- [ ] overlay 全量 vitest 零回归（本补丁不触 overlay custom，跑全量兜底）
- [ ] 空缓存机器验证留待引擎重建后（记档，不在本轮假装已验）
