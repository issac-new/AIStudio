# 2026-11-23 技术组件台账最新版与兼容升级

> 状态：已收口（2026-11-23，main 合并）。依据用户原始指令「更新台账到最新版 并完成兼容升级」；未获得范围外动作授权（不推送远端）。终态：全量 npm test 9885/0/11；release:check 四模块对齐 cockpit 0.8.30-studio.1。

## 变更

1. **技术组件台账按当日实测刷新**：以 `team/skills/devops/tech-component-ledger-refresh-orch/SKILL.md` 为程序正本，覆盖分域总表全部组件、🔴🟡 活跃线、🟢 快照线和 RETIRED 复活检查。记录精确版本、提交差量、默认/集成分支、判级和证据命令；已有当日 delta 报告的线引用既有结论，不重复制造报告。新出现的大增量只登记调研优先级，不在本批擅自吸收上游功能。
2. **Ekko Studio 基线 v0.8.28 → v0.8.30**：从 `5e4fb6354` 升到 releases/latest 对应的 `8a51d1bcfbc4de72f7f578b7876ee9b881c9110b`，谱系前进 16 提交、117 文件、+3885/−574。经 `npm run vendor:sync -- hermes-studio` 整树替换 pristine 基线，再按 `patches/series` 全量重放。差量与 54 条活跃补丁有文件交集，逐件按实际 apply 结果处理；上游已吸收的补丁退役归档，本仓语义仍需保留的补丁重锚或重建。
3. **其余 vendor 基线按真实来源处置**：hermes-agent 最新稳定版仍是 v0.23.3，保持现基线。ZCode.app 本机为 3.19.1，仓内 3.19.1 中文词条快照已入库且 `npm run catalog-check` 通过；但公开 `zai-org/zcode` 的 main 与最新 Release 仍为 3.18.2 / `fec97590`，因此 Ycode 不把安装版号冒充源码基线版本，不做无源码的 vendor 换血。
4. **Ycode 宿主协议兼容**：`custom/server/zcode/vendor/rpc/` 的头注仍停在 `872ad96`，与当前公开基线 `fec97590` 存在协议差量。按宿主实际 import 闭包同步所需 RPC 源文件（含 `channels.shared.ts`，以及 `proxy-channel.ts → channels.ts` 引入的 `channelServer.ts`、`delayedChannel.ts`），保留宿主省略 `.js` 扩展名的模块形态和逐文件 X3 头注；把头注和会话投影 pin 对齐到真实来源。修复 `zcode-engine-bridge.test.ts` 当前把全部复制文件列入豁免、实际不比较内容的守门缺口：普通闭包文件按“上游原文→仅移除相对 import 的 `.js`→添加该文件规定的精确 X3 头注”生成确定性预期内容并逐字节比较；有意收窄的 `index.ts` 单独断言导出面与 pin。另以关键协议行为测试防止再次静默漂移。
5. **版本与设计投影同批更新**：`vendor/VENDOR.md`、`RELEASE-MANIFEST.json`、`RELEASE-NOTES.md`、`README.md`、`AGENTS.md`、`docs/DESIGN.md`、设计总账、现行手册与培训载体的当前值跟随实际基线；驾驶舱按底座换血规则进位为 **0.8.30-studio.1**，对应培训手册版本断言随批更新。带日期的历史记录不机械替换。文档索引由仓内生成器重建。
6. **明确不做**：不全局升级 REA/DSH，不写宿主 `~/.hermes/hermes-agent` 热修目录，不构建或发布安装包，不推送远端，不把新出现的 🔴🟡 调研线自动转成代码吸收。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | Studio 跟 releases/latest=v0.8.30，不跟 canary 或字面最大的营销 tag | 与既有 vendor 钉版纪律一致；v0.8.30 有明确发布与提交锚 | 追 main（否决：引入未发布态）；只看 tag 名（否决：历史已证明版本谱系不能靠字面排序） |
| D2 | Ycode 源码保持 3.18.2，3.19.1 仅作为安装版快照与兼容对照 | 公开源码和本机应用是两种事实源；不能用 ASAR 构建产物替代 pristine 源码 | 把 vendor 版本改成 3.19.1（否决：造假且无法重放补丁） |
| D3 | 宿主 RPC 同步到当前真实源码 pin，并恢复有效守门 | 复制面漂移已影响错误字段、订阅错误处理等协议语义；旧测试全豁免无法发现 | 只改头注（否决：版本诚实但行为仍漂移）；全量引入未使用 RPC 模块（否决：扩大兼容面） |
| D4 | 台账刷新与功能吸收分离 | 台账契约要求 🔴🟡 的增量吸收先经用户裁决；本批只完成版本事实和本仓兼容 | 查到什么就吸收什么（否决：范围和回归面不可控） |
| D5 | 复用既有 vendor-sync、inject、release-check 与测试链，不新增治理机制 | 本轮是版本和兼容修复，现有机制可承载；避免触发机制预算 | 新增台账/补丁守门脚本（否决：无必要；RPC 只修既有测试） |

