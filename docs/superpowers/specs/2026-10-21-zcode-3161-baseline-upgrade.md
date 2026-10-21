# zcode 源码底座 3.15.1 → 3.16.1 迁移基线升级（2026-10-21）

> 用户指令：上游 zcode 已升级到最新版（取 main 分支），同步更新本机「IDE 工作区底层代码的迁移基线」。
> 本文是本轮升级的正本记录：基线、差异、补丁裁决、锚点核对与验证证据。历史版本分析见
> `docs/upstream-analysis/2026-10-18/zcode-3151.md` 与 `2026-10-18-zcode-3.15.3-delta.md`（已标注为历史快照）。

## 0. 结论

| 对象 | 升级前 | 升级后 | 证据 |
|---|---|---|---|
| `upstream/zcode` 源码基线 | v3.15.1（`aac47556`，公开 tag） | **origin/main `0a1fc56`（package 3.16.1，2026-10-19 `chore: sync ZCode source`）** | `git -C upstream/zcode log -1`；`package.json:3` |
| 本机安装版 ZCode.app | 3.15.3（build 8237） | **3.16.2（build 8769）** | `Info.plist` CFBundleShortVersionString/CFBundleVersion |
| 安装版词条快照 | 3.14.0：6120 键 / 93 ns | **3.16.2：6985 键 / 101 ns**（`docs/superpowers/notes/zcode-3162/`） | `npm run catalog-check` |
| zcode 补丁链 | 7 条（001–007） | **7 条（001 退役；002/006 重生成；003/004/005/007 原样；新增 008）** | `zcode-patches/series`；纯净树整套重放 |
| IDE 工作区行为 | — | **无需行为改动**：锚点文件除 Composer 标签动画外零语义变化 | `git diff v3.15.1 origin/main -- <锚点>` |

关键事实：**公开 tag 仍停在 v3.15.1**（`git tag -l` 只有 v3.14.3/v3.15.1）。3.16.1 只存在于
`origin/main` 的 source-sync 提交，3.16.2 是未公开源码的安装版构建。因此本轮基线口径是
「源码 = main 分支 3.16.1；安装版事实源 = 3.16.2」，不把 3.16.1 改名冒充 3.16.2。

## 1. 源码差异（v3.15.1 → origin/main 0a1fc56）

- 规模：`git diff --stat v3.15.1 origin/main` = **4502 files, +356395 / −121976**。
- V4 协议：**新增 7 个方法、零删除**——`v4/conversation/offPeakControl`、`v4/create-workflow-display`、
  `v4/offPeak/lifecycle`、`v4/plugin-ui/tool-result`、`v4/sessions-index`、`v4/sessionsIndex/reconcile`、
  `v4/workflow-runs`。既有方法签名未变，属偏斜安全的增量。
- UI i18n（源码 `packages/ui/src/i18n/locales/zh-CN.ts`）：6362 → **6973 键（+716 / −105）**。
  新增主力族：`archives`、`remote`（远程工作区）、`settings.source`、`conversationShare`、
  `automations`、`offPeak`、`project`、`resourceManager`、`settingsSync`。
- CUA：`packages/zcode-cua` 由 0.6.3 占位升到 **0.6.5**；**上游首次自带插件载荷**
  `apps/zcode-cli/packages/zcode-cua-plugin/`（0.6.5，Apache-2.0，skill/docs/client 与 0.6.4 缓存逐字节相同）。
- Composer 模式控件：`V4ComposerModeControls.tsx` 仅改「标签翻滚动画 + test-ids import 路径」，语义不变。
- 其余 IDE 锚点文件（`interfaceMode.ts`、`zcode-agent-model-state.ts`、`gen-ui/domain/references.ts`、
  `shortcutCommands.ts`、`node-repl-host/src/server.ts`）在 3.15.1→3.16.1 均 **零 diff**。

## 2. 安装版差异（ZCode.app 3.16.2 vs 源码 3.16.1）

- 词条：源码 6973 键 vs 安装版 **6985 键**。安装版独有 17 键，集中在
  `sidePane.fullView.*`（全屏侧栏族）与验证码/供应商业务错误 3007；
  源码独有 5 键，集中在 `taskList.openInSplitPane` / `v4Pane.split*`（分屏族）。
  说明 3.16.2 把「分屏」重构为「全屏侧栏」并新增验证码/计费提示，**源码未公开这部分**。
