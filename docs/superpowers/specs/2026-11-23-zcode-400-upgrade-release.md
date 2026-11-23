# 2026-11-23 Ycode 基线升至 ZCode 4.0.0＋v1.0.20-overlay 发版批

> 状态：实施中。依据用户指令「Zcode 已升级至 4.0（zai-org/zcode），同步完成 AIStudio 的相关升级」，以及方案确认时的裁决「合并后接着发版」。

## 变更

1. **Ycode 源码基线 3.18.2 → 4.0.0**：`vendor/zcode` 由 `fec97590` 换血至上游 main `a4b44451`（＝tag `v4.0.0`，2026-11-23 发布；差量 2209 文件 +149,753/−24,801，因 3.19.x 从未发布源码，本差量含两个版本的全部变更）。经 `npm run vendor:sync -- zcode` 整树替换 pristine 基线，工具链不变（Node ≥24、pnpm 10.33.2）。与 3.19.x 批次不同，本次源码已公开，源码基线与安装版（本机 ZCode.app 4.0.0）合一，不再分账。
2. **Ycode 补丁 11 条在新基线重放**：按 `zcode-patches/series` 全量重放，逐件按实测处置——直放、语义重锚、或上游已原生实现则退役归档。处置结果与依据回填本 spec 验证段。
3. **宿主 RPC 复制面同步**：`custom/server/zcode/vendor/rpc/` 按既有确定性规则（上游原文→仅去相对 import 的 `.js`→逐文件 X3 头注）同步至 `a4b44451`；头注与会话投影的 pin 对齐；会话投影头注补 4.0 新增的可选字段 `hasCompactWork`（X5 白名单按设计不透传）。
4. **词条快照**：按本机 4.0.0 应用重建 `docs/superpowers/notes/zcode-400/`（安装版事实源，与源码基线分属两口径）。
5. **版本载体进位（与升级同批）**：Ycode 模块 `3.18.2`→`4.0.0`；驾驶舱 `0.8.30-studio.1`→`0.8.30-studio.2`（本仓扩展序：Ycode 底座换血＋补丁适配＋宿主 RPC 同步，先例＝0.8.28-studio.3 记 Ycode 002/012）；整体包 `1.0.19-overlay`→`1.0.20-overlay`；agent-teams `v0.23.3-team.2` 与 yuan-skill `v2.103.0` 载体未变、维持。版本台账与投影随批对齐（`vendor/VENDOR.md`、`zcode-patches/series` 头、`RELEASE-MANIFEST.json`、`RELEASE-NOTES.md`、`AGENTS.md`、`README.md`、`docs/DESIGN.md`、设计总账、设计导读、培训载体、team README、技术组件台账）。
6. **发版 v1.0.20-overlay**：全量测试→`release:preflight`→打包（整体源码包＋swarm-yuan everything）→tag 指向实际打包 commit→GitHub Release 三资产→ModelScope everything 通道→`releaseBatches` 回填。
7. **引擎部署位**：全部验证通过并合入 main 后，在主检出执行 `npm run zcode:ensure` 与 `node scripts/zcode-engine.mjs install-cli`，更新本机 `~/.hermes/ycode/zcode.cjs`（覆盖前备份旧件）。
8. **明确不做**：不升级 hermes-studio / hermes-agent 基线；不写宿主 `~/.hermes/hermes-agent`；不做 3.19.x＋4.0 全部新特性的逐项功能对照与吸收（挂账台账）。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 源码基线升 `a4b44451`（＝tag v4.0.0＝main 头，三者同一提交） | 既定口径「按上游 main 同步、不看版本 tag」；本次 main 与 tag 恰好一致，无歧义 | 停在 3.18.2 只做安装版分账（否决：3.19.x 批次分账是因为源码未公开，本次前提已不成立） |
| D2 | 升级与发版合为一批，版本载体一次进位 | 用户在方案确认时裁决「合并后接着发版」；拆两批会让版本载体分两次进位、各带一遍传播面（上一版先例） | 先升级合并、再另开发版批（否决：多一轮合并与传播面） |
| D3 | 补丁退役只凭重放实测的上游原生实现证据，不按交集预判 | 交集只说明「目标文件被改过」；上一版 Studio 升级预判 54 条交集、实际只 5 条需适配 | 按文件交集批量重生成（否决：会把未被触及的补丁无谓改动，且掩盖真实根因） |
| D4 | 驾驶舱扩展序进位 `0.8.30-studio.2` | Ycode 补丁变更计入驾驶舱扩展序有先例（0.8.28-studio.3） | 不进位（否决：发布说明无法承载本版 Ycode 变更的追溯） |
| D5 | 词条快照目录沿用脚本既定命名规则 `zcode-400` | `notesDirFor` 按去点规则机械生成，非缺陷；不为单个版本改脚本 | 改脚本补零对齐位数为 `zcode-4000`（否决：制造第二套命名规则） |
| D6 | 引擎部署位更新放在合并 main 之后，且先备份旧件 | 部署位在仓外（`~/.hermes/ycode/`）；先保证仓内验证全过再动宿主 | 升级过程中途部署（否决：分支若放弃则宿主残留未验证件） |

## 验证

以下为验收设计，结果在完成后以实测回填：

1. **来源与基线**：tag `v4.0.0`、main 头、`vendor/zcode/package.json` 版本三点一致；`vendor-sync` 后暂存面与上游差量对账；提交后全树逐文件 oid 对账（`git ls-tree -r HEAD vendor/zcode` 对 `upstream/zcode` 同提交）；核对忽略规则是否静默排除上游跟踪文件。
2. **补丁重放**：净基线 `npm run clean && npm run inject` 达到 manifest `complete`、零 failed；二次 inject 幂等；pristine replay 守门通过。每条适配或退役的补丁记明依据。
3. **宿主 RPC**：同步前守门因 `proxy-channel.ts` 内容差异与 pin 失配而红，同步后转绿；`npm run typecheck:harness` 通过。
4. **引擎**：`npm run zcode:ensure` 依赖安装与 server 构建通过；CLI 入口可构建；隔离真引擎（独立端口与隔离 HOME/工作区）实跑会话导入→回读闭环。
5. **词条快照**：`npm run catalog-check` 在 4.0.0 应用上对账通过。
6. **回归**：目标测试先行，合并前全量 `npm test`；`npm run release:check` 四模块对齐。
7. **独立审查**：未参与实现的审查者核查 pristine 混入、补丁丢段、RPC 归一化是否掩盖差异、版本投影。
8. **发版**：`release:preflight` 全过；打包产物尺寸与 SHA256 回验；GitHub Release 资产尺寸、远端 SUMS 逐字比对；ModelScope 推送后 `Content-Length` 逐字节一致。

未验证项（如实列出）：引擎真实调用模型（需 API 配置）不在本批验证；工作台真机 UI 走查不做；3.19.x＋4.0 新特性对本仓的功能级影响不逐项评估。

## 设计文档影响

DESIGN_SYNC: touched —— 本批改变 `vendor/VENDOR.md` 钉版基线（zcode 行）、`RELEASE-MANIFEST.json` 的 `vendorBaseline` 与模块版本、`README.md`/`AGENTS.md` 当前版本行、`docs/DESIGN.md` §5.4 当前基线表、设计总账 §C 基线行与模块行；均须同批修订。