## 验证

以下为实测回填（2026-11-23）：

1. **来源与基线**：v0.8.30 releases/latest=published 2026-11-21、tag 提交 `8a51d1bcf`、desktop package.json=0.8.30 三点一致；vendor-sync 后 staged 面与上游 `git diff --shortstat v0.8.28^{}..v0.8.30^{}` 精确吻合（**117 文件 +3885/−574**），非 vendor 路径零混入；pristine 基线以 `VENDOR_SYNC=1` 先行提交（79022ee）后才注入。ZCode：公开 main 与最新 Release 均 `fec97590`/3.18.2（在线核验），本机安装版 3.19.1（Info.plist）＋catalog-check 7869 键一致——三事实源分账记载。
2. **真实重放**：净基线迭代五轮（根失败序列：042 版本锚→301→640→757→812，lane 级回滚为级联非根因）。终态 clean+inject **510/510 applied 零 failed**；第二次 inject 幂等（`manifest v2 与 series 前缀精确一致（noop）`）；pristine replay 守门 2/2 过（提交后，112.9s）。补丁处置：5 枚适配（042 版本上下文；301 并集上游 sessionSource+profile；640 保留 userAccessChanged 新上下文；757 重切用户存储段并补 Matrix 权限更新通知；812 统一池与 legacy bindInternalModelSession 并存），0 退役。
3. **RPC 目标测试**：TDD 闭环——新守门在旧复制面上 **4 项 RED**（确定性内容差异、pin 停在 872ad96、retryable=undefined、EventError 被静默丢弃＝旧全文件豁免守门失明的实证）；同步 10 文件闭包后三测试文件 **34/34 GREEN**。`npm run typecheck:harness` rc=0。
4. **Ycode 工程面**：`npm run zcode:ensure` 全量执行（pnpm install 59 workspace＋packages/server tsup 构建绿＋remote 构建＋CLI dist），幂等复跑「依赖与构建产物已就绪」；`npm run catalog-check` OK（3.19.1，7869 键/110 命名空间）。
5. **Studio 回归**：受影响面目标测试先行（modelpool 52＋matrix-login 19＋patches-guard 7 等）；全量 `npm test` 结果见交付说明。UI 行为：301/757/812 触及客户端与账号面行为，以组件级与 REST 级测试覆盖（pendingactions 深链在 ia2 路由面有守门）；本批未做浏览器实物走查，如实记为未验证项。
6. **台账与文档**：台账全表刷新（§二批注＋分域行＋§五＋§六验证锚＋§八变更日志）；`npm run docs:sync`/`docs:check` 一致（routes=128）；`npm run release:check` 四模块对账全绿（cockpit=0.8.30-studio.1/agent-teams=v0.23.3-team.2/ycode=3.18.2/yuan-skill=v2.103.0）；文档门 52/52（docs-ssot-guard/interactive-training-manual/training-manual/verify-release-manifest）。
7. **独立审查**：独立审查者对 pristine 混入、补丁丢段、RPC 归一化、版本投影、台账数字抽查执行审查，结论回填交付说明。

已知披露：`.swarm-yuan/decisions.jsonl` 哈希链存在两处历史断口（独立审查复核实测）——第 126-129 行（2026-11-16~18）无链字段；第 130-135 行为 `previous_checksum=''` 的重启链后第 136-140 行再断（2026-11-20~22 记录，均在本轮之前形成）。本轮新增第 141 行链字段齐全、`previous_checksum=''` 未伪造链接，不改写历史行，按红线披露。

审查修复波（独立审查 P1×1＋P2×6 全处置）：P1 设计总账 §C 三行（teams/yuan/整体包）随载体真值清偿；P2-1 vendor `.claude/launch.json` 补录＋VENDOR.md 立规；P2-2 session-projection 头注补 lastOutcome 新字段说明；P2-3 本段披露补全；P2-4 通知深链 `/app/collab/session/:id` 重定向落表（TDD：stash 前 RED→修复后 GREEN）；P2-5 培训 HTML yuan 值对齐；P2-6 设计导读三处事实列表归新。

## 设计文档影响

DESIGN_SYNC: touched —— 本批改变 `vendor/VENDOR.md` 钉版基线、`RELEASE-MANIFEST.json` 的 vendorBaseline、README/AGENTS 当前版本行和数字总账 §C；`docs/DESIGN.md` 与设计总账须同批修订。A.1/文档索引随新 spec 登记。Ycode 源码版本不变，宿主 RPC 属既有执行内核兼容修复，不新增产品能力域。