- 解释：安装版比公开源码新一个补丁版；IDE 侧以安装版词条快照为功能面事实源（catalog-check），
  以源码为引擎/协议事实源。两者差异必须显式记账，不能用其中一方冒充另一方。

## 3. 补丁迁移裁决（`overlay/zcode-patches`）

| 补丁 | 裁决 | 理由 |
|---|---|---|
| 001 server-cli yazl external | **退役（从 series 注释掉，文件留档）** | 3.16.1 的 `tsup.config.ts` 已原生把 `yazl` 列入 external，并带 ESM `require("fs")` 崩溃原因注释；补丁语义被上游吸收，继续应用会冲突。 |
| 002 importSession RPC | **重生成** | 上游仍无 `v4/session/import`；方法体/schema/migrationSource 扩展原样保留，仅重锚到新文件位置（行号 176 / 6383 / 353 / 732）。 |
| 003 CUA live | 原样 | 目标文件 3.15.1→3.16.1 零 diff，纯净树干净应用。 |
| 004 node-repl fallback | 原样 | `node-repl-host/src/server.ts` 零 diff。 |
| 005 hold_key | 原样 | 依赖 003，按序干净应用。 |
| 006 CUA bundled | **缩面重生成** | 3.16.1 上游已自带 0.6.5 载荷，006 不再补包（删除旧 `packages/zcode-cua-plugin` 副本）；只保留 fork 产品决策：`defaultEnabled: true` + 两份默认名单同步 + 机械对照测试翻转。 |
| 007 CUA official host protocol | 原样 | `node-repl-host` 协议 3.16.1 未变（host 源码零 diff）。 |
| 008 broker unavailable error code | **新增** | 3.16.1 上游新增 placeholder 测试，要求 broker 不可达时抛 `code=unavailable`；fork 活体 broker 原先直接漏出 errno。008 统一包成 `BrokerError(code=unavailable)`，`details.cause` 保留原始 errno。 |

验证：在 `origin/main` 的**纯净临时 worktree** 上按 002→008 顺序用 `git apply`（**无 3-way**）
整套重放，7/7 全部干净应用；001 不在 series 中。

## 4. IDE 工作区锚点核对

- 6 处代码注释的上游锚版本已从 v3.15.1 更新为 **v3.16.1**，并注明「零 diff / 仅动画」：
  `custom/client/ide/utils/zcodeModes.ts`、`utils/interface-mode.ts`、`utils/genui.ts`、
  `components/IdePermissionSwitcher.vue`、`views/IdeChatPane.vue`、`__tests__/zcode-modes.test.ts`。
- 结论：**本轮不需要改 IDE 行为代码**；协议新增方法均为增量，模式/权限/Gen UI/界面模式语义未变。
- `engine-models.ts` 的「取 runtime/provider 最大版本清单」逻辑无需改：安装版 3.16.2 的
  `~/.zcode/v2/runtime/provider` 目录仍按版本号发现，新增版本自动选中。

## 5. 验证证据

```text
# 源码基线
git -C upstream/zcode merge --ff-only origin/main   => 0a1fc56 / package 3.16.1
git -C upstream/zcode status                        => clean（升级后、注入前）

# 依赖与构建
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile   => Done（1m29s）
pnpm -r --filter "./packages/*" --filter "!@zcode/desktop" build => 通过（含 web）
pnpm --filter @zcode/server run build                            => tsup + remote 通过
apps/zcode-cli: ../../node_modules/.bin/turbo run build          => 24/24 tasks，CLI dist/zcode.cjs 28.7mb

# 上游守门测试
@zcode/bootstrap  vitest tests/plugins.test.ts  => 45/45（含包/清单/seed 版本对齐）
@zcode/node-repl-host test                      => 51/51
packages/zcode-cua/test                         => 2/2（008 收口后）
overlay 定向 vitest（模式/补丁守门/引擎链/桥/模型 REST） => 30/30

# 安装版词条基线
npm run catalog-check => OK：3.16.2，6985 键 / 101 命名空间（notes/zcode-3162）

# 引擎探活（:3030，重启后）
GET /api/server-info => version 3.16.1, desktopContinuous=true
WS helloConversationV4 => protocolVersion 3
importSessionV4(rows:[]) => fault.importSession.noRows（证明 002 方法已在新引擎注册）
```

## 6. 未验证 / 风险

- **安装版 3.16.2 的源码不可得**：`sidePane.fullView.*`、验证码/3007 等 17 个新键只存在于 asar；
  后续若要把这些能力迁进 IDE，只能按词条与产物行为反推，不能声称「源码已对齐 3.16.2」。
- **公开 tag 缺失**：3.16.1 只有 main 提交，没有 tag/release；下一次升级必须重新 `git fetch`
  并复核 main 是否前移，不能按 tag 判断「最新」。
- **共享 :3030 实例首次探活出现 hello 超时**：同一构建在隔离 HOME/3031 实例握手正常，
  重启 3030 后恢复正常；根因未定位（疑为旧进程状态/遗留 `zcode-cli` 子会话）。
  已记录为引擎生命周期风险，后续若复现需抓取引擎日志与子进程状态。
- **Windows/Linux CUA 路径**仍为代码就位、未真机验证（既有挂账，本轮未改变）。
- 006 载荷现由上游 0.6.5 提供；fork 的 003/004 运行时无 Helper/sharp 依赖，默认启用决策保持不变。

## 7. 下次升级 checklist（源码 main 前移时）

1. `overlay` 只反向 zcode 系列（不要 `npm run clean` 影响并行会话的 studio 注入态）：
   逆序 `git apply -R`，删除 patch 新增的 untracked 文件，`git reset` 清 intent-to-add。
2. `upstream/zcode`：`git merge --ff-only origin/main`，核对 `package.json` 版本与 `git tag -l`。
3. 逐条重放 `zcode-patches/series`；失败项按「上游是否已吸收 → 退役 / 缩面 / 重生成」裁决。
4. 重建：`pnpm install --frozen-lockfile` → packages build → server build → CLI turbo build。
5. 安装版词条基线：`npm run catalog-check -- --refresh`（按本机 ZCode.app 版本生成新 notes 目录），再跑 `npm run catalog-check`。
6. 引擎：重启 :3030，`/api/server-info` + WS hello + `importSessionV4` 探针。
7. 跑上游 bootstrap/node-repl/cua 测试 + overlay 定向 vitest；全绿后更新本文与版本矩阵。

## 8. 决策记录

- **D-1 源码基线取 `origin/main` 提交而非 tag**：公开 tag 仍停在 v3.15.1，3.16.1 只有 main 的
  source-sync 提交。理由=用户明确「取 main 分支」；把 v3.15.1 tag 当成最新会漏掉本轮全部差异。
- **D-2 退役 001**：上游已原生把 yazl 列入 external，补丁语义被吸收。理由=保留会造成冲突与
  「补丁仍必要」的假象；文件留档、series 注释说明退役原因。
- **D-3 006 缩面、不 fork 载荷**：3.16.1 上游自带 0.6.5 载荷，fork 只保留「默认启用」产品决策。
  理由=重复载荷会导致 seed 候选二义、版本/许可证漂移；上游载荷已覆盖 0.6.5 的 skill/client/docs。
- **D-4 008 收口 broker 错误码而不是改上游测试**：上游 3.16.1 新增的 placeholder 测试要求
  `code=unavailable`，这恰好是 fork 活体 broker 应有的 fail-closed 语义。理由=用产品语义满足测试，
  不把测试改成迁就实现。
- **D-5 安装版词条基线独立记账**：源码 3.16.1 与安装版 3.16.2 词条差 17/5 键，3.16.2 的
  `sidePane.fullView.*` 等能力源码未公开。理由=引擎/协议以源码为准，功能面以安装版为准，
  两者差异显式记录，禁止互相冒充。
- **D-6 IDE 行为代码零改动**：锚点文件除 Composer 标签动画外零语义变化，协议新增均为增量。
  理由=没有证据表明需要改行为；本轮只更新注释锚点与基线记录，避免无依据重构。
- **D-7 共享引擎重启**：3030 实例升级后 hello 超时，隔离实例正常，重启后恢复；根因未定位。
  理由=不能把「进程状态问题」误报成协议不兼容；风险与复现条件已记入 §6。
- **D-8 003/004/005/007 保持原样**：目标文件在 3.15.1→3.16.1 零 diff，纯净树整套重放通过。
  理由=无差异不重生成，减少无意义 diff 与审计面。
